"""Bloc Calcul, fn « valeur conditionnelle » (value_when).
Sélectionne par condition une valeur dans le groupe et la rebranche sur toutes
les autres lignes du même groupe — atomique par groupe, vacuité = NULL ou
fallback fixe. Couvre les réducteurs (first/last selon order_by, min/max/sum/avg/
concat) et la source colonne ou formule."""
import pandas as pd
import duckdb
import engine

# 4 documents ; sur chacun on veut prendre la valeur de la ligne marquée comme
# référence (type='ref') et la propager à toutes les autres lignes du document.
df = pd.DataFrame({
    "doc":   ["A", "A", "A", "B", "B", "C", "C", "C", "D"],
    "type":  ["ref", "x", "x", "x", "ref", "x", "x", "x", "ref"],
    "val":   ["v1", "v2", "v3", "v4", "v5", "v6", "v7", "v8", "v9"],
    "n":     [10,    20,   30,   40,   50,   60,   70,   80,   90],
    "ord":   [3,     1,    2,    1,    2,    1,    2,    3,    1],
})

con = duckdb.connect(":memory:")


def apply(group):
    return engine._apply_value_when(con, df, group)


# --- réducteur 'first' (sans order_by) -------------------------------------
# A: ref sur row#0 (v1) ; B: ref sur row#4 (v5) ; C: aucun ref -> NULL ;
# D: ref sur row#8 (v9).
out = apply({"partition_by": ["doc"], "functions": [{
    "fn": "value_when", "name": "val_ref", "enabled": True,
    "source": {"kind": "column", "column": "val"},
    "condition": {"groups": [{"rules": [{"column": "type", "test": "equals", "value": "ref"}]}]},
    "reducer": "first",
}]})
got = out.groupby("doc")["val_ref"].first().to_dict()
assert got == {"A": "v1", "B": "v5", "C": None, "D": "v9"} or \
       {k: (None if pd.isna(v) else v) for k, v in got.items()} == {"A": "v1", "B": "v5", "C": None, "D": "v9"}, got
# atomicité : toutes les lignes du groupe ont la même valeur
for d, g in out.groupby("doc"):
    assert g["val_ref"].nunique(dropna=False) == 1, (d, g["val_ref"].tolist())
print("first (sans tri) ->", got)


# --- fallback fixe quand aucun match dans le groupe -----------------------
out = apply({"partition_by": ["doc"], "functions": [{
    "fn": "value_when", "name": "val_ref", "enabled": True,
    "source": {"kind": "column", "column": "val"},
    "condition": {"groups": [{"rules": [{"column": "type", "test": "equals", "value": "ref"}]}]},
    "reducer": "first",
    "fallback": {"mode": "value", "value": "(inconnu)"},
}]})
got = out.groupby("doc")["val_ref"].first().to_dict()
assert got == {"A": "v1", "B": "v5", "C": "(inconnu)", "D": "v9"}, got
print("fallback fixe ->", got)


# --- first / last respectent order_by ------------------------------------
# Sur A, trois lignes type='x' ne sont pas refs. On change la condition pour
# matcher type='x' et on regarde l'effet du tri par 'ord'.
cfg = {"partition_by": ["doc"], "order_by": [{"column": "ord", "desc": False}], "functions": [{
    "fn": "value_when", "name": "x_first", "enabled": True,
    "source": {"kind": "column", "column": "val"},
    "condition": {"groups": [{"rules": [{"column": "type", "test": "equals", "value": "x"}]}]},
    "reducer": "first",
}]}
out = apply(cfg)
# A: x sur ord 1,2,3 -> trié 1,2,3 -> v2 ; B: x sur ord 1 -> v4 ;
# C: x sur ord 1,2,3 -> v6 ; D: aucun x -> NULL
got = out.groupby("doc")["x_first"].first().to_dict()
expected = {"A": "v2", "B": "v4", "C": "v6", "D": None}
norm = {k: (None if pd.isna(v) else v) for k, v in got.items()}
assert norm == expected, norm
# last avec même tri
cfg["functions"][0]["reducer"] = "last"
cfg["functions"][0]["name"] = "x_last"
out = apply(cfg)
got = out.groupby("doc")["x_last"].first().to_dict()
expected = {"A": "v3", "B": "v4", "C": "v8", "D": None}
norm = {k: (None if pd.isna(v) else v) for k, v in got.items()}
assert norm == expected, norm
print("first/last avec order_by ->", expected)


# --- réducteurs numériques sur plusieurs lignes matchantes ---------------
for reducer, expected in [
    ("sum", {"A": 50.0, "B": 40.0, "C": 210.0, "D": None}),   # somme des n où type='x'
    ("min", {"A": 20.0, "B": 40.0, "C": 60.0, "D": None}),
    ("max", {"A": 30.0, "B": 40.0, "C": 80.0, "D": None}),
    ("avg", {"A": 25.0, "B": 40.0, "C": 70.0, "D": None}),
]:
    out = apply({"partition_by": ["doc"], "functions": [{
        "fn": "value_when", "name": f"r_{reducer}", "enabled": True,
        "source": {"kind": "column", "column": "n"},
        "condition": {"groups": [{"rules": [{"column": "type", "test": "equals", "value": "x"}]}]},
        "reducer": reducer,
    }]})
    got = out.groupby("doc")[f"r_{reducer}"].first().to_dict()
    norm = {k: (None if pd.isna(v) else float(v)) for k, v in got.items()}
    assert norm == expected, (reducer, norm)
    print(f"reducer {reducer:4} -> {expected}")


# --- concat : liste des valeurs matchantes -------------------------------
out = apply({"partition_by": ["doc"], "functions": [{
    "fn": "value_when", "name": "x_list", "enabled": True,
    "source": {"kind": "column", "column": "val"},
    "condition": {"groups": [{"rules": [{"column": "type", "test": "equals", "value": "x"}]}]},
    "reducer": "concat",
}]})
got = out.groupby("doc")["x_list"].first().to_dict()
expected = {"A": "v2, v3", "B": "v4", "C": "v6, v7, v8", "D": None}
norm = {k: (None if pd.isna(v) else v) for k, v in got.items()}
assert norm == expected, norm
print("concat ->", expected)


# --- source = formule (compile_formula sur _vw_in) -----------------------
# Pour chaque doc, on veut '<val>=<n>' UNIQUEMENT pour la ligne de référence.
out = apply({"partition_by": ["doc"], "functions": [{
    "fn": "value_when", "name": "etiq", "enabled": True,
    "source": {"kind": "formula", "expr": '[val] & "=" & [n]'},
    "condition": {"groups": [{"rules": [{"column": "type", "test": "equals", "value": "ref"}]}]},
    "reducer": "first",
}]})
got = out.groupby("doc")["etiq"].first().to_dict()
expected = {"A": "v1=10", "B": "v5=50", "C": None, "D": "v9=90"}
norm = {k: (None if pd.isna(v) else v) for k, v in got.items()}
assert norm == expected, norm
print("source formule ->", expected)


print("OK — value_when : sélection conditionnelle + réducteurs + fallback + atomique par groupe")
