@echo off
title Lumiere Perfume CRM - Remove Auto-Start
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\LumiereCRM-Watchdog.cmd" >NUL 2>&1
echo.
echo Auto-start removed. The server no longer starts automatically at logon.
pause