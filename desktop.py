"""Roade en application de bureau — point d'entrée du `.exe` (PyInstaller).

Démarre le serveur FastAPI sur une adresse locale (127.0.0.1) puis ouvre Roade
dans le navigateur par défaut. Tout est local : aucune connexion sortante, aucun
compte. Les projets sont enregistrés dans `Documents/Roade-projets` (à l'écart du
dossier de l'application, donc une mise à jour n'efface jamais les données).

Pour builder :  pyinstaller roade_desktop.spec   (voir docs/DESKTOP.md)
En dev, on peut aussi le lancer tel quel :  python desktop.py
"""

from __future__ import annotations

import os
import shutil
import socket
import sys
import threading
import time
import webbrowser
from pathlib import Path

HOST = "127.0.0.1"


def _documents_dir() -> Path:
    """Le dossier « Documents » de l'utilisateur.

    On passe par l'API Windows (SHGetKnownFolderPath) pour gérer le cas
    fréquent où Documents est redirigé (OneDrive, dossier d'entreprise…).
    Replis successifs si l'appel échoue : ~/Documents, puis ~.
    """
    if sys.platform == "win32":
        try:
            import ctypes
            from ctypes import wintypes

            class _GUID(ctypes.Structure):
                _fields_ = [
                    ("Data1", wintypes.DWORD),
                    ("Data2", wintypes.WORD),
                    ("Data3", wintypes.WORD),
                    ("Data4", ctypes.c_ubyte * 8),
                ]

            # FOLDERID_Documents : {FDD39AD0-238F-46AF-ADB4-6C85480369C7}
            folder_id = _GUID(
                0xFDD39AD0,
                0x238F,
                0x46AF,
                (ctypes.c_ubyte * 8)(0xAD, 0xB4, 0x6C, 0x85, 0x48, 0x03, 0x69, 0xC7),
            )
            out = ctypes.c_wchar_p()
            get_path = ctypes.windll.shell32.SHGetKnownFolderPath
            get_path.argtypes = [
                ctypes.POINTER(_GUID),
                wintypes.DWORD,
                wintypes.HANDLE,
                ctypes.POINTER(ctypes.c_wchar_p),
            ]
            if get_path(ctypes.byref(folder_id), 0, None, ctypes.byref(out)) == 0:
                path = out.value
                ctypes.windll.ole32.CoTaskMemFree(out)
                if path:
                    return Path(path)
        except Exception:
            pass
    docs = Path.home() / "Documents"
    return docs if docs.exists() else Path.home()


def _migrate_legacy_projects(target: Path) -> None:
    """Les versions ≤ 0.5.0 rangeaient les projets à côté de l'exécutable.

    Si on en trouve et que le nouvel emplacement n'existe pas encore, on les
    déplace pour ne pas perdre le travail au moment d'une mise à jour. Best
    effort : à la moindre erreur on n'efface rien et on laisse l'ancien dossier
    en place.
    """
    if target.exists():
        return
    legacy = Path(sys.executable).resolve().parent / "Roade-projets"
    if not legacy.is_dir() or not any(legacy.iterdir()):
        return
    try:
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(legacy), str(target))
    except Exception:
        pass


def _data_dir() -> Path:
    """Où ranger les projets de l'utilisateur.

    Gelé (.exe) : dans « Documents/Roade-projets ». Un emplacement stable, *en
    dehors* du dossier de l'application : mettre à jour Roade (remplacer le
    dossier) n'efface jamais les données. En dev (python desktop.py) : on ne
    touche à rien, le backend garde son `projects/` du repo.
    """
    if getattr(sys, "frozen", False):
        target = _documents_dir() / "Roade-projets"
        _migrate_legacy_projects(target)
        return target
    return Path(__file__).resolve().parent / "projects"


def _free_port() -> int:
    """Un port libre attribué par l'OS (évite les collisions avec un autre
    service déjà sur 8000)."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind((HOST, 0))
        return s.getsockname()[1]


def _wait_then_open(url: str, port: int) -> None:
    """Attend que le serveur réponde, puis ouvre le navigateur — pas de page
    blanche « connexion refusée » si le démarrage prend une seconde."""
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(0.5)
            if s.connect_ex((HOST, port)) == 0:
                break
        time.sleep(0.2)
    webbrowser.open(url)


def _say(msg: str) -> None:
    """Affiche un message sans jamais faire planter le lancement : la console
    Windows est en cp1252 (échoue sur certains caractères) et, dans la version
    sans fenêtre (build final), `sys.stdout` peut être absent."""
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass
    try:
        print(msg)
    except Exception:
        pass


def main() -> None:
    # Build « sans fenêtre » (console=False) : pas de console → sys.stdout/stderr
    # valent None, ce qui ferait planter toute lib qui écrit dessus (uvicorn).
    # On les redirige vers le vide pour que l'app tourne sans console.
    if sys.stdout is None or sys.stderr is None:
        devnull = open(os.devnull, "w")  # noqa: SIM115 - fermé à l'arrêt du process
        sys.stdout = sys.stdout or devnull
        sys.stderr = sys.stderr or devnull

    # Doit être posé AVANT d'importer le backend : storage lit ROADE_PROJECTS_DIR
    # au moment de l'import (il crée le dossier à ce moment-là).
    data_dir = _data_dir()
    if getattr(sys, "frozen", False):
        os.environ.setdefault("ROADE_PROJECTS_DIR", str(data_dir))
    # Le backend importe ses modules à plat (`import engine`, etc.).
    sys.path.insert(0, str(Path(__file__).resolve().parent / "backend"))

    import uvicorn

    from main import app  # noqa: E402  (import tardif : après sys.path/env)

    # Port fixe via ROADE_PORT (pratique pour un favori stable), sinon l'OS en
    # choisit un libre. ROADE_NO_BROWSER désactive l'ouverture auto (tests/CI).
    port = int(os.environ.get("ROADE_PORT") or 0) or _free_port()
    url = f"http://{HOST}:{port}"
    if not os.environ.get("ROADE_NO_BROWSER"):
        threading.Thread(target=_wait_then_open, args=(url, port), daemon=True).start()

    # Message console (cette "fenetre noire" reste ouverte pendant l'usage).
    # ASCII volontaire : la console Windows (cp1252) afficherait mal les accents.
    _say("")
    _say("==============================================================")
    _say("  ROADE est lance.")
    _say(f"  -> Il s'ouvre dans votre navigateur : {url}")
    _say("     (si l'onglet ne s'ouvre pas tout seul, copiez ce lien")
    _say("      dans votre navigateur internet).")
    _say("")
    _say("  NE FERMEZ PAS cette fenetre noire : c'est elle qui fait")
    _say("  tourner Roade. Pour QUITTER Roade, fermez cette fenetre.")
    _say("==============================================================")
    _say("")
    uvicorn.run(app, host=HOST, port=port, log_level="warning")


if __name__ == "__main__":
    main()
