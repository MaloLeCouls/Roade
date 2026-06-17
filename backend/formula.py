"""Compile an Excel-like formula into a DuckDB SQL expression.

The Calcul block lets the user write spreadsheet-style formulas; this module
turns one formula into a single SQL scalar expression that DuckDB can evaluate
inside a SELECT.

Syntax
------
* column reference : ``[Column Name]``  -> ``"Column Name"``
* text literal     : ``"hello"``        -> ``'hello'``  (``""`` escapes a quote)
* concatenation    : ``&``              -> ``||``
* numbers / ops    : ``+ - * / %`` and ``= <> != < > <= >=`` pass through
* functions        : a whitelisted set (see FUNCTIONS) mapped to DuckDB

Examples
--------
``[prix_ht] * 1.2``                         -> ``"prix_ht" * 1.2``
``IF([stock] > 0, "OK", "Rupture")``        -> ``(CASE WHEN "stock" > 0 THEN 'OK' ELSE 'Rupture' END)``
``[nom] & " " & [prenom]``                  -> ``"nom" || ' ' || "prenom"``
"""

from __future__ import annotations

import re

__all__ = ["compile_formula", "FormulaError"]


class FormulaError(ValueError):
    """Raised when a formula cannot be parsed/compiled."""


# --------------------------------------------------------------------------- #
# Tokenizer
# --------------------------------------------------------------------------- #
_TOKEN_RE = re.compile(
    r"""
      (?P<WS>\s+)
    | (?P<COL>\[[^\]]*\])
    | (?P<STR>"(?:[^"]|"")*")
    | (?P<NUM>\d+(?:\.\d+)?)
    | (?P<IDENT>[A-Za-z_][A-Za-z0-9_]*)
    | (?P<OP><=|>=|<>|!=|&|=|<|>|\+|-|\*|/|%)
    | (?P<LP>\()
    | (?P<RP>\))
    | (?P<COMMA>,)
    """,
    re.VERBOSE,
)


class _Tok:
    __slots__ = ("kind", "val")

    def __init__(self, kind, val):
        self.kind = kind
        self.val = val

    def __repr__(self):
        return f"{self.kind}:{self.val!r}"


def _tokenize(src: str) -> list[_Tok]:
    toks: list[_Tok] = []
    pos = 0
    n = len(src)
    while pos < n:
        m = _TOKEN_RE.match(src, pos)
        if not m:
            raise FormulaError(f"Caractère inattendu : « {src[pos]} »")
        pos = m.end()
        kind = m.lastgroup
        if kind == "WS":
            continue
        toks.append(_Tok(kind, m.group()))
    return toks


# --------------------------------------------------------------------------- #
# Function whitelist -> DuckDB
#   Each entry: name -> (min_args, max_args | None, builder(list[str]) -> str)
# --------------------------------------------------------------------------- #
def _fn_if(a):
    if len(a) == 2:
        return f"(CASE WHEN {a[0]} THEN {a[1]} END)"
    return f"(CASE WHEN {a[0]} THEN {a[1]} ELSE {a[2]} END)"


def _join(op):
    return lambda a: "(" + f" {op} ".join(a) + ")"


def _call(name):
    return lambda a: f"{name}(" + ", ".join(a) + ")"


# ---- text helpers (extract / locate / replace parts of a string) ----------- #
def _find_builder(ci: bool):
    """FIND/SEARCH: 1-based position of `find` in `within`, NULL if absent.
    SEARCH (ci=True) is case-insensitive; the optional 3rd arg is a start offset."""

    def b(a):
        find = f"lower({a[0]})" if ci else a[0]
        within = f"lower({a[1]})" if ci else a[1]
        if len(a) == 2:
            return f"nullif(strpos({within}, {find}), 0)"
        start = a[2]
        p = f"strpos(substr({within}, {start}), {find})"
        return f"(CASE WHEN {p} = 0 THEN NULL ELSE {p} + ({start}) - 1 END)"

    return b


def _fn_replace(a):
    """REPLACE(text, start, num_chars, new): swap `num_chars` chars at `start`."""
    s, start, num, new = a
    return f"(substr({s}, 1, ({start}) - 1) || {new} || substr({s}, ({start}) + ({num})))"


def _fn_textafter(a):
    """TEXTAFTER(text, delim [, instance]): part after the instance-th delimiter.
    instance defaults to 1 (first); a negative value counts from the end
    (-1 = after the last delimiter), handy to get a file name from a path."""
    t, d = a[0], a[1]
    n = a[2] if len(a) == 3 else "1"
    parts = f"string_split({t}, {d})"
    start = f"(CASE WHEN ({n}) >= 0 THEN ({n}) + 1 ELSE len({parts}) + ({n}) + 1 END)"
    return f"array_to_string(list_slice({parts}, {start}, len({parts})), {d})"


def _fn_textbefore(a):
    """TEXTBEFORE(text, delim [, instance]): part before the instance-th delimiter."""
    t, d = a[0], a[1]
    n = a[2] if len(a) == 3 else "1"
    parts = f"string_split({t}, {d})"
    end = f"(CASE WHEN ({n}) >= 0 THEN ({n}) ELSE len({parts}) + ({n}) END)"
    return f"array_to_string(list_slice({parts}, 1, {end}), {d})"


def _fn_regexextract(a):
    """REGEXEXTRACT(text, pattern [, group]): the (group-th) regex match, '' if none."""
    if len(a) == 2:
        return f"regexp_extract({a[0]}, {a[1]})"
    return f"regexp_extract({a[0]}, {a[1]}, CAST({a[2]} AS INTEGER))"


FUNCTIONS = {
    "IF": (2, 3, _fn_if),
    "AND": (1, None, _join("AND")),
    "OR": (1, None, _join("OR")),
    "NOT": (1, 1, lambda a: f"(NOT {a[0]})"),
    "CONCAT": (1, None, _call("concat")),
    "UPPER": (1, 1, _call("upper")),
    "LOWER": (1, 1, _call("lower")),
    "TRIM": (1, 1, _call("trim")),
    "LEFT": (2, 2, lambda a: f"left({a[0]}, {a[1]})"),
    "RIGHT": (2, 2, lambda a: f"right({a[0]}, {a[1]})"),
    "MID": (3, 3, lambda a: f"substr({a[0]}, {a[1]}, {a[2]})"),
    "LEN": (1, 1, _call("length")),
    "REPT": (2, 2, lambda a: f"repeat({a[0]}, {a[1]})"),
    "FIND": (2, 3, _find_builder(False)),
    "SEARCH": (2, 3, _find_builder(True)),
    "SUBSTITUTE": (3, 3, lambda a: f"replace({a[0]}, {a[1]}, {a[2]})"),
    "REPLACE": (4, 4, _fn_replace),
    "TEXTBEFORE": (2, 3, _fn_textbefore),
    "TEXTAFTER": (2, 3, _fn_textafter),
    "REGEXEXTRACT": (2, 3, _fn_regexextract),
    "REGEXREPLACE": (3, 3, lambda a: f"regexp_replace({a[0]}, {a[1]}, {a[2]}, 'g')"),
    "ROUND": (1, 2, lambda a: f"round({', '.join(a)})"),
    "ABS": (1, 1, _call("abs")),
    "MOD": (2, 2, lambda a: f"mod({a[0]}, {a[1]})"),
    "POWER": (2, 2, lambda a: f"pow({a[0]}, {a[1]})"),
    "MIN": (1, None, _call("least")),
    "MAX": (1, None, _call("greatest")),
    "COALESCE": (1, None, _call("coalesce")),
    "ISBLANK": (1, 1, lambda a: f"({a[0]} IS NULL OR CAST({a[0]} AS VARCHAR) = '')"),
    "YEAR": (1, 1, _call("year")),
    "MONTH": (1, 1, _call("month")),
    "DAY": (1, 1, _call("day")),
    "TODAY": (0, 0, lambda a: "current_date"),
    "TEXT": (1, 2, lambda a: f"CAST({a[0]} AS VARCHAR)"),
    "VALUE": (1, 1, lambda a: f"TRY_CAST({a[0]} AS DOUBLE)"),
}

_KEYWORDS = {"TRUE": "TRUE", "FALSE": "FALSE", "NULL": "NULL"}
_COMPARE = {"=", "<>", "!=", "<", ">", "<=", ">="}


# --------------------------------------------------------------------------- #
# Recursive-descent parser -> SQL string
# --------------------------------------------------------------------------- #
class _Parser:
    def __init__(self, toks: list[_Tok]):
        self.toks = toks
        self.i = 0

    def _peek(self):
        return self.toks[self.i] if self.i < len(self.toks) else None

    def _next(self):
        t = self._peek()
        self.i += 1
        return t

    def _expect(self, kind, val=None):
        t = self._next()
        if t is None or t.kind != kind or (val is not None and t.val != val):
            want = val or kind
            raise FormulaError(f"« {want} » attendu")
        return t

    def parse(self) -> str:
        if not self.toks:
            raise FormulaError("Formule vide")
        sql = self._comparison()
        if self._peek() is not None:
            raise FormulaError(f"Élément en trop : « {self._peek().val} »")
        return sql

    def _comparison(self):
        left = self._concat()
        while True:
            t = self._peek()
            if t and t.kind == "OP" and t.val in _COMPARE:
                self._next()
                op = "=" if t.val == "==" else t.val
                right = self._concat()
                left = f"{left} {op} {right}"
            else:
                return left

    def _concat(self):
        left = self._additive()
        while True:
            t = self._peek()
            if t and t.kind == "OP" and t.val == "&":
                self._next()
                left = f"{left} || {self._additive()}"
            else:
                return left

    def _additive(self):
        left = self._term()
        while True:
            t = self._peek()
            if t and t.kind == "OP" and t.val in ("+", "-"):
                self._next()
                left = f"{left} {t.val} {self._term()}"
            else:
                return left

    def _term(self):
        left = self._unary()
        while True:
            t = self._peek()
            if t and t.kind == "OP" and t.val in ("*", "/", "%"):
                self._next()
                left = f"{left} {t.val} {self._unary()}"
            else:
                return left

    def _unary(self):
        t = self._peek()
        if t and t.kind == "OP" and t.val in ("-", "+"):
            self._next()
            return f"{t.val}{self._unary()}"
        return self._primary()

    def _primary(self):
        t = self._next()
        if t is None:
            raise FormulaError("Formule incomplète")
        if t.kind == "NUM":
            return t.val
        if t.kind == "STR":
            inner = t.val[1:-1].replace('""', '"')  # un-escape Excel ""
            return "'" + inner.replace("'", "''") + "'"
        if t.kind == "COL":
            name = t.val[1:-1].strip()
            if not name:
                raise FormulaError("Référence de colonne vide « [] »")
            return '"' + name.replace('"', '""') + '"'
        if t.kind == "LP":
            inner = self._comparison()
            self._expect("RP")
            return f"({inner})"
        if t.kind == "IDENT":
            up = t.val.upper()
            nxt = self._peek()
            if nxt and nxt.kind == "LP":
                return self._function(up)
            if up in _KEYWORDS:
                return _KEYWORDS[up]
            raise FormulaError(f"Nom inconnu « {t.val} ». Pour une colonne, écrivez [{t.val}].")
        raise FormulaError(f"Élément inattendu : « {t.val} »")

    def _function(self, name: str):
        spec = FUNCTIONS.get(name)
        self._expect("LP")
        args = []
        if not (self._peek() and self._peek().kind == "RP"):
            args.append(self._comparison())
            while self._peek() and self._peek().kind == "COMMA":
                self._next()
                args.append(self._comparison())
        self._expect("RP")
        if spec is None:
            raise FormulaError(f"Fonction inconnue : {name}")
        lo, hi, build = spec
        if len(args) < lo or (hi is not None and len(args) > hi):
            rng = f"{lo}" if hi == lo else (f"≥ {lo}" if hi is None else f"{lo}–{hi}")
            raise FormulaError(f"{name} attend {rng} argument(s), reçu {len(args)}")
        return build(args)


def compile_formula(expr: str) -> str:
    """Compile one Excel-like formula string into a DuckDB SQL expression."""
    if expr is None or str(expr).strip() == "":
        raise FormulaError("Formule vide")
    return _Parser(_tokenize(str(expr))).parse()
