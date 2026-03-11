# Terraform

This directory contains standardized Terraform entry points for `dev` and `prod`.

## Structure

```text
terraform/
  environments/
    dev/
    prod/
  modules/
    gce-compose-host/
    gcs-bucket/
  scripts/
    tfenv.sh
    tfenv.ps1
```

## Prerequisites

- Terraform `>= 1.5`
- GCP credentials configured (for local run)
- Remote state bucket already created

## One-time setup per environment

1. Copy backend template.
2. Set state bucket and prefix.
3. Prepare `terraform.tfvars` from `terraform.tfvars.example`.

```bash
cp terraform/environments/dev/backend.hcl.example terraform/environments/dev/backend.hcl
cp terraform/environments/dev/terraform.tfvars.example terraform/environments/dev/terraform.tfvars

cp terraform/environments/prod/backend.hcl.example terraform/environments/prod/backend.hcl
cp terraform/environments/prod/terraform.tfvars.example terraform/environments/prod/terraform.tfvars
```

## Standard commands

### Linux/macOS

```bash
# Validate (no backend)
bash terraform/scripts/tfenv.sh dev validate
bash terraform/scripts/tfenv.sh prod validate

# Plan
bash terraform/scripts/tfenv.sh dev plan
bash terraform/scripts/tfenv.sh prod plan

# Apply
bash terraform/scripts/tfenv.sh dev apply -auto-approve
bash terraform/scripts/tfenv.sh prod apply
```

### Windows PowerShell

```powershell
# Validate (no backend)
.\terraform\scripts\tfenv.ps1 -Environment dev -Action validate
.\terraform\scripts\tfenv.ps1 -Environment prod -Action validate

# Plan
.\terraform\scripts\tfenv.ps1 -Environment dev -Action plan
.\terraform\scripts\tfenv.ps1 -Environment prod -Action plan

# Apply
.\terraform\scripts\tfenv.ps1 -Environment dev -Action apply -ExtraArgs "-auto-approve"
.\terraform\scripts\tfenv.ps1 -Environment prod -Action apply
```

## CI/CD conventions

- `develop` branch: `dev` plan/apply
- `main` branch: `dev` plan/apply -> `prod` plan/apply
- Backend config in CI is injected via `terraform init -backend-config="bucket=..." -backend-config="prefix=..."`

## Security notes

- Do not commit `backend.hcl` or `terraform.tfvars` with real values.
- Keep secrets only in GitHub Secrets / secret manager.
- Runtime service accounts are created by Terraform per environment.
