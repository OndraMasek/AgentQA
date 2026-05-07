---
description: Project configuration — architecture, paths, dev environment
---

# Project Config

- **Project**: AgentQA — a pluggable, AI-driven QA layer that runs a swarm of specialized Claude agents against every delivery iteration of a host project
- **Form factor (v1)**: GitHub Action (primary) + Node CLI (`npx agentqa`); zero coupling to host project code, only a config file + repo secret required
- **Architecture**: Single-process Node.js orchestrator that fans out parallel `query()` calls via `@anthropic-ai/claude-agent-sdk`; deterministic reducer merges per-agent `Finding[]` into a single report
- **Structure**: `src/cli/` (CLI entry), `src/core/` (orchestrator, IntentBundle builder, reducer), `src/agents/` (built-in agent definitions), `src/config/` (Zod schemas + loader), `src/reporters/` (JSON + Markdown)
- **Build**: `tsc` for the CLI binary; no bundler — published to npm as plain ESM
- **Key dependency**: `@anthropic-ai/claude-agent-sdk` — spawns subagents via `query()` with bounded budgets, hooks, and tool permissions
- **Phase tracking**: spec-kit (`specs/NNN-…/{spec,plan,tasks,delivery-status}.md`) plus root `GOAL.md` as the living entry point
