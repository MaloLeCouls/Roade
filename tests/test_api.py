"""Tests HTTP des routes critiques de Roade (FastAPI TestClient).

Couvre, à raison d'au moins un test par route critique (cf. todo 0.4) :
- POST /api/projects                                   (création projet)
- POST + GET + PUT /api/projects/{pid}/workflows/...   (save/load workflow)
- GET .../run-stream                                   (exécution SSE)
- GET .../nodes/{nid}/preview                          (aperçu)

L'isolation par `tmp_path` est assurée par la fixture autouse `_isolate_storage`
de `conftest.py` : aucun test ne touche `projects/` à la racine.
"""

from __future__ import annotations

import io
import json

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_api_health():
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"ok": True}


def test_serves_frontend_build_when_present():
    """Si `frontend/dist/` existe (mode prod), FastAPI sert l'index — un seul
    process pour l'API + le frontend (cf. todo 0.8). Skip si pas de build."""
    from pathlib import Path

    dist = Path(__file__).resolve().parent.parent / "frontend" / "dist"
    if not (dist / "index.html").exists():
        pytest.skip("frontend/dist absent — `npm run build` non lancé")

    r = client.get("/")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/html")
    assert b'<div id="root">' in r.content or b"<div id='root'>" in r.content


def test_api_project_lifecycle():
    """POST → GET liste → GET détail → DELETE."""
    r = client.post("/api/projects", json={"name": "Roade-API"})
    assert r.status_code == 200, r.text
    pid = r.json()["id"]

    listed = client.get("/api/projects").json()
    assert any(p["id"] == pid for p in listed)

    detail = client.get(f"/api/projects/{pid}").json()
    assert detail["id"] == pid
    assert "dir" in detail  # le détail expose le chemin sur disque

    # Nom de projet requis : POST avec name vide → 400
    bad = client.post("/api/projects", json={"name": "   "})
    assert bad.status_code == 400

    r = client.delete(f"/api/projects/{pid}")
    assert r.status_code == 200
    assert client.get(f"/api/projects/{pid}").status_code == 404


def test_api_workflow_save_load():
    """POST workflow → PUT (avec nodes/edges) → GET → mêmes nodes/edges."""
    pid = client.post("/api/projects", json={"name": "WfTest"}).json()["id"]
    wid = client.post(f"/api/projects/{pid}/workflows", json={"name": "Mon WF"}).json()["id"]

    payload = {
        "name": "Mon WF",
        "nodes": [
            {"id": "s", "type": "source", "position": {"x": 0, "y": 0}, "data": {}},
            {"id": "v", "type": "validate", "position": {"x": 200, "y": 0}, "data": {}},
        ],
        "edges": [
            {
                "id": "e1",
                "source": "s",
                "target": "v",
                "sourceHandle": "out",
                "targetHandle": "in",
            }
        ],
    }
    r = client.put(f"/api/projects/{pid}/workflows/{wid}", json=payload)
    assert r.status_code == 200

    wf = client.get(f"/api/projects/{pid}/workflows/{wid}").json()
    assert wf["id"] == wid
    assert [n["id"] for n in wf["nodes"]] == ["s", "v"]
    assert wf["edges"][0]["target"] == "v"

    # 404 sur workflow inexistant
    miss = client.get(f"/api/projects/{pid}/workflows/does-not-exist")
    assert miss.status_code == 404


@pytest.fixture
def project_with_csv_workflow():
    """Crée un projet + workflow source→preview prêts à exécuter (réutilisable)."""
    pid = client.post("/api/projects", json={"name": "RunTest"}).json()["id"]

    # Upload d'un xlsx via la vraie route /files (sanity check du multipart)
    buf = io.BytesIO()
    pd.DataFrame({"nom": ["AAA", "BBB", "CCC"]}).to_excel(buf, index=False)
    buf.seek(0)
    r = client.post(
        f"/api/projects/{pid}/files",
        files={
            "file": (
                "data.xlsx",
                buf,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )
    assert r.status_code == 200, r.text

    wid = client.post(f"/api/projects/{pid}/workflows", json={"name": "Run"}).json()["id"]
    client.put(
        f"/api/projects/{pid}/workflows/{wid}",
        json={
            "name": "Run",
            "nodes": [
                {
                    "id": "s",
                    "type": "source",
                    "position": {"x": 0, "y": 0},
                    "data": {"file": "data.xlsx"},
                }
            ],
            "edges": [],
        },
    )
    return pid, wid


def _parse_sse(raw: bytes) -> list[dict]:
    """Extrait les events JSON d'un flux SSE `data: {...}\\n\\n`."""
    events = []
    for line in raw.decode("utf-8").splitlines():
        if line.startswith("data:"):
            events.append(json.loads(line[len("data:") :].strip()))
    return events


def test_api_run_stream(project_with_csv_workflow):
    """GET .../run-stream renvoie un SSE qui termine par un event `workflow_done`."""
    pid, wid = project_with_csv_workflow
    r = client.get(f"/api/projects/{pid}/workflows/{wid}/run-stream")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/event-stream")

    events = _parse_sse(r.content)
    assert events, "le SSE doit émettre au moins un event"
    kinds = {e.get("event") for e in events}
    # Le runner émet `start`, `node_start` / `node_done` par bloc, puis un terminal `done`.
    assert kinds >= {"start", "node_start", "node_done", "done"}, kinds
    # Le node source a bien tourné
    node_done = [e for e in events if e.get("event") == "node_done"]
    assert any(e.get("node_id") == "s" or e.get("id") == "s" for e in node_done), node_done


def test_api_preview(project_with_csv_workflow):
    """GET .../preview après un run renvoie colonnes + rows."""
    pid, wid = project_with_csv_workflow
    # Exécution préalable nécessaire pour matérialiser le parquet ; on consomme
    # le flux SSE pour forcer son évaluation jusqu'au bout (TestClient = lazy).
    _ = client.get(f"/api/projects/{pid}/workflows/{wid}/run-stream").content

    r = client.get(f"/api/projects/{pid}/workflows/{wid}/nodes/s/preview")
    assert r.status_code == 200, r.text
    body = r.json()
    assert "columns" in body and "rows" in body
    assert any(c["name"] == "nom" for c in body["columns"])
    assert body["row_count"] == 3


def test_api_runs_history(project_with_csv_workflow):
    """A.10 — après un run, l'historique remonte le détail (status, ran/cached,
    durée). Un second run sans changement marque le node `s` comme `cached`."""
    pid, wid = project_with_csv_workflow

    # 1er run : on consomme le flux pour que le record soit append.
    _ = client.get(f"/api/projects/{pid}/workflows/{wid}/run-stream").content
    runs = client.get(f"/api/projects/{pid}/workflows/{wid}/runs").json()
    assert isinstance(runs, list) and len(runs) == 1
    r0 = runs[0]
    assert r0["status"] == "ok"
    assert [e["node_id"] for e in r0["ran"]] == ["s"]
    assert r0["cached"] == []
    assert isinstance(r0["duration_ms"], int) and r0["duration_ms"] >= 0

    # 2e run sans modif : le node `s` doit être servi par le cache.
    _ = client.get(f"/api/projects/{pid}/workflows/{wid}/run-stream").content
    runs2 = client.get(f"/api/projects/{pid}/workflows/{wid}/runs").json()
    assert len(runs2) == 2  # plus récent en tête
    r_latest = runs2[0]
    assert r_latest["status"] == "ok"
    assert r_latest["ran"] == []
    assert [e["node_id"] for e in r_latest["cached"]] == ["s"]
