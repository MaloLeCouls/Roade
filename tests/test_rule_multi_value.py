"""Mode multi-valeur des règles de Validation.

Avant : pour « starts_with l'un de [00, 01, 02, …] », l'utilisateur devait
créer N conditions séparées en OR. Maintenant `rule.values = [...]` fait
en un coup la sémantique « ANY-match » (et « NONE-match » pour `not_*`)."""

import pandas as pd

import engine


def _mask(df, rule, cs=False, default_col="x"):
    """Helper : évalue _rule_mask sur un DataFrame et renvoie la liste booléenne."""
    return engine._rule_mask(df, rule, cs, default_col).tolist()


def _ok(s, rule, cs=False):
    return engine._rule_ok(s, rule, cs)


# --- vectorisé (_rule_mask) -------------------------------------------------


def test_starts_with_any_or():
    df = pd.DataFrame({"x": ["001-A", "01-B", "10-C", "02-D", "11-E"]})
    rule = {"test": "starts_with", "values": ["00", "01", "02"]}
    assert _mask(df, rule) == [True, True, False, True, False]


def test_ends_with_any_or():
    df = pd.DataFrame({"x": ["A.csv", "B.xls", "C.xlsx", "D.txt"]})
    rule = {"test": "ends_with", "values": [".csv", ".xls", ".xlsx"]}
    assert _mask(df, rule) == [True, True, True, False]


def test_contains_any_or():
    df = pd.DataFrame({"x": ["alpha-beta", "beta-gamma", "delta", "alpha"]})
    rule = {"test": "contains", "values": ["alpha", "gamma"]}
    assert _mask(df, rule) == [True, True, False, True]


def test_equals_any_or():
    df = pd.DataFrame({"x": ["A", "B", "C", "D"]})
    rule = {"test": "equals", "values": ["A", "C"]}
    assert _mask(df, rule) == [True, False, True, False]


def test_not_contains_means_none_of():
    """Sémantique attendue : « ne contient aucune de [X, Y] » = NOT (contient X OR Y)."""
    df = pd.DataFrame({"x": ["alpha", "beta", "alpha-beta", "gamma"]})
    rule = {"test": "not_contains", "values": ["alpha", "beta"]}
    # alpha → contient alpha → exclu
    # beta → contient beta → exclu
    # alpha-beta → contient les deux → exclu
    # gamma → n'en contient aucune → matche
    assert _mask(df, rule) == [False, False, False, True]


def test_not_equals_means_none_of():
    df = pd.DataFrame({"x": ["A", "B", "C", "D"]})
    rule = {"test": "not_equals", "values": ["A", "C"]}
    # A et C sont exclus ; B et D matchent
    assert _mask(df, rule) == [False, True, False, True]


def test_negate_on_multi_value_does_not_double_negate_not_contains():
    """NON sur `not_contains [X]` doit revenir à `contains [X]`, pas s'annuler avec
    la conversion not_contains → contains du multi-valeur."""
    df = pd.DataFrame({"x": ["alpha", "beta"]})
    rule = {"test": "not_contains", "values": ["alpha"], "negate": True}
    # not_contains [alpha] = [False, True] ; NON → [True, False]
    assert _mask(df, rule) == [True, False]


def test_empty_values_list_falls_back_to_single_value():
    """`values: []` est traité comme « pas de multi-valeur » → on retombe sur
    `value`. Évite de matcher zéro lignes en silence si la liste est vide."""
    df = pd.DataFrame({"x": ["00-A", "01-B"]})
    rule = {"test": "starts_with", "value": "00", "values": []}
    assert _mask(df, rule) == [True, False]


def test_blank_values_are_stripped():
    """Les entrées vides (frappées par erreur) sont ignorées."""
    df = pd.DataFrame({"x": ["00-A", "01-B", "02-C"]})
    rule = {"test": "starts_with", "values": ["00", "", " ", "02"]}
    assert _mask(df, rule) == [True, False, True]


def test_case_insensitive_multi_value():
    df = pd.DataFrame({"x": ["ABC", "DEF", "ghi"]})
    rule = {"test": "starts_with", "values": ["abc", "GHI"]}
    assert _mask(df, rule, cs=False) == [True, False, True]
    assert _mask(df, rule, cs=True) == [False, False, False]


# --- scalaire (_rule_ok) — utilisé par les testers live ---------------------


def test_rule_ok_starts_with_any():
    rule = {"test": "starts_with", "values": ["F0", "FE"]}
    assert _ok("F0-X", rule) is True
    assert _ok("FE-Y", rule) is True
    assert _ok("FX-Z", rule) is False


def test_rule_ok_not_contains_none_of():
    rule = {"test": "not_contains", "values": ["bad", "evil"]}
    assert _ok("alpha", rule) is True
    assert _ok("bad-thing", rule) is False
    assert _ok("evil-thing", rule) is False
