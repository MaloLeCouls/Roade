"""Project / workflow persistence on disk.

Layout:
projects/
  <project_id>/
    project.json
    files/                 # uploaded source files (xlsx, csv)
    workflows/
      <workflow_id>.json   # {id, name, nodes, edges}
    data/
      <workflow_id>/
        <node_id>.parquet      # materialized output of each block
        <node_id>.meta.json    # cached preview (columns, sample, stats)
"""

from __future__ import annotations

import json
import re
import shutil
import time
import uuid
from pathlib import Path

# projects/ lives next to the backend/ folder, at the repo root.
ROOT = Path(__file__).resolve().parent.parent / "projects"
ROOT.mkdir(parents=True, exist_ok=True)


def _slug(name: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9_-]+", "-", name.strip().lower()).strip("-")
    return s or "projet"


def _now() -> float:
    return time.time()


# --------------------------------------------------------------------------- #
# Projects
# --------------------------------------------------------------------------- #
def project_dir(project_id: str) -> Path:
    return ROOT / project_id


def list_projects() -> list[dict]:
    out = []
    for d in sorted(ROOT.iterdir()) if ROOT.exists() else []:
        meta = d / "project.json"
        if d.is_dir() and meta.exists():
            data = json.loads(meta.read_text(encoding="utf-8"))
            # C.6 — enrichissement : nb workflows, nb fichiers, dernière activité.
            # Sans toucher au format on-disk (project.json reste minimal) : on
            # dérive ces métriques à la lecture.
            wf_dir = d / "workflows"
            files_dir_ = d / "files"
            data["workflow_count"] = sum(1 for _ in wf_dir.glob("*.json")) if wf_dir.exists() else 0
            data["file_count"] = (
                sum(1 for f in files_dir_.iterdir() if f.is_file()) if files_dir_.exists() else 0
            )
            # « dernière activité » = max mtime de project.json + workflows/*.json,
            # exposée en millisecondes pour rester JS-friendly.
            mtimes = [meta.stat().st_mtime_ns]
            if wf_dir.exists():
                mtimes += [p.stat().st_mtime_ns for p in wf_dir.glob("*.json")]
            data["last_modified_ms"] = max(mtimes) // 1_000_000
            out.append(data)
    out.sort(key=lambda p: p.get("last_modified_ms", p.get("created_at", 0)), reverse=True)
    return out


def create_project(name: str) -> dict:
    base = _slug(name)
    pid = base
    i = 2
    while (ROOT / pid).exists():
        pid = f"{base}-{i}"
        i += 1
    d = ROOT / pid
    (d / "files").mkdir(parents=True)
    (d / "workflows").mkdir(parents=True)
    (d / "data").mkdir(parents=True)
    meta = {"id": pid, "name": name, "created_at": _now()}
    (d / "project.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return meta


def get_project(project_id: str) -> dict | None:
    meta = project_dir(project_id) / "project.json"
    if not meta.exists():
        return None
    return json.loads(meta.read_text(encoding="utf-8"))


def delete_project(project_id: str) -> None:
    d = project_dir(project_id)
    if d.exists():
        shutil.rmtree(d)


# --------------------------------------------------------------------------- #
# Files
# --------------------------------------------------------------------------- #
def files_dir(project_id: str) -> Path:
    return project_dir(project_id) / "files"


def exports_dir(project_id: str) -> Path:
    return project_dir(project_id) / "exports"


def _safe_folder(name: str) -> str:
    """OS-illegal chars stripped, casing/spaces kept — so the on-disk folder
    name still reads as the workflow does in the UI ('Workflow A', not 'workflow-a')."""
    return re.sub(r"[\\/:*?\"<>|]", "_", str(name or "").strip()) or "Workflow"


def workflow_export_dir(project_id: str, wf_name: str) -> Path:
    return exports_dir(project_id) / _safe_folder(wf_name)


def list_files(project_id: str) -> list[dict]:
    fd = files_dir(project_id)
    out = []
    if fd.exists():
        for f in sorted(fd.iterdir()):
            if f.is_file():
                out.append({"name": f.name, "size": f.stat().st_size})
    return out


# --------------------------------------------------------------------------- #
# Workflows
# --------------------------------------------------------------------------- #
def workflows_dir(project_id: str) -> Path:
    return project_dir(project_id) / "workflows"


def list_workflows(project_id: str) -> list[dict]:
    wd = workflows_dir(project_id)
    out = []
    if wd.exists():
        for f in sorted(wd.glob("*.json")):
            wf = json.loads(f.read_text(encoding="utf-8"))
            out.append({"id": wf["id"], "name": wf.get("name", wf["id"])})
    return out


def create_workflow(project_id: str, name: str) -> dict:
    wid = uuid.uuid4().hex[:8]
    wf = {"id": wid, "name": name, "nodes": [], "edges": []}
    save_workflow(project_id, wf)
    return wf


def get_workflow(project_id: str, workflow_id: str) -> dict | None:
    f = workflows_dir(project_id) / f"{workflow_id}.json"
    if not f.exists():
        return None
    return json.loads(f.read_text(encoding="utf-8"))


def save_workflow(project_id: str, wf: dict) -> dict:
    wd = workflows_dir(project_id)
    wd.mkdir(parents=True, exist_ok=True)
    (wd / f"{wf['id']}.json").write_text(json.dumps(wf, indent=2), encoding="utf-8")
    return wf


def delete_workflow(project_id: str, workflow_id: str) -> None:
    f = workflows_dir(project_id) / f"{workflow_id}.json"
    if f.exists():
        f.unlink()
    dd = data_dir(project_id, workflow_id)
    if dd.exists():
        shutil.rmtree(dd)


# --------------------------------------------------------------------------- #
# Materialized data
# --------------------------------------------------------------------------- #
def data_dir(project_id: str, workflow_id: str) -> Path:
    return project_dir(project_id) / "data" / workflow_id


def _handle_suffix(handle: str) -> str:
    # default output keeps the bare name (backward compatible with V1 projects)
    return "" if handle in (None, "", "out") else f"__{handle}"


def node_parquet(project_id: str, workflow_id: str, node_id: str, handle: str = "out") -> Path:
    return data_dir(project_id, workflow_id) / f"{node_id}{_handle_suffix(handle)}.parquet"


def node_meta_path(project_id: str, workflow_id: str, node_id: str, handle: str = "out") -> Path:
    return data_dir(project_id, workflow_id) / f"{node_id}{_handle_suffix(handle)}.meta.json"


def read_node_meta(
    project_id: str, workflow_id: str, node_id: str, handle: str = "out"
) -> dict | None:
    p = node_meta_path(project_id, workflow_id, node_id, handle)
    if not p.exists():
        return None
    return json.loads(p.read_text(encoding="utf-8"))


def write_node_meta(
    project_id: str, workflow_id: str, node_id: str, meta: dict, handle: str = "out"
) -> None:
    data_dir(project_id, workflow_id).mkdir(parents=True, exist_ok=True)
    node_meta_path(project_id, workflow_id, node_id, handle).write_text(
        json.dumps(meta, indent=2), encoding="utf-8"
    )


# --------------------------------------------------------------------------- #
# Runs history (A.10) — JSONL append-only par workflow
# --------------------------------------------------------------------------- #
# La progression est live (SSE) et perdue dès qu'on ferme l'onglet. On garde
# ici une trace persistante des derniers runs pour pouvoir comparer, voir si
# tel bloc a été recalculé ou servi par le cache, et combien de temps il a
# mis. Le format est JSONL : append-only en O(1), pas de lock à gérer.


def _runs_path(project_id: str, workflow_id: str) -> Path:
    return data_dir(project_id, workflow_id) / "runs.jsonl"


def append_run(project_id: str, workflow_id: str, entry: dict) -> None:
    p = _runs_path(project_id, workflow_id)
    p.parent.mkdir(parents=True, exist_ok=True)
    with p.open("a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


def list_runs(project_id: str, workflow_id: str, limit: int = 50) -> list[dict]:
    """Return the most recent runs (newest first), at most `limit`."""
    p = _runs_path(project_id, workflow_id)
    if not p.exists():
        return []
    # Pour des historiques courts (< quelques milliers), lire tout est OK.
    # Si ça grandit, on tronquera le fichier régulièrement (à voir plus tard).
    lines = p.read_text(encoding="utf-8").splitlines()
    out = []
    for ln in lines[-limit:][::-1]:
        ln = ln.strip()
        if not ln:
            continue
        try:
            out.append(json.loads(ln))
        except json.JSONDecodeError:
            continue  # ligne corrompue → on l'ignore plutôt que faire planter l'historique
    return out


def prune_node_outputs(project_id: str, workflow_id: str, node_id: str, keep_handles) -> list[str]:
    # Delete any .parquet/.meta.json on disk for this node whose handle isn't
    # in `keep_handles`. Called right after a node re-materializes so a config
    # that drops an output (or toggles `else` off) doesn't leave a ghost file
    # that a downstream block could still ingest via an orphan edge.
    dd = data_dir(project_id, workflow_id)
    if not dd.exists():
        return []
    keep = {(h or "out") for h in keep_handles}
    removed: list[str] = []
    prefix = f"{node_id}__"
    for p in dd.iterdir():
        nm = p.name
        for ext in (".parquet", ".meta.json"):
            if not nm.endswith(ext):
                continue
            stem = nm[: -len(ext)]
            if stem == node_id:
                handle = "out"
            elif stem.startswith(prefix):
                handle = stem[len(prefix) :]
            else:
                continue
            if handle not in keep:
                try:
                    p.unlink()
                    removed.append(nm)
                except OSError:
                    pass
            break
    return removed
