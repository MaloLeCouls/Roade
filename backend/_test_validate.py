"""Smoke test for the validation (nomenclature) block."""
import pandas as pd
import storage, engine

p = storage.create_project("ValTest")
pid = p["id"]
fd = storage.files_dir(pid)
# filenames: expected nomenclature = 2 letters + 1 digit + '-' + 4 digits
pd.DataFrame({"fichier": [
    "AB1-2024",   # ok
    "ab1-2024",   # ok (case-insensitive)
    "A11-2024",   # bad: 2nd char not a letter
    "AB1-99",     # bad: not 4 digits
    "ABC-2024",   # bad: 3rd not digit
    None,         # bad: null
]}).to_excel(fd / "f.xlsx", index=False)

wf = storage.create_workflow(pid, "W")
wid = wf["id"]
wf["nodes"] = [
    {"id": "s", "type": "source", "position": {}, "data": {"file": "f.xlsx"}},
    {"id": "mask", "type": "validate", "position": {}, "data": {
        "mode": "mask", "target_column": "fichier", "case_sensitive": False,
        "add_flag": True, "add_reason": True,
        "segments": [
            {"type": "letter", "length": 2},
            {"type": "digit", "length": 1},
            {"type": "literal", "value": "-"},
            {"type": "digit", "length": 4},
        ]}},
    {"id": "rules", "type": "validate", "position": {}, "data": {
        "mode": "rules", "target_column": "fichier", "combine": "all",
        "add_reason": True, "rules": [
            {"test": "substr_equals", "start": 1, "length": 2, "value": "AB", "label": "préfixe AB"},
            {"test": "char_class", "position": 3, "charclass": "digit", "label": "3e = chiffre"},
            {"test": "length_eq", "value": 8, "label": "longueur 8"},
        ]}},
]
wf["edges"] = [
    {"id": "e1", "source": "s", "target": "mask", "sourceHandle": "out", "targetHandle": "in"},
    {"id": "e2", "source": "s", "target": "rules", "sourceHandle": "out", "targetHandle": "in"},
]
storage.save_workflow(pid, wf)

res = engine.run_workflow(pid, wid)
print("mask outputs:", res["results"]["mask"]["outputs"])
print("rules outputs:", res["results"]["rules"]["outputs"])

mv = engine.preview_node(pid, wid, "mask", handle="valid")
mi = engine.preview_node(pid, wid, "mask", handle="invalid")
print("mask valid:", [r["fichier"] for r in mv["rows"]])
print("mask invalid (motif):", [(r["fichier"], r.get("motif")) for r in mi["rows"]])
assert mv["row_count"] == 2          # AB1-2024, ab1-2024
assert mi["row_count"] == 3          # (pandas drops the trailing all-empty row)
assert "valide" in [c["name"] for c in mv["columns"]]
assert "motif" in [c["name"] for c in mv["columns"]]

rv = engine.preview_node(pid, wid, "rules", handle="valid")
ri = engine.preview_node(pid, wid, "rules", handle="invalid")
print("rules valid:", [r["fichier"] for r in rv["rows"]])
print("rules invalid (motif):", [(r["fichier"], r.get("motif")) for r in ri["rows"]])
# case-sensitive substr 'AB' => 'ab1-2024' fails prefix; AB1-2024 ok
assert "AB1-2024" in [r["fichier"] for r in rv["rows"]]

storage.delete_project(pid)
print("OK — validation test passed")
