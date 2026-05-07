# Phase 001 — Tasks

Implements [`plan.md`](plan.md). Constitution-bound. 4-hour total budget.

Mark each task complete with `[x]` as it lands. Update [`delivery-status.md`](delivery-status.md) at every block boundary with what was done, what was tested, and what was observed.

---

## Block 1 — Repo bootstrap & contracts (30 min)

- [x] T1.1 Create `package.json` (`type: module`, scripts: `dev`, `build`, `typecheck`, `lint`, `test`); deps: `@anthropic-ai/claude-agent-sdk`, `commander`, `picocolors`, `zod`, `esbuild`; devDeps: `typescript`, `@types/node`, `vitest`, `@biomejs/biome`
- [x] T1.2 Create `tsconfig.json` (strict, NodeNext, `outDir: dist`)
- [x] T1.3 Create `biome.json` with sensible defaults
- [x] T1.4 Create `vitest.config.ts`
- [x] T1.5 Add `bin` entry: `"agentqa": "./dist/cli/index.js"` plus shebang in source
- [x] T1.6 Create `src/types.ts` re-exporting `z.infer<>`s from `specs/001-agentqa-mvp/contracts/`
- [x] T1.7 Verify: `npm install && npm run typecheck` clean

## Block 2 — CLI + config loader (30 min)

- [x] T2.1 `src/cli/index.ts` — Commander shell with `init` and `run` subcommands; shebang `#!/usr/bin/env node`
- [x] T2.2 `src/config/load.ts` — locate `agentqa.config.{ts,json}` (CWD upward), `.ts` via in-memory `esbuild` transform, validate with `AgentQAConfigSchema`
- [x] T2.3 `src/cli/init.ts` — read `package.json`, detect framework (`next`/`vite`/`remix`/`other`), write framework-aware default `agentqa.config.ts`
- [x] T2.4 `src/cli/run.ts` — parse flags `--config`, `--diff`, `--only`, `--reporter`, `--ci`, `--verbose`; load config; call orchestrator stub (returns empty report for now)
- [x] T2.5 Test: `tests/config/load.test.ts` — valid + invalid fixture configs; assert Zod errors include offending path
- [x] T2.6 Verify: `npx . init` in a tmp dir produces a config that round-trips through the loader

## Block 3 — Diff resolver + IntentBundle builder (25 min)

- [x] T3.1 `src/core/shell.ts` — `runShell(cmd: string, args: string[], opts?)` over Node's `execFile`-style API; never accepts a single concatenated string
- [x] T3.2 `src/core/diff.ts` — `resolveDiff(base, head)`: validate refs via `git rev-parse`, run `git diff --name-status`, return `ChangedFile[]` + raw diff
- [x] T3.3 `src/core/intent.ts` — `buildIntent(config, diffResult)`: read `GITHUB_EVENT_PATH` for PR body when `--ci`; extract linked-issue numbers via regex; for each number call `gh issue view <n> --json title,body`; collect `git log --pretty=%B base..head`; read `contextDocs` files; return `IntentBundleSchema`-validated bundle
- [x] T3.4 Test: `tests/core/diff.test.ts` against a fixture repo under `tests/fixtures/repos/basic/`
- [x] T3.5 Test: `tests/core/intent.test.ts` with mocked `runShell`

## Block 4 — Swarm orchestrator + budget (40 min)

- [x] T4.1 `src/core/swarm.ts` — `dispatchSwarm(agents, intent, budget)`: cost projection per agent; drop lowest-priority agents until under `maxTotalUsd`; `Promise.allSettled` over `query()` per remaining agent; collect final structured `Finding[]` from each
- [x] T4.2 Wrap `query()` with timeout (`AbortController`); on timeout, mark `status: "timeout"` and return partial findings
- [x] T4.3 Each agent's last assistant message MUST be a JSON code block matching `Finding[]`; on parse failure, synthesise a meta finding (`agent: "meta"`, `severity: "low"`)
- [x] T4.4 `src/core/orchestrator.ts` — wire diff → intent → swarm → reduce → report
- [x] T4.5 Test: `tests/core/swarm.test.ts` — stub `query()` to return canned streams; assert parallelism, timeout enforcement, budget abort
- [x] T4.6 Test: `tests/core/budget.test.ts` — projected over-budget dispatch drops agents in priority order

## Block 5 — Built-in agents (60 min)

- [x] T5.1 `src/agents/registry.ts` — `defineAgent({name, systemPrompt, tools, maxTurns})`; built-in registry; helper to materialise enabled agents from config
- [x] T5.2 `src/agents/functional/prompt.md` — system prompt for functional verifier (reads diff + IntentBundle, judges against claim, returns `Finding[]` JSON)
- [x] T5.3 `src/agents/functional/index.ts` — wire prompt + tools (`Read`, `Grep`, `Bash` read-only)
- [x] T5.4 `src/agents/regression/prompt.md` + `index.ts` — regression scout (Read, Grep)
- [x] T5.5 `src/agents/smoke/prompt.md` + `index.ts` — smoke runner (WebFetch, Bash for `curl`)
- [x] T5.6 Each `prompt.md` MUST instruct the agent to emit a final JSON block matching `Finding[]` with required fields: `agent`, `ruleHint`, `severity`, `file`, `message`
- [x] T5.7 Test: smoke each agent against a fixture diff in `tests/fixtures/repos/basic/` with stubbed `query()` returning realistic `Finding[]`

## Block 6 — Reducer + reporters (30 min)

- [x] T6.1 `src/core/reducer.ts` — group by `(file, lineRange ?? null, ruleHint)`; keep highest severity; merge messages with `"\n\n— also: "`; sort severity DESC, file ASC, line ASC; compute stable id
- [x] T6.2 `src/reporters/json.ts` — write `agentqa-report.json`; validate against `ReportSchema` before writing
- [x] T6.3 `src/reporters/markdown.ts` — render header, summary line, severity-grouped table, per-agent details `<details>`
- [x] T6.4 `src/reporters/github-pr-comment.ts` — locate sticky comment via `gh api repos/.../issues/<n>/comments` + grep for `<!-- agentqa-comment -->`; `PATCH` if found, `POST` otherwise
- [x] T6.5 Test: `tests/core/reducer.test.ts` — hand-built `Finding[]`; assert dedupe + ordering
- [x] T6.6 Test: `tests/reporters/markdown.test.ts` — snapshot against deterministic `Report` fixture
- [x] T6.7 Test: `tests/reporters/json.test.ts` — round-trip → re-validate

## Block 7 — GitHub Action template (25 min)

- [x] T7.1 `.github/workflows/agentqa.yml` — host-project template: `pull_request` trigger, `actions/checkout@v4` with `fetch-depth: 0`, `actions/setup-node@v4` with Node 22, `npx agentqa@latest run --ci`
- [x] T7.2 Surface env: `ANTHROPIC_API_KEY`, `GITHUB_TOKEN` (for `gh`), `GITHUB_BASE_REF`, `GITHUB_HEAD_REF`
- [x] T7.3 Upload `./.agentqa-cache/runs/<runId>/` as workflow artifact (per NFR-5)
- [x] T7.4 Document the template in README "Quick start" — already drafted; verify it matches `agentqa.yml`

## Block 8 — Example + end-to-end smoke (25 min)

- [x] T8.1 `examples/sample-next-app/package.json` (minimal Next.js skeleton)
- [x] T8.2 `examples/sample-next-app/agentqa.config.ts` — uses defaults
- [x] T8.3 `tests/fixtures/repos/basic/` — small git repo with two commits (base, head) producing a known diff
- [x] T8.4 End-to-end test: `npm run build && node dist/cli/index.js run --config examples/sample-next-app/agentqa.config.ts --diff <fixture-base>..<fixture-head>` produces a report
- [ ] T8.5 Manual: open a throwaway PR on a private repo with the template; confirm sticky comment behaviour _(deferred — needs published npm package or pack/link flow; out of scope for this session)_
- [x] T8.6 Update `delivery-status.md` with end-to-end observations
