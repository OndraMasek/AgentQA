---
description: "Reference: Technology stack — Node.js 22, TypeScript strict, Claude Agent SDK, Vitest, Biome, Zod"
---

# Reference: Technology Stack

## Runtime & language

- **Runtime**: Node.js 22 LTS (matches what host repos already run; uses native `node:test`-compatible globals via Vitest)
- **Language**: TypeScript 5.5+ with `strict: true`. No JS source files.
- **Module format**: ESM only (`"type": "module"`). No CJS in source.

## Orchestration

- **Agent SDK**: `@anthropic-ai/claude-agent-sdk` — spawns subagents via `query()` async generator with bounded budgets, hooks (PreToolUse / PostToolUse / SubagentStart / SubagentStop), and per-tool permissions
- **Pattern**: Orchestrator fans out N `query()` calls in parallel via `Promise.all`. Each call returns a stream of events; the orchestrator collects the final structured `Finding[]` per agent.
- **Budget enforcement**: pre-dispatch projection check against `maxTotalUsd`; per-agent timeout; orchestrator aborts a pending agent if remaining budget would be exceeded.

## Validation & contracts

- **Zod** — every config, intent bundle, finding, and report has a Zod schema. Schemas live under `specs/<phase>/contracts/` and are the single source of truth (TS types via `z.infer<>`).
- **Schema versioning**: each emitted JSON has a `schemaVersion` field; bumps follow semver (additive = minor; breaking = major).

## CLI

- **Commander** for argv parsing — proven, minimal, no surprises
- **Picocolors** for terminal styling — no chalk (smaller, ESM-friendly)
- **Distribution**: published to npm as plain compiled ESM; no bundler step. Consumers run via `npx agentqa@latest`.

## Reporting

- **Markdown**: hand-rolled string templates (no MDX, no rendering libs) — keeps the PR-comment output diffable
- **GitHub interaction**: shells out to `gh` CLI for PR-comment find/update + issue fetch (always available in GH Actions runners; documented prerequisite for non-GH CI)

## Testing & lint

- **Vitest** — unit + integration; fixtures for diffs and IntentBundles
- **Biome** — lint + format (single binary, fast, replaces ESLint + Prettier)
- **No Playwright in v1** — no browser surface to test in this repo. Smoke agent uses `WebFetch` against host project's preview URL.

## Scripting & automation

- Default: TypeScript/Node.js for scripts (consistent with the rest of the stack)
- Shell scripts only for trivial one-liners
- Long-running jobs use `child_process.spawn` with explicit timeout; never `execSync` in hot paths
