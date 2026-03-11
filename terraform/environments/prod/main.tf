locals {
  env           = "prod"
  instance_tags = ["wiki-prod"]
  service_account_scopes = [
    "https://www.googleapis.com/auth/devstorage.read_write",
    "https://www.googleapis.com/auth/logging.write",
    "https://www.googleapis.com/auth/monitoring.write",
  ]
  runtime_service_account_roles = [
    "roles/logging.logWriter",
    "roles/monitoring.metricWriter",
  ]
}

resource "google_service_account" "runtime" {
  project      = var.project_id
  account_id   = "corp-internal-runtime-prod"
  display_name = "corp-internal runtime (prod)"
}

resource "google_project_iam_member" "runtime_roles" {
  for_each = toset(local.runtime_service_account_roles)

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.runtime.email}"
}

module "network" {
  source = "../../modules/vpc-network"

  project_id          = var.project_id
  name                = "corp-internal-prod-vpc"
  subnetwork_name     = "corp-internal-prod-subnet"
  region              = var.region
  subnet_cidr         = "10.20.0.0/24"
  target_tags         = local.instance_tags
  admin_source_ranges = var.admin_source_ranges
  web_source_ranges   = var.web_source_ranges
}

module "gce" {
  source = "../../modules/gce-compose-host"

  project_id             = var.project_id
  name                   = "wiki-prod"
  zone                   = var.zone
  machine_type           = "e2-standard-2"
  disk_size_gb           = 100
  network_self_link      = module.network.network_self_link
  subnetwork_self_link   = module.network.subnetwork_self_link
  service_account_email  = google_service_account.runtime.email
  service_account_scopes = local.service_account_scopes
  tags                   = local.instance_tags
  labels = {
    app = "corp-internal"
    env = local.env
  }
}

resource "google_storage_bucket_iam_member" "runtime_object_access" {
  bucket = module.files_bucket.name
  role   = "roles/storage.objectUser"
  member = "serviceAccount:${google_service_account.runtime.email}"
}

module "files_bucket" {
  source = "../../modules/gcs-bucket"

  project_id = var.project_id
  name       = "corp-internal-files-prod"
  labels = {
    app = "corp-internal"
    env = local.env
  }
}

