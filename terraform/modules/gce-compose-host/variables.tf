variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "name" {
  description = "Instance name"
  type        = string
}

variable "zone" {
  description = "GCE zone"
  type        = string
}

variable "machine_type" {
  description = "GCE machine type"
  type        = string
}

variable "disk_size_gb" {
  description = "Boot disk size in GB"
  type        = number
}

variable "tags" {
  description = "Network tags"
  type        = list(string)
  default     = []
}

variable "labels" {
  description = "Labels applied to the instance"
  type        = map(string)
  default     = {}
}

variable "network_self_link" {
  description = "Self link for the network attached to the instance"
  type        = string
}

variable "subnetwork_self_link" {
  description = "Self link for the subnetwork attached to the instance"
  type        = string
}

variable "service_account_email" {
  description = "Service account email attached to the instance"
  type        = string
}

variable "service_account_scopes" {
  description = "OAuth scopes attached to the instance service account"
  type        = list(string)
}

