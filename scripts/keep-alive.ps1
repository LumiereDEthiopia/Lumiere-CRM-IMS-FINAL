# ============================================================================
# Lumiere Perfume CRM - Keep-Alive Watchdog
# ----------------------------------------------------------------------------
# Ensures the API server (port 3001) and the web client (port 5173) are always
# running on THIS PC.  It polls both services every few seconds and restarts
# any that crash.  Intended to be started at Windows logon (see
# install-autostart.bat) or by double-clicking start-crm.bat.
#
# Usage:
#   powershell -File keep-alive.ps1        -> run forever (watchdog mode)
#   powershell -File keep-alive.ps1 --once -> run a single health check, then exit
# ============================================================================
$ErrorActionPreference = "SilentlyContinue"
$ProgressPreference     = "SilentlyContinue"   # silence Invoke-WebRequest progress noise

# ---------------------------------------------------------------- config ----
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir   = Split-Path -Parent $scriptDir
$serverDir = Join-Path $rootDir "server"
$clientDir = Join-Path $rootDir "client"
$logDir    = Join-Path $rootDir "logs"

$lockFile  = Join-Path $env:TEMP "lumiere-crm-keepalive.pid"
$keepLog   = Join-Path $logDir "keepalive.log"
$serverOut = Join-Path $logDir "server.out.log"
$serverErr = Join-Path $logDir "server.err.log"
$clientOut = Join-Path $logDir "client.out.log"
$clientErr = Join-Path $logDir "client.err.log"

$API_URL     = "http://localhost:3001/api/health"
$CLIENT_URL  = "http://localhost:5173/"
$PORT_API    = 3001
$PORT_CLIENT = 5173
$LOOP_SECS   = 10          # seconds between health checks (1 tick)
$GRACE_TICKS = 3           # ticks to wait after (re)starting before judging again

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

# ------------------------------------------------------------- logging -----
function Log($msg) {
  $line = "[" + (Get-Date -Format "yyyy-MM-dd HH:mm:ss") + "] " + $msg
  Write-Host $line
  Add-Content -Path $keepLog -Value $line
}

# ----------------------------------------------- resolve Node.js runtime ----
function Resolve-NodeExe {
  $c = Get-Command "node" -ErrorAction SilentlyContinue
  if ($c -ne $null -and (Test-Path $c.Path)) { return $c.Path }
  foreach ($p in @(
      "C:\Program Files\nodejs\node.exe",
      "C:\Program Files (x86)\nodejs\node.exe",
      "$env:ProgramFiles\nodejs\node.exe",
      "$env:LOCALAPPDATA\Programs\nodejs\node.exe")) {
    if (Test-Path $p) { return $p }
  }
  return $null
}

# --------------------------------------------- single-instance lock ---------
function Acquire-Lock {
  if (Test-Path $lockFile) {
    $oldPid = (Get-Content -Raw $lockFile | Out-String).Trim()
    if ($oldPid -match "^\d+$") {
      if (Get-Process -Id ([int]$oldPid) -ErrorAction SilentlyContinue) {
        Write-Host "Watchdog is already running (PID $oldPid). Exiting."
        exit 0
      }
    }
  }
  Set-Content -Path $lockFile -Value ("" + $PID) -NoNewline
}

# ---------------------------------------------------- process helpers -------
function Get-PidsOnPort($port) {
  $pids = @()
  $raw = netstat -ano -p tcp 2>$null
  foreach ($line in $raw) {
    $t = "" + $line
    if ($t -match "^\s*TCP\s+") {
      $parts = $t -split "\s+"
      if ($parts.Length -ge 5) {
        $local  = $parts[1]
        $state  = $parts[3]
        $procId = $parts[4]
        if ($state -eq "LISTENING" -and $local.EndsWith(":" + $port) -and $procId -match "^\d+$") {
          if ($pids -notcontains $procId) { $pids += $procId }
        }
      }
    }
  }
  # emit a FLAT list to the pipeline; callers must wrap with @(...)
  Write-Output $pids
}

function Kill-Pids($pids, $label) {
  foreach ($procId in $pids) {
    if ($procId -match "^\d+$" -and (Get-Process -Id ([int]$procId) -ErrorAction SilentlyContinue)) {
      Log "Killing stale $label process (PID $procId)"
      cmd /c "taskkill /F /T /PID $procId" >NUL 2>&1
    }
  }
}

function Test-Url($url) {
  try {
    $r = Invoke-WebRequest -Uri $url -Method Get -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
    return ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500)
  } catch {
    return $false
  }
}

function Start-Managed($name, $port, $workDir, $scriptRel, $outLog, $errLog) {
  try {
    Start-Process -FilePath $global:NodeExe -ArgumentList @($scriptRel) `
        -WorkingDirectory $workDir -WindowStyle Hidden `
        -RedirectStandardOutput $outLog -RedirectStandardError $errLog `
        -ErrorAction Stop
    # wait up to ~10s for the service to bind its port, then report the PID(s)
    $holders = @()
    for ($i = 0; $i -lt 10; $i++) {
      $holders = @(Get-PidsOnPort $port)
      if ($holders.Count -gt 0) { break }
      Start-Sleep -Seconds 1
    }
    if ($holders.Count -gt 0) {
      Log "Started $name (PID $($holders -join ', '))"
    } else {
      Log "Started $name (port not yet bound, will confirm on next check)"
    }
    return $holders
  } catch {
    Log "ERROR: failed to start $name -> $_"
    return $null
  }
}

# ------------------------------------------------- service supervision -------
# $svc = @{ name = @{ pending; pendingTick; up } }
function Check-Service($name, $port, $url, $scriptRel, $workDir, $outLog, $errLog, $svc) {
  $ok  = Test-Url $url
  $st  = $svc[$name]

  if ($ok) {
    if (-not $st.up) {
      Log "$name is UP ($url)"
      $st.up = $true
    }
    $st.pending = $false
    return
  }

  # service is DOWN
  if ($st.up) { Log "$name went DOWN - restarting" }
  $st.up = $false

  if ($st.pending) {
    if ($tick -ge ($st.pendingTick + $GRACE_TICKS)) {
      Log "$name did not come up within the grace period - hard restart"
      Kill-Pids @(Get-PidsOnPort $port) $name
      Start-Sleep -Seconds 2
      $st.pendingTick = $tick
      Start-Managed $name $port $workDir $scriptRel $outLog $errLog
    }
    return
  }

  $st.pending = $true
  $st.pendingTick = $tick
  Kill-Pids @(Get-PidsOnPort $port) $name
  Start-Sleep -Seconds 2
  Start-Managed $name $port $workDir $scriptRel $outLog $errLog
}

# ---------------------------------------------------------------- main ------
$once = ($args -contains "--once")

Acquire-Lock
$global:NodeExe = Resolve-NodeExe
if ($null -eq $global:NodeExe) {
  Log "ERROR: node.exe not found. Install Node.js (https://nodejs.org) and try again."
  exit 1
}
Log "Using Node: $global:NodeExe"
Log "Project root: $rootDir"

$svc = @{
  server = @{ pending = $false; pendingTick = 0; up = $false }
  client = @{ pending = $false; pendingTick = 0; up = $false }
}
$tick = 0

try {
  while ($true) {
    $tick++

    try {
      Check-Service "server" $PORT_API    $API_URL    "src/app.js"                    $serverDir $serverOut $serverErr $svc
      Check-Service "client" $PORT_CLIENT $CLIENT_URL "node_modules/vite/bin/vite.js" $clientDir $clientOut $clientErr $svc

      if (($tick % 6) -eq 0) {
        Log "heartbeat: server=$($svc.server.up) client=$($svc.client.up)"
      }
    } catch {
      Log "Watchdog iteration error (continuing): $_"
    }
    if ($once) { break }
    Start-Sleep -Seconds $LOOP_SECS
  }

  if ($once) {
    Log "One-shot check complete: server=$($svc.server.up) client=$($svc.client.up)"
  }
} finally {
  Remove-Item -Force $lockFile -ErrorAction SilentlyContinue
}