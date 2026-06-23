# syntax=docker/dockerfile:1
# Image de production Roade : un seul process FastAPI qui sert l'API ET le
# frontend buildé sur le port 8000 (mode prod « un seul process », cf. todo 0.8).

# ── Étape 1 : build du frontend (Vite) ──────────────────────────────────────
FROM node:20-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ── Étape 2 : runtime Python (sert l'API + le dist du front) ────────────────
FROM python:3.12-slim
# uv pour installer les dépendances verrouillées (uv.lock).
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/
WORKDIR /app
ENV UV_LINK_MODE=copy
COPY pyproject.toml uv.lock ./
# Pas de --frozen : l'image tourne sur Python 3.12 (le lock a pu être généré sur
# une autre version) ; uv résout alors les bonnes roues depuis le lock universel.
RUN uv sync --no-dev
COPY backend/ ./backend/
COPY --from=frontend /app/frontend/dist ./frontend/dist
EXPOSE 8000
# main.py sert frontend/dist (résolu via __file__/../../frontend/dist) si présent.
# Bind sur $PORT si l'hébergeur en fournit un (Railway/Render…), sinon 8000
# (docker compose local). `exec` → uvicorn devient PID 1 et reçoit SIGTERM,
# donc l'arrêt du conteneur reste propre malgré la forme shell.
CMD ["sh", "-c", "exec .venv/bin/python -m uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --app-dir backend"]
