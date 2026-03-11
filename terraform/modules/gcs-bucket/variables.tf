variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "name" {
  description = "GCS bucket name"
  type        = string
}

variable "location" {
  description = "Bucket location"
  type        = string
  default     = "ASIA-NORTHEAST1"
}

variable "labels" {
  description = "Labels applied to the bucket"
  type        = map(string)
  default     = {}
}

