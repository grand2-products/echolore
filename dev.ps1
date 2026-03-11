param(
  [switch]$SkipDocker,
  [switch]$SkipApi,
  [switch]$SkipWeb
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
  docker info *> $null
  return $LASTEXITCODE -eq 0
}

Import-EnvFile -Path (Join-Path $repoRoot ".env")

Set-DefaultEnv -Name "DB_PASSWORD" -Value "wiki_password"
Set-DefaultEnv -Name "WEB_PORT" -Value "17720"
Set-DefaultEnv -Name "API_PORT" -Value "17721"
Set-DefaultEnv -Name "LIVEKIT_PORT" -Value "17722"
Set-DefaultEnv -Name "LIVEKIT_SIGNAL_PORT" -Value "17723"
Set-DefaultEnv -Name "DB_PORT" -Value "17724"
Set-DefaultEnv -Name "VALKEY_PORT" -Value "17725"
Set-DefaultEnv -Name "OAUTH_PROXY_PORT" -Value "17726"
Set-DefaultEnv -Name "LIVEKIT_RTC_PORT_RANGE" -Value "17730-17930"
Set-DefaultEnv -Name "PORT" -Value ([Environment]::GetEnvironmentVariable("API_PORT", "Process"))
Set-DefaultEnv -Name "NEXT_PUBLIC_API_URL" -Value ("http://localhost:" + [Environment]::GetEnvironmentVariable("API_PORT", "Process"))
Set-DefaultEnv -Name "NEXT_PUBLIC_LIVEKIT_URL" -Value ("ws://localhost:" + [Environment]::GetEnvironmentVariable("LIVEKIT_PORT", "Process"))
Set-DefaultEnv -Name "LIVEKIT_HOST" -Value ("http://localhost:" + [Environment]::GetEnvironmentVariable("LIVEKIT_PORT", "Process"))
  Set-DefaultEnv -Name "LIVEKIT_API_KEY" -Value "devkey"
  Set-DefaultEnv -Name "LIVEKIT_API_SECRET" -Value "secret"
Set-DefaultEnv -Name "CORS_ORIGIN" -Value ("http://localhost:" + [Environment]::GetEnvironmentVariable("WEB_PORT", "Process"))
Set-DefaultEnv -Name "DATABASE_URL" -Value ("postgresql://wiki:wiki_password@localhost:" + [Environment]::GetEnvironmentVariable("DB_PORT", "Process") + "/wiki")
Set-DefaultEnv -Name "AUTH_BYPASS" -Value "true"
Set-DefaultEnv -Name "NODE_ENV" -Value "development"
Set-DefaultEnv -Name "API_NODE_ENV" -Value "development"
Set-DefaultEnv -Name "WEB_NODE_ENV" -Value "development"
Set-DefaultEnv -Name "COOKIE_SECRET" -Value "local-dev-cookie-secret"
Set-DefaultEnv -Name "GOOGLE_CLIENT_ID" -Value "local-dev-client-id"
Set-DefaultEnv -Name "GOOGLE_CLIENT_SECRET" -Value "local-dev-client-secret"
Set-DefaultEnv -Name "APP_TITLE" -Value "corp-internal"
Set-DefaultEnv -Name "NEXT_PUBLIC_APP_TITLE" -Value ([Environment]::GetEnvironmentVariable("APP_TITLE", "Process"))
Set-DefaultEnv -Name "NEXT_PUBLIC_APP_TAGLINE" -Value "Internal collaboration platform"

if (-not $SkipDocker) {
  if (-not (Test-DockerAvailable)) {
    throw "Docker daemon is not available. Start Docker Desktop first, then run ./dev.ps1 again. If you want to start only the app processes, run ./dev.ps1 -SkipDocker."
  }

  Write-Step "Starting middleware containers (db, valkey, livekit)"
  Push-Location $repoRoot
  try {
    docker compose up -d --remove-orphans db valkey livekit
    if ($LASTEXITCODE -ne 0) {
      throw "Failed to start middleware containers. If a previous Redis container is still present, run 'docker compose down --remove-orphans' once and try again."
    }
  } finally {
    Pop-Location
  }

  Write-Step "Waiting for PostgreSQL health"
  Wait-ForContainerHealth -ContainerName "corp-internal-db"
}

$sharedEnv = @{
  DATABASE_URL              = [Environment]::GetEnvironmentVariable("DATABASE_URL", "Process")
  DB_PASSWORD               = [Environment]::GetEnvironmentVariable("DB_PASSWORD", "Process")
  LIVEKIT_HOST              = [Environment]::GetEnvironmentVariable("LIVEKIT_HOST", "Process")
  LIVEKIT_API_KEY           = [Environment]::GetEnvironmentVariable("LIVEKIT_API_KEY", "Process")
  LIVEKIT_API_SECRET        = [Environment]::GetEnvironmentVariable("LIVEKIT_API_SECRET", "Process")
  NEXT_PUBLIC_LIVEKIT_URL   = [Environment]::GetEnvironmentVariable("NEXT_PUBLIC_LIVEKIT_URL", "Process")
  GOOGLE_CLOUD_PROJECT      = [Environment]::GetEnvironmentVariable("GOOGLE_CLOUD_PROJECT", "Process")
  GCS_BUCKET                = [Environment]::GetEnvironmentVariable("GCS_BUCKET", "Process")
  GOOGLE_APPLICATION_CREDENTIALS = [Environment]::GetEnvironmentVariable("GOOGLE_APPLICATION_CREDENTIALS", "Process")
}

foreach ($entry in $sharedEnv.GetEnumerator()) {
  if ($null -ne $entry.Value) {
    [Environment]::SetEnvironmentVariable($entry.Key, [string]$entry.Value, "Process")
  }
}

$devFilters = @()

if (-not $SkipApi) {
  $devFilters += "--filter=@corp-internal/api"
}

if (-not $SkipWeb) {
  $devFilters += "--filter=@corp-internal/web"
}

if ($devFilters.Count -eq 0) {
Write-Host ""
Write-Host "Daily dev environment started." -ForegroundColor Green
Write-Host ("Web: http://localhost:" + [Environment]::GetEnvironmentVariable("WEB_PORT", "Process"))
Write-Host ("API: http://localhost:" + [Environment]::GetEnvironmentVariable("API_PORT", "Process"))
Write-Host ("LiveKit: http://localhost:" + [Environment]::GetEnvironmentVariable("LIVEKIT_PORT", "Process"))
Write-Host ("PostgreSQL: localhost:" + [Environment]::GetEnvironmentVariable("DB_PORT", "Process"))
  Write-Host ""
  Write-Host "Stop middleware with: docker compose stop db valkey livekit"
  return
}

Write-Host ""
Write-Host "Middleware ready. Starting app dev processes with Turborepo..." -ForegroundColor Green
Write-Host "Stop middleware later with: docker compose stop db valkey livekit"
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
