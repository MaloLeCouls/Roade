"""ETA d'exécution — l'estimation s'appuie sur l'historique RÉEL des durées.

Au 1er run d'un bloc, on n'a qu'un modèle grossier (basis='model'). Dès qu'il a
tourné une fois, sa durée réelle est stockée (runs.jsonl) et réutilisée
(basis='history') — c'est ce qui rend l'ETA stable et fiable, surtout pour les
imports/exports dont le coût varie beaucoup selon le fichier et la machine.
"""

import pandas as pd

import engine
import storage


def _setup():
    p = storage.create_project("Eta")
    pid = p["id"]
    fd = storage.files_dir(pid)
    pd.DataFrame({"x": range(2000), "y": ["a", "b"] * 1000}).to_excel(fd / "d.xlsx", index=False)
    wf = storage.create_workflow(pid, "W")
    wid = wf["id"]
    wf["nodes"] = [
        {"id": "s", "type": "source", "position": {}, "data": {"file": "d.xlsx"}},
        {"id": "u", "type": "union", "position": {}, "data": {}},
    ]
    wf["edges"] = [
        {"id": "e", "source": "s", "target": "u", "sourceHandle": "out", "targetHandle": "in1"},
    ]
    storage.save_workflow(pid, wf)
    return pid, wid


def _eta_event(pid, wid, **kw):
    for ev in engine.iter_run_workflow(pid, wid, **kw):
        if ev.get("event") == "eta":
            return ev
    raise AssertionError("aucun événement 'eta' émis")


def test_eta_event_shape():
    pid, wid = _setup()
    eta = _eta_event(pid, wid)
    assert isinstance(eta["eta_ms"], int)
    assert len(eta["plan"]) == 2  # source + union
    assert {"node_id", "est_ms", "cached", "basis"} <= set(eta["plan"][0])


def test_history_used_after_first_run():
    pid, wid = _setup()
    # 1er run : tout est recalculé (basis 'model' pour l'ETA, pas d'historique)
    first = _eta_event(pid, wid)
    assert all(p["basis"] == "model" for p in first["plan"])
    # on exécute réellement → la durée de chaque bloc est stockée
    list(engine.iter_run_workflow(pid, wid))
    # 2e run forcé : on recalcule, mais cette fois depuis l'historique réel
    second = _eta_event(pid, wid, force=True)
    assert all(p["basis"] == "history" for p in second["plan"])
    assert second["confident"] is True


def test_cached_blocks_predicted_near_zero():
    pid, wid = _setup()
    list(engine.iter_run_workflow(pid, wid))  # tout en cache ensuite
    # run normal (sans force) : les blocs inchangés seront servis par le cache
    eta = _eta_event(pid, wid)
    assert all(p["cached"] for p in eta["plan"])
    assert eta["eta_ms"] <= 100  # ~0 (25 ms/bloc cache)
