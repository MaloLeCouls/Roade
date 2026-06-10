@echo off
REM Lance Roade (backend + frontend) dans deux fenetres separees.
setlocal
set "ROOT=%~dp0"

echo Demarrage du backend (http://127.0.0.1:8000) ...
start "Roade backend" cmd /k ""%ROOT%backend\.venv\Scripts\python.exe" -m uvicorn main:app --host 127.0.0.1 --port 8000 --app-dir "%ROOT%backend" --reload"

echo Demarrage du frontend (http://localhost:5173) ...
start "Roade frontend" cmd /k "cd /d "%ROOT%frontend" && npm run dev"

timeout /t 3 /nobreak >nul
start "" "http://localhost:5173"
echo Roade demarre. Ouvrez http://localhost:5173
endlocal
