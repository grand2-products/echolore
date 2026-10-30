---
name: echolore-marketing-reporting
description: Answer marketing performance questions and reproduce EchoLore reporting dashboards through its MCP endpoint. Use when the user asks about ad spend, conversions, CPA/ROAS, sessions, form submissions, landing pages, marketing data freshness, or wants a report built from their marketing dashboards.
---

# EchoLore Marketing Reporting

You are connected to an EchoLore instance via MCP. Marketing reporting tools
(requires the `reporting` scope; they run with the token creator's
`marketing.view` permission):

| Tool | What it does |
|------|--------------|
| `marketing_query_metrics` | Query metrics with period totals or breakdowns (date/source/campaign/account), including coverage and freshness |
| `marketing_list_dashboards` | List the reporting dashboards defined in EchoLore |
| `marketing_get_dashboard` | Read a dashboard definition (widgets, metrics, filters, linked wiki pages) |
| `marketing_data_status` | Data health: connector freshness, sync success rate, verification/review status, pending approvals |

Metric keys: `cost, impressions, clicks, conversions, conversion_value, sessions,
lp_views, form_starts, form_submits, key_events, inquiries, revenue,
uptime_checks, uptime_successes, response_ms_total` (base) and
`ctr, cpc, cpa, cvr, form_completion_rate, roas, availability, avg_response_ms`
(derived, computed as sum÷sum — never average the daily ratios).

## Workflows

### 1. Quick status ("数字新しい?" / "データの調子は?")

1. Call `marketing_data_status` first. Report stale connectors, failed syncs, and pending approvals before quoting numbers.
2. If anything is stale, say so explicitly and state which sources are affected.

### 2. Answer a performance question ("先週いくら使った?" / "CPAは?")

1. Translate the question into metrics + period. `from`/`to` are inclusive YYYY-MM-DD; or pass `lastDays`.
2. Call `marketing_query_metrics`. For trends add `dimensions: ["date"]`; for per-campaign views add `"campaign"`.
3. Read `coverage` in the result: `missingDates` are **未取得 (not fetched), not zero** — never include them in totals, and mention them if they overlap the asked period.
4. Report numbers with their source/currency when the response is split. The server automatically splits non-summable metrics (media conversions, key events, inquiries, revenue) by `source` — do not merge those rows yourself.
5. Derived metrics may be `null` (算定不可, zero denominator) — report as "not computable", not 0.

### 3. Reproduce a dashboard ("今週のダッシュボードレポートを")

1. `marketing_list_dashboards` → pick the dashboard (or ask which one).
2. `marketing_get_dashboard` to read widget definitions: each widget declares metrics, dimensions, filters, and a date range (`last_7_days`, `last_28_days`, `this_month`, `last_month`, `last_90_days`).
3. Resolve each widget's date range to concrete from/to dates, then run `marketing_query_metrics` per widget (kpi = period totals, timeseries = `dimensions: ["date"]`, breakdown = its dimension).
4. Compose the report: headers per widget, tables or ASCII charts for series, footnotes for coverage warnings and linked wiki pages (`wikiPageId` — read context with `wiki_read_page` when useful).

### 4. Write the report into the Wiki (only on explicit request)

If the user asks to save the report as an article and the token has the `write`
scope, draft it as markdown (summary first, then sections per widget, state the
period and data freshness) and save with `wiki_create_page`. Always attribute
numbers to their period and note 未取得 days.

## Rules

- Never invent numbers — every figure must come from a tool result.
- Check `marketing_data_status` when freshness matters; repeat it if the conversation spans hours.
- 未取得 ≠ 0. Null ratio ≠ 0. State both plainly.
- Do not sum across `source` rows for conversions / conversion_value / key_events / inquiries / revenue; keep them per source.
- Reporting tools are read-only. Creating wiki pages requires the `write` scope and an explicit user request (one page per request).
