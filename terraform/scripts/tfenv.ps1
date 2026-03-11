param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("dev", "prod")]
  [string]$Environment,

  [Parameter(Mandatory = $true)]
  [ValidateSet("init", "plan", "apply", "destroy", "validate")]
  [string]$Action,

  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$ExtraArgs
)

$ErrorActionPreference = "Stop"

$rootDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$envDir = Join-Path $rootDir "environments/$Environment"
$backendFile = Join-Path $envDir "backend.hcl"

if (-not (Test-Path $envDir)) {
  throw "Environment directory not found: $envDir"
}

Push-Location $envDir
try {
  switch ($Action) {
    "init" {
      if (-not (Test-Path $backendFile)) {
        throw "backend.hcl not found. Copy backend.hcl.example to backend.hcl and set bucket/prefix."
      }
      & terraform init "-backend-config=$backendFile" @ExtraArgs
      break
    }
    "validate" {
      & terraform init -backend=false
      & terraform validate @ExtraArgs
      break
    }
    "plan" {
      if (-not (Test-Path $backendFile)) {
        throw "backend.hcl not found. Copy backend.hcl.example to backend.hcl and set bucket/prefix."
      }
      & terraform init "-backend-config=$backendFile"
      & terraform plan @ExtraArgs
      break
    }
    "apply" {
      if (-not (Test-Path $backendFile)) {
        throw "backend.hcl not found. Copy backend.hcl.example to backend.hcl and set bucket/prefix."
      }
      & terraform init "-backend-config=$backendFile"
      & terraform apply @ExtraArgs
      break
    }
    "destroy" {
      if (-not (Test-Path $backendFile)) {
        throw "backend.hcl not found. Copy backend.hcl.example to backend.hcl and set bucket/prefix."
      }
      & terraform init "-backend-config=$backendFile"
      & terraform destroy @ExtraArgs
      break
    }
  }

  if ($LASTEXITCODE -ne 0) {
    throw "Terraform command failed with exit code $LASTEXITCODE"
  }
}
finally {
  Pop-Location
}
