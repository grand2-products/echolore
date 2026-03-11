variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "name" {
  description = "VPC network name"
  type        = string
}

variable "subnetwork_name" {
  description = "Subnetwork name"
  type        = string
}

variable "region" {
  description = "GCP region for the subnetwork"
  type        = string
}

variable "subnet_cidr" {
  description = "Primary CIDR for the subnetwork"
  type        = string
}

variable "target_tags" {
  description = "Instance tags targeted by firewall rules"
  type        = list(string)
}

variable "admin_source_ranges" {
  description = "Allowed source ranges for admin SSH access"
  type        = list(string)
}

variable "web_source_ranges" {
  description = "Allowed source ranges for web and LiveKit ingress"
  type        = list(string)
}
