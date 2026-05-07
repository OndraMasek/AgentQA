# Quickstart — AgentQA contributor bring-up

Local development setup for working ON AgentQA itself. For the host-project install path (using AgentQA against another repo), see the root [`README.md`](../../README.md).

---

## Prerequisites

- Node.js 22 LTS or newer (`node --version` ≥ v22.0.0)
- npm 10+ (ships with Node 22)
- `git` ≥ 2.40 (`git --version`)
- `gh` CLI (`gh --version`) — required for the GitHub-comment reporter and `gh issue view` calls during IntentBundle build. On a fresh machine: `brew install gh && gh auth login`. Tests for those code paths work without `gh` (they mock `src/core/shell.ts`), but end-to-end runs need it.
- An Anthropic API key, exported as `ANTHROPIC_API_KEY`. **Only required for end-to-end runs that call the live SDK.** Unit tests stub the SDK by default and run offline.

## First-time setup

```bash
git clone <repo>
cd AgentQA
npm install
npm run typecheck   # must be clean before doing anything else
```

## Day-to-day commands

| Command | What it does |
|---|---|
| `npm run dev` | TypeScript watch mode |
| `npm run typecheck` | Strict TS check (no emit) |
| `npm run lint` | Biome check |
| `npm run format` | Biome format-write |
| `npm test` | Vitest (offline, SDK stubbed) |
| `npm run test:watch` | Vitest in watch mode |
| `npm run build` | Compile to `dist/` |

After `npm run build`, the CLI is runnable as `node dist/cli/index.js …` or, after `npm link`, simply `agentqa …`.

## Running AgentQA against the example project

```bash
npm run build
node dist/cli/index.js run \
  --config examples/sample-next-app/agentqa.config.ts \
  --diff fixtures/diff-001/base..fixtures/diff-001/head \
  --reporter markdown \
  --reporter json
```

What you should see:

- A Markdown report printed to stdout, header `✅ AgentQA — N agents reviewed your diff` (or `❌` if the fixture trips the gate)
- `agentqa-report.json` written to the current working directory
- A `./.agentqa-cache/runs/<runId>/` directory with `run.json` and per-perspective logs

## Test posture (Cost Discipline — Constitution §V)

By default, **`npm test` never hits the network**. The orchestrator's `query()` calls are stubbed with canned event streams from `tests/fixtures/sdk-responses/`.

To run the (small) integration smoke that uses the real SDK:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export AGENTQA_TEST_BUDGET_USD=0.50          # absolute cap; the harness aborts past this
npm run test -- --include="tests/e2e/**"
```

The harness checks `AGENTQA_TEST_BUDGET_USD` before any live call; without it, e2e tests skip silently.

## Repo map (where things live)

| Path | What's there |
|---|---|
| [`GOAL.md`](../../GOAL.md) | Living top-level phase context — start here |
| [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) | Binding principles |
| [`specs/001-agentqa-mvp/`](.) | Phase-1 spec, plan, tasks, contracts, status |
| [`specs/001-agentqa-mvp/contracts/`](contracts/) | Zod schemas — single source of truth for public types |
| [`src/`](../../src/) | Implementation |
| [`tests/`](../../tests/) | Vitest suites + fixtures |
| [`examples/`](../../examples/) | Sample host projects with `agentqa.config.ts` |
| [`.claude/rules/`](../../.claude/rules/) | Workflow + tech-stack rules read by the AI agent |

## Working on a Block

The 4-hour MVP is broken into 8 blocks under [`tasks.md`](tasks.md). To pick one up:

1. Read the block's task list end-to-end before starting
2. Tick checkboxes in `tasks.md` as you land each task
3. End-of-block: run `npm run typecheck && npm run lint && npm test` — all green is required
4. Update [`delivery-status.md`](delivery-status.md) with **Done / Tested / Observed / Next** for the block
5. Open a PR — AgentQA will eventually be the reviewer of its own changes (dogfooding)

## Diagnostics

When something looks wrong:

1. `node dist/cli/index.js run --verbose …` — streams every perspective's tool calls
2. `./.agentqa-cache/runs/<runId>/run.json` — orchestrator-level lifecycle (config, IntentBundle, per-perspective costs)
3. `./.agentqa-cache/runs/<runId>/agents/<name>.log` — full SDK event stream for one perspective
4. CI: `gh run download <run-id>` to fetch the same artefact tree from a workflow run

## Cleanup

```bash
rm -rf .agentqa-cache dist .tsbuildinfo node_modules
```
