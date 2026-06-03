"""Smoke tests for pivot, clean, union, lock, preview filters and profile."""
import pandas as pd
import storage, engine

p = storage.create_project("Feat")
pid = p["id"]
fd = storage.files_dir(pid)

pd.DataFrame({
    "Country": ["FR", "FR", "DE", "DE"],
    "Quarter": ["Q1", "Q2", "Q1", "Q2"],
    "Amount": [10, 20, 30, 40],
}).to_excel(fd / "sales.xlsx", index=False)

# messy data for cleaning
pd.DataFrame({
    "Name": ["  alice ", "BOB", "Carol  "],
    "Price": ["10.5", "abc", "30"],        # 'abc' should fail to_number
    "City": ["Paris", None, "Lyon"],
}).to_excel(fd / "messy.xlsx", index=False)

pd.DataFrame({"Country": ["US"], "Quarter": ["Q1"], "Amount": [99]}).to_excel(fd / "sales2.xlsx", index=False)

wf = storage.create_workflow(pid, "W")
wid = wf["id"]
wf["nodes"] = [
    {"id": "sales", "type": "source", "position": {}, "data": {"file": "sales.xlsx"}},
    {"id": "sales2", "type": "source", "position": {}, "data": {"file": "sales2.xlsx"}},
    {"id": "messy", "type": "source", "position": {}, "data": {"file": "messy.xlsx"}},
    {"id": "piv", "type": "pivot", "position": {}, "data": {
        "mode": "pivot", "index_columns": ["Country"], "pivot_column": "Quarter",
        "value_column": "Amount", "agg": "SUM"}},
    {"id": "unp", "type": "pivot", "position": {}, "data": {
        "mode": "unpivot", "value_columns": ["Q1", "Q2"],
        "name_column": "Trimestre", "value_column": "Montant"}},
    {"id": "clean", "type": "clean", "position": {}, "data": {"operations": [
        {"op": "trim", "column": "Name"},
        {"op": "capitalize", "column": "Name"},
        {"op": "to_number", "column": "Price"},
        {"op": "fillna", "column": "City", "value": "Inconnu", "value_type": "text"},
    ]}},
    {"id": "uni", "type": "union", "position": {}, "data": {"by_name": True}},
]
wf["edges"] = [
    {"id": "e1", "source": "sales", "target": "piv", "sourceHandle": "out", "targetHandle": "in"},
    {"id": "e2", "source": "piv", "target": "unp", "sourceHandle": "out", "targetHandle": "in"},
    {"id": "e3", "source": "messy", "target": "clean", "sourceHandle": "out", "targetHandle": "in"},
    {"id": "e4", "source": "sales", "target": "uni", "sourceHandle": "out", "targetHandle": "in"},
    {"id": "e5", "source": "sales2", "target": "uni", "sourceHandle": "out", "targetHandle": "in"},
]
storage.save_workflow(pid, wf)

res = engine.run_workflow(pid, wid)
print("RAN:", res["ran"])

# --- pivot ---
piv = engine.preview_node(pid, wid, "piv")
print("PIVOT cols:", [c["name"] for c in piv["columns"]], "rows:", piv["row_count"])
assert "Q1" in [c["name"] for c in piv["columns"]] and "Q2" in [c["name"] for c in piv["columns"]]
assert piv["row_count"] == 2

# --- unpivot ---
unp = engine.preview_node(pid, wid, "unp")
print("UNPIVOT cols:", [c["name"] for c in unp["columns"]], "rows:", unp["row_count"])
assert "Trimestre" in [c["name"] for c in unp["columns"]]
assert unp["row_count"] == 4

# --- clean + report ---
rep = res["results"]["clean"]["clean_report"]
print("CLEAN report:")
for r in rep:
    print("  ", r["op_label"], r["column"], "changed=%s failed=%s was_null=%s" % (r["changed"], r["failed"], r["was_null"]))
price_op = next(r for r in rep if r["op"] == "to_number")
assert price_op["failed"] == 1          # 'abc'
city_op = next(r for r in rep if r["op"] == "fillna")
assert city_op["was_null"] == 1
clean_rows = engine.preview_node(pid, wid, "clean")["rows"]
assert clean_rows[0]["Name"] == "Alice"

# --- union ---
uni = engine.preview_node(pid, wid, "uni")
print("UNION rows:", uni["row_count"])
assert uni["row_count"] == 5            # 4 + 1

# --- preview filter / sort / search ---
f = engine.preview_node(pid, wid, "sales", filters=[{"column": "Country", "op": "=", "value": "FR"}])
print("FILTER FR rows:", f["row_count"])
assert f["row_count"] == 2
srt = engine.preview_node(pid, wid, "sales", sort="Amount", direction="desc")
assert srt["rows"][0]["Amount"] == 40
gs = engine.preview_node(pid, wid, "sales", q="DE")
assert gs["row_count"] == 2

# --- column profile ---
prof = engine.column_profile(pid, wid, "sales", "Amount")
print("PROFILE Amount: distinct=%s nulls=%s min=%s max=%s buckets=%s"
      % (prof["distinct"], prof["nulls"], prof["numeric_stats"]["min"],
         prof["numeric_stats"]["max"], len(prof["histogram"])))
assert prof["numeric"] and prof["distinct"] == 4
profc = engine.column_profile(pid, wid, "sales", "Country")
assert not profc["numeric"] and len(profc["top_values"]) == 2

# --- version lock ---
wf["nodes"][0]["data"]["locked"] = True          # lock 'sales'
storage.save_workflow(pid, wf)
# overwrite the source file with different data
pd.DataFrame({"Country": ["ZZ"], "Quarter": ["Q9"], "Amount": [1]}).to_excel(fd / "sales.xlsx", index=False)
res2 = engine.run_workflow(pid, wid)
assert res2["results"]["sales"].get("locked") is True
locked_rows = engine.preview_node(pid, wid, "sales")["rows"]
assert all(r["Country"] in ("FR", "DE") for r in locked_rows)   # old data kept
print("LOCK ok: source not recomputed, kept", len(locked_rows), "old rows")

storage.delete_project(pid)
print("OK — all feature tests passed")
