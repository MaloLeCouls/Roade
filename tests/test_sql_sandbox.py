"""Sandbox du SQL `raw` — B.4.

Avant ce chantier : un bloc SQL en mode `raw` pouvait appeler `read_csv_auto`,
`COPY ... TO`, `httpfs`, `ATTACH` — donc lire/écrire/exfiltrer n'importe quel
fichier accessible par le process. Couplé au CORS large d'avant Chantier B,
ça constituait un vecteur d'exécution arbitraire.

Maintenant : `_run_sql` ouvre une connexion DuckDB jetable avec
`enable_external_access = false` pour le mode raw uniquement. Le mode
`builder` (SQL qu'on génère) garde la connexion partagée du workflow.
"""

from pathlib import Path

import pandas as pd
import pytest

import engine
import storage


def _make_workflow_with_raw_sql(raw_sql: str, source_df=None):
    """Construit un workflow Source → SQL(raw), exécute la Source, renvoie pid/wid."""
    p = storage.create_project("SqlSandbox")
    pid = p["id"]
    fd = storage.files_dir(pid)
    df = source_df if source_df is not None else pd.DataFrame({"x": [1, 2, 3], "y": ["a", "b", "c"]})
    df.to_excel(fd / "data.xlsx", index=False)
    wf = storage.create_workflow(pid, "W")
    wid = wf["id"]
    wf["nodes"] = [
        {"id": "s", "type": "source", "position": {}, "data": {"file": "data.xlsx"}},
        {"id": "q", "type": "sql", "position": {}, "data": {"mode": "raw", "raw_sql": raw_sql}},
    ]
    wf["edges"] = [
        {"id": "e", "source": "s", "target": "q", "sourceHandle": "out", "targetHandle": "in1"},
    ]
    storage.save_workflow(pid, wf)
    engine.run_workflow(pid, wid, only_node="s")
    return pid, wid


def test_raw_sql_against_input_table_still_works():
    """Le mode raw doit rester fonctionnel sur les entrées enregistrées —
    on bloque le filesystem, pas les SELECT."""
    pid, wid = _make_workflow_with_raw_sql("SELECT * FROM in1 WHERE x > 1")
    engine.run_workflow(pid, wid, only_node="q")
    out = engine.preview_node(pid, wid, "q")
    assert out["row_count"] == 2  # rows where x = 2 and 3


def test_raw_sql_can_join_two_inputs():
    """Smoke test : `register` sur des DataFrames en mémoire reste autorisé
    même après `enable_external_access = false`."""
    p = storage.create_project("SqlSandboxJoin")
    pid = p["id"]
    fd = storage.files_dir(pid)
    pd.DataFrame({"id": [1, 2, 3], "val": ["a", "b", "c"]}).to_excel(fd / "a.xlsx", index=False)
    pd.DataFrame({"id": [1, 3], "extra": ["X", "Z"]}).to_excel(fd / "b.xlsx", index=False)
    wf = storage.create_workflow(pid, "W")
    wid = wf["id"]
    wf["nodes"] = [
        {"id": "sa", "type": "source", "position": {}, "data": {"file": "a.xlsx"}},
        {"id": "sb", "type": "source", "position": {}, "data": {"file": "b.xlsx"}},
        {
            "id": "q",
            "type": "sql",
            "position": {},
            "data": {
                "mode": "raw",
                "raw_sql": "SELECT in1.id, val, extra FROM in1 JOIN in2 USING (id) ORDER BY in1.id",
            },
        },
    ]
    wf["edges"] = [
        {"id": "ea", "source": "sa", "target": "q", "sourceHandle": "out", "targetHandle": "in1"},
        {"id": "eb", "source": "sb", "target": "q", "sourceHandle": "out", "targetHandle": "in2"},
    ]
    storage.save_workflow(pid, wf)
    engine.run_workflow(pid, wid, only_node="sa")
    engine.run_workflow(pid, wid, only_node="sb")
    engine.run_workflow(pid, wid, only_node="q")
    out = engine.preview_node(pid, wid, "q")
    assert out["row_count"] == 2  # ids 1 et 3


def test_raw_sql_blocks_read_csv_auto():
    """`read_csv_auto('chemin')` est l'attaque canonique : lire un fichier
    arbitraire du disque depuis du SQL utilisateur. `run_workflow` propage
    l'erreur en `RuntimeError` (cf. backend/engine.py:run_workflow)."""
    pid, wid = _make_workflow_with_raw_sql("SELECT * FROM read_csv_auto('any.csv')")
    with pytest.raises(RuntimeError, match="sandbox|filesystem|disabled"):
        engine.run_workflow(pid, wid, only_node="q")


def test_raw_sql_blocks_read_parquet_arbitrary_path():
    """Symétrique : `read_parquet` sur un chemin disque arbitraire."""
    pid, wid = _make_workflow_with_raw_sql("SELECT * FROM read_parquet('whatever.parquet')")
    with pytest.raises(RuntimeError, match="sandbox|filesystem|disabled"):
        engine.run_workflow(pid, wid, only_node="q")


def test_raw_sql_blocks_copy_to_file(tmp_path):
    """`COPY ... TO 'fichier'` permettrait d'exfiltrer le résultat vers le disque."""
    target = tmp_path / "leak.csv"
    pid, wid = _make_workflow_with_raw_sql(
        f"COPY (SELECT * FROM in1) TO '{target}' (FORMAT CSV)"
    )
    with pytest.raises(RuntimeError, match="sandbox|filesystem|disabled"):
        engine.run_workflow(pid, wid, only_node="q")
    assert not target.exists(), "le COPY a quand même écrit le fichier — sandbox cassée"


def test_raw_sql_blocks_install_extension():
    """`INSTALL` télécharge depuis le réseau, doit être interdit. DuckDB peut
    formuler l'erreur différemment ici — on accepte tout ce qui n'est pas un
    succès silencieux."""
    pid, wid = _make_workflow_with_raw_sql("INSTALL httpfs")
    with pytest.raises(RuntimeError):
        engine.run_workflow(pid, wid, only_node="q")


def test_raw_sql_cannot_re_enable_external_access():
    """`enable_external_access` est *one-way* dans DuckDB : une fois à false dans
    une session, impossible de remonter à true. On vérifie qu'une attaque qui
    tenterait `SET enable_external_access = true; ...` échoue avant même
    d'atteindre le `read_csv_auto`."""
    pid, wid = _make_workflow_with_raw_sql(
        "SET enable_external_access = true; SELECT * FROM read_csv_auto('any.csv')"
    )
    with pytest.raises(RuntimeError, match="Cannot change enable_external_access|sandbox"):
        engine.run_workflow(pid, wid, only_node="q")


def test_builder_mode_is_not_affected():
    """Le mode builder (SQL qu'on génère) doit rester sur la connexion partagée
    du workflow — sinon on casserait tous les SQL pré-existants."""
    p = storage.create_project("SqlBuilder")
    pid = p["id"]
    fd = storage.files_dir(pid)
    pd.DataFrame({"x": [10, 20, 30]}).to_excel(fd / "d.xlsx", index=False)
    wf = storage.create_workflow(pid, "W")
    wid = wf["id"]
    wf["nodes"] = [
        {"id": "s", "type": "source", "position": {}, "data": {"file": "d.xlsx"}},
        {
            "id": "q",
            "type": "sql",
            "position": {},
            "data": {
                "mode": "builder",
                "query": {
                    "select": [{"column": "x", "alias": "x"}],
                    "where": [],
                    "joins": [],
                    "group_by": [],
                    "order_by": [],
                },
            },
        },
    ]
    wf["edges"] = [
        {"id": "e", "source": "s", "target": "q", "sourceHandle": "out", "targetHandle": "in1"},
    ]
    storage.save_workflow(pid, wf)
    engine.run_workflow(pid, wid)
    out = engine.preview_node(pid, wid, "q")
    assert out["row_count"] == 3
