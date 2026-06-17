"""Smoke test for the Calcul block's formula compiler — text functions."""

import duckdb

from formula import compile_formula


def test_formula_text_functions():
    con = duckdb.connect()

    def ev(formula, **row):
        """Compile a formula and evaluate it on a single-row table built from row."""
        cols = ", ".join(f"? AS {k}" for k in row)
        con.execute(f"CREATE OR REPLACE TABLE t AS SELECT {cols}", list(row.values()))
        sql = compile_formula(formula)
        return con.execute(f"SELECT {sql} AS r FROM t").fetchone()[0]

    # --- the motivating case: a file name out of a full path -------------------- #
    WPATH = r"C:\Users\me\Documents\rapport final.xlsx"
    assert ev('TEXTAFTER([p], "\\", -1)', p=WPATH) == "rapport final.xlsx"
    assert ev('TEXTAFTER([p], "/", -1)', p="/var/log/app/out.csv") == "out.csv"
    # file name without extension: drop the part after the last dot
    assert ev('TEXTBEFORE(TEXTAFTER([p], "\\", -1), ".", -1)', p=WPATH) == "rapport final"
    # the extension alone
    assert ev('TEXTAFTER([p], ".", -1)', p=WPATH) == "xlsx"

    # --- TEXTBEFORE / TEXTAFTER instances --------------------------------------- #
    assert ev('TEXTBEFORE([s], "-")', s="AB-12-XY") == "AB"  # first (default)
    assert ev('TEXTAFTER([s], "-")', s="AB-12-XY") == "12-XY"  # first
    assert ev('TEXTAFTER([s], "-", -1)', s="AB-12-XY") == "XY"  # last
    assert ev('TEXTBEFORE([s], "-", -1)', s="AB-12-XY") == "AB-12"  # before last

    # --- FIND / SEARCH ---------------------------------------------------------- #
    assert ev('FIND("X", [s])', s="aXbXc") == 2
    assert ev('FIND("z", [s])', s="abc") is None  # not found -> NULL
    assert ev('SEARCH("b", [s])', s="ABC") == 2  # case-insensitive
    assert ev('FIND("X", [s], 3)', s="aXbXc") == 4  # search from pos 3

    # --- SUBSTITUTE / REPLACE / REGEX ------------------------------------------- #
    assert ev('SUBSTITUTE([s], " ", "_")', s="a b c") == "a_b_c"
    assert ev('REPLACE([s], 1, 3, "XXX")', s="abcdef") == "XXXdef"
    assert ev('REGEXEXTRACT([s], "[0-9]+")', s="ab123cd") == "123"
    assert ev('REGEXEXTRACT([p], "([^\\\\]+)\\.[^.]+$", 1)', p=WPATH) == "rapport final"
    assert ev('REGEXREPLACE([s], "[0-9]", "#")', s="a1b2") == "a#b#"
    assert ev('REPT("ab", 3)', s="x") == "ababab"

    # --- existing functions still compile --------------------------------------- #
    assert ev('UPPER([s]) & "!"', s="hi") == "HI!"
    assert ev('IF([n] > 0, "pos", "neg")', n=5) == "pos"
