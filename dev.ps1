param(
  [string]$Command,
  [switch]$SkipDocker,
  [switch]$SkipApi,
  [switch]$SkipWeb,
  [switch]$SkipWorker
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

function Write-Step {
  param([string]$Message)
  Write-Host "[dev] $Message" -ForegroundColor Cyan
}

function Import-EnvFile {
  param([string]$Path)

  if (-not (Test-Path $Path)) {
    return
  }

  Get-Content $Path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) {
      return
    }

    $parts = $line -split "=", 2
    if ($parts.Count -ne 2) {
      return
    }

    $name = $parts[0].Trim()
    $value = $parts[1].Trim()
    if (-not $name) {
      return
    }

    [Environment]::SetEnvironmentVariable($name, $value, "Process")
  }
}

function Import-OptionalEnvFiles {
  param([string[]]$Paths)

  foreach ($path in $Paths) {
    Import-EnvFile -Path $path
  }
}

function Set-DefaultEnv {
  param(
    [string]$Name,
    [string]$Value
  )

  if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($Name, "Process"))) {
    [Environment]::SetEnvironmentVariable($Name, $Value, "Process")
  }
}

function Wait-ForContainerHealth {
  param(
    [string]$ContainerName,
    [int]$TimeoutSeconds = 60
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    $status = docker inspect --format "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}" $ContainerName 2>$null
    if ($LASTEXITCODE -eq 0 -and ($status -eq "healthy" -or $status -eq "running")) {
      return
    }

    Start-Sleep -Seconds 2
  }

  throw "Timed out waiting for container '$ContainerName'."
}

function Test-DockerAvailable {
  docker info 2>&1 | Out-Null
  return $LASTEXITCODE -eq 0
}

function Test-DrizzleMigrationsPresent {
  param([string]$ApiDir)

  $journalPath = Join-Path $ApiDir "drizzle/meta/_journal.json"
  return Test-Path $journalPath
}

function Get-PostgresScalar {
  param(
    [string]$Sql
  )

  $result = docker exec echolore-db psql -U wiki -d wiki -t -A -c $Sql 2>$null
  if ($LASTEXITCODE -ne 0) {
    return $null
  }

  return ($result | Out-String).Trim()
}

function Test-DrizzleHistoryApplied {
  $historyTable = Get-PostgresScalar -Sql "select to_regclass('public.__drizzle_migrations');"
  return -not [string]::IsNullOrWhiteSpace($historyTable)
}

function Test-PublicTablesPresent {
  $tableCount = Get-PostgresScalar -Sql "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';"
  if ([string]::IsNullOrWhiteSpace($tableCount)) {
    return $false
  }

  return [int]$tableCount -gt 0
}

function Sync-EnvFile {
  param(
    [string]$ExamplePath,
    [string]$TargetPath
  )

  if (-not (Test-Path $ExamplePath)) { return }

  # Collect existing keys from the target .env (if it exists)
  $existingKeys = @{}
  if (Test-Path $TargetPath) {
    Get-Content $TargetPath | ForEach-Object {
      $line = $_.Trim()
      if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
        $key = ($line -split "=", 2)[0].Trim()
        if ($key) { $existingKeys[$key] = $true }
      }
    }
  }

  # Read example and find missing keys
  $missing = @()
  $currentComment = @()
  Get-Content $ExamplePath | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) {
      $currentComment += $_
      return
    }
    if ($line.Contains("=")) {
      $key = ($line -split "=", 2)[0].Trim()
      if ($key -and -not $existingKeys.ContainsKey($key)) {
        $missing += $currentComment
        $missing += $_
      }
    }
    $currentComment = @()
  }

  if ($missing.Count -eq 0) { return }

  # Create or append
  if (-not (Test-Path $TargetPath)) {
    [System.IO.File]::WriteAllLines($TargetPath, $missing, [System.Text.UTF8Encoding]::new($false))
    Write-Step "Created $TargetPath with default values from $(Split-Path -Leaf $ExamplePath)"
  } else {
    $toAppend = ("", "# --- Added from $(Split-Path -Leaf $ExamplePath) ---") + $missing
    [System.IO.File]::AppendAllLines($TargetPath, [string[]]$toAppend, [System.Text.UTF8Encoding]::new($false))
    $keyNames = ($missing | Where-Object { $_ -and -not $_.TrimStart().StartsWith("#") -and $_.Contains("=") } |
      ForEach-Object { ($_ -split "=", 2)[0].Trim() }) -join ", "
    Write-Step "Appended missing keys to $($TargetPath): $keyNames"
  }
}

function Sync-AllEnvFiles {
  $pairs = @(
    @{ Example = ".env.example";                Target = ".env" },
    @{ Example = "apps/api/.env.example";       Target = "apps/api/.env" },
    @{ Example = "apps/web/.env.local.example"; Target = "apps/web/.env.local" },
    @{ Example = "apps/worker/.env.example";    Target = "apps/worker/.env" }
  )

  foreach ($pair in $pairs) {
    Sync-EnvFile `
      -ExamplePath (Join-Path $repoRoot $pair.Example) `
      -TargetPath  (Join-Path $repoRoot $pair.Target)
  }
}

Import-OptionalEnvFiles -Paths @(
  (Join-Path $repoRoot ".env")
)

Set-DefaultEnv -Name "DB_PASSWORD" -Value "wiki_password"
Set-DefaultEnv -Name "WEB_PORT" -Value "17760"
Set-DefaultEnv -Name "API_PORT" -Value "17721"
Set-DefaultEnv -Name "LIVEKIT_PORT" -Value "17722"
Set-DefaultEnv -Name "LIVEKIT_SIGNAL_PORT" -Value "17723"
Set-DefaultEnv -Name "DB_PORT" -Value "17724"
Set-DefaultEnv -Name "VALKEY_PORT" -Value "17725"
Set-DefaultEnv -Name "LIVEKIT_RTC_PORT_RANGE" -Value "17730-17750"
Set-DefaultEnv -Name "AUTH_SECRET" -Value "local-dev-auth-secret"
Set-DefaultEnv -Name "GOOGLE_CLIENT_ID" -Value "local-dev-client-id"
Set-DefaultEnv -Name "GOOGLE_CLIENT_SECRET" -Value "local-dev-client-secret"
Set-DefaultEnv -Name "FILE_STORAGE_PATH" -Value "$repoRoot/data/files"

# ---------------------------------------------------------------------------
# Port conflict check
# ---------------------------------------------------------------------------

function Test-PortAvailable {
  param([int]$Port)
  $listener = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue |
    Where-Object { $_.State -eq "Listen" }
  return -not $listener
}

function Assert-PortsFree {
  $portVars = @(
    @{ Name = "WEB_PORT";            Label = "Web" },
    @{ Name = "API_PORT";            Label = "API" },
    @{ Name = "LIVEKIT_PORT";        Label = "LiveKit" },
    @{ Name = "LIVEKIT_SIGNAL_PORT"; Label = "LiveKit Signal" },
    @{ Name = "DB_PORT";             Label = "PostgreSQL" },
    @{ Name = "VALKEY_PORT";         Label = "Valkey" }
  )

  $dockerConflicts  = @()
  $wslConflicts     = @()
  $otherConflicts   = @()

  foreach ($pv in $portVars) {
    $port = [int][Environment]::GetEnvironmentVariable($pv.Name, "Process")
    if (-not (Test-PortAvailable -Port $port)) {
      $proc = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue |
        Where-Object { $_.State -eq "Listen" } | Select-Object -First 1
      $ownerPid  = $proc.OwningProcess
      $procName  = (Get-Process -Id $ownerPid -ErrorAction SilentlyContinue).ProcessName
      $entry     = @{ Label = $pv.Label; Port = $port; Pid = $ownerPid; ProcName = $procName }
      if ($procName -like "com.docker*") {
        $dockerConflicts += $entry
      } elseif ($procName -eq "wslrelay") {
        $wslConflicts += $entry
      } else {
        $otherConflicts += $entry
      }
    }
  }

  # Ports held by com.docker.backend mean containers are already running — not a conflict.
  if ($dockerConflicts.Count -gt 0) {
    Write-Host ""
    Write-Host "Docker containers appear to be already running:" -ForegroundColor Green
    $dockerConflicts | ForEach-Object {
      Write-Host "  $($_.Label) port $($_.Port) (Docker)" -ForegroundColor DarkGreen
    }
  }

  # Ports held by wslrelay are forwarded from WSL2 — not a conflict.
  if ($wslConflicts.Count -gt 0) {
    Write-Host ""
    Write-Host "WSL2 services detected (via wslrelay):" -ForegroundColor Green
    $wslConflicts | ForEach-Object {
      Write-Host "  $($_.Label) port $($_.Port) (WSL2)" -ForegroundColor DarkGreen
    }
  }

  if ($otherConflicts.Count -gt 0) {
    Write-Host ""
    Write-Host "Port conflicts detected:" -ForegroundColor Red
    $otherConflicts | ForEach-Object {
      Write-Host "  $($_.Label) port $($_.Port) is in use by $($_.ProcName) (PID $($_.Pid))" -ForegroundColor Yellow
    }
    Write-Host ""
    Write-Host "  k) Kill conflicting processes and continue" -ForegroundColor Cyan
    Write-Host "  q) Quit" -ForegroundColor Cyan
    Write-Host ""
    $answer = Read-Host "Select action"

    if ($answer.Trim().ToLower() -in "k", "kill") {
      foreach ($entry in $otherConflicts) {
        Write-Step "Stopping $($entry.ProcName) (PID $($entry.Pid)) on port $($entry.Port)"
        Stop-Process -Id $entry.Pid -Force -ErrorAction SilentlyContinue
      }
      Write-Step "Conflicting processes stopped"
    } else {
      throw "Aborted by user."
    }
  }

  Write-Step "All ports available"
}

# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

function Invoke-InstallDependencies {
  Write-Step "Installing workspace dependencies"
  Push-Location $repoRoot
  try {
    pnpm install
    if ($LASTEXITCODE -ne 0) {
      throw "Failed to install dependencies."
    }
  } finally {
    Pop-Location
  }
}

function Invoke-EnsureDocker {
  if (-not (Test-DockerAvailable)) {
    throw "Docker daemon is not available. Start Docker Desktop first."
  }

  Write-Step "Starting middleware containers (db, valkey, livekit, livekit-egress)"
  Push-Location $repoRoot
  try {
    docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --remove-orphans db valkey livekit livekit-egress
    if ($LASTEXITCODE -ne 0) {
      throw "Failed to start middleware containers. If a previous Redis container is still present, run 'docker compose down --remove-orphans' once and try again."
    }
  } finally {
    Pop-Location
  }

  Write-Step "Waiting for PostgreSQL health"
  Wait-ForContainerHealth -ContainerName "echolore-db"
}

function Invoke-ApplySchema {
  $apiDir = Join-Path $repoRoot "apps/api"
  $dbSetupCommand = "pnpm db:migrate"
  if (-not (Test-DrizzleMigrationsPresent -ApiDir $apiDir)) {
    $dbSetupCommand = "pnpm db:push"
  } elseif (-not (Test-DrizzleHistoryApplied) -and (Test-PublicTablesPresent)) {
    Write-Step "Detected an existing local schema without Drizzle migration history; using pnpm db:push to reconcile"
    $dbSetupCommand = "pnpm db:push"
  }

  Write-Step "Applying database schema with $dbSetupCommand"
  Push-Location $repoRoot
  try {
    if ($dbSetupCommand -eq "pnpm db:migrate") {
      pnpm db:migrate
    } else {
      pnpm --filter @echolore/api exec drizzle-kit push --force
    }
    if ($LASTEXITCODE -ne 0) {
      throw "Failed to apply database schema."
    }
  } finally {
    Pop-Location
  }
}

# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------

function Invoke-Start {
  Sync-AllEnvFiles
  Assert-PortsFree
  Invoke-InstallDependencies

  if (-not $SkipDocker) {
    Invoke-EnsureDocker
    Invoke-ApplySchema
  }

  $devFilters = @()

  if (-not $SkipApi) {
    $devFilters += "--filter=@echolore/api"
  }

  if (-not $SkipWeb) {
    $devFilters += "--filter=@echolore/web"
  }

  if (-not $SkipWorker) {
    $devFilters += "--filter=@echolore/worker"
  }

  if ($devFilters.Count -eq 0) {
    Write-Host ""
    Write-Host "Daily dev environment started." -ForegroundColor Green
    Write-Host ("Web: http://localhost:" + [Environment]::GetEnvironmentVariable("WEB_PORT", "Process"))
    Write-Host ("API: http://localhost:" + [Environment]::GetEnvironmentVariable("API_PORT", "Process"))
    Write-Host ("LiveKit: http://localhost:" + [Environment]::GetEnvironmentVariable("LIVEKIT_PORT", "Process"))
    Write-Host ("PostgreSQL: localhost:" + [Environment]::GetEnvironmentVariable("DB_PORT", "Process"))
    Write-Host ""
    Write-Host "Stop middleware with: docker compose stop db valkey livekit livekit-egress"
    return
  }

  Write-Host ""
  Write-Host "Middleware ready. Starting app dev processes with Turborepo..." -ForegroundColor Green
  Write-Host "Stop middleware later with: docker compose stop db valkey livekit livekit-egress"
  Write-Host ("Web: http://localhost:" + [Environment]::GetEnvironmentVariable("WEB_PORT", "Process"))
  Write-Host ("API: http://localhost:" + [Environment]::GetEnvironmentVariable("API_PORT", "Process"))
  Write-Host ""

  Push-Location $repoRoot
  try {
    & pnpm turbo run dev @devFilters
    exit $LASTEXITCODE
  } finally {
    Pop-Location
  }
}

function Invoke-DbReset {
  Invoke-EnsureDocker

  Write-Step "Dropping all tables in public schema"
  $dropSql = @"
DO `$`$ DECLARE r RECORD;
BEGIN
  FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
    EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
  END LOOP;
END `$`$;
"@
  docker exec echolore-db psql -U wiki -d wiki -c $dropSql
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to drop tables."
  }
  Write-Step "All tables dropped"

  Invoke-InstallDependencies
  Invoke-ApplySchema

  Write-Host ""
  Write-Host "Database has been reset successfully." -ForegroundColor Green
}

# ---------------------------------------------------------------------------
# Interactive menu / CLI dispatch
# ---------------------------------------------------------------------------

function Show-Menu {
  Write-Host ""
  Write-Host "=== echolore dev tools ===" -ForegroundColor Cyan
  Write-Host "  1) start      - Start dev environment"
  Write-Host "  2) db:reset   - Drop all tables and re-apply schema"
  Write-Host "  q) quit"
  Write-Host ""
}

if ($Command) {
  switch ($Command.ToLower()) {
    { $_ -in "start", "1" } { Invoke-Start; return }
    { $_ -in "db:reset", "2" } { Invoke-DbReset; return }
    default { throw "Unknown command: $Command. Available: start, db:reset" }
  }
}

Show-Menu
$choice = Read-Host "Select command"

switch ($choice.Trim().ToLower()) {
  { $_ -in "1", "start" }    { Invoke-Start }
  { $_ -in "2", "db:reset" } { Invoke-DbReset }
  { $_ -in "q", "quit" }     { Write-Host "Bye."; return }
  default { throw "Unknown selection: $choice" }
}
