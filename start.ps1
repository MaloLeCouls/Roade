# Lance Roade (backend + frontend) dans deux fenetres PowerShell.
$root = $PSScriptRoot

Write-Host "Demarrage du backend (http://127.0.0.1:8000) ..."
Start-Process powershell -ArgumentList @(
  '-NoExit', '-Command',
  "& '$root\backend\.venv\Scripts\python.exe' -m uvicorn main:app --host 127.0.0.1 --port 8000 --app-dir '$root\backend'"
)

Write-Host "Demarrage du frontend (http://localhost:5173) ..."
Start-Process powershell -ArgumentList @(
  '-NoExit', '-Command',
  "Set-Location '$root\frontend'; npm run dev"
)

Start-Sleep -Seconds 3
Start-Process "http://localhost:5173"
Write-Host "Roade demarre. Ouvrez http://localhost:5173"
