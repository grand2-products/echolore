output "instance_name" {
  value = module.gce.instance_name
}

output "instance_external_ip" {
  value = module.gce.external_ip
}

output "files_bucket_name" {
  value = module.files_bucket.name
}

output "runtime_service_account_email" {
  value = google_service_account.runtime.email
}

