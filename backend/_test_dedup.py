"""Smoke test for the dedup block."""
import pandas as pd
import storage, engine

p = storage.create_project("DedupTest")
pid = p["id"]
fd = storage.files_dir(pid)
# rows 0&1 duplicate on (Country,Client); row 4 duplicates row 0 fully-ish
pd.DataFrame({
    "Country": ["FR", "FR", "DE", "US", "FR"],
    "Client":  ["a",  "a",  "b",  "c",  "a"],
    "Amount":  [100,  100,  50,   400,  999],
}).to_excel(fd / "d.xlsx", index=False)

wf = storage.create_workflow(pid, "T")
wid = wf["id"]
wf["nodes"] = [
    {"id": "s", "type": "source", "position": {"x": 0, "y": 0},
     "data": {"file": "d.xlsx"}},
    {"id": "d", "type": "dedup", "position": {"x": 300, "y": 0},
     "data": {"key_columns": ["Country", "Client"], "keep": "first", "dups_mode": "all"}},
]
wf["edges"] = [
    {"id": "e1", "source": "s", "target": "d", "sourceHandle": "out", "targetHandle": "in"},
]
storage.save_workflow(pid, wf)

res = engine.run_workflow(pid, wid)
print("outputs:", res["results"]["d"]["outputs"])

kept = engine.preview_node(pid, wid, "d", handle="kept")
dups = engine.preview_node(pid, wid, "d", handle="dups")
uniq = engine.preview_node(pid, wid, "d", handle="uniques")
print("kept rows:", kept["row_count"], [r["Client"] + r["Country"] for r in kept["rows"]])
print("dups rows:", dups["row_count"])
print("uniques rows:", uniq["row_count"])

# (FR,a) appears 3x, (DE,b) 1x, (US,c) 1x  -> 3 groups
assert kept["row_count"] == 3        # one per group
assert dups["row_count"] == 3        # all 3 rows of the FR/a group
assert uniq["row_count"] == 2        # DE/b and US/c

# exemplar mode
wf["nodes"][1]["data"]["dups_mode"] = "exemplar"
storage.save_workflow(pid, wf)
engine.run_workflow(pid, wid, only_node="d")
dups2 = engine.preview_node(pid, wid, "d", handle="dups")
assert dups2["row_count"] == 1       # one exemplar of the duplicated group
print("exemplar dups rows:", dups2["row_count"])

storage.delete_project(pid)
print("OK — dedup test passed")
