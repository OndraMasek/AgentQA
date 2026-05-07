---
description: "Step 4: Implement — coding rules, AgentQA module layout"
---

# Step 4: Implement

Write clean code from the start. Follow these rules during implementation:

- Do NOT commit via `git` unless explicitly instructed by the user
- When creating diagrams or graphs, use `mermaid`
- Write clean code from the start — don't plan to "clean it up later"
- Refactor continuously — improve code structure immediately when you see issues
- Remove dead code — delete unused functions, variables, imports, and commented code
- After writing code: review comments, clean up imports, check for side effects
- All public types must have a Zod schema in `specs/<phase>/contracts/` — schema is the single source of truth, types are inferred via `z.infer<>`

## CLI (`src/cli/`)

User-facing entry. Thin layer over the core.

- `index.ts` — Commander setup, subcommands `init`, `run`
- `init.ts` — detects framework from `package.json`, scaffolds `agentqa.config.ts` + `.gitignore` entry
- `run.ts` — parses flags (`--diff`, `--only`, `--reporter`, `--ci`, `--verbose`), invokes the orchestrator, prints reports, exits with the documented code

## Core (`src/core/`)

Pure Node.js orchestrator — no IO concerns beyond what the SDK and `child_process` need. Trivially unit-testable.

- `orchestrator.ts` — main pipeline: load config → resolve diff → build IntentBundle → fan out to agents → reduce → report
- `intent.ts` — `IntentBundle` builder: PR body + linked issues (`gh issue view`) + commit messages + `contextDocs`
- `diff.ts` — `git diff` resolver between two refs (or `GITHUB_BASE_REF...HEAD`)
- `swarm.ts` — parallel `query()` fan-out with per-agent + total `maxTotalUsd` budget enforcement
- `reducer.ts` — deduplicate by `(file, lineRange, ruleHint)`, prioritize by severity, emit final report
- `types.ts` — re-exports of Zod-inferred types from `specs/<phase>/contracts/`

## Agents (`src/agents/`)

Each agent is a directory containing a prompt file + a small TypeScript module exposing its config (tools, scope, severity floor). Agents are pure data — no orchestration logic lives here.

- `functional/` — verifies whether the change does what the PR/issue claims
- `regression/` — surveys callers and adjacent modules for accidental impact
- `smoke/` — boots dev server (or hits provided preview URL), exercises golden-path routes
- `index.ts` — registry of built-in agents + helper to instantiate custom agents from config

## Config (`src/config/`)

- `schema.ts` — Zod schema mirroring `specs/<phase>/contracts/config.schema.ts`
- `load.ts` — locates `agentqa.config.{ts,json}` in CWD or via `--config`, parses, validates, returns typed config

## Reporters (`src/reporters/`)

- `json.ts` — writes `agentqa-report.json` validated against the report schema
- `markdown.ts` — renders the PR-comment body
- `github-pr-comment.ts` — finds-or-creates the sticky comment via `gh api`, edits in place

## Repository Structure

```
AgentQA/
├── package.json
├── tsconfig.json
├── biome.json
├── src/
│   ├── cli/
│   ├── core/
│   ├── agents/
│   │   ├── functional/
│   │   ├── regression/
│   │   └── smoke/
│   ├── config/
│   ├── reporters/
│   └── types.ts
├── tests/
├── examples/
│   └── sample-next-app/
├── specs/
│   └── 001-agentqa-mvp/
│       ├── spec.md
│       ├── plan.md
│       ├── tasks.md
│       ├── delivery-status.md
│       └── contracts/
└── .github/
    └── workflows/
        ├── ci.yml          # AgentQA's own CI
        └── agentqa.yml     # Template host projects copy
```
