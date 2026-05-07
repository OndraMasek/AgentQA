# AgentQA

A pluggable, AI-driven QA layer that runs a swarm of specialized Claude agents against every delivery iteration of a software project — catching the issues unit tests, linters, and humans miss, without adding QA headcount.

See `GOAL.md` for current phase context. The phase-1 spec-kit artifacts live in `specs/001-agentqa-mvp/`.

## What it does

On every pull request, AgentQA spawns a small swarm of specialized agents (built on `@anthropic-ai/claude-agent-sdk`) — each scoped to the diff, each with a focused QA role — and posts a single sticky comment on the PR with prioritized findings. The check fails if any finding crosses your configured severity gate.

v1 ships three built-in agents:

- **Functional verifier** — reads the diff + PR description / linked issue, judges whether the change does what it claims
- **Regression scout** — surveys non-diff code adjacent to the change and flags accidental impact zones
- **Smoke runner** — hits a preview URL, exercises golden-path routes, reports failures

Custom agents are first-class — define name + prompt + tools + scope in `agentqa.config.ts`.

## Quick start (host project)

1. Add the workflow:

   ```yaml
   # .github/workflows/agentqa.yml
   name: AgentQA
   on: pull_request
   jobs:
     review:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
           with: { fetch-depth: 0 }
         - uses: actions/setup-node@v4
           with: { node-version: '22' }
         - run: npx agentqa@latest run --ci
           env: { ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }} }
   ```

2. Add `ANTHROPIC_API_KEY` to repo secrets.

3. Generate config:

   ```bash
   npx agentqa init
   ```

4. Commit + push. Open a PR — comment shows up in 30–90 s.

## Repo layout

```
src/                   # CLI, core orchestrator, agents, reporters
tests/                 # Vitest suites
examples/              # Sample host projects with agentqa.config.ts
specs/                 # Spec-kit phase folders
.specify/memory/       # Constitution (binding principles)
GOAL.md                # Living phase context
```

## Common scripts

| Command | What it does |
|---|---|
| `npm run dev` | Watch-mode TypeScript build |
| `npm run typecheck` | TypeScript strict check |
| `npm run lint` | Biome check |
| `npm test` | Vitest |
| `npx agentqa run --diff main..HEAD` | Run AgentQA locally against a diff |
| `npx agentqa init` | Generate `agentqa.config.ts` for a host project |

## Compatibility

AgentQA does not require a vibe-coding chat log. It builds an `IntentBundle` per run from artifacts that always exist: the diff, the PR title/body, linked issues (`Fixes #123`), commit messages, and configurable repo docs. Equally usable for hand-coded PRs, vibe-coded PRs, and fully autonomous-coder loops (stable JSON schema, deterministic exit codes, in-place PR comment editing).

## Constitution

This project is bound by `.specify/memory/constitution.md`. The Core Principles — Workflow Discipline, Test-Before-Report, Simplicity & YAGNI, Pluggability, Cost Discipline — apply to every change.
