# Режим разработки: Postgres + Backend в Docker (hot reload), Frontend локально (HMR).
# Запуск: .\dev-local.ps1
# Затем откройте http://localhost:3000

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "Starting Postgres and Backend (dev) in Docker..." -ForegroundColor Cyan
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres backend
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Waiting for Backend to be ready..." -ForegroundColor Cyan
Start-Sleep -Seconds 5

Write-Host "Starting Frontend locally (HMR)..." -ForegroundColor Green
Set-Location frontend
npm run dev
