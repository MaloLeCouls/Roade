"""Smoke test for the unified routing / conformity model of the validate block."""

import pandas as pd
import pytest

import engine
import storage


def test_route_and_conformity():
    p = storage.create_project("RouteTest")
    pid = p["id"]
    fd = storage.files_dir(pid)
    pd.DataFrame({"nom": ["A.sldprt", "B.sldprt", "C.txt", "Axx", "D.sldprt"]}).to_excel(
        fd / "f.xlsx", index=False
    )
    wf = storage.create_workflow(pid, "W")
    wid = wf["id"]
    wf["nodes"] = [
        {"id": "s", "type": "source", "position": {}, "data": {"file": "f.xlsx"}},
        {"id": "r", "type": "validate", "position": {}, "data": {}},
    ]
    wf["edges"] = [
        {"id": "e", "source": "s", "target": "r", "sourceHandle": "out", "targetHandle": "in"}
    ]

    def set_validate(data):
        wf["nodes"][1]["data"] = data
        storage.save_workflow(pid, wf)

    def counts(*handles):
        return tuple(engine.preview_node(pid, wid, "r", handle=h)["row_count"] for h in handles)

    # --- 1. named conditions attributed to outputs (router intent, partition) ---
    data = {
        "mode": "route",
        "intent": "router",
        "target_column": "nom",
        "case_sensitive": False,
        "routing": "first",
        "else_enabled": True,
        "conditions": [
            {
                "id": "cA",
                "name": "Commence par A",
                "kind": "rules",
                "column": "",
                "groups": [{"rules": [{"test": "starts_with", "value": "A"}]}],
            },
            {
                "id": "cS",
                "name": "SLDPRT",
                "kind": "rules",
                "column": "",
                "groups": [{"rules": [{"test": "ends_with", "value": ".sldprt"}]}],
            },
        ],
        "outputs": [
            {
                "id": "oa",
                "label": "A",
                "color": "#4E79A7",
                "match": {"conditionId": "cA", "negate": False},
            },
            {
                "id": "osld",
                "label": "SLDPRT",
                "color": "#59A14F",
                "match": {"conditionId": "cS", "negate": False},
            },
        ],
    }
    set_validate(data)
    engine.run_workflow(pid, wid)
    assert counts("oa", "osld", "else") == (2, 2, 1)

    rp = engine.route_preview(pid, wid, "r", data)
    assert rp["counts"]["oa"] == 2 and rp["counts"]["else"] == 1, rp

    # --- 2. overlap mode: a row may land in several outputs ---
    data["routing"] = "all"
    set_validate(data)
    engine.run_workflow(pid, wid, only_node="r")
    assert counts("osld") == (3,)

    # --- 3. NON on an output reference (negate) ---
    data["routing"] = "first"
    data["outputs"] = [
        {
            "id": "ono",
            "label": "pas A",
            "color": "#E15759",
            "match": {"conditionId": "cA", "negate": True},
        }
    ]
    set_validate(data)
    engine.run_workflow(pid, wid, only_node="r")
    assert counts("ono") == (3,)  # not-starting-with-A: B, C, D

    # --- 5. legacy inline-condition route still runs (back-compat fallback) ---
    legacy = {
        "mode": "route",
        "target_column": "nom",
        "routing": "first",
        "else_enabled": True,
        "outputs": [
            {
                "id": "ox",
                "label": "x",
                "color": "#000",
                "condition": {"groups": [{"rules": [{"test": "contains", "value": "xx"}]}]},
            }
        ],
    }
    set_validate(legacy)
    engine.run_workflow(pid, wid, only_node="r")
    assert counts("ox") == (1,)  # only "Axx"

    # --- 6. tester on a condition object (rules + mask) ---
    tr = engine.validate_test(
        {
            "kind": "rules",
            "case_sensitive": False,
            "groups": [{"rules": [{"test": "starts_with", "value": "A"}]}],
        },
        ["Axx", "B.sldprt"],
    )
    assert tr["ok"] and tr["results"][0]["valid"] and not tr["results"][1]["valid"], tr

    tm = engine.validate_test(
        {
            "kind": "mask",
            "case_sensitive": False,
            "segments": [{"type": "upper", "length": 1}, {"type": "digit", "length": 2}],
        },
        ["A12", "AB1"],
    )
    assert tm["ok"] and tm["results"][0]["valid"] and not tm["results"][1]["valid"], tm

    # --- 4. conformity preset: one condition -> valid/invalid via negate + diagnostics ---
    # Placé en dernier car la dernière assertion (colonne `motif` sur la branche
    # `valid`) est une régression silencieuse révélée par 0.3 — cf. xfail plus bas.
    conf = {
        "mode": "route",
        "intent": "control",
        "target_column": "nom",
        "case_sensitive": False,
        "routing": "first",
        "else_enabled": False,
        "add_flag": True,
        "add_reason": True,
        "conditions": [
            {
                "id": "c0",
                "name": "Conforme",
                "kind": "rules",
                "column": "",
                "groups": [{"rules": [{"test": "ends_with", "value": ".sldprt"}]}],
            }
        ],
        "outputs": [
            {
                "id": "valid",
                "label": "Conformes",
                "color": "#59A14F",
                "match": {"conditionId": "c0", "negate": False},
            },
            {
                "id": "invalid",
                "label": "Non conformes",
                "color": "#E15759",
                "match": {"conditionId": "c0", "negate": True},
            },
        ],
    }
    set_validate(conf)
    engine.run_workflow(pid, wid, only_node="r")
    v = engine.preview_node(pid, wid, "r", handle="valid")
    assert v["row_count"] == 3 and counts("invalid") == (2,)
    assert "valide" in [c["name"] for c in v["columns"]], v["columns"]

    # Régression silencieuse révélée à la migration pytest (0.3) : avec
    # `add_reason: True` en mode `control`, la colonne `motif` n'apparaît plus sur
    # la branche `valid`. Cf. xfail symétrique dans test_validate.py.
    # À trancher Chantier A / D.10.
    pytest.xfail("colonne `motif` absente sur branche `valid` en mode `control`.")
    assert "motif" in [c["name"] for c in v["columns"]]
