---
name: echolore-wiki-maintenance
description: Maintain and extend an EchoLore knowledge base through its MCP endpoint. Use when the user asks to organize, audit, or clean up their team wiki, research internal knowledge, or save conversation content as shareable wiki articles.
---

# EchoLore Wiki Maintenance

You are connected to an EchoLore instance via MCP. The available tools are:

| Tool | What it does |
|------|--------------|
| `wiki_search` | Vector search over wiki pages (returns title, id, similarity, snippet) |
| `wiki_read_page` | Page content as markdown by id (permission-checked; use offset/maxLength for long pages) |
| `wiki_list_spaces` | Visible spaces with IDs and writability (use to pick a spaceId before creating) |
| `wiki_maintenance_report` | Knowledge health audit (see below) |
| `wiki_create_page` | Create a NEW page from markdown (only with write scope; only on explicit request) |

You only see pages the token's creator may read. Never invent page ids or content — always verify with a tool call first.

## Workflows

### 1. Knowledge audit ("ナレッジを整理して" / "wiki のメンテ状況は?")

1. Call `wiki_maintenance_report` first. Do not guess; the report is authoritative.
2. Summarize findings grouped by severity:
   - **Review overdue / registry drift** → governance action needed (owner should review or unregister)
   - **Draft unapproved** → needs an approver (self-approval is prohibited in EchoLore)
   - **Stale page** → verify relevance before recommending deletion
   - **Empty page** → deletion or content candidates
3. For high-severity items, optionally `wiki_read_page` to add context.
4. Deliver an action list: page title, id, recommended action, suggested owner.

### 2. Research ("社内の○○について調べて")

1. Start with `wiki_search` using concise topic keywords (not full sentences).
2. Read promising hits with `wiki_read_page`.
3. Cite page titles when using facts. State clearly when something is NOT in the wiki.

### 3. Save as article ("これを記事にして" / "チームにシェアしたい")

**Only when the user explicitly asks to create/save a page.** Never create pages proactively.

1. Draft the article as markdown: a leading summary, `##` sections, lists where scannable, code blocks for technical content. Write in the user's language.
2. Derive a concise descriptive title (not "メモ" or "新しいページ").
3. If the user names a target space, call `wiki_list_spaces` to resolve its spaceId; otherwise omit `spaceId` (General is used).
4. Call `wiki_create_page` with `{ title, markdown }` (add `spaceId` when resolved).
5. Report the created page title and remind the user to review — the page is attributed to them and fully editable/deletable in the UI.

### 4. Audit-then-draft (combined)

1. Run the maintenance report.
2. For each stale/empty page the user wants to refresh, read it, then draft an updated article.
3. If the user confirms, create the replacement via `wiki_create_page` and mention the old page so the user can delete/archive it manually. (Direct editing of existing pages is not available; proposals are coming.)

## Rules

- Read tools are safe to use freely. `wiki_create_page` is a write action: explicit user request only, one page per request.
- Respect the report's findings over your assumptions about wiki health.
- Do not expose token values or scope details in your answers.
- If a tool returns a permission error, say so plainly — the token simply cannot see or modify that resource.
