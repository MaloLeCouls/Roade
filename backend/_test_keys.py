"""Tests for the « Clés multiples » analysis (_compute_keys_analysis) and the
group drill-down endpoint (engine.keys_group)."""
import pandas as pd
import storage, engine

# --- direct unit test on _compute_keys_analysis ---------------------------- #
df = pd.DataFrame({
    "client_id": [1, 1, 1, 2, 2, 3],
    "name":      ["Alice", "Alice", "Alice", "Bob", "Bob", "Carol"],  # stable per id
    "city":      ["Paris", "Paris", "Lyon", "Nice", "Nice", "Lille"],  # varies for id=1
})
types = {"client_id": "BIGINT", "name": "VARCHAR", "city": "VARCHAR"}
a = engine._compute_keys_analysis(df, {"kind": "keys", "key": ["client_id"], "top": 5}, types, len(df))
print("KEYS:", {k: a[k] for k in ("distinct_keys", "dup_keys", "singletons", "rows_in_dups", "unique")})
assert a["distinct_keys"] == 3 and a["dup_keys"] == 2 and a["singletons"] == 1
assert a["rows_in_dups"] == 5 and a["unique"] is False
assert a["group_max"] == 3 and a["null_keys"] == 0

# distribution: one key each of size 3, 2, 1
dist = {d["key"]: d["count"] for d in a["distribution"]}
assert dist.get("1") == 1 and dist.get("2") == 1 and dist.get("3") == 1, dist

# functional dependency: name constant per id, city varies in 1 group (id=1)
cons = {e["column"]: e for e in a["consistency"]}
assert cons["name"]["constant"] is True, cons["name"]
assert cons["city"]["constant"] is False and cons["city"]["varying_groups"] == 1, cons["city"]
assert set(cons["city"]["example"]["values"]) == {"Paris", "Lyon"}

# biggest group first, with its rows
top = a["top_groups"][0]
assert top["key"] == {"client_id": 1} and top["size"] == 3 and len(top["rows"]) == 3
# smallest group first (the singleton id=3)
small = a["small_groups"][0]
assert small["size"] == 1 and small["key"] == {"client_id": 3}
assert a["group_min"] == 1 and a["group_max"] == 3
print("  distribution:", dist, "| city varies:", cons["city"]["varying_groups"], "groupe",
      "| min/max:", a["group_min"], "/", a["group_max"])

# composite key (client_id, name) — still 3 groups since name is determined by id
ac = engine._compute_keys_analysis(df, {"kind": "keys", "key": ["client_id", "name"]}, types, len(df))
assert ac["distinct_keys"] == 3 and ac["dup_keys"] == 2
print("  composite key ->", ac["distinct_keys"], "groupes")

# unique key -> candidate
au = engine._compute_keys_analysis(df, {"kind": "keys", "key": ["city"]}, types, len(df))
print("  city unique?", au["unique"], "(distinct", au["distinct_keys"], ")")

# --- end-to-end: report node + group drill-down ---------------------------- #
p = storage.create_project("Keys")
pid = p["id"]
fd = storage.files_dir(pid)
df.to_excel(fd / "clients.xlsx", index=False)

wf = storage.create_workflow(pid, "W")
wid = wf["id"]
wf["nodes"] = [
    {"id": "src", "type": "source", "position": {}, "data": {"file": "clients.xlsx"}},
    {"id": "rep", "type": "report", "position": {}, "data": {
        "analyses": [{"id": "k1", "kind": "keys", "key": ["client_id"], "top": 5}]}},
]
wf["edges"] = [{"id": "e1", "source": "src", "target": "rep", "sourceHandle": "out", "targetHandle": "in"}]
storage.save_workflow(pid, wf)

res = engine.run_workflow(pid, wid)
print("RAN:", res["ran"])
report = engine.preview_node(pid, wid, "rep")["report"]
ra = report["analyses"][0]
assert ra["kind"] == "keys" and ra["dup_keys"] == 2

# drill-down: search key value "2" -> the group for client_id=2 (2 rows)
g = engine.keys_group(pid, wid, "rep", ["client_id"], "2")
print("GROUP q=2:", g["row_count"], "ligne(s)")
assert g["available"] and g["row_count"] == 2
assert all(r["client_id"] == 2 for r in g["rows"])

storage.delete_project(pid)
print("OK — keys analysis tests passed")
