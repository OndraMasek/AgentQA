# AgentQA — Project Goal

> Single living entry point for what this repo is, where it's going, and where to look right now.

## What AgentQA is

A pluggable, AI-driven QA layer that runs a swarm of specialized Claude agents against every delivery iteration of a host software project — catching the issues unit tests, linters, and humans miss, without adding QA headcount.

- **Form factor (v1):** GitHub Action (primary) + Node CLI (`npx agentqa`)
- **Built on:** `@anthropic-ai/claude-agent-sdk`
- **Wedge:** small / solo dev teams without dedicated QA
- **Trigger model:** per-PR, diff-aware
- **Output:** sticky Markdown PR comment + machine-consumable JSON artifact

## Constitution

Binding principles for every change live in [`.specify/memory/constitution.md`](.specify/memory/constitution.md). The five Core Principles — Workflow Discipline, Test-Before-Report, Simplicity & YAGNI, Pluggability, Cost Discipline — apply to every PR.

## Phases

| # | Phase | Status | Folder |
|---|---|---|---|
| 1 | MVP — CLI + GitHub Action + 3 built-in agents (functional, regression, smoke) | **In progress** | [`specs/001-agentqa-mvp/`](specs/001-agentqa-mvp/) |

For phase 1 progress, read [`specs/001-agentqa-mvp/delivery-status.md`](specs/001-agentqa-mvp/delivery-status.md). It's the living tracker — updated at every block boundary.

## V2 candidates (out of scope for phase 1)

- A11y reviewer, API contract checker, doc/UX critic agents
- Per-release / full-sweep mode (phase 1 is per-PR diff-aware only)
- Polished standalone CLI DX (works in v1, just not the headline surface)
- Web UI / dashboard
- Persistent run history beyond `./.agentqa-cache/`
- Cross-iteration trend analysis ("regression rate over time")
- Custom-agent marketplace
- Non-Claude model support
- Editor / `--watch` mode
- OSS-maintainer and enterprise packaging variants
- "Fix mode" — agents that propose patches in addition to surfacing findings

## Where to start as a contributor

1. Read this file
2. Read [`.specify/memory/constitution.md`](.specify/memory/constitution.md)
3. Open [`specs/001-agentqa-mvp/spec.md`](specs/001-agentqa-mvp/spec.md) → [`plan.md`](specs/001-agentqa-mvp/plan.md) → [`tasks.md`](specs/001-agentqa-mvp/tasks.md)
4. Check [`delivery-status.md`](specs/001-agentqa-mvp/delivery-status.md) to see what's done and what's next
5. Read `.claude/rules/*` for the workflow + tech-stack rules

## Where to start as a host-project user

See [`README.md`](README.md). Three steps: copy workflow file, add `ANTHROPIC_API_KEY` secret, run `npx agentqa init`.
