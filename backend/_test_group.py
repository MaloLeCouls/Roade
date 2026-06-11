"""Group conditions must be GROUP-ATOMIC: every row of a group gets the same
verdict, so a group is never split between the conforme / non-conforme outputs.
This guards every check kind (a per-row check like the old 'unique' would split
groups — regression covered here)."""
import pandas as pd
import engine

df = pd.DataFrame({
    "nom":     ["A", "A", "A", "B", "B", "B", "C", "C", "C", "D", "D", "D"],
    "libelle": ["x", "x", "y", "p", "q", "r", None, None, None, "a", None, "b"],
    "cat":     ["m", "m", "m", "m", "n", "n", "z", "z", "z", "k", "k", "k"],
})


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
    v = verdicts({"group_by": ["nom"], "checks": [ck]})
    print(f"{ck.get('check'):14} -> {v}")

# the reported scenario: unicité + pas entièrement vide, combined (ET)
v = verdicts({"group_by": ["nom"], "checks": [
    {"check": "not_all_null", "column": "libelle"},
    {"check": "unique", "column": "libelle"},
]})
assert v == {"A": False, "B": True, "C": False, "D": True}, v
print("combo not_all_null & unique ->", v)

# constant: cat is constant only for A (m,m,m), C (z,z,z), D (k,k,k); B has m,n
vc = verdicts({"group_by": ["nom"], "checks": [{"check": "constant", "column": "cat"}]})
assert vc == {"A": True, "B": False, "C": True, "D": True}, vc

# all_null (toujours vide): libelle empty in EVERY row only for C (None,None,None) — inverse of no_null
va = verdicts({"group_by": ["nom"], "checks": [{"check": "all_null", "column": "libelle"}]})
assert va == {"A": False, "B": False, "C": True, "D": False}, va

# --- two-column checks: compare a column to another (atomic, robust) -------
df2 = pd.DataFrame({
    "nom":    ["F1"] * 6 + ["F2"] * 3,
    "config": ["c1", "c2", "c3", "c1a", "c2a", "c3a", "k1", "k1", "k2"],
    "truc":   ["t1", "t2", "t3", "t1", "t2", "t3", "t1", "t9", "t2"],
})


def verdicts2(cond):
    m = engine._group_condition_mask(df2, cond, True, None).astype(bool)
    g = df2.assign(ok=list(m)).groupby("nom")["ok"]
    assert (g.nunique() == 1).all(), f"NON ATOMIQUE pour {cond}: {g.nunique().to_dict()}"
    return g.first().to_dict()


# F1: config→truc is a function (each config one truc) ; F2: k1→{t1,t9} breaks it
assert verdicts2({"group_by": ["nom"], "checks": [
    {"check": "determines", "column": "config", "column2": "truc"}]}) == {"F1": True, "F2": False}
# reverse: truc→config holds in both (each truc maps to a single config)
assert verdicts2({"group_by": ["nom"], "checks": [
    {"check": "determines", "column": "truc", "column2": "config"}]}) == {"F1": False, "F2": True}
# distinct counts: F1 has 6 configs vs 3 trucs (>) ; F2 has 2 vs 3 (not >)
assert verdicts2({"group_by": ["nom"], "checks": [
    {"check": "distinct_cmp", "column": "config", "op": "gt", "column2": "truc"}]}) == {"F1": True, "F2": False}
assert verdicts2({"group_by": ["nom"], "checks": [
    {"check": "distinct_cmp", "column": "config", "op": "ne", "column2": "truc"}]}) == {"F1": True, "F2": True}

print("OK — toutes les conditions de groupe sont atomiques (dont comparaisons à 2 colonnes)")

# --- conditional checks: WHEN premise + rows_satisfy consequent -------------
# Still GROUP-ATOMIC. A premise filters the rows a check looks at; a group with
# no matching row is conforme by vacuity (implication P->Q is true when P false).
df3 = pd.DataFrame({
    "doc":      ["A", "A", "B", "B", "C", "C", "D"],
    "statut":   ["validé", "validé", "validé", "brouillon", "brouillon", "brouillon", "validé"],
    "date_val": ["2024", None, "2024", None, None, None, "2025"],
    "type":     ["final", "final", "final", "draft", "draft", "draft", "final"],
    "version":  ["v1", "v1", "v1", "v9", "v1", "v1", "v1"],
})


def verdicts3(cond):
    m = engine._group_condition_mask(df3, cond, True, None).astype(bool)
    g = df3.assign(ok=list(m)).groupby("doc")["ok"]
    assert (g.nunique() == 1).all(), f"NON ATOMIQUE pour {cond}: {g.nunique().to_dict()}"
    return g.first().to_dict()


def _when(col, val):  return {"groups": [{"rules": [{"column": col, "test": "equals", "value": val}]}]}
def _then(col, test): return {"groups": [{"rules": [{"column": col, "test": test}]}]}

# rows_satisfy: "quand statut = validé, alors date_val est non vide"
#   A: a validé row has no date -> FAIL ; B: validé row has a date (brouillon row
#   ignored) -> OK ; C: no validé row -> vacuously OK ; D: validé + date -> OK.
v = verdicts3({"group_by": ["doc"], "checks": [
    {"check": "rows_satisfy", "when": _when("statut", "validé"), "then": _then("date_val", "not_empty")}]})
assert v == {"A": False, "B": True, "C": True, "D": True}, v
print("rows_satisfy (statut=validé -> date non vide) ->", v)

# premise on a property check: "quand type = final, version unique"
#   A: two final rows share v1 -> not unique -> FAIL ; B: one final row -> OK ;
#   C: no final -> vacuously OK ; D: one final -> OK.
v = verdicts3({"group_by": ["doc"], "checks": [
    {"check": "unique", "column": "version", "when": _when("type", "final")}]})
assert v == {"A": False, "B": True, "C": True, "D": True}, v
print("unique WHEN type=final ->", v)

# the premise really filters: same no_null check with vs without a premise differs.
no_premise = verdicts3({"group_by": ["doc"], "checks": [{"check": "no_null", "column": "date_val"}]})
assert no_premise == {"A": False, "B": False, "C": False, "D": True}, no_premise   # legacy behaviour, unchanged
with_premise = verdicts3({"group_by": ["doc"], "checks": [
    {"check": "no_null", "column": "date_val", "when": _when("statut", "validé")}]})
assert with_premise == {"A": False, "B": True, "C": True, "D": True}, with_premise

# a premise that never matches -> every group conforme by vacuity
none_match = verdicts3({"group_by": ["doc"], "checks": [
    {"check": "rows_satisfy", "when": _when("statut", "inexistant"), "then": _then("date_val", "not_empty")}]})
assert none_match == {"A": True, "B": True, "C": True, "D": True}, none_match

# two conditional checks combined (ET): both must hold for the group
v = verdicts3({"group_by": ["doc"], "checks": [
    {"check": "rows_satisfy", "when": _when("statut", "validé"), "then": _then("date_val", "not_empty")},
    {"check": "unique", "column": "version", "when": _when("type", "final")}]})
assert v == {"A": False, "B": True, "C": True, "D": True}, v

print("OK — contrôles de groupe conditionnels (prémisse QUAND + rows_satisfy), atomiques")
