"""Quick end-to-end smoke test of the engine (no HTTP)."""
import pandas as pd
import storage, engine

# clean slate
p = storage.create_project("Selftest")
pid = p["id"]
print("project", pid)

# write two excel sources
fd = storage.files_dir(pid)
pd.DataFrame({
    "Country": ["FR", "FR", "DE", "US", "DE"],
    "Amount": [100, 200, 50, 400, 75],
    "Client": ["a", "b", "c", "d", "e"],
}).to_excel(fd / "ventes.xlsx", index=False)
pd.DataFrame({
    "Country": ["FR", "DE", "US"],
    "Region": ["Europe", "Europe", "Amerique"],
}).to_excel(fd / "regions.xlsx", index=False)

wf = storage.create_workflow(pid, "Test")
wid = wf["id"]
wf["nodes"] = [
    {"id": "src1", "type": "source", "position": {"x": 0, "y": 0},
     "data": {"label": "Ventes", "file": "ventes.xlsx"}},
    {"id": "src2", "type": "source", "position": {"x": 0, "y": 200},
     "data": {"label": "Regions", "file": "regions.xlsx"}},
    {"id": "sql1", "type": "sql", "position": {"x": 300, "y": 0},
     "data": {"label": "Agg", "mode": "builder", "query": {
         "select": [
             {"kind": "column", "input": "in1", "column": "Country"},
             {"kind": "column", "input": "in2", "column": "Region"},
             {"kind": "agg", "func": "SUM", "input": "in1", "column": "Amount", "alias": "total"},
         ],
         "joins": [{"input": "in2", "type": "LEFT", "on": [
             {"left_input": "in1", "left_column": "Country",
              "right_input": "in2", "right_column": "Country"}]}],
         "where": [{"input": "in1", "column": "Amount", "op": ">", "value": "60", "value_type": "number"}],
         "group_by": [{"input": "in1", "column": "Country"}, {"input": "in2", "column": "Region"}],
         "order_by": [{"input": "in1", "column": "Country", "dir": "ASC"}],
     }}},
    {"id": "exp1", "type": "export", "position": {"x": 600, "y": 0},
     "data": {"label": "Sortie", "filename": "resultat", "format": "xlsx"}},
]
wf["edges"] = [
    {"id": "e1", "source": "src1", "target": "sql1", "sourceHandle": "out", "targetHandle": "in1"},
    {"id": "e2", "source": "src2", "target": "sql1", "sourceHandle": "out", "targetHandle": "in2"},
    {"id": "e3", "source": "sql1", "target": "exp1", "sourceHandle": "out", "targetHandle": "in"},
]
storage.save_workflow(pid, wf)

res = engine.run_workflow(pid, wid)
print("RAN:", res["ran"])
for nid, r in res["results"].items():
    print(" ", nid, r.get("row_count"), r.get("type"))

prev = engine.preview_node(pid, wid, "sql1")
print("SQL columns:", [c["name"] for c in prev["columns"]])
print("compiled_sql:\n", prev["compiled_sql"])
print("rows:", prev["rows"])
assert any(c["name"] == "total" for c in prev["columns"])
assert (storage.files_dir(pid) / "resultat.xlsx").exists()

# cleanup
storage.delete_project(pid)
print("OK — selftest passed")
