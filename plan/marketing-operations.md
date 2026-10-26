# Marketing Operations — Remaining Work

Implemented behavior: `docs/marketing-operations.md`.

## Open decisions

- Data platform: facts live in PostgreSQL. Decide whether GA4 BigQuery Export is needed
  (event-level analysis) and, if so, add a `ga4_bigquery` connector rather than a second store.
- Retention: confirm company policy for aggregated data (default 13 months) and run logs
  (default 90 days) before production use.
- Google Ads / Meta API versions and access levels (developer token level, Meta app review)
  must be verified against the real accounts at kickoff.

## Remaining work

- GTM: store and compare published container versions (計画書 p.6 「設定版の保管と照合」).
  Today GTM is tracked as an asset and through change requests only.
- Wiki link check: monthly detection of broken links and overdue pages is shown in the
  registry, but dead links inside page bodies are not scanned.
- CRM / order data integration (out of MVP scope per the plan; needs a data owner first).
- Notification channel: connector failures email asset owners only; consider a team channel.
- Scheduled update success rate counts UTC days with a successful scheduled run; switch to
  "succeeded before the agreed time" once the agreed time is decided.

## Acceptance checks (MVP, 計画書 p.13)

- [ ] Asset register covers every selected asset with owner, billing, primary/secondary and recovery contact.
- [ ] Groups with `marketing.*` permissions are set; non-members cannot open `/marketing`.
- [ ] Management dashboard shows cost, media CV/CPA, GA4 sessions/key events and LP list with period, last success and unfetched days.
- [ ] Last 7 days reconciled against the source consoles under agreed conditions and approved.
- [ ] Daily/weekly procedures, budget change, GTM/LP release, collection failure and recovery procedures approved in the knowledge registry.
- [ ] The deputy completes a weekly report and a document update using only the procedures.
