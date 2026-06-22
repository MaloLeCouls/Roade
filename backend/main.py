"""Roade backend — FastAPI HTTP API over the storage + engine modules.

Run with:  uvicorn main:app --host 127.0.0.1 --port 8000 --app-dir backend

Dev :  le serveur Vite (port 5173) proxifie /api -> http://127.0.0.1:8000.
Prod : si `frontend/dist/` existe (après `npm run build`), FastAPI sert aussi
       l'app buildée à la racine — un seul process pour l'API + le frontend.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from io import BytesIO
from pathlib import Path
from typing import Any
from urllib.parse import quote

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, ConfigDict, Field

import demo
import engine
import storage
import workflow_doc
from errors import RoadeError, register_error_handlers

# Source unique de la version backend. Tenu en synchro avec `pyproject.toml` et
# `frontend/package.json` ; voir CHANGELOG.md pour la politique de release (G.5).
__version__ = "0.5.0"

app = FastAPI(title="Roade API", version=__version__)

# CORS volontairement étroit (cf. todo B.1). Roade est mono-utilisateur local :
# le seul cas où l'on a besoin de CORS, c'est le dev avec Vite (port 5173) qui
# appelle l'API sur 8000. En prod « un seul process » (todo 0.8), le frontend
# est servi par FastAPI lui-même → même origine, aucune en-tête CORS requise.
# `allow_origins=["*"]` exposait l'API à n'importe quel onglet ouvert dans le
# navigateur (cf. chaîne exploitable audit 07 § 8).
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type"],
)


class ApiVersionRewrite:
    """Expose l'API sous `/api/v1` (graine cloud 1 — versionner pour évoluer
    sans casser) sans dupliquer les ~40 routes : on réécrit `/api/v1/<x>` en
    `/api/<x>` avant le routage. La forme `/api/<x>` (sans version) reste
    acceptée — rétro-compat des bookmarks et de la suite de tests.

    C'est aussi le **seul point d'entrée** que traverse chaque requête API :
    l'endroit naturel où brancher demain une vérification d'authentification
    (graine cloud 1, encore inactive — on ne câble rien ici aujourd'hui).

    Implémenté en ASGI pur (pas via `BaseHTTPMiddleware`) pour ne pas
    bufferiser la réponse en streaming du run SSE (`/run-stream`).
    """

    _PREFIX = "/api/v1"

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            path = scope.get("path", "")
            if path == self._PREFIX or path.startswith(self._PREFIX + "/"):
                scope = dict(scope)
                scope["path"] = "/api" + path[len(self._PREFIX) :]
                raw = scope.get("raw_path")
                if raw is not None:
                    # raw_path est ASCII et n'inclut pas la query string : on ne
                    # réécrit que le préfixe de version, le reste reste intact.
                    scope["raw_path"] = b"/api" + raw[len(self._PREFIX) :]
        await self.app(scope, receive, send)


# Ajouté après CORS → middleware le plus externe : la réécriture de version a
# lieu avant tout le reste, le routage ne voit que des chemins `/api/...`.
app.add_middleware(ApiVersionRewrite)

# Enveloppe d'erreur typée `{code, message}` sur toute l'API (todo B.6).
register_error_handlers(app)


# --------------------------------------------------------------------------- #
# Bodies JSON validés (Pydantic) — todo B.5
# --------------------------------------------------------------------------- #
# Les bodies « catalogue de bloc » sont volontairement libres (extra=allow) :
# imposer un schéma profond casserait à chaque ajout de fonctionnalité dans un
# bloc et déplacerait la validation utile (clé X obligatoire pour ce type Y)
# dans `engine.py` où elle existe déjà. On valide ici la *forme du shell* — ce
# qui suffit à arrêter un body manifestement invalide AVANT qu'il n'atteigne
# l'engine, et à renvoyer un 422 propre au front.


class CreateProjectBody(BaseModel):
    """POST /api/projects."""

    name: str = Field(..., min_length=1, max_length=200)


class CreateWorkflowBody(BaseModel):
    """POST /api/projects/{pid}/workflows."""

    name: str = Field(default="Nouveau workflow", max_length=200)


class SaveWorkflowBody(BaseModel):
    """PUT /api/projects/{pid}/workflows/{wid}."""

    model_config = ConfigDict(extra="allow")
    name: str | None = None
    nodes: list[dict[str, Any]] = Field(default_factory=list)
    edges: list[dict[str, Any]] = Field(default_factory=list)


class ValidateTestBody(BaseModel):
    """POST /api/validate/test."""

    config: dict[str, Any] = Field(default_factory=dict)
    samples: list[Any] = Field(default_factory=list)


class BackpackAddBody(BaseModel):
    """POST /api/projects/{pid}/backpack — créer un item d'inventaire."""

    name: str = Field(default="", max_length=120)
    nodes: list[dict[str, Any]] = Field(default_factory=list)
    edges: list[dict[str, Any]] = Field(default_factory=list)


class BackpackPatchBody(BaseModel):
    """PATCH /api/projects/{pid}/backpack/{iid} — renommer."""

    name: str = Field(..., min_length=1, max_length=120)


class FreeJsonBody(BaseModel):
    """Bodies très libres (route-preview / split-scan) : on accepte un objet,
    on refuse tout sauf ça (liste, str, null) — c'est déjà mieux que rien."""

    model_config = ConfigDict(extra="allow")


@app.get("/api/health")
def health():
    return {"ok": True}


@app.get("/api/version")
def version():
    return {"version": __version__}


@app.post("/api/demo")
def create_demo():
    """G.2 — crée le projet de démonstration embarqué (dossier + CSV FR + un
    workflow complet et exécutable) et renvoie de quoi naviguer droit dessus."""
    return demo.seed_demo_project()


# --------------------------------------------------------------------------- #
# Projects
# --------------------------------------------------------------------------- #
@app.get("/api/projects")
def list_projects():
    return storage.list_projects()


@app.post("/api/projects")
def create_project(payload: CreateProjectBody):
    name = payload.name.strip()
    if not name:
        raise RoadeError("project.name_required", "Nom de projet requis", 400)
    return storage.create_project(name)


@app.get("/api/projects/{pid}")
def get_project(pid: str):
    p = storage.get_project(pid)
    if not p:
        raise RoadeError("project.not_found", "Projet introuvable", 404)
    p = dict(p)
    p["dir"] = str(storage.project_dir(pid))
    return p


@app.delete("/api/projects/{pid}")
def delete_project(pid: str):
    storage.delete_project(pid)
    return {"ok": True}


# --------------------------------------------------------------------------- #
# Inventaire (« backpack » — groupes de blocs réutilisables, échelle projet)
# --------------------------------------------------------------------------- #
@app.get("/api/projects/{pid}/backpack")
def list_backpack(pid: str):
    if not storage.get_project(pid):
        raise RoadeError("project.not_found", "Projet introuvable", 404)
    return storage.read_backpack(pid)


@app.post("/api/projects/{pid}/backpack")
def add_backpack(pid: str, payload: BackpackAddBody):
    if not storage.get_project(pid):
        raise RoadeError("project.not_found", "Projet introuvable", 404)
    if not payload.nodes:
        raise RoadeError(
            "backpack.empty_selection", "Sélection vide — au moins un bloc requis", 400
        )
    name = payload.name.strip() or _auto_name_backpack(payload.nodes)
    return storage.add_backpack_item(
        pid, {"name": name, "nodes": payload.nodes, "edges": payload.edges}
    )


@app.patch("/api/projects/{pid}/backpack/{iid}")
def rename_backpack(pid: str, iid: str, payload: BackpackPatchBody):
    updated = storage.update_backpack_item(pid, iid, {"name": payload.name.strip()})
    if not updated:
        raise RoadeError("backpack.not_found", "Item introuvable", 404)
    return updated


@app.delete("/api/projects/{pid}/backpack/{iid}")
def delete_backpack(pid: str, iid: str):
    if not storage.delete_backpack_item(pid, iid):
        raise RoadeError("backpack.not_found", "Item introuvable", 404)
    return {"ok": True}


def _auto_name_backpack(nodes: list[dict[str, Any]]) -> str:
    """Composé à partir des labels (data.label) ou types ; tronqué à 60 car."""
    parts = []
    for n in nodes:
        d = n.get("data") or {}
        parts.append(str(d.get("label") or n.get("type") or "Bloc"))
    name = " + ".join(parts[:3])
    if len(parts) > 3:
        name += f" + {len(parts) - 3}"
    return name[:60] if name else "Sans titre"


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
            raise RoadeError("file.invalid_path", "Chemin de fichier invalide", 400)
    else:
        root = storage.files_dir(pid).resolve()
        path = (root / name).resolve()
        if path.parent != root:
            raise RoadeError("file.invalid_path", "Chemin de fichier invalide", 400)
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
                files.append(
                    {
                        "name": f.name,
                        "size": f.stat().st_size,
                        "origin": "export",
                        "subdir": wf_dir.name,
                    }
                )
    return files


def _safe_upload_name(raw: str | None) -> str:
    """Reject path-traversal at upload time (todo B.2).

    On rejette plutôt qu'on sanitise : si un client envoie `../x.exe`, le
    réduire à `x.exe` silencieusement masque l'attaque (et change le nom de
    fichier perçu par l'utilisateur). Le serveur tournant en local n'est pas
    une excuse — c'est l'un des deux maillons exploitables de l'audit 07 § 8.
    """
    name = (raw or "").strip()
    if not name:
        raise RoadeError("file.invalid_name", "Nom de fichier manquant", 400)
    if any(c in name for c in ("/", "\\", "\0")):
        raise RoadeError("file.invalid_name", "Nom de fichier invalide (séparateur de chemin)", 400)
    if name in (".", "..") or name.startswith("..") or "/.." in name or "\\.." in name:
        raise RoadeError("file.invalid_name", "Nom de fichier invalide (..)", 400)
    return name


@app.post("/api/projects/{pid}/files")
async def upload_file(pid: str, file: UploadFile = File(...)):
    fd = storage.files_dir(pid)
    if not fd.exists():
        raise RoadeError("project.not_found", "Projet introuvable", 404)
    name = _safe_upload_name(file.filename)
    dest = fd / name
    with dest.open("wb") as out:
        while chunk := await file.read(1 << 20):
            out.write(chunk)
    return {"name": name, "size": dest.stat().st_size}


@app.get("/api/projects/{pid}/files/{name}")
def download_file(pid: str, name: str, subdir: str | None = Query(None)):
    path = _resolve_file(pid, name, subdir)
    if not path.exists():
        raise RoadeError("file.not_found", "Fichier introuvable", 404)
    return FileResponse(path, filename=name)


@app.delete("/api/projects/{pid}/files/{name}")
def delete_file(pid: str, name: str, subdir: str | None = Query(None)):
    path = _resolve_file(pid, name, subdir)
    if path.exists():
        path.unlink()
    return {"ok": True}


# Extensions « data » que Roade accepte d'ouvrir avec l'application native (Excel,
# explorateur de texte, etc.). Tout le reste — .exe, .bat, .cmd, .ps1, .lnk, .scr,
# .js, .jar, .vbs… — est refusé, parce que `os.startfile` lance le programme
# associé : ouvrir un .lnk déposé dans le projet, c'est exécuter ce qu'il pointe.
# Cf. audit 07 § 5.5, chaîne d'exécution exploitable (todo B.3).
_OS_OPENABLE = frozenset(
    {".csv", ".tsv", ".txt", ".xlsx", ".xls", ".xlsm", ".parquet", ".json", ".md"}
)


def _open_in_os(path) -> None:
    """Open a file with the OS default application (Excel, etc.). Local use only:
    the backend runs on the same machine as the user."""
    ext = Path(path).suffix.lower()
    if ext and ext not in _OS_OPENABLE:
        raise RoadeError(
            "file.not_openable",
            f"Type de fichier non ouvrable depuis Roade : {ext or '(sans extension)'}",
            400,
        )
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
        raise RoadeError("file.not_found", "Fichier introuvable", 404)
    try:
        _open_in_os(path)
    except RoadeError:
        raise  # nos refus 400 (extensions non whitelistées) doivent remonter intacts
    except Exception as e:  # noqa: BLE001
        raise RoadeError("file.open_failed", f"Impossible d'ouvrir le fichier : {e}", 500)
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
            raise RoadeError("file.invalid_path", "Chemin invalide", 400)
    else:
        fd = storage.files_dir(pid)
    if not fd.exists():
        raise RoadeError("file.not_found", "Dossier introuvable", 404)
    try:
        _open_in_os(fd)
    except RoadeError:
        raise
    except Exception as e:  # noqa: BLE001
        raise RoadeError("file.open_failed", f"Impossible d'ouvrir le dossier : {e}", 500)
    return {"ok": True}


@app.get("/api/projects/{pid}/peek")
def peek(
    pid: str,
    file: str,
    sheet: str | None = None,
    header_row: int = 0,
    encoding: str | None = Query(None),
    decimal: str | None = Query(None),
    thousands: str | None = Query(None),
):
    data = {
        k: v
        for k, v in {
            "encoding": encoding,
            "decimal": decimal,
            "thousands": thousands,
            "header_row": header_row,
        }.items()
        if v not in (None, "")
    }
    try:
        return engine.peek_source(pid, file, sheet, header_row, data)
    except Exception as e:  # noqa: BLE001
        raise RoadeError("source.peek_failed", str(e), 400)


# --------------------------------------------------------------------------- #
# Workflows
# --------------------------------------------------------------------------- #
@app.get("/api/projects/{pid}/workflows")
def list_workflows(pid: str):
    return storage.list_workflows(pid)


@app.post("/api/projects/{pid}/workflows")
def create_workflow(pid: str, payload: CreateWorkflowBody):
    name = (payload.name or "Nouveau workflow").strip()
    return storage.create_workflow(pid, name)


@app.get("/api/projects/{pid}/workflows/{wid}")
def get_workflow(pid: str, wid: str):
    wf = storage.get_workflow(pid, wid)
    if not wf:
        raise RoadeError("workflow.not_found", "Workflow introuvable", 404)
    return wf


@app.put("/api/projects/{pid}/workflows/{wid}")
def save_workflow(pid: str, wid: str, payload: SaveWorkflowBody):
    # On repasse au dict pour la suite : `engine.prune_orphan_edges` et
    # `storage.save_workflow` attendent une forme JSON brute (les data des nodes
    # sont polymorphes selon le type de bloc).
    body = payload.model_dump(exclude_unset=False)
    body["id"] = wid
    # Drop ghost edges (sourceHandle points to an output that no longer exists)
    # before persisting — otherwise a downstream block would still ingest the
    # stale parquet next run. Idempotent: a clean workflow saves unchanged.
    engine.prune_orphan_edges(body)
    return storage.save_workflow(pid, body)


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
        raise RoadeError("run.failed", str(e), 400)


@app.get("/api/projects/{pid}/workflows/{wid}/document")
def document_workflow(pid: str, wid: str):
    """Human-readable Excel documentation of the workflow (one sheet per output
    file, tracing every treatment that leads to it)."""
    wf = storage.get_workflow(pid, wid)
    if not wf:
        raise RoadeError("workflow.not_found", "Workflow introuvable", 404)
    try:
        data = workflow_doc.build_workbook(pid, wid)
    except Exception as e:  # noqa: BLE001 - surfaced to the UI
        raise RoadeError("document.failed", str(e), 400)
    name = (wf.get("name") or "Workflow").strip() or "Workflow"
    fname = f"Documentation - {name}.xlsx"
    ascii_name = fname.encode("ascii", "ignore").decode().strip() or "documentation.xlsx"
    headers = {
        "Content-Disposition": f'attachment; filename="{ascii_name}"; '
        f"filename*=UTF-8''{quote(fname)}"
    }
    return StreamingResponse(
        BytesIO(data),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers=headers,
    )


@app.get("/api/projects/{pid}/workflows/{wid}/runs")
def list_runs(pid: str, wid: str, limit: int = Query(50, ge=1, le=500)):
    """Historique des derniers runs (A.10) — du plus récent au plus ancien."""
    return storage.list_runs(pid, wid, limit=limit)


@app.post("/api/projects/{pid}/workflows/{wid}/cancel")
def cancel_run(pid: str, wid: str):
    """Demande l'annulation du run en cours (E.2). Best-effort : un bloc en
    cours d'exécution n'est PAS interrompu en plein milieu — la boucle
    s'arrête entre 2 blocs pour ne pas laisser de parquet à demi-écrit."""
    engine.request_cancel(pid, wid)
    return {"ok": True}


@app.get("/api/projects/{pid}/workflows/{wid}/run-stream")
def run_stream(
    pid: str,
    wid: str,
    only_node: str | None = Query(None),
    force: bool = Query(False),
    all_exports: bool = Query(False),
    force_nodes: str | None = Query(None),
):
    # Recalcul forcé ciblé (sélection sur le canevas) : liste d'ids séparés par
    # des virgules. L'engine y ajoute l'aval et bypass leur cache.
    forced = [n for n in (force_nodes or "").split(",") if n.strip()] or None

    def gen():
        for ev in engine.iter_run_workflow(
            pid, wid, only_node, force, all_exports, force_nodes=forced
        ):
            yield f"data: {json.dumps(ev, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


# --------------------------------------------------------------------------- #
# Preview & profile
# --------------------------------------------------------------------------- #
@app.get("/api/projects/{pid}/workflows/{wid}/nodes/{nid}/preview")
def preview(
    pid: str,
    wid: str,
    nid: str,
    handle: str = "out",
    limit: int = 200,
    offset: int = 0,
    sort: str | None = None,
    dir: str = "asc",
    q: str | None = None,
    filters: str | None = None,
):
    parsed = []
    if filters:
        try:
            parsed = json.loads(filters)
        except json.JSONDecodeError:
            parsed = []
    try:
        return engine.preview_node(
            pid,
            wid,
            nid,
            handle=handle,
            limit=limit,
            offset=offset,
            sort=sort,
            direction=dir,
            filters=parsed,
            q=q,
        )
    except Exception as e:  # noqa: BLE001
        raise RoadeError("preview.failed", str(e), 400)


@app.get("/api/projects/{pid}/workflows/{wid}/nodes/{nid}/profile")
def profile(pid: str, wid: str, nid: str, column: str, handle: str = "out"):
    try:
        return engine.column_profile(pid, wid, nid, column, handle=handle)
    except Exception as e:  # noqa: BLE001
        raise RoadeError("profile.failed", str(e), 400)


@app.get("/api/projects/{pid}/workflows/{wid}/nodes/{nid}/group")
def keys_group(
    pid: str,
    wid: str,
    nid: str,
    key: str = "",
    q: str | None = None,
    handle: str = "out",
    limit: int = 200,
):
    key_cols = [c for c in key.split(",") if c.strip()]
    try:
        return engine.keys_group(pid, wid, nid, key_cols, q, handle=handle, limit=limit)
    except Exception as e:  # noqa: BLE001
        raise RoadeError("group.failed", str(e), 400)


@app.post("/api/projects/{pid}/workflows/{wid}/nodes/{nid}/route-preview")
def route_preview(pid: str, wid: str, nid: str, payload: FreeJsonBody):
    try:
        return engine.route_preview(pid, wid, nid, payload.model_dump())
    except Exception as e:  # noqa: BLE001
        raise RoadeError("route_preview.failed", str(e), 400)


@app.post("/api/projects/{pid}/workflows/{wid}/nodes/{nid}/split-scan")
def split_scan(pid: str, wid: str, nid: str, payload: FreeJsonBody):
    try:
        return engine.split_scan(pid, wid, nid, payload.model_dump())
    except Exception as e:  # noqa: BLE001
        raise RoadeError("split_scan.failed", str(e), 400)


@app.post("/api/projects/{pid}/workflows/{wid}/nodes/{nid}/filter-preview")
def filter_preview(pid: str, wid: str, nid: str, payload: FreeJsonBody):
    try:
        return engine.filter_preview(pid, wid, nid, payload.model_dump())
    except Exception as e:  # noqa: BLE001
        raise RoadeError("filter_preview.failed", str(e), 400)


@app.post("/api/projects/{pid}/workflows/{wid}/nodes/{nid}/dedup-preview")
def dedup_preview(pid: str, wid: str, nid: str, payload: FreeJsonBody):
    try:
        return engine.dedup_preview(pid, wid, nid, payload.model_dump())
    except Exception as e:  # noqa: BLE001
        raise RoadeError("dedup_preview.failed", str(e), 400)


# --------------------------------------------------------------------------- #
# Validation tester
# --------------------------------------------------------------------------- #
@app.post("/api/validate/test")
def validate_test(payload: ValidateTestBody):
    return engine.validate_test(payload.config, payload.samples)


# --------------------------------------------------------------------------- #
# Frontend buildé (servi par FastAPI en prod — un seul process)
# --------------------------------------------------------------------------- #
# Catch-all monté en dernier : Starlette matche les routes dans l'ordre, donc
# toutes les routes /api/... ci-dessus restent prioritaires.
#
# Le routeur SPA front (C.1) utilise des URLs comme `/p/<pid>/w/<wid>` ; un
# mount StaticFiles renverrait 404 sur ces chemins (aucun fichier sur disque).
# On sert donc index.html pour tout ce qui n'est ni un asset existant, ni une
# route /api. Le path est resolved+contained pour ne pas servir un fichier
# en dehors de dist/ (cohérent avec la philo path-traversal de B.3).
_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if _DIST.exists():
    _DIST_INDEX = _DIST / "index.html"

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa_or_asset(full_path: str):
        # `/api/...` est déjà matchée par les routes ci-dessus ; ce garde-fou
        # évite juste qu'un `/api/inexistant` retombe sur index.html.
        if full_path.startswith("api/"):
            raise HTTPException(404)
        if full_path:
            candidate = (_DIST / full_path).resolve()
            try:
                candidate.relative_to(_DIST.resolve())
                if candidate.is_file():
                    return FileResponse(candidate)
            except ValueError:
                pass  # sortait de dist/ — on fallback à index.html
        return FileResponse(_DIST_INDEX)
