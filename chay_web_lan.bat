@echo off
chcp 65001 >nul
title LH-NaviX - Chay Web Admin LAN (Khong bi Mixed Content)
echo ===================================================================
echo   LH-NaviX: Khoi dong Web Admin che do HTTP LAN
echo   (Tranh hoan toan loi Mixed Content chan ESP32-CAM)
echo ===================================================================
echo.

:: 1. Uu tien dung Python neu co
python --version >nul 2>&1
if %errorlevel% equ 0 (
    echo [*] Tim thay Python. Dang khoi dong Web Server tren cong 8080...
    start "" "http://localhost:8080/admin.html"
    python -m http.server 8080
    goto :eof
)

:: 2. Uu tien dung npx serve neu co
where npx >nul 2>&1
if %errorlevel% equ 0 (
    echo [*] Tim thay Node.js / npx. Dang khoi dong Web Server tren cong 8080...
    start "" "http://localhost:8080/admin.html"
    call npx serve -p 8080 .
    goto :eof
)

:: 3. Dung PowerShell Web Server tich hop san tren Windows (khong can cai them gi)
echo [*] Dang khoi dong PowerShell Web Server tren cong 8080...
start "" "http://localhost:8080/admin.html"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scratch\lan_server.ps1" -Port 8080
pause
