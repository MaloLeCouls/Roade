"""Workflow execution engine.

A workflow is a DAG of blocks (nodes) linked by edges. Each block reads the
Parquet output(s) of its upstream block(s), computes its own result and
materializes it to Parquet (one file per output *handle*) plus a cached
``.meta.json`` (columns / row_count / sample / stats).

Public API (consumed by main.py and the smoke tests in backend/_test_*.py):
    iter_run_workflow(pid, wid, only_node=None) -> generator of SSE events
    run_workflow(pid, wid, only_node=None)      -> {"ran": [...], "results": {...}}
    preview_node(pid, wid, node_id, handle="out", ...) -> dict
    column_profile(pid, wid, node_id, column, handle="out") -> dict
    peek_source(pid, file, sheet, header_row)   -> {"sheets", "columns"}
    validate_test(config, samples)              -> {"ok", "results"|"error"}
"""
from __future__ import annotations

import math
import re

import duckdb
import numpy as np
import pandas as pd

import storage
import query_builder
from query_builder import q_ident
from formula import compile_formula, FormulaError

# Output handles per block type (first one is the "primary" output).
OUTPUTS = {
    "source": ["out"], "sql": ["out"], "pivot": ["out"], "clean": ["out"],
    "calc": ["out"], "union": ["out"], "export": [],
    "dedup": ["kept", "dups", "uniques"],
    "validate": ["valid", "invalid"],
}

_NUMERIC_TYPES = ("TINYINT", "SMALLINT", "INTEGER", "BIGINT", "HUGEINT",
                  "UTINYINT", "USMALLINT", "UINTEGER", "UBIGINT", "UHUGEINT",
                  "FLOAT", "REAL", "DOUBLE", "DECIMAL")


# --------------------------------------------------------------------------- #
# Small helpers
# --------------------------------------------------------------------------- #
def _lit(path) -> str:
    """DuckDB string literal for a filesystem path (forward slashes on Windows)."""
    return "'" + str(path).replace("\\", "/").replace("'", "''") + "'"


def _is_null(v) -> bool:
    return v is None or (isinstance(v, float) and math.isnan(v)) or v is pd.NaT


def _json_safe(v):
    if _is_null(v):
        return None
    if isinstance(v, np.integer):
        return int(v)
    if isinstance(v, np.floating):
        f = float(v)
        return None if math.isnan(f) else f
    if isinstance(v, np.bool_):
        return bool(v)
    if isinstance(v, (pd.Timestamp,)):
        return v.isoformat(sep=" ")
    if isinstance(v, bytes):
        return v.decode("utf-8", "replace")
    return v


def _df_records(df: pd.DataFrame) -> list[dict]:
    return [{k: _json_safe(val) for k, val in rec.items()}
            for rec in df.to_dict("records")]


def _describe(con, rel: str) -> list[dict]:
    rows = con.execute(f"DESCRIBE SELECT * FROM {rel}").fetchall()
    return [{"name": r[0], "type": r[1]} for r in rows]


def _is_numeric_type(t: str) -> bool:
    t = (t or "").upper()
    return any(t.startswith(p) for p in _NUMERIC_TYPES)


# --------------------------------------------------------------------------- #
# Source reading
# --------------------------------------------------------------------------- #
_EXCEL_EXT = (".xlsx", ".xls", ".xlsm")


def _source_fingerprint(pid, node) -> str | None:
    """Identity of a source's inputs: file name + sheet + header + size + mtime.
    Changes whenever the underlying file or its read options change, so a cached
    output can be safely reused only while this string is unchanged."""
    d = node["data"]
    f = d.get("file")
    if not f:
        return None
    p = storage.files_dir(pid) / f
    if not p.exists():
        return None
    st = p.stat()
    return f"{f}|{d.get('sheet') or ''}|{int(d.get('header_row') or 0)}|{st.st_size}|{st.st_mtime_ns}"


def _read_source(path, sheet, header_row: int) -> pd.DataFrame:
    ext = path.suffix.lower()
    hr = int(header_row or 0)
    if ext in _EXCEL_EXT:
        return pd.read_excel(path, sheet_name=(sheet or 0), skiprows=hr)
    if ext == ".parquet":
        return pd.read_parquet(path)
    if ext in (".tsv", ".txt"):
        return pd.read_csv(path, sep="\t", skiprows=hr)
    return pd.read_csv(path, sep=None, engine="python", skiprows=hr)


def _dtype_label(dt) -> str:
    s = str(dt)
    if s.startswith("int") or s.startswith("Int") or s.startswith("uint"):
        return "BIGINT"
    if s.startswith("float") or s.startswith("Float"):
        return "DOUBLE"
    if s.startswith("bool"):
        return "BOOLEAN"
    if "datetime" in s:
        return "TIMESTAMP"
    return "VARCHAR"


def peek_source(pid: str, file: str, sheet: str | None, header_row) -> dict:
    path = storage.files_dir(pid) / file
    if not path.exists():
        raise ValueError(f"Fichier introuvable : {file}")
    sheets = None
    hr = int(header_row or 0)
    if path.suffix.lower() in _EXCEL_EXT:
        with pd.ExcelFile(path) as xl:          # context-manager closes the file handle
            sheets = list(xl.sheet_names)
            target = sheet if (sheet and sheet in sheets) else sheets[0]
            df = pd.read_excel(xl, sheet_name=target, skiprows=hr, nrows=100)
    else:
        df = _read_source(path, sheet, hr).head(100)
    columns = [{"name": str(c), "type": _dtype_label(df[c].dtype)} for c in df.columns]
    return {"sheets": sheets, "columns": columns}


# --------------------------------------------------------------------------- #
# Graph ordering
# --------------------------------------------------------------------------- #
def _topo_order(nodes: dict, edges: list) -> list[str]:
    indeg = {nid: 0 for nid in nodes}
    succ = {nid: [] for nid in nodes}
    for e in edges:
        s, t = e.get("source"), e.get("target")
        if s in nodes and t in nodes:
            succ[s].append(t)
            indeg[t] += 1
    queue = [nid for nid in nodes if indeg[nid] == 0]
    order = []
    while queue:
        n = queue.pop(0)
        order.append(n)
        for m in succ[n]:
            indeg[m] -= 1
            if indeg[m] == 0:
                queue.append(m)
    # append any nodes left out by a cycle so we never silently drop work
    for nid in nodes:
        if nid not in order:
            order.append(nid)
    return order


def _ancestors(node_id: str, edges: list) -> set[str]:
    preds = {}
    for e in edges:
        preds.setdefault(e.get("target"), []).append(e.get("source"))
    seen = set()
    stack = [node_id]
    while stack:
        n = stack.pop()
        for p in preds.get(n, []):
            if p and p not in seen:
                seen.add(p)
                stack.append(p)
    return seen


# --------------------------------------------------------------------------- #
# Inputs
# --------------------------------------------------------------------------- #
def _node_inputs(pid, wid, node, edges) -> list[tuple[str, pd.DataFrame]]:
    ins = []
    for e in edges:
        if e.get("target") != node["id"]:
            continue
        src = e.get("source")
        sh = e.get("sourceHandle") or "out"
        alias = e.get("targetHandle") or "in"
        path = storage.node_parquet(pid, wid, src, sh)
        if not path.exists():
            raise ValueError("une entrée n'a pas encore été exécutée")
        ins.append((alias, pd.read_parquet(path)))
    return ins


def _single(ins):
    if not ins:
        raise ValueError("aucune entrée connectée")
    return ins[0][1]


# --------------------------------------------------------------------------- #
# Block runners  ->  (outputs: {handle: DataFrame}, extra_meta: dict)
# --------------------------------------------------------------------------- #
def _run_source(con, pid, node, ins):
    d = node["data"]
    file = d.get("file")
    if not file:
        raise ValueError("aucun fichier sélectionné")
    path = storage.files_dir(pid) / file
    if not path.exists():
        raise ValueError(f"fichier introuvable : {file}")
    df = _read_source(path, d.get("sheet"), d.get("header_row") or 0)
    fp = _source_fingerprint(pid, node)
    return {"out": df}, ({"source_fingerprint": fp} if fp else {})


def _run_sql(con, pid, node, ins):
    d = node["data"]
    if not ins:
        raise ValueError("aucune entrée connectée")
    aliases = []
    for alias, df in ins:
        con.register(alias, df)
        aliases.append(alias)
    primary = "in1" if "in1" in aliases else aliases[0]
    if d.get("mode") == "raw":
        sql = (d.get("raw_sql") or "").strip()
        if not sql:
            raise ValueError("SQL brut vide")
    else:
        sql = query_builder.compile_query(d.get("query") or {}, primary)
    try:
        df = con.execute(sql).df()
    finally:
        for alias in aliases:
            con.unregister(alias)
    return {"out": df}, {"compiled_sql": sql}


def _run_dedup(con, pid, node, ins):
    d = node["data"]
    df = _single(ins)
    keys = [k for k in (d.get("key_columns") or []) if k in df.columns]
    if not keys:
        keys = list(df.columns)
    keep = d.get("keep", "first")
    if keep not in ("first", "last"):
        keep = "first"
    dups_mode = d.get("dups_mode", "all")

    dup_any = df.duplicated(subset=keys, keep=False)
    exemplar = ~df.duplicated(subset=keys, keep=keep)        # one row per group
    kept = df[exemplar]
    uniques = df[~dup_any]
    if dups_mode == "exemplar":
        dups = df[dup_any & exemplar]
    elif dups_mode == "extra":
        dups = df[df.duplicated(subset=keys, keep=keep)]
    else:
        dups = df[dup_any]
    return {
        "kept": kept.reset_index(drop=True),
        "dups": dups.reset_index(drop=True),
        "uniques": uniques.reset_index(drop=True),
    }, {}


def _run_validate(con, pid, node, ins):
    d = node["data"]
    df = _single(ins)
    col = d.get("target_column")
    if not col or col not in df.columns:
        raise ValueError("choisissez la colonne à contrôler")
    flags, motifs = [], []
    for v in df[col].tolist():
        ok, motif = _validate_one(v, d)
        flags.append(ok)
        motifs.append(motif)
    out = df.copy()
    if d.get("add_flag"):
        out["valide"] = ["oui" if f else "non" for f in flags]
    if d.get("add_reason"):
        out["motif"] = ["" if f else m for f, m in zip(flags, motifs)]
    mask = pd.Series(flags, index=out.index)
    return {
        "valid": out[mask].reset_index(drop=True),
        "invalid": out[~mask].reset_index(drop=True),
    }, {}


def _run_pivot(con, pid, node, ins):
    d = node["data"]
    df = _single(ins)
    if d.get("mode") == "unpivot":
        vcs = [c for c in (d.get("value_columns") or []) if c in df.columns]
        if not vcs:
            raise ValueError("sélectionnez les colonnes à dépivoter")
        name_col = d.get("name_column") or "variable"
        val_col = d.get("value_column") or "valeur"
        id_vars = [c for c in df.columns if c not in vcs]
        out = df.melt(id_vars=id_vars, value_vars=vcs,
                      var_name=name_col, value_name=val_col)
        return {"out": out}, {}
    # pivot
    idx = [c for c in (d.get("index_columns") or []) if c in df.columns]
    pc = d.get("pivot_column")
    vc = d.get("value_column")
    if not idx or not pc or not vc:
        raise ValueError("renseignez lignes, colonne à éclater et valeurs")
    aggmap = {"SUM": "sum", "AVG": "mean", "MIN": "min", "MAX": "max",
              "COUNT": "count", "MEDIAN": "median", "FIRST": "first", "LAST": "last"}
    fn = aggmap.get((d.get("agg") or "SUM").upper(), "sum")
    pt = pd.pivot_table(df, index=idx, columns=pc, values=vc, aggfunc=fn)
    pt = pt.reset_index()
    pt.columns = [str(c) for c in pt.columns]
    return {"out": pt}, {}


_CLEAN_LABELS = {
    "trim": "Supprimer les espaces", "upper": "MAJUSCULES", "lower": "minuscules",
    "capitalize": "Capitaliser", "replace": "Rechercher / remplacer",
    "fillna": "Remplir les vides", "to_number": "Convertir en nombre",
    "to_integer": "Convertir en entier", "to_date": "Convertir en date",
    "round": "Arrondir", "abs": "Valeur absolue",
}


def _run_clean(con, pid, node, ins):
    d = node["data"]
    df = _single(ins).copy()
    report = []
    for o in d.get("operations") or []:
        if o.get("enabled") is False:
            continue
        op = o.get("op")
        col = o.get("column")
        if not col or col not in df.columns:
            continue
        before = df[col]
        new, failed = _apply_clean(op, before, o)
        was_null = int(before.isna().sum())
        changed_mask = _changed_mask(before, new)
        changed = int(changed_mask.sum())
        samples = []
        for i in df.index[changed_mask][:5]:
            samples.append({"old": _json_safe(before.loc[i]), "new": _json_safe(new.loc[i])})
        df[col] = new
        report.append({
            "op": op, "op_label": _CLEAN_LABELS.get(op, op), "column": col,
            "changed": changed, "failed": int(failed), "was_null": was_null,
            "samples": samples,
        })
    return {"out": df}, {"clean_report": report}


def _changed_mask(old: pd.Series, new: pd.Series) -> pd.Series:
    o = old.astype(object).where(old.notna(), None)
    n = new.astype(object).where(new.notna(), None)
    return pd.Series([a != b for a, b in zip(o, n)], index=old.index)


def _apply_clean(op, s: pd.Series, o: dict):
    """Return (new_series, failed_count)."""
    failed = 0
    if op == "trim":
        return s.map(lambda x: x.strip() if isinstance(x, str) else x), 0
    if op == "upper":
        return s.map(lambda x: x.upper() if isinstance(x, str) else x), 0
    if op == "lower":
        return s.map(lambda x: x.lower() if isinstance(x, str) else x), 0
    if op == "capitalize":
        return s.map(lambda x: x.capitalize() if isinstance(x, str) else x), 0
    if op == "replace":
        find = o.get("find", "")
        repl = o.get("replace", "")
        use_re = bool(o.get("regex"))

        def rep(x):
            if not isinstance(x, str):
                return x
            return re.sub(find, repl, x) if use_re else x.replace(find, repl)
        return s.map(rep), 0
    if op == "fillna":
        val = o.get("value", "")
        if (o.get("value_type") or "text") == "number":
            try:
                val = float(val)
            except (TypeError, ValueError):
                val = 0
        return s.where(s.notna(), val), 0
    if op in ("to_number", "to_integer"):
        coerced = pd.to_numeric(
            s.map(lambda x: str(x).replace(",", ".") if isinstance(x, str) else x),
            errors="coerce")
        failed = int((coerced.isna() & s.notna()).sum())
        if op == "to_integer":
            coerced = coerced.round().astype("Int64")
        return coerced, failed
    if op == "to_date":
        fmt = o.get("format") or None
        coerced = pd.to_datetime(s, format=fmt, errors="coerce")
        failed = int((coerced.isna() & s.notna()).sum())
        return coerced, failed
    if op == "round":
        digits = int(o.get("digits") or 0)
        coerced = pd.to_numeric(s, errors="coerce").round(digits)
        return coerced, int((coerced.isna() & s.notna()).sum())
    if op == "abs":
        coerced = pd.to_numeric(s, errors="coerce").abs()
        return coerced, int((coerced.isna() & s.notna()).sum())
    return s, 0


def _run_calc(con, pid, node, ins):
    d = node["data"]
    df = _single(ins)
    con.register("_calc_in", df)
    known = {str(c) for c in df.columns}
    sql = "SELECT * FROM _calc_in"
    try:
        for item in d.get("columns") or []:
            if item.get("enabled") is False:
                continue
            name = (item.get("name") or "").strip()
            expr = item.get("expr") or ""
            if not name or not expr.strip():
                continue
            sql_expr = compile_formula(expr)
            qname = q_ident(name)
            if name in known:
                sql = f'SELECT * REPLACE (({sql_expr}) AS {qname}) FROM ({sql}) q'
            else:
                sql = f'SELECT *, ({sql_expr}) AS {qname} FROM ({sql}) q'
                known.add(name)
        out = con.execute(sql).df()
    finally:
        con.unregister("_calc_in")
    return {"out": out}, {}


def _run_union(con, pid, node, ins):
    d = node["data"]
    if not ins:
        raise ValueError("aucune entrée connectée")
    names = []
    for i, (_, df) in enumerate(ins):
        nm = f"_u{i}"
        con.register(nm, df)
        names.append(nm)
    by_name = d.get("by_name", True) is not False
    try:
        if len(names) == 1:
            sql = f"SELECT * FROM {names[0]}"
        else:
            joiner = " UNION ALL BY NAME " if by_name else " UNION ALL "
            sql = joiner.join(f"SELECT * FROM {nm}" for nm in names)
        if d.get("distinct"):
            sql = f"SELECT DISTINCT * FROM ({sql})"
        out = con.execute(sql).df()
    finally:
        for nm in names:
            con.unregister(nm)
    return {"out": out}, {}


def _run_export(con, pid, node, ins):
    d = node["data"]
    df = _single(ins)
    fn = (d.get("filename") or "resultat").strip() or "resultat"
    fmt = (d.get("format") or "xlsx").lower()
    fn = re.sub(r"[\\/:*?\"<>|]", "_", fn)
    if fmt == "csv":
        out_path = storage.files_dir(pid) / f"{fn}.csv"
        df.to_csv(out_path, index=False)
    else:
        out_path = storage.files_dir(pid) / f"{fn}.xlsx"
        df.to_excel(out_path, index=False)
    return {}, {"exported": out_path.name, "row_count": int(len(df))}


_RUNNERS = {
    "source": _run_source, "sql": _run_sql, "dedup": _run_dedup,
    "validate": _run_validate, "pivot": _run_pivot, "clean": _run_clean,
    "calc": _run_calc, "union": _run_union, "export": _run_export,
}


# --------------------------------------------------------------------------- #
# Validation logic (also used by the live tester endpoint)
# --------------------------------------------------------------------------- #
_CLASS_RE = {"letter": "[A-Za-z]", "upper": "[A-Z]", "lower": "[a-z]",
             "digit": "[0-9]", "alnum": "[A-Za-z0-9]", "any": "."}


def _seg_pattern(seg) -> str:
    """Regex for one mask segment."""
    t = seg.get("type") or "any"
    if t == "literal":
        return re.escape(seg.get("value") or "")
    base = "[" + re.escape(seg.get("value") or "") + "]" if t == "set" else _CLASS_RE.get(t, ".")
    ln, lo, hi = seg.get("length"), seg.get("min"), seg.get("max")
    if ln not in (None, ""):
        return base + "{%d}" % int(ln)
    if lo not in (None, "") or hi not in (None, ""):
        return base + "{%s,%s}" % (int(lo) if lo not in (None, "") else 0,
                                   int(hi) if hi not in (None, "") else "")
    return base + "{1}"


def _mask_pattern(segments: list, case_sensitive: bool = False) -> str:
    return "".join(_seg_pattern(s) for s in segments or [])


def _segment_label(seg) -> str:
    t = seg.get("type") or "any"
    if t == "literal":
        return f"« {seg.get('value') or ''} »"
    names = {"letter": "lettres", "upper": "MAJ", "lower": "min", "digit": "chiffres",
             "alnum": "alphanum.", "set": f"[{seg.get('value') or ''}]", "any": "tout"}
    base = names.get(t, t)
    ln, lo, hi = seg.get("length"), seg.get("min"), seg.get("max")
    if ln not in (None, ""):
        return f"{base}×{int(ln)}"
    if lo not in (None, "") or hi not in (None, ""):
        return f"{base}×{lo or 0}–{hi if hi not in (None, '') else '∞'}"
    return base


def _mask_steps(s: str, segments: list, cs: bool) -> list[dict]:
    """Per-segment status for one sample: the first segment whose cumulative
    prefix no longer matches is the blocker ('fail'); earlier ones are 'ok',
    later ones 'skip'. A trailing extra (string longer than the mask) is flagged."""
    flags = 0 if cs else re.IGNORECASE
    segs = segments or []
    pats = [_seg_pattern(x) for x in segs]
    labels = [_segment_label(x) for x in segs]
    n = len(pats)
    if n == 0:
        return []
    blocker = n
    for k in range(n):
        if not re.match("".join(pats[:k + 1]), s, flags):
            blocker = k
            break
    steps = [{"label": labels[i],
              "status": "ok" if i < blocker else ("fail" if i == blocker else "skip")}
             for i in range(n)]
    if blocker == n and not re.fullmatch("".join(pats), s, flags):
        steps.append({"label": "caractères en trop", "status": "fail"})
    return steps


def _char_in_class(ch: str, cls: str, cs: bool) -> bool:
    if not cs and cls in ("upper", "lower"):
        return ch.isalpha()
    return {
        "letter": ch.isalpha(), "upper": ch.isupper(), "lower": ch.islower(),
        "digit": ch.isdigit(), "alnum": ch.isalnum(),
    }.get(cls, True)


def _rule_label(r: dict) -> str:
    if r.get("label"):
        return r["label"]
    test = r.get("test")
    v = r.get("value", "")
    labels = {
        "starts_with": f"doit commencer par « {v} »",
        "ends_with": f"doit finir par « {v} »",
        "contains": f"doit contenir « {v} »",
        "not_contains": f"ne doit pas contenir « {v} »",
        "equals": f"doit être égal à « {v} »",
        "not_equals": f"doit être différent de « {v} »",
        "regex": f"doit correspondre à {v}",
        "regex_full": f"doit correspondre à {v}",
        "length_eq": f"longueur doit être {v}",
        "length_min": f"longueur ≥ {v}",
        "length_max": f"longueur ≤ {v}",
        "char_class": f"le caractère {r.get('position', 1)} est invalide",
        "char_equals": f"le caractère {r.get('position', 1)} doit être « {v} »",
        "substr_equals": f"les caractères {r.get('start', 1)}… doivent être « {v} »",
        "substr_class": f"les caractères {r.get('start', 1)}… sont invalides",
        "is_in": "valeur hors liste autorisée",
        "is_empty": "doit être vide", "not_empty": "ne doit pas être vide",
        "is_numeric": "doit être numérique",
    }
    return labels.get(test, test or "règle non respectée")


def _rule_ok(s: str, r: dict, cs: bool) -> bool:
    test = r.get("test")
    v = r.get("value")
    flags = 0 if cs else re.IGNORECASE

    def norm(x):
        return x if cs else str(x).lower()

    ss = s if cs else s.lower()
    vv = norm(v) if v is not None else ""
    try:
        if test == "starts_with":
            return ss.startswith(vv)
        if test == "ends_with":
            return ss.endswith(vv)
        if test == "contains":
            return vv in ss
        if test == "not_contains":
            return vv not in ss
        if test == "equals":
            return ss == vv
        if test == "not_equals":
            return ss != vv
        if test == "regex":
            return re.search(str(v), s, flags) is not None
        if test == "regex_full":
            return re.fullmatch(str(v), s, flags) is not None
        if test == "length_eq":
            return len(s) == int(v)
        if test == "length_min":
            return len(s) >= int(v)
        if test == "length_max":
            return len(s) <= int(v)
        if test == "char_class":
            p = int(r.get("position") or 1)
            return 0 < p <= len(s) and _char_in_class(s[p - 1], r.get("charclass", "letter"), cs)
        if test == "char_equals":
            p = int(r.get("position") or 1)
            return 0 < p <= len(s) and norm(s[p - 1]) == vv
        if test == "substr_equals":
            st = int(r.get("start") or 1)
            ln = int(r.get("length") or 1)
            return norm(s[st - 1:st - 1 + ln]) == vv
        if test == "substr_class":
            st = int(r.get("start") or 1)
            ln = int(r.get("length") or 1)
            seg = s[st - 1:st - 1 + ln]
            return len(seg) == ln and all(_char_in_class(c, r.get("charclass", "letter"), cs) for c in seg)
        if test == "is_in":
            items = [norm(x.strip()) for x in str(v).split(",") if x.strip() != ""]
            return ss in items
        if test == "is_empty":
            return s == ""
        if test == "not_empty":
            return s != ""
        if test == "is_numeric":
            float(str(s).replace(",", "."))
            return True
    except (ValueError, TypeError):
        return False
    return True


def _validate_one(value, cfg: dict) -> tuple[bool, str]:
    cs = bool(cfg.get("case_sensitive"))
    s = "" if _is_null(value) else str(value)
    if cfg.get("mode") == "mask":
        pat = _mask_pattern(cfg.get("segments") or [], cs)
        flags = 0 if cs else re.IGNORECASE
        ok = bool(re.fullmatch(pat, s, flags)) if pat else (s == "")
        return ok, ("" if ok else "ne correspond pas au format attendu")
    rules = cfg.get("rules") or []
    if not rules:
        return True, ""
    combine = cfg.get("combine", "all")
    fails = [r for r in rules if not _rule_ok(s, r, cs)]
    if combine == "any":
        ok = len(fails) < len(rules)
        return ok, ("" if ok else "aucune règle satisfaite")
    ok = not fails
    return ok, ("" if ok else _rule_label(fails[0]))


def validate_test(config: dict, samples: list) -> dict:
    cfg = config or {}
    cs = bool(cfg.get("case_sensitive"))
    is_mask = cfg.get("mode") == "mask"
    try:
        results = []
        for x in samples or []:
            s = "" if _is_null(x) else str(x)
            ok, motif = _validate_one(x, cfg)
            if is_mask:
                steps = _mask_steps(s, cfg.get("segments") or [], cs)
            else:
                steps = [{"label": _rule_label(r), "status": "ok" if _rule_ok(s, r, cs) else "fail"}
                         for r in (cfg.get("rules") or [])]
            results.append({"valid": ok, "motif": "OK" if ok else (motif or "non conforme"),
                            "steps": steps})
        return {"ok": True, "results": results}
    except Exception as e:  # noqa: BLE001 - surfaced to the UI tester
        return {"ok": False, "error": str(e)}


# --------------------------------------------------------------------------- #
# Materialization
# --------------------------------------------------------------------------- #
def _meta_from_parquet(path) -> dict:
    con = duckdb.connect()
    try:
        rel = f"read_parquet({_lit(path)})"
        columns = _describe(con, rel)
        row_count = con.execute(f"SELECT count(*) FROM {rel}").fetchone()[0]
        sample = _df_records(con.execute(f"SELECT * FROM {rel} LIMIT 50").df())
        try:
            stats = _df_records(con.execute(f"SUMMARIZE SELECT * FROM {rel}").df())
        except Exception:
            stats = []
        return {"columns": columns, "row_count": int(row_count),
                "sample": sample, "stats": stats}
    finally:
        con.close()


def _write_output(pid, wid, node, handle, df, extra) -> dict:
    storage.data_dir(pid, wid).mkdir(parents=True, exist_ok=True)
    path = storage.node_parquet(pid, wid, node["id"], handle)
    df.to_parquet(path, index=False)
    meta = {"block_type": node["type"], "label": node["data"].get("label", node["id"])}
    meta.update(_meta_from_parquet(path))
    meta.update(extra)
    storage.write_node_meta(pid, wid, node["id"], meta, handle)
    return meta


def _execute_node(con, pid, wid, node, edges, bypass_cache=False) -> dict:
    ntype = node["type"]
    handles = OUTPUTS.get(ntype, ["out"])
    label = node["data"].get("label", node["id"])

    # source caching: skip re-reading a file that has not changed since last run
    # (fingerprint = name + sheet + header + size + mtime). Big Excel reads are
    # slow, so this avoids recomputing the source every time a downstream block runs.
    if (ntype == "source" and not bypass_cache and node["data"].get("cache", True)
            and storage.node_parquet(pid, wid, node["id"], "out").exists()):
        m = storage.read_node_meta(pid, wid, node["id"], "out") or {}
        fp = _source_fingerprint(pid, node)
        if fp and m.get("source_fingerprint") == fp:
            return {"type": ntype, "locked": False, "cached": True,
                    "outputs": {"out": m.get("row_count", 0)},
                    "row_count": m.get("row_count", 0), "columns": m.get("columns", [])}

    # locked: reuse existing parquet without recomputing
    if (node["data"].get("locked") and not bypass_cache and handles and all(
            storage.node_parquet(pid, wid, node["id"], h).exists() for h in handles)):
        outputs, columns, extra = {}, [], {}
        for i, h in enumerate(handles):
            m = storage.read_node_meta(pid, wid, node["id"], h) or {}
            outputs[h] = m.get("row_count", 0)
            if i == 0:
                columns = m.get("columns", [])
                for k in ("compiled_sql", "clean_report"):
                    if k in m:
                        extra[k] = m[k]
        return {"type": ntype, "locked": True, "outputs": outputs,
                "row_count": outputs.get(handles[0], 0), "columns": columns, **extra}

    ins = _node_inputs(pid, wid, node, edges)
    runner = _RUNNERS.get(ntype)
    if runner is None:
        raise ValueError(f"type de bloc inconnu : {ntype}")
    out_dfs, extra = runner(con, pid, node, ins)

    if not handles:  # export
        return {"type": ntype, "locked": False, "outputs": {},
                "row_count": extra.get("row_count", 0), "columns": [], **extra}

    outputs, columns = {}, []
    for i, h in enumerate(handles):
        df = out_dfs.get(h)
        if df is None:
            df = pd.DataFrame()
        meta = _write_output(pid, wid, node, h, df, extra if i == 0 else {})
        outputs[h] = meta["row_count"]
        if i == 0:
            columns = meta["columns"]
    result = {"type": ntype, "locked": False, "outputs": outputs,
              "row_count": outputs.get(handles[0], 0), "columns": columns}
    for k in ("compiled_sql", "clean_report"):
        if k in extra:
            result[k] = extra[k]
    return result


# --------------------------------------------------------------------------- #
# Run
# --------------------------------------------------------------------------- #
def iter_run_workflow(pid, wid, only_node=None, force=False):
    wf = storage.get_workflow(pid, wid)
    if not wf:
        yield {"event": "error", "message": "Workflow introuvable"}
        return
    nodes = {n["id"]: n for n in wf.get("nodes", [])}
    edges = wf.get("edges", [])
    order = _topo_order(nodes, edges)
    if only_node and only_node in nodes:
        run_set = _ancestors(only_node, edges) | {only_node}
    else:
        run_set = set(nodes)
    run_ids = [nid for nid in order if nid in run_set]

    yield {"event": "start", "total": len(run_ids)}
    con = duckdb.connect()
    try:
        for nid in run_ids:
            node = nodes[nid]
            yield {"event": "node_start", "node_id": nid,
                   "label": node["data"].get("label", nid), "type": node["type"]}
            try:
                result = _execute_node(con, pid, wid, node, edges,
                                       bypass_cache=(force and nid == only_node))
            except Exception as e:  # noqa: BLE001 - reported to the client
                yield {"event": "error", "node_id": nid,
                       "message": f"{node['data'].get('label', nid)} : {e}"}
                return
            yield {"event": "node_done", "node_id": nid, "result": result}
        yield {"event": "done"}
    finally:
        con.close()


def run_workflow(pid, wid, only_node=None) -> dict:
    ran, results = [], {}
    for ev in iter_run_workflow(pid, wid, only_node):
        if ev["event"] == "node_done":
            ran.append(ev["node_id"])
            results[ev["node_id"]] = ev["result"]
        elif ev["event"] == "error":
            raise RuntimeError(ev.get("message", "erreur d'exécution"))
    return {"ran": ran, "results": results}


# --------------------------------------------------------------------------- #
# Preview & profile
# --------------------------------------------------------------------------- #
def _slike(v) -> str:
    return "'%" + str(v).replace("'", "''") + "%'"


def _build_where(columns, filters, q) -> str:
    names = {c["name"] for c in columns}
    clauses = []
    for f in filters or []:
        col = f.get("column")
        if col not in names:
            continue
        op = f.get("op", "contains")
        val = f.get("value")
        ident = q_ident(col)
        if op == "is_null":
            clauses.append(f"{ident} IS NULL")
        elif op == "equals":                       # exact match (top-value click)
            if isinstance(val, bool):
                clauses.append(f"{ident} = {'TRUE' if val else 'FALSE'}")
            elif isinstance(val, (int, float)):
                clauses.append(f"{ident} = {val}")
            elif val not in (None, ""):
                clauses.append(f"CAST({ident} AS VARCHAR) = '{str(val).replace(chr(39), chr(39) * 2)}'")
        elif val not in (None, ""):                # contains (text filter input)
            clauses.append(f"CAST({ident} AS VARCHAR) ILIKE {_slike(val)}")
    if q:
        ors = [f"CAST({q_ident(c)} AS VARCHAR) ILIKE {_slike(q)}" for c in names]
        if ors:
            clauses.append("(" + " OR ".join(ors) + ")")
    return " AND ".join(clauses)


def preview_node(pid, wid, node_id, handle="out", limit=200, offset=0,
                 sort=None, direction="asc", filters=None, q=None) -> dict:
    path = storage.node_parquet(pid, wid, node_id, handle)
    if not path.exists():
        return {"available": False}
    con = duckdb.connect()
    try:
        rel = f"read_parquet({_lit(path)})"
        columns = _describe(con, rel)
        total = con.execute(f"SELECT count(*) FROM {rel}").fetchone()[0]
        where = _build_where(columns, filters, q)
        base = f"SELECT * FROM {rel}"
        if where:
            base += " WHERE " + where
            row_count = con.execute(f"SELECT count(*) FROM ({base})").fetchone()[0]
        else:
            row_count = total
        sql = base
        if sort and any(c["name"] == sort for c in columns):
            d = "DESC" if (direction or "asc").lower() == "desc" else "ASC"
            sql += f" ORDER BY {q_ident(sort)} {d}"
        sql += f" LIMIT {int(limit)} OFFSET {int(offset)}"
        rows = _df_records(con.execute(sql).df())
        meta = storage.read_node_meta(pid, wid, node_id, handle) or {}
        return {
            "available": True, "columns": columns, "rows": rows,
            "row_count": int(row_count), "total_count": int(total),
            "compiled_sql": meta.get("compiled_sql"),
            "clean_report": meta.get("clean_report"),
            "stats": meta.get("stats"),
        }
    finally:
        con.close()


def column_profile(pid, wid, node_id, column, handle="out") -> dict:
    path = storage.node_parquet(pid, wid, node_id, handle)
    if not path.exists():
        return {"available": False}
    con = duckdb.connect()
    try:
        rel = f"read_parquet({_lit(path)})"
        columns = _describe(con, rel)
        match = next((c for c in columns if c["name"] == column), None)
        if not match:
            return {"available": False}
        ident = q_ident(column)
        total = con.execute(f"SELECT count(*) FROM {rel}").fetchone()[0]
        nulls = con.execute(f"SELECT count(*) FROM {rel} WHERE {ident} IS NULL").fetchone()[0]
        distinct = con.execute(f"SELECT count(DISTINCT {ident}) FROM {rel}").fetchone()[0]
        numeric = _is_numeric_type(match["type"])
        null_pct = round(nulls / total * 100, 1) if total else 0.0
        res = {"available": True, "type": match["type"], "total": int(total),
               "nulls": int(nulls), "null_pct": null_pct, "distinct": int(distinct),
               "numeric": numeric, "numeric_stats": None, "histogram": [],
               "top_values": []}

        if numeric and (total - nulls) > 0:
            sub = f"(SELECT {ident} AS c FROM {rel} WHERE {ident} IS NOT NULL)"
            mn, mx, avg, med, sd = con.execute(
                f"SELECT min(c), max(c), avg(c), median(c), stddev_samp(c) FROM {sub}"
            ).fetchone()
            res["numeric_stats"] = {
                "min": _json_safe(mn), "max": _json_safe(mx), "avg": _json_safe(avg),
                "median": _json_safe(med), "stddev": _json_safe(sd),
            }
            mnf, mxf = float(mn), float(mx)
            if mxf > mnf:
                width = (mxf - mnf) / 10
                rows = con.execute(
                    f"SELECT LEAST(9, CAST(floor((c - {mnf}) / {width}) AS INTEGER)) AS b, "
                    f"count(*) FROM {sub} GROUP BY b"
                ).fetchall()
                counts = {int(r[0]): int(r[1]) for r in rows}
                res["histogram"] = [
                    {"lo": mnf + i * width, "hi": mnf + (i + 1) * width, "count": counts.get(i, 0)}
                    for i in range(10)
                ]
            else:
                res["histogram"] = [{"lo": mnf, "hi": mxf, "count": int(total - nulls)}]

        top = con.execute(
            f"SELECT {ident} AS v, count(*) AS c FROM {rel} "
            f"GROUP BY v ORDER BY c DESC LIMIT 10"
        ).fetchall()
        res["top_values"] = [{"value": _json_safe(r[0]), "count": int(r[1])} for r in top]
        return res
    finally:
        con.close()
