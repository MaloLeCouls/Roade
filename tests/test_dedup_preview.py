"""Dry-run du bloc Doublons (`dedup_preview`) — compteur live de la refonte.

Vérifie que les comptes renvoyés (total, groupes en double, lignes redondantes,
tailles des 3 sorties) sont exacts et calés sur la sémantique de `_run_dedup`.
"""

from __future__ import annotations

import io

import pandas as pd
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def _project_with_dups():
    pid = client.post("/api/projects", json={"name": "Dedup"}).json()["id"]
    # nom : A,A,B,C,C,C → groupes en double A(2) et C(3) ; B unique.
    buf = io.BytesIO()
    pd.DataFrame({"nom": ["A", "A", "B", "C", "C", "C"]}).to_excel(buf, index=False)
    buf.seek(0)
    client.post(
        f"/api/projects/{pid}/files",
        files={
            "file": (
                "d.xlsx",
                buf,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )
    wid = client.post(f"/api/projects/{pid}/workflows", json={"name": "W"}).json()["id"]
    client.put(
        f"/api/projects/{pid}/workflows/{wid}",
        json={
            "nodes": [
                {"id": "s", "type": "source", "position": {}, "data": {"file": "d.xlsx"}},
                {"id": "dd", "type": "dedup", "position": {}, "data": {"key_columns": ["nom"]}},
            ],
            "edges": [
                {
                    "id": "e",
                    "source": "s",
                    "target": "dd",
                    "sourceHandle": "out",
                    "targetHandle": "in",
                }
            ],
        },
    )
    # matérialise la source (dry-run lit son Parquet)
    _ = client.get(f"/api/projects/{pid}/workflows/{wid}/run-stream").content
    return pid, wid


def _preview(pid, wid, **cfg):
    cfg.setdefault("key_columns", ["nom"])
    r = client.post(f"/api/projects/{pid}/workflows/{wid}/nodes/dd/dedup-preview", json=cfg)
    assert r.status_code == 200, r.text
    return r.json()


def test_dedup_preview_counts():
    pid, wid = _project_with_dups()
    r = _preview(pid, wid)
    assert r["status"] == "ok"
    assert r["total"] == 6
    assert r["dup_groups"] == 2  # A et C
    assert r["dup_rows"] == 5  # A,A,C,C,C
    assert r["extra"] == 3  # 1 (A) + 2 (C) redondantes
    assert r["kept"] == 3  # un exemplaire par groupe : A,B,C
    assert r["uniques"] == 1  # B
    assert r["dups"] == 5  # mode all par défaut


def test_dedup_preview_dups_mode():
    pid, wid = _project_with_dups()
    assert _preview(pid, wid, dups_mode="exemplar")["dups"] == 2  # un par groupe en double
    assert _preview(pid, wid, dups_mode="extra")["dups"] == 3  # occurrences en trop
    assert _preview(pid, wid, dups_mode="all")["dups"] == 5  # toutes


def test_dedup_preview_whole_row_when_no_keys():
    pid, wid = _project_with_dups()
    r = _preview(pid, wid, key_columns=[])
    assert r["status"] == "ok"
    assert r["whole_row"] is True
    # ligne entière = mêmes valeurs : ici une seule colonne, donc identique au cas nom
    assert r["kept"] == 3


def test_dedup_preview_no_input_is_soft():
    """Sans entrée matérialisée, on renvoie un statut doux (pas une 500)."""
    pid = client.post("/api/projects", json={"name": "Dd2"}).json()["id"]
    wid = client.post(f"/api/projects/{pid}/workflows", json={"name": "W"}).json()["id"]
    client.put(
        f"/api/projects/{pid}/workflows/{wid}",
        json={
            "nodes": [{"id": "dd", "type": "dedup", "position": {}, "data": {}}],
            "edges": [],
        },
    )
    r = client.post(f"/api/projects/{pid}/workflows/{wid}/nodes/dd/dedup-preview", json={})
    assert r.status_code == 200
    assert r.json()["status"] == "no_input"
