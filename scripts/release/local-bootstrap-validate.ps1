param(
  [string]$ApiImage = "corp-internal/local-api:bootstrap",
  [string]$WebImage = "corp-internal/local-web:bootstrap",
  [string]$ReleaseSha = "local-bootstrap"
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$runId = Get-Date -Format "yyyyMMddHHmmss"
$projectName = "bootstrap-local-$runId"
$stagingDir = Join-Path ([System.IO.Path]::GetTempPath()) "corp-internal-bootstrap-$runId"
$envPath = Join-Path $stagingDir ".env"
$composePath = Join-Path $stagingDir "docker-compose.bootstrap-check.yml"
$livekitPath = Join-Path $stagingDir "livekit.yaml"
$credentialsPath = Join-Path $stagingDir "credentials.json"

function Invoke-Step {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Command
  )

  Write-Host "==> $Command"
  & powershell -NoProfile -Command $Command
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed: $Command"
  }
}

function Cleanup {
  if (Test-Path $composePath) {
    try {
      docker compose -p $projectName -f $composePath down -v --remove-orphans | Out-Host
    } catch {
      Write-Warning "Failed to tear down bootstrap validation stack: $_"
    }
  }

  if (Test-Path $stagingDir) {
    Remove-Item $stagingDir -Recurse -Force
  }
}

New-Item -ItemType Directory -Path $stagingDir | Out-Null

try {
  Copy-Item (Join-Path $repoRoot "docker-compose.bootstrap-check.yml") $composePath
  Copy-Item (Join-Path $repoRoot "livekit.yaml") $livekitPath
  Set-Content -Path $credentialsPath -Value "{}" -NoNewline

  $envContent = @"
API_IMAGE=$ApiImage
WEB_IMAGE=$WebImage
RELEASE_SHA=$ReleaseSha
DB_PASSWORD=wiki_password
GOOGLE_CLIENT_ID=bootstrap-local-client
GOOGLE_CLIENT_SECRET=bootstrap-local-secret
COOKIE_SECRET=MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=
AUTH_ALLOWED_DOMAIN=grand2-products.com
AUTH_BYPASS=false
GOOGLE_CLOUD_PROJECT=local-bootstrap
GCS_BUCKET=corp-internal-files-local
GOOGLE_APPLICATION_CREDENTIALS_HOST=./credentials.json
NEXT_PUBLIC_API_URL=http://api:3001
NEXT_PUBLIC_LIVEKIT_URL=ws://livekit:7880
LIVEKIT_HOST=http://livekit:7880
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=secret
CORS_ORIGIN=http://oauth2-proxy:4180
OAUTH_REDIRECT_URL=http://localhost:4180/oauth2/callback
OAUTH_COOKIE_SECURE=false
GEMINI_API_KEY=
"@
  Set-Content -Path $envPath -Value $envContent -NoNewline

  Push-Location $repoRoot
  try {
    Invoke-Step "docker build -f apps/api/Dockerfile -t $ApiImage ."
    Invoke-Step "docker build -f apps/web/Dockerfile -t $WebImage ."
  } finally {
    Pop-Location
  }

  Push-Location $stagingDir
  try {
    Invoke-Step "docker compose -p $projectName -f `"$composePath`" config"
    Invoke-Step "docker pull postgres:17-alpine"
    Invoke-Step "docker pull valkey/valkey:8-alpine"
    Invoke-Step "docker pull livekit/livekit-server:latest"
    Invoke-Step "docker pull quay.io/oauth2-proxy/oauth2-proxy:v7.7.1"
    Invoke-Step "docker compose -p $projectName -f `"$composePath`" up -d --wait --remove-orphans --pull never"
    Invoke-Step "docker compose -p $projectName -f `"$composePath`" ps"
    Invoke-Step "docker compose -p $projectName -f `"$composePath`" exec -T api wget --no-verbose --tries=1 --spider http://localhost:3001/health"
    Invoke-Step "docker compose -p $projectName -f `"$composePath`" exec -T web wget --no-verbose --tries=1 --spider http://127.0.0.1:3000"
  } finally {
    Pop-Location
  }
} finally {
  Cleanup
}
