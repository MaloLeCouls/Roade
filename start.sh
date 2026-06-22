#!/usr/bin/env bash
# Lance Roade (backend + frontend) en développement, sur macOS / Linux.
# Miroir Unix de start.ps1. Prérequis : uv (https://docs.astral.sh/uv/) et Node ≥ 18.
# (Pour un lancement sans Python/Node du tout, voir Docker : `docker compose up`.)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

echo "→ Dépendances Python (uv sync)…"
uv sync

if [ ! -d frontend/node_modules ]; then
  echo "→ Dépendances Node (npm install)…"
  npm install --prefix frontend
fi

# Arrête proprement les deux process quand on quitte (Ctrl+C).
pids=()
cleanup() {
  for p in "${pids[@]:-}"; do kill "$p" 2>/dev/null || true; done
}
trap cleanup EXIT INT TERM

echo "→ Backend  : http://127.0.0.1:8000"
uv run -- python -m uvicorn main:app --host 127.0.0.1 --port 8000 --app-dir backend --reload &
pids+=($!)

echo "→ Frontend : http://localhost:5173"
npm run dev --prefix frontend &
pids+=($!)

# Ouvre le navigateur (best-effort, ne bloque pas si indisponible).
URL="http://localhost:5173"
sleep 3
if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$URL" >/dev/null 2>&1 || true
elif command -v open >/dev/null 2>&1; then
  open "$URL" >/dev/null 2>&1 || true
fi

echo ""
echo "Roade démarré → $URL   (Ctrl+C pour arrêter)"
wait
