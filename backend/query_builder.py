"""Compile a structured, UI-built query model into DuckDB SQL.

The frontend never asks the user to type SQL: it produces a JSON model made of
structured pieces (select items, joins, filters, group by, order by). This
module turns that model into a safe, valid SQL string.

Inputs are referenced by *alias* (the target handle of an incoming edge, e.g.
"in1", "in2"). Each alias is registered in DuckDB as a view before execution.

Model shape (all keys optional except it must reference at least one input):
{
  "distinct": false,
  "select": [
     {"kind": "column",  "input": "in1", "column": "Amount", "alias": "amt"},
     {"kind": "agg",     "func": "SUM",  "input": "in1", "column": "Amount", "alias": "total"},
     {"kind": "expr",    "expression": "Amount * 1.2",      "alias": "ttc"}
  ],
  "joins": [
     {"input": "in2", "type": "INNER",
      "on": [{"left_input": "in1", "left_column": "id",
              "right_input": "in2", "right_column": "id"}]}
  ],
  "where":   [{"input": "in1", "column": "Country", "op": "=", "value": "FR",
               "value_type": "text", "connector": "AND"}],
  "group_by":[{"input": "in1", "column": "Country"}],
  "having":  [{"func": "SUM", "input": "in1", "column": "Amount",
               "op": ">", "value": "1000", "value_type": "number"}],
  "order_by":[{"input": "in1", "column": "Amount", "dir": "DESC"}],
  "limit": 1000
}
"""
from __future__ import annotations

AGG_FUNCS = {"SUM", "AVG", "MIN", "MAX", "COUNT", "COUNT_DISTINCT",
             "MEDIAN", "STDDEV", "FIRST", "LAST", "STRING_AGG"}
COMPARISON_OPS = {"=", "!=", "<>", ">", ">=", "<", "<=",
                  "LIKE", "NOT LIKE", "ILIKE", "IN", "NOT IN",
                  "IS NULL", "IS NOT NULL", "BETWEEN"}


def q_ident(name: str) -> str:
    """Quote an identifier for DuckDB (handles spaces / accents in headers)."""
    return '"' + str(name).replace('"', '""') + '"'


def q_ref(input_alias: str | None, column: str) -> str:
    col = q_ident(column)
    if input_alias:
        return f"{q_ident(input_alias)}.{col}"
    return col


def _literal(value, value_type: str) -> str:
    value_type = (value_type or "text").lower()
    if value_type == "number":
        # let DuckDB parse it; reject anything that is not a plain number
        try:
            float(value)
        except (TypeError, ValueError):
            raise ValueError(f"Valeur numérique invalide: {value!r}")
        return str(value)
    if value_type == "raw":
        return str(value)
    if value_type == "boolean":
        return "TRUE" if str(value).lower() in ("1", "true", "vrai", "oui") else "FALSE"
    # default: text -> single-quoted, escaped
    s = "" if value is None else str(value)
    return "'" + s.replace("'", "''") + "'"


def _agg_expr(func: str, ref: str) -> str:
    func = (func or "").upper()
    if func == "COUNT_DISTINCT":
        return f"COUNT(DISTINCT {ref})"
    if func == "STRING_AGG":
        return f"STRING_AGG({ref}, ', ')"
    if func not in AGG_FUNCS:
        raise ValueError(f"Fonction d'agrégat inconnue: {func}")
    return f"{func}({ref})"


def _select_item(item: dict) -> str:
    kind = item.get("kind", "column")
    alias = item.get("alias")
    if kind == "expr":
        expr = item.get("expression", "").strip()
        if not expr:
            raise ValueError("Expression vide")
        sql = f"({expr})"
    elif kind == "agg":
        col = item.get("column")
        ref = "*" if (item.get("func", "").upper() == "COUNT" and not col) \
            else q_ref(item.get("input"), col)
        sql = _agg_expr(item["func"], ref)
    else:  # column
        sql = q_ref(item.get("input"), item["column"])
    if alias:
        sql += f" AS {q_ident(alias)}"
    return sql


def _condition(c: dict) -> str:
    op = (c.get("op") or "=").upper()
    if op not in COMPARISON_OPS:
        raise ValueError(f"Opérateur inconnu: {op}")

    # left side: either a plain column or an aggregate (for HAVING)
    if c.get("func"):
        ref = "*" if (c["func"].upper() == "COUNT" and not c.get("column")) \
            else q_ref(c.get("input"), c.get("column"))
        left = _agg_expr(c["func"], ref)
    else:
        left = q_ref(c.get("input"), c["column"])

    vtype = c.get("value_type", "text")
    if op in ("IS NULL", "IS NOT NULL"):
        return f"{left} {op}"
    if op in ("IN", "NOT IN"):
        raw = c.get("value", "")
        parts = [p.strip() for p in str(raw).split(",") if p.strip() != ""]
        if not parts:
            raise ValueError("Liste IN vide")
        vals = ", ".join(_literal(p, vtype) for p in parts)
        return f"{left} {op} ({vals})"
    if op == "BETWEEN":
        lo = _literal(c.get("value"), vtype)
        hi = _literal(c.get("value2"), vtype)
        return f"{left} BETWEEN {lo} AND {hi}"
    return f"{left} {op} {_literal(c.get('value'), vtype)}"


def _join_clause(j: dict) -> str:
    jtype = (j.get("type") or "INNER").upper()
    if jtype not in ("INNER", "LEFT", "RIGHT", "FULL", "CROSS"):
        raise ValueError(f"Type de jointure inconnu: {jtype}")
    alias = j["input"]
    if jtype == "CROSS":
        return f"CROSS JOIN {q_ident(alias)}"
    conds = j.get("on", [])
    if not conds:
        raise ValueError("Jointure sans condition ON")
    parts = []
    for c in conds:
        l = q_ref(c["left_input"], c["left_column"])
        r = q_ref(c["right_input"], c["right_column"])
        parts.append(f"{l} = {r}")
    return f"{jtype} JOIN {q_ident(alias)} ON " + " AND ".join(parts)


def _where_block(conds: list[dict]) -> str:
    sql = ""
    for i, c in enumerate(conds):
        piece = _condition(c)
        if i == 0:
            sql = piece
        else:
            conn = (c.get("connector") or "AND").upper()
            conn = "OR" if conn == "OR" else "AND"
            sql += f" {conn} {piece}"
    return sql


def compile_query(model: dict, primary_input: str) -> str:
    """Build a SELECT statement. `primary_input` is the FROM alias (the first
    connected input)."""
    if not primary_input:
        raise ValueError("Le bloc SQL n'a aucune entrée connectée.")

    select_items = model.get("select") or []
    if select_items:
        select_sql = ", ".join(_select_item(it) for it in select_items)
    else:
        select_sql = "*"
    distinct = "DISTINCT " if model.get("distinct") else ""

    sql = f"SELECT {distinct}{select_sql}\nFROM {q_ident(primary_input)}"

    for j in model.get("joins") or []:
        sql += "\n" + _join_clause(j)

    where = model.get("where") or []
    if where:
        sql += "\nWHERE " + _where_block(where)

    group_by = model.get("group_by") or []
    if group_by:
        cols = ", ".join(q_ref(g.get("input"), g["column"]) for g in group_by)
        sql += "\nGROUP BY " + cols

    having = model.get("having") or []
    if having:
        sql += "\nHAVING " + _where_block(having)

    order_by = model.get("order_by") or []
    if order_by:
        parts = []
        for o in order_by:
            d = "DESC" if (o.get("dir") or "ASC").upper() == "DESC" else "ASC"
            parts.append(f"{q_ref(o.get('input'), o['column'])} {d}")
        sql += "\nORDER BY " + ", ".join(parts)

    limit = model.get("limit")
    if limit not in (None, "", 0, "0"):
        try:
            sql += f"\nLIMIT {int(limit)}"
        except (TypeError, ValueError):
            raise ValueError(f"LIMIT invalide: {limit!r}")

    return sql
