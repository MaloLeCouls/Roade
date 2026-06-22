"""Group conditions must be GROUP-ATOMIC: every row of a group gets the same
verdict, so a group is never split between the conforme / non-conforme outputs.
This guards every check kind (a per-row check like the old 'unique' would split
groups — regression covered here)."""

import pandas as pd

import engine


def test_group_atomic_single_column():
    df = pd.DataFrame(
        {
            "nom": ["A", "A", "A", "B", "B", "B", "C", "C", "C", "D", "D", "D"],
            "libelle": ["x", "x", "y", "p", "q", "r", None, None, None, "a", None, "b"],
            "cat": ["m", "m", "m", "m", "n", "n", "z", "z", "z", "k", "k", "k"],
        }
    )

    def verdicts(cond):
        m = engine._group_condition_mask(df, cond, True, None).astype(bool)
        g = df.assign(ok=list(m)).groupby("nom")["ok"]
        assert (g.nunique() == 1).all(), f"NON ATOMIQUE pour {cond}: {g.nunique().to_dict()}"
        return g.first().to_dict()

    # every single check must be atomic (one verdict per group)
    for ck in [
        {"check": "unique", "column": "libelle"},
        {"check": "constant", "column": "cat"},
        {"check": "no_null", "column": "libelle"},
        {"check": "all_null", "column": "libelle"},
        {"check": "not_all_null", "column": "libelle"},
        {"check": "distinct_min", "n": 2, "column": "libelle"},
        {"check": "contains", "value": "x", "column": "libelle"},
        {"check": "size_min", "n": 3},
    ]:
        verdicts({"group_by": ["nom"], "checks": [ck]})

    # the reported scenario: unicité + pas entièrement vide, combined (ET)
    v = verdicts(
        {
            "group_by": ["nom"],
            "checks": [
                {"check": "not_all_null", "column": "libelle"},
                {"check": "unique", "column": "libelle"},
            ],
        }
    )
    assert v == {"A": False, "B": True, "C": False, "D": True}, v

    # constant: cat is constant only for A (m,m,m), C (z,z,z), D (k,k,k); B has m,n
    vc = verdicts({"group_by": ["nom"], "checks": [{"check": "constant", "column": "cat"}]})
    assert vc == {"A": True, "B": False, "C": True, "D": True}, vc

    # all_null (toujours vide): libelle empty in EVERY row only for C (None,None,None) — inverse of no_null
    va = verdicts({"group_by": ["nom"], "checks": [{"check": "all_null", "column": "libelle"}]})
    assert va == {"A": False, "B": False, "C": True, "D": False}, va


def test_group_check_case_insensitive():
    """Régression : en pandas 3.0, les colonnes texte sont du dtype `str` (plus
    `object`), y compris à la lecture Parquet. Le repli en minuscules du
    contrôle par groupe était gardé par `dtype == object` → il était sauté, et
    toute comparaison insensible à la casse échouait dès qu'une casse différait.

    Symptôme rapporté : « trier les groupes où la colonne contient la valeur X »
    ne marchait que si X tombait, à la bonne casse, sur la 1re ligne du groupe.
    """
    df = pd.DataFrame(
        {
            "groupe": ["A", "A", "B", "B", "C", "C"],
            # « clos » (groupe A) en 2e ligne, « CLOS » (groupe C) en 2e ligne
            # avec une casse différente de la valeur cherchée.
            "statut": ["ouvert", "clos", "ouvert", "ouvert", "ouvert", "CLOS"],
        }
    )

    def matched(cs):
        m = engine._group_condition_mask(
            df,
            {
                "group_by": ["groupe"],
                "checks": [{"check": "contains", "column": "statut", "value": "clos"}],
            },
            cs,
            "statut",
        ).astype(bool)
        g = df.assign(ok=list(m)).groupby("groupe")["ok"]
        assert (g.nunique() == 1).all(), g.nunique().to_dict()  # toujours atomique
        return {k for k, v in g.first().to_dict().items() if v}

    # Insensible à la casse : A (« clos ») ET C (« CLOS », 2e ligne) matchent ; B non.
    assert matched(False) == {"A", "C"}
    # Sensible à la casse : seul A (« clos » exact) matche ; C (« CLOS ») non.
    assert matched(True) == {"A"}

    # Un check fondé sur l'égalité des valeurs (constant) bénéficie aussi du
    # repli de casse : « Paris »/« paris » = une seule valeur en insensible.
    df2 = pd.DataFrame({"g": ["A", "A", "B", "B"], "ville": ["Paris", "paris", "Lyon", "Nice"]})

    def constant(cs):
        m = engine._group_condition_mask(
            df2,
            {"group_by": ["g"], "checks": [{"check": "constant", "column": "ville"}]},
            cs,
            "ville",
        ).astype(bool)
        return df2.assign(ok=list(m)).groupby("g")["ok"].first().to_dict()

    assert constant(False) == {"A": True, "B": False}  # Paris == paris en ci
    assert constant(True) == {"A": False, "B": False}  # Paris != paris en cs


def test_group_atomic_two_columns():
    df2 = pd.DataFrame(
        {
            "nom": ["F1"] * 6 + ["F2"] * 3,
            "config": ["c1", "c2", "c3", "c1a", "c2a", "c3a", "k1", "k1", "k2"],
            "truc": ["t1", "t2", "t3", "t1", "t2", "t3", "t1", "t9", "t2"],
        }
    )

    def verdicts2(cond):
        m = engine._group_condition_mask(df2, cond, True, None).astype(bool)
        g = df2.assign(ok=list(m)).groupby("nom")["ok"]
        assert (g.nunique() == 1).all(), f"NON ATOMIQUE pour {cond}: {g.nunique().to_dict()}"
        return g.first().to_dict()

    # F1: config→truc is a function (each config one truc) ; F2: k1→{t1,t9} breaks it
    assert verdicts2(
        {
            "group_by": ["nom"],
            "checks": [{"check": "determines", "column": "config", "column2": "truc"}],
        }
    ) == {"F1": True, "F2": False}
    # reverse: truc→config holds in both (each truc maps to a single config)
    assert verdicts2(
        {
            "group_by": ["nom"],
            "checks": [{"check": "determines", "column": "truc", "column2": "config"}],
        }
    ) == {"F1": False, "F2": True}
    # distinct counts: F1 has 6 configs vs 3 trucs (>) ; F2 has 2 vs 3 (not >)
    assert verdicts2(
        {
            "group_by": ["nom"],
            "checks": [
                {"check": "distinct_cmp", "column": "config", "op": "gt", "column2": "truc"}
            ],
        }
    ) == {"F1": True, "F2": False}
    assert verdicts2(
        {
            "group_by": ["nom"],
            "checks": [
                {"check": "distinct_cmp", "column": "config", "op": "ne", "column2": "truc"}
            ],
        }
    ) == {"F1": True, "F2": True}


def test_group_atomic_conditional():
    """Conditional checks: WHEN premise + rows_satisfy consequent — still atomic.
    A group with no matching row is conforme by vacuity (implication P->Q is true
    when P is false)."""

    df3 = pd.DataFrame(
        {
            "doc": ["A", "A", "B", "B", "C", "C", "D"],
            "statut": [
                "validé",
                "validé",
                "validé",
                "brouillon",
                "brouillon",
                "brouillon",
                "validé",
            ],
            "date_val": ["2024", None, "2024", None, None, None, "2025"],
            "type": ["final", "final", "final", "draft", "draft", "draft", "final"],
            "version": ["v1", "v1", "v1", "v9", "v1", "v1", "v1"],
        }
    )

    def verdicts3(cond):
        m = engine._group_condition_mask(df3, cond, True, None).astype(bool)
        g = df3.assign(ok=list(m)).groupby("doc")["ok"]
        assert (g.nunique() == 1).all(), f"NON ATOMIQUE pour {cond}: {g.nunique().to_dict()}"
        return g.first().to_dict()

    def _when(col, val):
        return {"groups": [{"rules": [{"column": col, "test": "equals", "value": val}]}]}

    def _then(col, test):
        return {"groups": [{"rules": [{"column": col, "test": test}]}]}

    # rows_satisfy: "quand statut = validé, alors date_val est non vide"
    v = verdicts3(
        {
            "group_by": ["doc"],
            "checks": [
                {
                    "check": "rows_satisfy",
                    "when": _when("statut", "validé"),
                    "then": _then("date_val", "not_empty"),
                }
            ],
        }
    )
    assert v == {"A": False, "B": True, "C": True, "D": True}, v

    # premise on a property check: "quand type = final, version unique"
    v = verdicts3(
        {
            "group_by": ["doc"],
            "checks": [{"check": "unique", "column": "version", "when": _when("type", "final")}],
        }
    )
    assert v == {"A": False, "B": True, "C": True, "D": True}, v

    # the premise really filters: same no_null check with vs without a premise differs.
    no_premise = verdicts3(
        {"group_by": ["doc"], "checks": [{"check": "no_null", "column": "date_val"}]}
    )
    assert no_premise == {"A": False, "B": False, "C": False, "D": True}, no_premise
    with_premise = verdicts3(
        {
            "group_by": ["doc"],
            "checks": [
                {"check": "no_null", "column": "date_val", "when": _when("statut", "validé")}
            ],
        }
    )
    assert with_premise == {"A": False, "B": True, "C": True, "D": True}, with_premise

    # a premise that never matches -> every group conforme by vacuity
    none_match = verdicts3(
        {
            "group_by": ["doc"],
            "checks": [
                {
                    "check": "rows_satisfy",
                    "when": _when("statut", "inexistant"),
                    "then": _then("date_val", "not_empty"),
                }
            ],
        }
    )
    assert none_match == {"A": True, "B": True, "C": True, "D": True}, none_match

    # two conditional checks combined (ET): both must hold for the group
    v = verdicts3(
        {
            "group_by": ["doc"],
            "checks": [
                {
                    "check": "rows_satisfy",
                    "when": _when("statut", "validé"),
                    "then": _then("date_val", "not_empty"),
                },
                {"check": "unique", "column": "version", "when": _when("type", "final")},
            ],
        }
    )
    assert v == {"A": False, "B": True, "C": True, "D": True}, v
