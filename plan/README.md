# Plan Directory

`plan/` is for temporary planning artifacts.

## Purpose
- execution backlog
- incomplete status gates
- open design decisions
- near-term task breakdown for unfinished work

## Maintenance Rule
- `plan/` is not the long-term home for implemented behavior.
- When implementation is complete and the content becomes durable, write or move the implementation-facing description into `docs/`.
- After that, keep the corresponding `plan/` entry short, status-oriented, or remove it if it no longer helps execution.
- Do not keep implemented-reality mirrors such as `Current State Summary` in `plan/`.

## Retained Files
- `todo-master.md`: active execution backlog
- `implementation-status-master.md`: remaining gates only
- `deployment.md`: release/deployment-specific remaining work

## Directory Split
- `plan/`: future-facing and status-oriented
- `docs/`: implemented reality and operational knowledge
- `AGENTS.md`: stable repository-wide rules

## Examples
- Active remediation backlog: keep in `plan/`
- Current release gap tracking: keep in `plan/`
- Actual release procedure after implementation: keep in `docs/`
- Actual runtime and operator behavior: keep in `docs/`

## Related Files
- `../AGENTS.md`
- `../docs/ops-runbook.md`
- `./implementation-status-master.md`
- `./todo-master.md`
