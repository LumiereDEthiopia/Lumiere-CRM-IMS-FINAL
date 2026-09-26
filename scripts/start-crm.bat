@echo off
title Lumiere Perfume CRM - Watchdog (Keep Alive)
cd /d "%~dp0"
"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -NoExit -File "%~dp0scripts\keep-alive.ps1"
echo.
echo Watchdog stopped (or already closed). Press any key to close this window.
pause >NUL