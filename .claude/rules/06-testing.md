---
description: "Step 4: Testing — define DoD, run Vitest, smoke the CLI against fixture diffs, verify schemas, fix and repeat until passing"
---

# Step 4: Testing

**Every code change must be tested before reporting completion. No exceptions.**

## 4a. Define your Definition of Done

Before testing, **write out your DoD checklist in the conversation** so the user can see what you intend to verify. Example:

> **Definition of Done for this task:**
> - [ ] `npm run typecheck` is clean
> - [ ] New Vitest case covers the happy path AND the budget-exceeded edge case
> - [ ] `npx agentqa run --diff <fixture-base>..<fixture-head>` against `examples/sample-next-app` produces a Markdown report with at least one finding from each enabled agent
> - [ ] Emitted `agentqa-report.json` validates against `report.schema.ts`

## 4b. What to test, by area

| Change area | How to test |
|---|---|
| `src/config/` | Vitest unit tests with valid + invalid fixture configs; assert Zod errors include the offending path |
| `src/core/diff.ts` | Vitest against fixture git repos under `tests/fixtures/repos/`; assert `ChangedFile[]` matches expectation |
| `src/core/intent.ts` | Vitest with mocked `gh` CLI (via `vi.mock` over a thin wrapper); assert `IntentBundle` includes PR body, linked issues, commit messages |
| `src/core/swarm.ts` | Vitest with a stubbed `query()` that returns canned `Finding[]`; assert parallelism, timeout enforcement, budget abort |
| `src/core/reducer.ts` | Vitest with hand-built `Finding[]` arrays; assert dedupe by `(file, lineRange, ruleHint)` and severity ordering |
| `src/agents/*` | Smoke test: `npx agentqa run --only <agent>` against a fixture diff in `examples/`; assert at least one well-formed finding |
| `src/reporters/markdown.ts` | Snapshot test against a deterministic `Report` fixture — diff the rendered Markdown string |
| `src/reporters/json.ts` | Round-trip test: write → re-parse → validate against `report.schema.ts` |
| GitHub Action | Manual dry-run on a throwaway PR (see 4c) |

Agent prompts themselves are stochastic. We do NOT snapshot their text output. We snapshot the *structure* (Zod-validated `Finding[]`) and assert non-empty / well-formed at that layer.

## 4c. End-to-end smoke against a fixture host project

The repo ships `examples/sample-next-app/` — a minimal Next.js project with a fixture diff (`fixtures/diff-001/{base,head}/`) the agents can review. Use it for end-to-end runs.

```bash
# From the repo root
npm run build
node dist/cli/index.js run \
  --config examples/sample-next-app/agentqa.config.ts \
  --diff fixtures/diff-001/base..fixtures/diff-001/head \
  --reporter markdown \
  --reporter json
```

Expected:
- Exit code `0` (or `1` if the fixture diff intentionally trips the gate — documented per fixture)
- Markdown printed to stdout with header line `✅ AgentQA — N agents reviewed your diff` (or `❌` if gated)
- `agentqa-report.json` written to CWD; validates against `specs/001-agentqa-mvp/contracts/report.schema.ts`

For CI / Action verification, push a branch with a known-bad change to a private throwaway repo that has the AgentQA workflow installed, and confirm:
- The Action completes within the 90 s budget
- A single sticky comment appears on the PR
- A second push edits the same comment (no duplicates)
- The check is red iff the fixture diff includes a finding ≥ `gate.failOn`

## 4d. Cost discipline during testing

Real `query()` calls cost money. Default test posture:

- **Unit tests**: stub `query()`. Never hit the network. CI must be runnable offline.
- **Integration smoke**: real SDK calls allowed but capped — set `budget.maxTotalUsd: 0.10` per run in the test config; CI enforces a global `AGENTQA_TEST_BUDGET_USD=0.50` env var that the harness checks before any live invocation.
- **Recording**: when a real run produces interesting output, persist the `query()` response stream as a fixture under `tests/fixtures/sdk-responses/` so future tests can replay it.

## 4e. Non-testable changes

Docs, the constitution, GOAL.md, `.claude/rules/*` updates: explicitly state in the report why no runtime test is needed.

## 4f. Diagnostics

When something looks wrong, check these in order:

1. **CLI verbose mode**: `npx agentqa run --verbose` streams every agent's tool calls and final structured output. First place to look.
2. **Per-agent transcript logs**: `./.agentqa-cache/runs/<runId>/agents/<agent>.log` — full SDK event stream per agent. Persisted across runs (gitignored).
3. **Latest run summary**: `./.agentqa-cache/runs/<runId>/run.json` — orchestrator-level lifecycle (config, IntentBundle, per-agent costs, final report).
4. **GitHub Action logs**: in CI mode, the Action also uploads the `runs/<runId>/` directory as an artifact — `gh run download <run-id>` to inspect.

If a finding is unexpectedly missing or extra, reproduce locally with `--only <agent> --verbose --diff <same-refs>` and compare the agent's tool calls against expectation. Agent prompts live under `src/agents/<name>/prompt.md` — edit there, not in code.
