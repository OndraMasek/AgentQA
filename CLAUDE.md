# AgentQA — Development Guidelines

Auto-generated alongside spec-kit feature plans. Last updated: 2026-05-07.

## Active Technologies

- TypeScript 5.5+ (strict), Node.js 22 LTS
- `@anthropic-ai/claude-agent-sdk` — multi-agent swarm orchestration
- Vitest — unit + integration tests
- Biome — lint + format
- Zod — config + contract validation

## Project Structure

```text
src/
  cli/          # `agentqa init`, `agentqa run` — CLI entry
  core/         # Swarm orchestrator, IntentBundle builder, reducer
  agents/       # Built-in agents: functional verifier, smoke runner, regression scout
  config/       # Config loader + Zod schemas
  reporters/    # JSON + Markdown reporters
  types.ts
tests/
examples/       # Sample host projects with agentqa.config.ts
specs/          # Spec-kit phase folders (001-agentqa-mvp/ …)
.specify/
  memory/
    constitution.md
GOAL.md         # Living top-level phase context
```

## Commands

```
npm test && npm run lint
```

## Code Style

TypeScript 5.5+ strict, Node.js 22 LTS — follow standard conventions and the rules under `.claude/rules/`.

## Recent Changes

- Initial scaffolding for AgentQA — multi-agent QA swarm via Claude Agent SDK (phase 001-agentqa-mvp)

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
