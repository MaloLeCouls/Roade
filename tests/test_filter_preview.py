"""Dry-run du Filtre — F.3 bonus.

Vérifie que `engine.filter_preview` remonte des comptes corrects sans
matérialiser le bloc, et qu'il distingue les configs incomplètes (paire vide,
colonne absente, ref non branchée) du cas nominal."""

import pandas as pd

import engine
import storage


def _setup_filter(main_df, ref_df, data, project_name="FilterPreview"):
    """Construit un workflow Source(données) + Source(ref) + Filtre, exécute les
    Sources pour matérialiser leurs Parquet (sinon filter_preview ne peut pas
    lire les entrées), et renvoie (pid, wid, node_id)."""
    p = storage.create_project(project_name)
    pid = p["id"]
    fd = storage.files_dir(pid)
    main_df.to_excel(fd / "main.xlsx", index=False)
    ref_df.to_excel(fd / "ref.xlsx", index=False)
    wf = storage.create_workflow(pid, "W")
    wid = wf["id"]
    wf["nodes"] = [
        {"id": "sm", "type": "source", "position": {}, "data": {"file": "main.xlsx"}},
        {"id": "sr", "type": "source", "position": {}, "data": {"file": "ref.xlsx"}},
        {"id": "f", "type": "filter", "position": {}, "data": data},
    ]
    wf["edges"] = [
        {"id": "em", "source": "sm", "target": "f", "sourceHandle": "out", "targetHandle": "in"},
        {"id": "er", "source": "sr", "target": "f", "sourceHandle": "out", "targetHandle": "ref"},
    ]
    storage.save_workflow(pid, wf)
    # Matérialise les deux Sources sans tenter d'exécuter le Filtre (qui peut
    # avoir une config volontairement incomplète dans certains tests).
    engine.run_workflow(pid, wid, only_node="sm")
    engine.run_workflow(pid, wid, only_node="sr")
    return pid, wid, "f"


def test_keep_mode_single_pair():
    pid, wid, nid = _setup_filter(
        pd.DataFrame({"code": ["A", "B", "C", "D", "E"]}),
        pd.DataFrame({"k": ["A", "C", "E"]}),
        {"mode": "keep", "pairs": [{"column": "code", "ref_column": "k"}]},
    )
    res = engine.filter_preview(
        pid,
        wid,
        nid,
        {
            "mode": "keep",
            "pairs": [{"column": "code", "ref_column": "k"}],
        },
    )
    assert res["status"] == "ok"
    assert res["mode"] == "keep"
    assert res["total_main"] == 5
    assert res["total_ref"] == 3
    assert res["matches"] == 3
    assert res["kept"] == 3
    assert res["excluded"] == 2


def test_exclude_mode_is_complement_of_keep():
    pid, wid, nid = _setup_filter(
        pd.DataFrame({"code": ["A", "B", "C", "D", "E"]}),
        pd.DataFrame({"k": ["A", "C", "E"]}),
        {"mode": "exclude", "pairs": [{"column": "code", "ref_column": "k"}]},
    )
    res = engine.filter_preview(
        pid,
        wid,
        nid,
        {
            "mode": "exclude",
            "pairs": [{"column": "code", "ref_column": "k"}],
        },
    )
    assert res["status"] == "ok"
    assert res["mode"] == "exclude"
    assert res["matches"] == 3
    assert res["kept"] == 2  # B, D
    assert res["excluded"] == 3  # A, C, E


def test_composite_key_requires_all_columns_to_match():
    pid, wid, nid = _setup_filter(
        pd.DataFrame({"a": ["x", "x", "y", "y"], "b": [1, 2, 1, 2]}),
        pd.DataFrame({"ka": ["x", "y"], "kb": [1, 2]}),
        {},
    )
    res = engine.filter_preview(
        pid,
        wid,
        nid,
        {
            "mode": "keep",
            "pairs": [
                {"column": "a", "ref_column": "ka"},
                {"column": "b", "ref_column": "kb"},
            ],
        },
    )
    # ref n'a que (x,1) et (y,2). Donc main (x,1) et (y,2) matchent ; (x,2) et (y,1) non.
    assert res["matches"] == 2
    assert res["kept"] == 2
    assert res["excluded"] == 2


def test_case_insensitive():
    pid, wid, nid = _setup_filter(
        pd.DataFrame({"code": ["abc", "DEF", "ghi"]}),
        pd.DataFrame({"k": ["ABC", "def"]}),
        {},
    )
    sensitive = engine.filter_preview(
        pid,
        wid,
        nid,
        {
            "mode": "keep",
            "pairs": [{"column": "code", "ref_column": "k"}],
            "case_insensitive": False,
        },
    )
    assert sensitive["kept"] == 0  # aucune correspondance exacte
    insensitive = engine.filter_preview(
        pid,
        wid,
        nid,
        {
            "mode": "keep",
            "pairs": [{"column": "code", "ref_column": "k"}],
            "case_insensitive": True,
        },
    )
    assert insensitive["kept"] == 2  # "abc"↔"ABC" et "DEF"↔"def"


def test_no_ref_input():
    p = storage.create_project("FilterPreviewNoRef")
    pid = p["id"]
    fd = storage.files_dir(pid)
    pd.DataFrame({"code": ["A", "B"]}).to_excel(fd / "main.xlsx", index=False)
    wf = storage.create_workflow(pid, "W")
    wid = wf["id"]
    wf["nodes"] = [
        {"id": "sm", "type": "source", "position": {}, "data": {"file": "main.xlsx"}},
        {"id": "f", "type": "filter", "position": {}, "data": {}},
    ]
    wf["edges"] = [
        {"id": "em", "source": "sm", "target": "f", "sourceHandle": "out", "targetHandle": "in"},
    ]
    storage.save_workflow(pid, wf)
    engine.run_workflow(pid, wid, only_node="sm")
    res = engine.filter_preview(pid, wid, "f", {"mode": "keep"})
    assert res["status"] == "no_ref"
    assert res["total_main"] == 2


def test_no_pairs():
    pid, wid, nid = _setup_filter(
        pd.DataFrame({"code": ["A", "B"]}),
        pd.DataFrame({"k": ["A"]}),
        {},
    )
    res = engine.filter_preview(pid, wid, nid, {"mode": "keep", "pairs": []})
    assert res["status"] == "no_pairs"
    assert res["total_main"] == 2
    assert res["total_ref"] == 1


def test_bad_column():
    pid, wid, nid = _setup_filter(
        pd.DataFrame({"code": ["A", "B"]}),
        pd.DataFrame({"k": ["A"]}),
        {},
    )
    res = engine.filter_preview(
        pid,
        wid,
        nid,
        {
            "mode": "keep",
            "pairs": [{"column": "inexistante", "ref_column": "k"}],
        },
    )
    assert res["status"] == "bad_column"
    assert "inexistante" in res["message"]


def test_null_keys_are_reported_and_not_matched():
    pid, wid, nid = _setup_filter(
        pd.DataFrame({"code": ["A", None, "C", "A"]}),
        pd.DataFrame({"k": ["A", "C"]}),
        {},
    )
    res = engine.filter_preview(
        pid,
        wid,
        nid,
        {
            "mode": "keep",
            "pairs": [{"column": "code", "ref_column": "k"}],
        },
    )
    assert res["null_keys"] == 1
    # A, C, A matchent → 3 ; None ne peut pas matcher → exclu
    assert res["matches"] == 3
    assert res["kept"] == 3
    assert res["excluded"] == 1
