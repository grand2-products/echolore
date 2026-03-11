output "network_self_link" {
  description = "Self link for the VPC network"
  value       = google_compute_network.this.self_link
}

output "subnetwork_self_link" {
  description = "Self link for the subnetwork"
  value       = google_compute_subnetwork.this.self_link
}
