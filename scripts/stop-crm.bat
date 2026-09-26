@echo off
title Lumiere Perfume CRM - Stop All
if exist "%TEMP%\lumiere-crm-keepalive.pid" (
  set /p STOPPID=<"%TEMP%\lumiere-crm-keepalive.pid"
  if not "%STOPPID%"=="" taskkill /F /PID %STOPPID% >NUL 2>&1
)
powershell -NoProfile -ExecutionPolicy Bypass -Command "& { $ports = @(3001,5173); foreach ($port in $ports) { foreach ($line in (netstat -ano -p tcp)) { $t = [string]$line; if ($t -match '^\s*TCP') { $p = $t -split '\s+'; if ($p.Length -ge 5 -and $p[3] -eq 'LISTENING' -and $p[1].EndsWith(':' + $port)) { taskkill /F /T /PID $p[4] | Out-Null } } } }; Write-Host 'Stopped.' }"
echo.
echo The API server and the client have been stopped.
echo The keep-alive watchdog will restart them again (if it is still running).
pause