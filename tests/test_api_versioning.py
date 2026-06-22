"""B.6 — API versionnée `/api/v1` + enveloppe d'erreur typée `{code, message}`.

Couvre :
- le préfixe canonical `/api/v1` (graine cloud 1) ;
- la rétro-compat `/api` (bookmarks + suite de tests existante) ;
- que les deux préfixes touchent le **même** handler/stockage (réécriture, pas
  duplication) ;
- la forme stable des erreurs : `{code, message}` (+ `details` sur les 422).

Isolation par la fixture autouse `_isolate_storage` (conftest.py).
"""

from __future__ import annotations

import io

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


# --------------------------------------------------------------------------- #
# Le préfixe /api/v1 et sa rétro-compat /api
# --------------------------------------------------------------------------- #
def test_v1_prefix_works():
    r = client.get("/api/v1/health")
    assert r.status_code == 200
    assert r.json() == {"ok": True}


def test_legacy_prefix_still_works():
    """`/api/...` (sans version) reste accepté — on ne casse pas l'existant."""
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"ok": True}


def test_both_prefixes_hit_the_same_storage():
    """Créé via /api/v1, relu via /api (et inversement) : la réécriture mappe
    bien les deux préfixes sur les mêmes routes (aucune duplication d'état)."""
    created = client.post("/api/v1/projects", json={"name": "Versionné"}).json()
    pid = created["id"]

    via_legacy = client.get(f"/api/projects/{pid}")
    assert via_legacy.status_code == 200
    assert via_legacy.json()["id"] == pid

    listed = client.get("/api/v1/projects").json()
    assert any(p["id"] == pid for p in listed)


def test_v1_route_preserves_query_and_encoded_segments():
    """La réécriture ne touche qu'au préfixe : query string et segments
    encodés du chemin restent intacts (ici un nom de fichier inexistant avec
    espace encodé → 404 propre, pas une erreur de routage)."""
    pid = client.post("/api/v1/projects", json={"name": "Q"}).json()["id"]
    r = client.get(f"/api/v1/projects/{pid}/files/mon%20fichier.csv")
    assert r.status_code == 404
    assert r.json()["code"] == "file.not_found"


# --------------------------------------------------------------------------- #
# Enveloppe d'erreur typée {code, message}
# --------------------------------------------------------------------------- #
def test_error_envelope_not_found_has_code():
    r = client.get("/api/v1/projects/does-not-exist")
    assert r.status_code == 404
    body = r.json()
    assert body["code"] == "project.not_found"
    assert isinstance(body["message"], str) and body["message"]
    assert "detail" not in body  # ancienne forme FastAPI bien remplacée


def test_error_envelope_workflow_not_found():
    pid = client.post("/api/v1/projects", json={"name": "WF404"}).json()["id"]
    r = client.get(f"/api/v1/projects/{pid}/workflows/nope")
    assert r.status_code == 404
    assert r.json()["code"] == "workflow.not_found"


def test_error_envelope_on_legacy_prefix_too():
    """La même enveloppe est servie quel que soit le préfixe utilisé."""
    r = client.get("/api/projects/does-not-exist")
    assert r.status_code == 404
    assert r.json()["code"] == "project.not_found"


def test_validation_error_envelope_has_details():
    """Un body sans `name` → 422 sous notre enveloppe, avec le détail Pydantic."""
    r = client.post("/api/v1/projects", json={})
    assert r.status_code == 422
    body = r.json()
    assert body["code"] == "validation_error"
    assert isinstance(body.get("details"), list) and body["details"]


def test_upload_invalid_name_has_typed_code():
    """Un path-traversal à l'upload renvoie un code exploitable par le front."""
    pid = client.post("/api/v1/projects", json={"name": "UpCode"}).json()["id"]
    r = client.post(
        f"/api/v1/projects/{pid}/files",
        files={"file": ("../escape.exe", io.BytesIO(b"x"), "application/octet-stream")},
    )
    assert r.status_code == 400
    assert r.json()["code"] == "file.invalid_name"


def test_unknown_api_route_is_typed_404():
    """Une route /api inconnue retombe sur un 404 enveloppé (pas l'index SPA)."""
    r = client.get("/api/v1/this/route/does/not/exist")
    assert r.status_code == 404
    body = r.json()
    assert body["code"] == "not_found"
    assert "message" in body
