"""Fixtures pytest pour Roade.

Le pattern de tous les anciens scripts `backend/_test_*.py` était d'écrire dans
`projects/` à la racine du repo et de nettoyer à la fin via `storage.delete_project`
— sans `try/finally`, donc en cas d'échec d'assertion le projet restait sur disque.

Ici on isole chaque test dans son propre `tmp_path` en remplaçant dynamiquement
`storage.ROOT` (résolu via les globals du module ; toutes les fonctions de
`storage.py` lisent cette même variable). pytest nettoie `tmp_path` automatiquement.
"""

from __future__ import annotations

import pytest


@pytest.fixture(autouse=True)
def _isolate_storage(tmp_path, monkeypatch):
    """Redirige `storage.ROOT` vers `tmp_path/projects` pour chaque test."""
    import storage

    root = tmp_path / "projects"
    root.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(storage, "ROOT", root)
    yield root
