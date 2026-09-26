@echo off
title Lumiere Perfume CRM - Install Auto-Start at Windows Logon
> "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\LumiereCRM-Watchdog.cmd" (
  echo @echo off
  echo cd /d "%~dp0"
  echo call "%~dp0start-crm.bat"
)
echo.
echo Auto-start installed: the server watchdog will start at every Windows logon.
echo (To undo: run scripts\uninstall-autostart.bat)
pause