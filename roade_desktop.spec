# roade_desktop.spec — empaquette Roade en application de bureau autonome.
# Build :  pyinstaller roade_desktop.spec   (depuis la racine du dépôt)
# Sortie :  dist/Roade/Roade.exe  (+ ses dépendances dans le même dossier)
# Cf. docs/DESKTOP.md.
from PyInstaller.utils.hooks import collect_all, collect_submodules

datas = [("frontend/dist", "frontend/dist")]
binaries = []
hiddenimports = [
    # Modules backend, importés « à plat » (cf. desktop.py : sys.path += backend/).
    "main",
    "engine",
    "storage",
    "demo",
    "workflow_doc",
    "errors",
    "formula",
    "query_builder",
    # Pas toujours détectés par l'analyse statique :
    "multipart",
    "python_multipart",
]
hiddenimports += collect_submodules("uvicorn")

# DuckDB et PyArrow embarquent des bibliothèques natives + des fichiers de
# données : collect_all les ramasse intégralement (gros, mais sûr).
for pkg in ("duckdb", "pyarrow"):
    d, b, h = collect_all(pkg)
    datas += d
    binaries += b
    hiddenimports += h

a = Analysis(
    ["desktop.py"],
    pathex=["backend"],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    runtime_hooks=[],
    excludes=["tkinter", "pytest", "ruff"],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="Roade",
    # console=True : une petite fenêtre console reste ouverte pendant l'exécution
    # (« Fermez cette fenêtre pour quitter »). Volontaire : le bootloader « sans
    # fenêtre » (console=False) de PyInstaller est fréquemment supprimé par les
    # antivirus (motif malware courant) — la console est le choix FIABLE pour
    # distribuer le .exe sans qu'il se fasse effacer. Cf. docs/DESKTOP.md.
    console=True,
)
coll = COLLECT(exe, a.binaries, a.datas, name="Roade")
