"""Roade backend — FastAPI HTTP API over the storage + engine modules.

Run with:  uvicorn main:app --host 127.0.0.1 --port 8000 --app-dir backend
The Vite dev server proxies /api -> http://127.0.0.1:8000.
"""
from __future__ import annotations

import json

from fastapi import FastAPI, Body, UploadFile, File, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse

import storage
import engine

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
@app.get("/api/projects/{pid}/files")
def list_files(pid: str):
    return storage.list_files(pid)


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
def download_file(pid: str, name: str):
    path = storage.files_dir(pid) / name
    if not path.exists():
        raise HTTPException(404, "Fichier introuvable")
    return FileResponse(path, filename=name)


@app.delete("/api/projects/{pid}/files/{name}")
def delete_file(pid: str, name: str):
    path = storage.files_dir(pid) / name
    if path.exists():
        path.unlink()
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


@app.get("/api/projects/{pid}/workflows/{wid}/run-stream")
def run_stream(pid: str, wid: str, only_node: str | None = Query(None),
               force: bool = Query(False)):
    def gen():
        for ev in engine.iter_run_workflow(pid, wid, only_node, force):
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


# --------------------------------------------------------------------------- #
# Validation tester
# --------------------------------------------------------------------------- #
@app.post("/api/validate/test")
def validate_test(payload: dict = Body(...)):
    return engine.validate_test(payload.get("config") or {}, payload.get("samples") or [])
