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

print("OK — toutes les conditions de groupe sont atomiques")
