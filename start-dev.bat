@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo [1/3] Postgres...
docker compose up -d postgres
if errorlevel 1 (
    echo Ошибка Docker. Запустите Docker Desktop и повторите.
    pause
    exit /b 1
)
echo Ждём запуска БД...
timeout /t 5 /nobreak >nul

echo [2/3] Backend (port 4000)...
start "Backend" cmd /k "cd /d %~dp0backend && npm run dev"

echo [3/3] Frontend (port 3000)...
timeout /t 3 /nobreak >nul
start "Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo Готово. Откройте http://localhost:3000
echo Окна Backend и Frontend можно не закрывать.
pause
