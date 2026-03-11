variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
  default     = "asia-northeast1"
}

variable "zone" {
  description = "GCP zone"
  type        = string
  default     = "asia-northeast1-a"
}

variable "admin_source_ranges" {
  description = "Allowed CIDRs for SSH administration access"
  type        = list(string)
  default     = ["35.235.240.0/20"]
}

variable "web_source_ranges" {
  description = "Allowed CIDRs for web and LiveKit ingress"
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

