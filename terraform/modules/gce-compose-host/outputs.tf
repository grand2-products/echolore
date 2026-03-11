output "instance_name" {
  description = "Created instance name"
  value       = google_compute_instance.this.name
}

output "instance_self_link" {
  description = "Created instance self link"
  value       = google_compute_instance.this.self_link
}

output "external_ip" {
  description = "External IP address"
  value       = google_compute_instance.this.network_interface[0].access_config[0].nat_ip
}

