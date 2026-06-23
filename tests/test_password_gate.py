"""Portail mot de passe (HTTP Basic) — graine cloud 1.

`PasswordGate` protège tout le service **si** `ROADE_PASSWORD` est définie, et
reste totalement transparent sinon (dev local et `docker compose` perso). On
teste le middleware ASGI isolément, autour d'une mini-app, pour ne pas dépendre
de la pile middleware déjà figée de `main.app`.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from main import PasswordGate


async def _ok_app(scope, receive, send):
    """Mini-app ASGI qui répond toujours 200 « ok » — la cible protégée."""
    await send(
        {
            "type": "http.response.start",
            "status": 200,
            "headers": [(b"content-type", b"text/plain")],
        }
    )
    await send({"type": "http.response.body", "body": b"ok"})


def _client(monkeypatch, *, password=None, user=None) -> TestClient:
    """Construit le portail APRÈS avoir posé l'environnement (lu en __init__)."""
    monkeypatch.delenv("ROADE_PASSWORD", raising=False)
    monkeypatch.delenv("ROADE_USER", raising=False)
    if password is not None:
        monkeypatch.setenv("ROADE_PASSWORD", password)
    if user is not None:
        monkeypatch.setenv("ROADE_USER", user)
    return TestClient(PasswordGate(_ok_app))


def test_no_password_means_open(monkeypatch):
    """Sans `ROADE_PASSWORD` : aucun mot de passe demandé (dev local inchangé)."""
    r = _client(monkeypatch).get("/")
    assert r.status_code == 200
    assert r.text == "ok"


def test_password_set_blocks_anonymous(monkeypatch):
    """Variable posée + aucune authentification → 401 avec le défi Basic."""
    r = _client(monkeypatch, password="s3cret").get("/")
    assert r.status_code == 401
    assert r.headers["www-authenticate"].lower().startswith("basic")


def test_wrong_password_rejected(monkeypatch):
    r = _client(monkeypatch, password="s3cret").get("/", auth=("roade", "nope"))
    assert r.status_code == 401


def test_correct_credentials_pass(monkeypatch):
    """Bon couple (utilisateur par défaut `roade`) → la requête traverse."""
    r = _client(monkeypatch, password="s3cret").get("/", auth=("roade", "s3cret"))
    assert r.status_code == 200
    assert r.text == "ok"


def test_custom_user_name(monkeypatch):
    """`ROADE_USER` change l'identifiant attendu ; l'ancien ne marche plus."""
    client = _client(monkeypatch, password="s3cret", user="manager")
    assert client.get("/", auth=("roade", "s3cret")).status_code == 401
    assert client.get("/", auth=("manager", "s3cret")).status_code == 200
