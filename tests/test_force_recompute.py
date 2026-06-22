"""Recalcul forcé ciblé (`force_nodes`) — sélection sur le canevas.

Forcer un bloc seul ne suffit pas : la signature de cache d'un bloc aval ne
dépend que de la config + des signatures amont (Merkle), pas du contenu
recalculé. Le force ciblé doit donc recalculer la sélection ET tout son aval,
tout en réutilisant l'amont depuis le cache (ne pas relire une source lente).

On s'appuie sur le projet de démo (Source → Nettoyage → Calcul → Validation →
2 Exports), isolé par la fixture autouse `_isolate_storage`.
"""

from __future__ import annotations

import json

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def _run(pid, wid, **params):
    """Lance un run (SSE) jusqu'au bout, renvoie {node_id: cached(bool)}."""
    r = client.get(f"/api/projects/{pid}/workflows/{wid}/run-stream", params=params)
    assert r.status_code == 200, r.text
    cached = {}
    for line in r.content.decode("utf-8").splitlines():
        if not line.startswith("data:"):
            continue
        ev = json.loads(line[len("data:") :].strip())
        if ev.get("event") == "node_done":
            cached[ev["node_id"]] = bool(ev["result"].get("cached"))
    return cached


def _seed_and_prime():
    pid, wid = (lambda b: (b["project_id"], b["workflow_id"]))(client.post("/api/demo").json())
    _run(pid, wid)  # 1er run complet : tout est matérialisé
    return pid, wid


def test_force_node_recomputes_it_and_downstream_reuses_upstream():
    pid, wid = _seed_and_prime()

    # Force ciblé sur la Validation : amont réutilisé, val + exports recalculés.
    cached = _run(pid, wid, force_nodes="val")

    # amont (réutilisé du cache)
    assert cached["src"] is True
    assert cached["clean"] is True
    assert cached["calc"] is True
    # la sélection + son aval (recalculés)
    assert cached["val"] is False
    assert cached["exp_ok"] is False
    assert cached["exp_ko"] is False


def test_force_middle_node_propagates_to_all_descendants():
    pid, wid = _seed_and_prime()

    # Force sur le Calcul (au milieu) : src/clean réutilisés ; calc, val, exports recalculés.
    cached = _run(pid, wid, force_nodes="calc")
    assert cached["src"] is True
    assert cached["clean"] is True
    assert cached["calc"] is False
    assert cached["val"] is False
    assert cached["exp_ok"] is False
    assert cached["exp_ko"] is False


def test_force_does_not_touch_unrelated_upstream_branch():
    """Sans force, un 2e run réutilise TOUT (rien de sale) — garde-fou : le
    mécanisme de cache de base reste intact à côté du force ciblé."""
    pid, wid = _seed_and_prime()
    cached = _run(pid, wid)  # 2e run, aucun changement
    # exports mis à part (ils tournent toujours), tout le reste est en cache
    assert cached["src"] is True
    assert cached["clean"] is True
    assert cached["calc"] is True
    assert cached["val"] is True


def test_force_normal_run_after_keeps_result_consistent():
    """Après un force ciblé, le résultat matérialisé est bien à jour : l'aperçu
    de la sortie `valid` rend le bon nombre de lignes (9 conformes)."""
    pid, wid = _seed_and_prime()
    _run(pid, wid, force_nodes="val")
    valid = client.get(
        f"/api/projects/{pid}/workflows/{wid}/nodes/val/preview", params={"handle": "valid"}
    ).json()
    assert valid["row_count"] == 9
