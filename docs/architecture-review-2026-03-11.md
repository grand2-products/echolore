# Architecture Review Snapshot (2026-03-11)

Last updated: 2026-03-11

This document preserves the architecture-review remediation snapshot from 2026-03-11.
Active execution tracking has moved to `plan/todo-master.md`.

## Review Goals
- close security trust-boundary gaps
- enforce authorization
- make deployment reproducible
- harden infrastructure and operations

## Workstream Summary

### WS-1 Security and Trust Boundary
- remove client-supplied actor IDs from write contracts
- derive actor identity from authenticated session only
- add regression coverage for spoofed identities

### WS-2 Authorization Enforcement
- enforce authorization on wiki, meetings, files, and users
- emit audit events for allow/deny decisions

### WS-3 Deploy and Runtime Consistency
- standardize on a runtime deployment strategy
- ensure clean-host deployability
- add health checks and rollback procedure

### WS-4 Infrastructure Hardening
- reduce IAM scope
- move to explicit network and firewall configuration
- remove dangerous defaults

### WS-5 Application Consistency and Data Safety
- connect permission model to real access paths
- normalize frontend session identity
- wrap multi-step writes in transactions

### WS-6 Config Hygiene, QA, and Observability
- remove config drift
- add security regression tests in CI
- add access-control observability

## Milestone Shape
- M1: P0 trust boundary, authorization, deploy consistency
- M2: P1 infrastructure and application consistency
- M3: P2 config hygiene, QA, and observability

## Current Canonical Sources
- current execution backlog: `../plan/todo-master.md`
- current implementation state: `../plan/implementation-status-master.md`
- current release flow: `./release-workflows.md`
