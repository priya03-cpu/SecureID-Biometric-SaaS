# Starts the face service, the backend and the frontend, each in its own window.
# Run from the project root:
#   powershell -ExecutionPolicy Bypass -File .\start.ps1
$root = $PSScriptRoot
$py = Join-Path $root "face-service\venv\Scripts\python.exe"

if (-not (Test-Path $py)) {
  Write-Host "Face service venv not found. Follow face-service\README.md first." -ForegroundColor Red
  exit 1
}

Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\face-service'; & '$py' -m uvicorn main:app --host 127.0.0.1 --port 8001"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\server'; node server.js"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root'; npm run dev"

Write-Host "Started 3 windows. Wait for 'Ready.' in the face service window, then open http://localhost:5173"
