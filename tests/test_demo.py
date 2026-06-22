"""G.2 — le projet de démonstration embarqué doit s'exécuter de bout en bout.

C'est le filet du « clic qui charge un workflow complet qu'on peut exécuter » :
si une shape de bloc dérive (data Validation, formule Calcul, options Source…),
ce test casse AVANT que la démo n'accueille un primo-utilisateur sur une erreur.

Il vérifie aussi l'intégrité FR (anti-slop #2) : la décimale virgule est bien
parsée (Montant numérique, pas une SUM = 0), et la Validation sépare les
références `CMD-…` des autres.

Isolation par la fixture autouse `_isolate_storage` (conftest.py).
"""

from __future__ import annotations

import json

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def _seed():
    r = client.post("/api/demo")
    assert r.status_code == 200, r.text
    body = r.json()
    return body["project_id"], body["workflow_id"]


def _parse_sse(raw: bytes) -> list[dict]:
    events = []
    for line in raw.decode("utf-8").splitlines():
        if line.startswith("data:"):
            events.append(json.loads(line[len("data:") :].strip()))
    return events


def test_demo_seed_creates_project_file_and_workflow():
    pid, wid = _seed()

    # Le projet existe et le CSV FR est bien déposé.
    assert client.get(f"/api/projects/{pid}").status_code == 200
    files = client.get(f"/api/projects/{pid}/files").json()
    assert any(f["name"] == "commandes.csv" for f in files)

    # Le workflow se charge avec ses 6 blocs + 5 liens.
    wf = client.get(f"/api/projects/{pid}/workflows/{wid}").json()
    assert wf["name"] == "Traitement des commandes"
    assert {n["id"] for n in wf["nodes"]} == {"src", "clean", "calc", "val", "exp_ok", "exp_ko"}
    assert len(wf["edges"]) == 5


def test_demo_runs_end_to_end_without_error():
    pid, wid = _seed()
    raw = client.get(f"/api/projects/{pid}/workflows/{wid}/run-stream").content
    events = _parse_sse(raw)
    kinds = {e.get("event") for e in events}
    assert "done" in kinds, kinds
    assert "error" not in kinds, [e for e in events if e.get("event") == "error"]


def test_demo_fr_decimal_is_parsed_numeric():
    """A.2 — `12,50` lu comme 12.5, donc Montant = Quantité × Prix est correct
    (et non une chaîne / une SUM qui casse en silence)."""
    pid, wid = _seed()
    _ = client.get(f"/api/projects/{pid}/workflows/{wid}/run-stream").content  # force run

    prev = client.get(f"/api/projects/{pid}/workflows/{wid}/nodes/calc/preview").json()
    cols = {c["name"] for c in prev["columns"]}
    assert "Montant" in cols
    # 1ʳᵉ ligne = CMD-1001 : 3 × 12,50 = 37,5 (numérique).
    first = prev["rows"][0]
    assert isinstance(first["Montant"], (int, float))
    assert abs(first["Montant"] - 37.5) < 1e-9


def test_demo_validation_splits_conformes():
    """La Validation route les références `CMD-…` (9) vs le reste (3)."""
    pid, wid = _seed()
    _ = client.get(f"/api/projects/{pid}/workflows/{wid}/run-stream").content  # force run

    valid = client.get(
        f"/api/projects/{pid}/workflows/{wid}/nodes/val/preview", params={"handle": "valid"}
    ).json()
    invalid = client.get(
        f"/api/projects/{pid}/workflows/{wid}/nodes/val/preview", params={"handle": "invalid"}
    ).json()
    assert valid["row_count"] == 9
    assert invalid["row_count"] == 3


def test_demo_produces_both_exports():
    pid, wid = _seed()
    _ = client.get(f"/api/projects/{pid}/workflows/{wid}/run-stream").content  # force run

    files = client.get(f"/api/projects/{pid}/files").json()
    export_names = {f["name"] for f in files if f.get("origin") == "export"}
    assert "Commandes conformes.xlsx" in export_names
    assert "À corriger.csv" in export_names
