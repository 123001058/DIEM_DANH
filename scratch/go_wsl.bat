@echo off
:: Tu dong yeu cau quyen Administrator neu chua co
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Yeu cau quyen Administrator de tat WSL...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

title DANG GO WSL - WINDOWS SUBSYSTEM FOR LINUX
cls
echo ===================================================
echo     DANG TIEN HANH GO BO VA TAT WSL HOAN TOAN
echo ===================================================
echo.

echo [1/3] Go bo ung dung WSL (neu co)...
wsl --uninstall

echo.
echo [2/3] Tat tinh nang Windows Subsystem for Linux...
powershell -Command "Disable-WindowsOptionalFeature -Online -FeatureName Microsoft-Windows-Subsystem-Linux -NoRestart"

echo.
echo [3/3] Tat tinh nang Virtual Machine Platform (tuy chon)...
powershell -Command "Disable-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform -NoRestart"

echo.
echo ===================================================
echo   HOAN TAT! WSL da duoc go bo va tat hoan toan.
echo   Ban co the khoi dong lai may de hoan tat 100%%.
echo ===================================================
echo.
pause
