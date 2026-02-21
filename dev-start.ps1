# Запуск в режиме разработки: Postgres + Backend (+ опционально Frontend)
# Требуется: Docker Desktop запущен (для Postgres)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

Write-Host "=== Режим разработки ===" -ForegroundColor Cyan

# 1. Postgres
Write-Host "`n1. Postgres (Docker)..." -ForegroundColor Yellow
try {
    Set-Location $root
    docker compose up -d postgres 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Docker failed" }
    Write-Host "   Postgres запущен (localhost:55432)" -ForegroundColor Green
    Start-Sleep -Seconds 3
} catch {
    Write-Host "   Ошибка: Docker не запущен или недоступен." -ForegroundColor Red
    Write-Host "   Запустите Docker Desktop и снова выполните этот скрипт." -ForegroundColor Red
    exit 1
}

# 2. Backend
Write-Host "`n2. Backend (порт 4000)..." -ForegroundColor Yellow
$backendJob = Start-Job -ScriptBlock {
    Set-Location $using:root\backend
    npm run dev 2>&1
}
Start-Sleep -Seconds 8
$state = (Get-Job $backendJob).State
if ($state -eq "Running") {
    Write-Host "   Backend запускается (ждём вывода)..." -ForegroundColor Green
} else {
    Receive-Job $backendJob
    Write-Host "   Backend мог не стартовать. Запустите вручную: cd backend && npm run dev" -ForegroundColor Yellow
}

Write-Host "`n--- Готово ---" -ForegroundColor Cyan
Write-Host "Frontend: в отдельном терминале выполните:  cd frontend && npm run dev" -ForegroundColor White
Write-Host "Сайт:     http://localhost:3000" -ForegroundColor White
Write-Host "API:      http://localhost:4000" -ForegroundColor White
Write-Host "`nЧтобы остановить backend:  Stop-Job $backendJob; Remove-Job $backendJob" -ForegroundColor Gray
