"""Tests de la chaîne d'exécution exploitable de l'audit 07 § 8.

Ferme les trois maillons qui, ensemble, permettaient à un onglet tiers ouvert
pendant que Roade tourne en localhost d'uploader un fichier arbitraire et de
le faire exécuter par l'OS :
    - B.1 : CORS restreint à l'origine locale (pas `*`).
    - B.2 : `file.filename` assainie à l'upload (basename only, rejet `..`).
    - B.3 : `os.startfile` refuse les extensions exécutables.
    - B.5 : Pydantic refuse un body malformé avec 422 (et pas 500).
"""

from __future__ import annotations

import io

import pytest
from fastapi.testclient import TestClient

import main
from main import app

client = TestClient(app)


# --------------------------------------------------------------------------- #
# B.1 — CORS
# --------------------------------------------------------------------------- #
def test_cors_blocks_unknown_origin():
    """Une page malveillante (ici, evil.example) ne reçoit PAS d'en-tête
    `Access-Control-Allow-Origin` qui l'autoriserait à lire la réponse."""
    r = client.get("/api/health", headers={"Origin": "https://evil.example"})
    assert r.status_code == 200  # la requête passe (le navigateur, pas le serveur, bloque)
    assert r.headers.get("access-control-allow-origin") != "https://evil.example"
    assert r.headers.get("access-control-allow-origin") != "*"


def test_cors_allows_vite_dev_origin():
    """Le frontend Vite (localhost:5173) doit, lui, être autorisé à appeler /api."""
    r = client.get("/api/health", headers={"Origin": "http://localhost:5173"})
    assert r.status_code == 200
    assert r.headers.get("access-control-allow-origin") == "http://localhost:5173"


# --------------------------------------------------------------------------- #
# B.2 — Upload : sanitize `filename`
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize(
    "bad_name",
    [
        "../escape.txt",
        "..\\escape.txt",
        "../../etc/passwd",
        "sub/dir/file.csv",
        "sub\\dir\\file.csv",
        "..",
        ".",
    ],
)
def test_upload_rejects_path_traversal(bad_name):
    """Quel que soit le path inclus dans `filename`, l'upload doit refuser
    plutôt que d'écrire en dehors de `files/`. Sans cela, un upload `../x.exe`
    + un `open` ensuite suffisait à exécuter du code (audit 07 § 8)."""
    pid = client.post("/api/projects", json={"name": "Up"}).json()["id"]
    r = client.post(
        f"/api/projects/{pid}/files",
        files={"file": (bad_name, io.BytesIO(b"data"), "text/plain")},
    )
    assert r.status_code == 400, r.text


def test_upload_keeps_basename():
    """Cas légitime : un filename simple est gardé tel quel."""
    pid = client.post("/api/projects", json={"name": "UpOk"}).json()["id"]
    r = client.post(
        f"/api/projects/{pid}/files",
        files={"file": ("rapport.csv", io.BytesIO(b"a;b\n1;2\n"), "text/csv")},
    )
    assert r.status_code == 200
    assert r.json()["name"] == "rapport.csv"


# --------------------------------------------------------------------------- #
# B.3 — OS open : whitelist d'extensions
# --------------------------------------------------------------------------- #
def test_open_refuses_executable_extension():
    """Même avec un fichier déposé sur disque, l'API refuse de l'ouvrir si son
    extension n'est pas une extension data — sinon `os.startfile('x.lnk')`
    lance ce que le lien pointe."""
    pid = client.post("/api/projects", json={"name": "OpenExe"}).json()["id"]
    # On dépose directement le fichier sur disque (l'upload aurait sanitizé le
    # nom mais accepté un `.exe`). On teste le filtre côté ouverture.
    import storage

    fd = storage.files_dir(pid)
    (fd / "rogue.lnk").write_bytes(b"not a real lnk")
    r = client.post(f"/api/projects/{pid}/files/rogue.lnk/open")
    assert r.status_code == 400, r.text
    assert "non ouvrable" in r.text.lower() or "ouvrable" in r.text.lower()


# --------------------------------------------------------------------------- #
# B.5 — Pydantic refuse les bodies malformés AVEC 422 (pas 500)
# --------------------------------------------------------------------------- #
def test_create_project_rejects_missing_name_with_422():
    """Sans clé `name`, Pydantic renvoie 422 ; avant, c'était un 400 maison
    via .get('name') — OK, mais un body de type complètement faux (liste,
    string nu) levait un 500."""
    r = client.post("/api/projects", json={})
    assert r.status_code == 422
    r2 = client.post("/api/projects", json=["not an object"])
    assert r2.status_code == 422


def test_validate_test_rejects_non_object_body():
    """Un body qui n'est pas un objet JSON est refusé proprement (422)."""
    r = client.post("/api/validate/test", json="not an object")
    assert r.status_code == 422


# --------------------------------------------------------------------------- #
# Unitaires sur les helpers de B (couvrent les chemins non-API)
# --------------------------------------------------------------------------- #
def test_safe_upload_name_unit():
    # Cas légitimes : conservés tels quels
    assert main._safe_upload_name("foo.csv") == "foo.csv"
    assert main._safe_upload_name(" rapport final.xlsx ") == "rapport final.xlsx"  # strip OK
    assert main._safe_upload_name("Référence.csv") == "Référence.csv"  # accents OK

    # Cas dangereux : rejet (PAS sanitize silencieux — sinon `../x.exe` passerait
    # pour `x.exe` et l'utilisateur ne verrait rien d'anormal côté UI)
    from errors import RoadeError

    for bad in ("", "..", ".", "../x", "..\\x", "a/b", "a\\b", "../../etc/passwd"):
        with pytest.raises(RoadeError):
            main._safe_upload_name(bad)
