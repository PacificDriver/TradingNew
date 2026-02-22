# Запуск без Docker: backend + frontend локально.
# PostgreSQL: либо один контейнер "docker compose up postgres -d", либо установленный локально (см. SYSTEM_OVERVIEW.md).

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
if (-not $root) { $root = Get-Location }

$dbUrl = $env:DATABASE_URL
if (-not $dbUrl) {
  $dbUrl = "postgresql://mvp_user:mvp_password@localhost:55432/mvp_trading?schema=public"
  Write-Host "DATABASE_URL не задан, используем: $dbUrl (ожидается Postgres на порту 55432, например: docker compose up postgres -d)" -ForegroundColor Yellow
}

# Опционально поднять только Postgres в Docker
if (-not $env:SKIP_POSTGRES_DOCKER) {
  $docker = Get-Command docker -ErrorAction SilentlyContinue
  if ($docker) {
    Write-Host "Проверка Postgres (Docker)…" -ForegroundColor Cyan
    Push-Location $root
    docker compose up postgres -d 2>$null
    Pop-Location
    Start-Sleep -Seconds 2
  }
}

# Backend в новом окне
$backendCmd = "Set-Location '$root\backend'; `$env:DATABASE_URL='$dbUrl'; `$env:PORT='4000'; npm run dev"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCmd

Start-Sleep -Seconds 2

# Frontend в новом окне
$frontendCmd = "Set-Location '$root\frontend'; `$env:NEXT_PUBLIC_API_BASE_URL='https://wetwetwetwetwe.ngrok.app'; `$env:NEXT_PUBLIC_WS_URL='wss://wetwetwetwetwe.ngrok.app'; npm run dev"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontendCmd

Write-Host "Backend and Frontend started. Frontend: http://localhost:3000  Backend: http://localhost:4000" -ForegroundColor Green
