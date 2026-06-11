"""Roade backend — FastAPI HTTP API over the storage + engine modules.

Run with:  uvicorn main:app --host 127.0.0.1 --port 8000 --app-dir backend
The Vite dev server proxies /api -> http://127.0.0.1:8000.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from io import BytesIO
from urllib.parse import quote

from pathlib import Path

from fastapi import FastAPI, Body, UploadFile, File, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse

import storage
import engine
import workflow_doc

app = FastAPI(title="Roade API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"ok": True}


# --------------------------------------------------------------------------- #
# Projects
# --------------------------------------------------------------------------- #
@app.get("/api/projects")
def list_projects():
    return storage.list_projects()


@app.post("/api/projects")
def create_project(payload: dict = Body(...)):
    name = (payload.get("name") or "").strip()
    if not name:
        raise HTTPException(400, "Nom de projet requis")
    return storage.create_project(name)


@app.get("/api/projects/{pid}")
def get_project(pid: str):
    p = storage.get_project(pid)
    if not p:
        raise HTTPException(404, "Projet introuvable")
    p = dict(p)
    p["dir"] = str(storage.project_dir(pid))
    return p


@app.delete("/api/projects/{pid}")
def delete_project(pid: str):
    storage.delete_project(pid)
    return {"ok": True}


# --------------------------------------------------------------------------- #
# Files
# --------------------------------------------------------------------------- #
def _resolve_file(pid: str, name: str, subdir: str | None) -> Path:
    """Locate a file by name + optional subdir. Sources live flat in files/;
    exports live nested in exports/<workflow folder>/. Path traversal is
    rejected by comparing resolved parents to the legitimate roots."""
    if subdir:
        root = storage.exports_dir(pid).resolve()
        path = (root / subdir / name).resolve()
        if root not in path.parents:
            raise HTTPException(400, "Chemin de fichier invalide")
    else:
        root = storage.files_dir(pid).resolve()
        path = (root / name).resolve()
        if path.parent != root:
            raise HTTPException(400, "Chemin de fichier invalide")
    return path


@app.get("/api/projects/{pid}/files")
def list_files(pid: str):
    # Sources sit flat in files/. Exports are nested in exports/<workflow>/,
    # one folder per workflow — surface both lists in one response so the UI
    # can group exports by workflow without a second request.
    files = storage.list_files(pid)
    for f in files:
        f["origin"] = "source"
    exports_root = storage.exports_dir(pid)
    if exports_root.exists():
        for wf_dir in sorted(p for p in exports_root.iterdir() if p.is_dir()):
            for f in sorted(p for p in wf_dir.iterdir() if p.is_file()):
                files.append({"name": f.name, "size": f.stat().st_size,
                              "origin": "export", "subdir": wf_dir.name})
    return files


@app.post("/api/projects/{pid}/files")
async def upload_file(pid: str, file: UploadFile = File(...)):
    fd = storage.files_dir(pid)
    if not fd.exists():
        raise HTTPException(404, "Projet introuvable")
    dest = fd / file.filename
    with dest.open("wb") as out:
        while chunk := await file.read(1 << 20):
            out.write(chunk)
    return {"name": file.filename, "size": dest.stat().st_size}


@app.get("/api/projects/{pid}/files/{name}")
def download_file(pid: str, name: str, subdir: str | None = Query(None)):
    path = _resolve_file(pid, name, subdir)
    if not path.exists():
        raise HTTPException(404, "Fichier introuvable")
    return FileResponse(path, filename=name)


@app.delete("/api/projects/{pid}/files/{name}")
def delete_file(pid: str, name: str, subdir: str | None = Query(None)):
    path = _resolve_file(pid, name, subdir)
    if path.exists():
        path.unlink()
    return {"ok": True}


def _open_in_os(path) -> None:
    """Open a file with the OS default application (Excel, etc.). Local use only:
    the backend runs on the same machine as the user."""
    if sys.platform.startswith("win"):
        os.startfile(str(path))  # noqa: S606 - Windows-only, trusted local path
    elif sys.platform == "darwin":
        subprocess.Popen(["open", str(path)])
    else:
        subprocess.Popen(["xdg-open", str(path)])


@app.post("/api/projects/{pid}/files/{name}/open")
def open_file(pid: str, name: str, subdir: str | None = Query(None)):
    path = _resolve_file(pid, name, subdir)
    if not path.exists():
        raise HTTPException(404, "Fichier introuvable")
    try:
        _open_in_os(path)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(500, f"Impossible d'ouvrir le fichier : {e}")
    return {"ok": True}


@app.post("/api/projects/{pid}/files/open-folder")
def open_files_folder(pid: str, subdir: str | None = Query(None)):
    """Reveal a project folder in the OS file explorer. No subdir = the sources
    folder; subdir='<workflow folder>' = that workflow's exports folder.
    Local use only — the backend runs on the user's machine."""
    if subdir:
        fd = (storage.exports_dir(pid) / subdir).resolve()
        root = storage.exports_dir(pid).resolve()
        if root not in fd.parents and fd != root:
            raise HTTPException(400, "Chemin invalide")
    else:
        fd = storage.files_dir(pid)
    if not fd.exists():
        raise HTTPException(404, "Dossier introuvable")
    try:
        _open_in_os(fd)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(500, f"Impossible d'ouvrir le dossier : {e}")
    return {"ok": True}


@app.get("/api/projects/{pid}/peek")
def peek(pid: str, file: str, sheet: str | None = None, header_row: int = 0):
    try:
        return engine.peek_source(pid, file, sheet, header_row)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, str(e))


# --------------------------------------------------------------------------- #
# Workflows
# --------------------------------------------------------------------------- #
@app.get("/api/projects/{pid}/workflows")
def list_workflows(pid: str):
    return storage.list_workflows(pid)


@app.post("/api/projects/{pid}/workflows")
def create_workflow(pid: str, payload: dict = Body(...)):
    name = (payload.get("name") or "Nouveau workflow").strip()
    return storage.create_workflow(pid, name)


@app.get("/api/projects/{pid}/workflows/{wid}")
def get_workflow(pid: str, wid: str):
    wf = storage.get_workflow(pid, wid)
    if not wf:
        raise HTTPException(404, "Workflow introuvable")
    return wf


@app.put("/api/projects/{pid}/workflows/{wid}")
def save_workflow(pid: str, wid: str, payload: dict = Body(...)):
    payload["id"] = wid
    return storage.save_workflow(pid, payload)


@app.delete("/api/projects/{pid}/workflows/{wid}")
def delete_workflow(pid: str, wid: str):
    storage.delete_workflow(pid, wid)
    return {"ok": True}


# --------------------------------------------------------------------------- #
# Run
# --------------------------------------------------------------------------- #
@app.post("/api/projects/{pid}/workflows/{wid}/run")
def run_workflow(pid: str, wid: str, only_node: str | None = Query(None)):
    try:
        return engine.run_workflow(pid, wid, only_node)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, str(e))


@app.get("/api/projects/{pid}/workflows/{wid}/document")
def document_workflow(pid: str, wid: str):
    """Human-readable Excel documentation of the workflow (one sheet per output
    file, tracing every treatment that leads to it)."""
    wf = storage.get_workflow(pid, wid)
    if not wf:
        raise HTTPException(404, "Workflow introuvable")
    try:
        data = workflow_doc.build_workbook(pid, wid)
    except Exception as e:  # noqa: BLE001 - surfaced to the UI
        raise HTTPException(400, str(e))
    name = (wf.get("name") or "Workflow").strip() or "Workflow"
    fname = f"Documentation - {name}.xlsx"
    ascii_name = fname.encode("ascii", "ignore").decode().strip() or "documentation.xlsx"
    headers = {
        "Content-Disposition": f"attachment; filename=\"{ascii_name}\"; "
                               f"filename*=UTF-8''{quote(fname)}"
    }
    return StreamingResponse(
        BytesIO(data),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers=headers,
    )


@app.get("/api/projects/{pid}/workflows/{wid}/run-stream")
def run_stream(pid: str, wid: str, only_node: str | None = Query(None),
               force: bool = Query(False), all_exports: bool = Query(False)):
    def gen():
        for ev in engine.iter_run_workflow(pid, wid, only_node, force, all_exports):
            yield f"data: {json.dumps(ev, ensure_ascii=False)}\n\n"
    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no",
                 "Connection": "keep-alive"},
    )


# --------------------------------------------------------------------------- #
# Preview & profile
# --------------------------------------------------------------------------- #
@app.get("/api/projects/{pid}/workflows/{wid}/nodes/{nid}/preview")
def preview(pid: str, wid: str, nid: str,
            handle: str = "out", limit: int = 200, offset: int = 0,
            sort: str | None = None, dir: str = "asc",
            q: str | None = None, filters: str | None = None):
    parsed = []
    if filters:
        try:
            parsed = json.loads(filters)
        except json.JSONDecodeError:
            parsed = []
    try:
        return engine.preview_node(pid, wid, nid, handle=handle, limit=limit,
                                   offset=offset, sort=sort, direction=dir,
                                   filters=parsed, q=q)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, str(e))


@app.get("/api/projects/{pid}/workflows/{wid}/nodes/{nid}/profile")
def profile(pid: str, wid: str, nid: str, column: str, handle: str = "out"):
    try:
        return engine.column_profile(pid, wid, nid, column, handle=handle)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, str(e))


@app.get("/api/projects/{pid}/workflows/{wid}/nodes/{nid}/group")
def keys_group(pid: str, wid: str, nid: str, key: str = "",
               q: str | None = None, handle: str = "out", limit: int = 200):
    key_cols = [c for c in key.split(",") if c.strip()]
    try:
        return engine.keys_group(pid, wid, nid, key_cols, q, handle=handle, limit=limit)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, str(e))


@app.post("/api/projects/{pid}/workflows/{wid}/nodes/{nid}/route-preview")
def route_preview(pid: str, wid: str, nid: str, payload: dict = Body(...)):
    try:
        return engine.route_preview(pid, wid, nid, payload)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, str(e))


@app.post("/api/projects/{pid}/workflows/{wid}/nodes/{nid}/split-scan")
def split_scan(pid: str, wid: str, nid: str, payload: dict = Body(...)):
    try:
        return engine.split_scan(pid, wid, nid, payload)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, str(e))


# --------------------------------------------------------------------------- #
# Validation tester
# --------------------------------------------------------------------------- #
@app.post("/api/validate/test")
def validate_test(payload: dict = Body(...)):
    return engine.validate_test(payload.get("config") or {}, payload.get("samples") or [])
