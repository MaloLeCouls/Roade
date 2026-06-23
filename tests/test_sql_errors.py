"""Filet d'erreurs pédagogique du bloc SQL (`_explain_sql_error`).

Les fautes les plus fréquentes (colonne mal orthographiée, table/entrée non
branchée, mot-clé erroné) doivent produire un message en français actionnable —
pas le jargon brut de DuckDB. Le détail technique reste en fin de message.
"""

import pandas as pd
import pytest

import engine
import storage


def _setup(raw_sql, df=None):
    p = storage.create_project("SqlErr")
    pid = p["id"]
    fd = storage.files_dir(pid)
    src = df if df is not None else pd.DataFrame({"Montant": [1, 2], "Pays": ["FR", "BE"]})
    src.to_excel(fd / "a.xlsx", index=False)
    wf = storage.create_workflow(pid, "W")
    wid = wf["id"]
    wf["nodes"] = [
        {"id": "s", "type": "source", "position": {}, "data": {"file": "a.xlsx"}},
        {"id": "q", "type": "sql", "position": {}, "data": {"mode": "raw", "raw_sql": raw_sql}},
    ]
    wf["edges"] = [
        {"id": "e", "source": "s", "target": "q", "sourceHandle": "out", "targetHandle": "in1"},
    ]
    storage.save_workflow(pid, wf)
    engine.run_workflow(pid, wid, only_node="s")
    return pid, wid


def test_unknown_column_lists_available_columns():
    """Colonne mal orthographiée → message clair + liste des colonnes réelles."""
    pid, wid = _setup('SELECT "Montnt" FROM in1')  # faute de frappe
    with pytest.raises(RuntimeError) as ei:
        engine.run_workflow(pid, wid, only_node="q")
    msg = str(ei.value)
    assert "introuvable" in msg
    assert "Montant" in msg  # une vraie colonne est proposée
    assert "Détail DuckDB" in msg  # le détail technique reste accessible


def test_unconnected_input_table_explained():
    """Référencer in2 sans l'avoir branchée → on explique les entrées."""
    pid, wid = _setup("SELECT * FROM in2")
    with pytest.raises(RuntimeError) as ei:
        engine.run_workflow(pid, wid, only_node="q")
    msg = str(ei.value)
    assert "in2" in msg
    assert "entrée" in msg.lower()


def test_syntax_error_is_friendly():
    """Mot-clé erroné → message « syntaxe » en français, pas le Parser Error brut."""
    pid, wid = _setup("SELET * FROM in1")  # SELECT mal écrit
    with pytest.raises(RuntimeError, match="[Ss]yntaxe"):
        engine.run_workflow(pid, wid, only_node="q")
