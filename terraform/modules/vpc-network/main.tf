resource "google_compute_network" "this" {
  project                 = var.project_id
  name                    = var.name
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "this" {
  project       = var.project_id
  name          = var.subnetwork_name
  region        = var.region
  network       = google_compute_network.this.id
  ip_cidr_range = var.subnet_cidr
}

resource "google_compute_firewall" "ssh_iap" {
  project = var.project_id
  name    = "${var.name}-allow-ssh-iap"
  network = google_compute_network.this.name

  direction     = "INGRESS"
  source_ranges = var.admin_source_ranges
  target_tags   = var.target_tags

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }
}

resource "google_compute_firewall" "web" {
  project = var.project_id
  name    = "${var.name}-allow-web"
  network = google_compute_network.this.name

  direction     = "INGRESS"
  source_ranges = var.web_source_ranges
  target_tags   = var.target_tags

  allow {
    protocol = "tcp"
    ports    = ["80", "443", "4180"]
  }
}

resource "google_compute_firewall" "livekit_tcp" {
  project = var.project_id
  name    = "${var.name}-allow-livekit-tcp"
  network = google_compute_network.this.name

  direction     = "INGRESS"
  source_ranges = var.web_source_ranges
  target_tags   = var.target_tags

  allow {
    protocol = "tcp"
    ports    = ["7880", "7881"]
  }
}

resource "google_compute_firewall" "livekit_udp" {
  project = var.project_id
  name    = "${var.name}-allow-livekit-udp"
  network = google_compute_network.this.name

  direction     = "INGRESS"
  source_ranges = var.web_source_ranges
  target_tags   = var.target_tags

  allow {
    protocol = "udp"
    ports    = ["50000-50200"]
  }
}
