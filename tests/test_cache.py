"""Smoke test for source caching: an unchanged file is not re-read."""

import time

import pandas as pd

import engine
import storage


def test_source_cache():
    p = storage.create_project("CacheTest")
    pid = p["id"]
    fd = storage.files_dir(pid)
    pd.DataFrame({"nom": ["AB1", "C22", "ab3"]}).to_excel(fd / "f.xlsx", index=False)

    wf = storage.create_workflow(pid, "W")
    wid = wf["id"]
    wf["nodes"] = [
        {"id": "s", "type": "source", "position": {}, "data": {"file": "f.xlsx", "cache": True}},
        {
            "id": "v",
            "type": "validate",
            "position": {},
            "data": {
                "mode": "rules",
                "target_column": "nom",
                "combine": "all",
                "add_reason": True,
                "rules": [{"test": "char_class", "position": 1, "charclass": "letter"}],
            },
        },
    ]
    wf["edges"] = [
        {"id": "e1", "source": "s", "target": "v", "sourceHandle": "out", "targetHandle": "in"}
    ]
    storage.save_workflow(pid, wf)

    pq = storage.node_parquet(pid, wid, "s", "out")

    # first run: source is read & materialized
    r1 = engine.run_workflow(pid, wid)
    assert r1["results"]["s"].get("cached") is not True
    mtime1 = pq.stat().st_mtime_ns

    # second run (unchanged file): source served from cache, parquet untouched
    time.sleep(0.05)
    r2 = engine.run_workflow(pid, wid)
    assert r2["results"]["s"].get("cached") is True, "source should be cached on re-run"
    assert pq.stat().st_mtime_ns == mtime1, "cached source parquet must not be rewritten"

    # change the file -> fingerprint differs -> re-read
    time.sleep(0.05)
    pd.DataFrame({"nom": ["ZZ9", "Y88", "x77", "W66"]}).to_excel(fd / "f.xlsx", index=False)
    r3 = engine.run_workflow(pid, wid)
    assert r3["results"]["s"].get("cached") is not True, "changed file must be re-read"
    assert r3["results"]["s"]["row_count"] == 4

    # force bypass on an unchanged file
    mtime3 = pq.stat().st_mtime_ns
    time.sleep(0.05)
    ran = [
        ev
        for ev in engine.iter_run_workflow(pid, wid, only_node="s", force=True)
        if ev["event"] == "node_done"
    ]
    assert ran and ran[0]["result"].get("cached") is not True, "force must bypass cache"
    assert pq.stat().st_mtime_ns != mtime3, "force must rewrite the parquet"
