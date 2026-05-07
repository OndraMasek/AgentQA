# Implementation Plan: AgentQA MVP

**Branch**: `feature/customize-for-agentqa`
**Spec**: [`spec.md`](spec.md)
**Constitution**: [`../../.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.0.0

---

## Summary

Build a Node.js CLI + GitHub Action that, on every pull request, gathers a shared context bundle (diff, PR body, linked issues, commit messages, named project docs), spawns multiple specialised review perspectives in parallel via the Claude Agent SDK, deduplicates and prioritises their findings, and publishes results in two forms: a single in-place-updated PR comment (human) and a versioned JSON artefact (machine). v1 ships three built-in perspectives (functional verifier, regression scout, smoke runner) plus first-class custom perspectives. Total build budget: 4 hours from Block 1 onwards.

---

## Technical Context

| Field | Value |
|---|---|
| **Language / version** | TypeScript 5.7+ strict, Node.js 22 LTS |
| **Module format** | ESM only (`"type": "module"`) |
| **Primary dependencies** | `@anthropic-ai/claude-agent-sdk` (review-perspective dispatch), `zod` (contracts), `commander` + `picocolors` (CLI), `esbuild` (in-memory `.ts` config transform) |
| **External tools shelled out to** | `git` (always), `gh` (when available — PR/issue/comment ops); never with shell interpolation |
| **Storage** | Filesystem only — `./.agentqa-cache/runs/<runId>/` per-run audit trail; no DB |
| **Testing** | Vitest (unit + integration); fixture diffs and stubbed SDK responses for hermetic CI |
| **Lint / format** | Biome (single binary; replaces ESLint + Prettier) |
| **Target platforms** | GitHub Actions runner (primary); local dev (Linux/macOS); generic shell CI (secondary) |
| **Project type** | Single Node package with CLI + library entrypoints; no app, no service |
| **Performance goals** | NFR-002 — typical PR review ≤ 90 s wall-clock |
| **Cost goals** | NFR-001 + SC-007 — under USD 1.00 / median PR with default config |
| **Constraints** | NFR-003 — 5-min one-time setup; zero host-app code changes |
| **Scale / scope** | v1 — single repo per run; ≤ ~30 changed files typical PR; 3 default perspectives + N custom |
| **Outstanding NEEDS CLARIFICATION** | None — all wedge / agents / trigger / form-factor decisions are locked |

---

## Constitution Check

Each principle from [`../../.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.0.0, evaluated against this plan:

| Principle | Plan compliance | Evidence |
|---|---|---|
| **I. Workflow Discipline** | ✅ Pass | The 5-step loop is encoded in `.claude/CLAUDE.md` and exercised throughout — see `delivery-status.md` per-block entries. |
| **II. Test-Before-Report** | ✅ Pass | Every block in [`tasks.md`](tasks.md) ends with a verify step. Reporters and reducer ship with snapshot/round-trip tests; orchestrator with stubbed SDK; e2e with a fixture-diff smoke. Perspective prompts themselves are stochastic — only their *structured output shape* is asserted. |
| **III. Simplicity & YAGNI** | ✅ Pass | Out-of-Scope list (spec.md + GOAL.md) explicitly defers: a11y / contract / doc-UX perspectives, full-sweep mode, web UI, dashboards, fix mode, non-Claude providers, on-prem packaging. No DB, no bundler, no monorepo. |
| **IV. Pluggability** | ✅ Pass | Three-thing install contract (workflow file + secret + `init` command) — verified by NFR-003. No host-app code changes required. CLI binary unmodified across host frameworks. |
| **V. Cost Discipline** | ✅ Pass | `budget.maxTotalUsd` is a top-level config field with a conservative default; orchestrator runs cost projection pre-dispatch and drops lowest-priority perspectives until under budget. Default test posture stubs the SDK; live tests gated on `AGENTQA_TEST_BUDGET_USD`. |

**Result**: 5 / 5 pass. No violations to justify.

---

## Project Structure

### Documentation

```
GOAL.md                              # Living top-level phase context
.specify/
  memory/constitution.md             # v1.0.0 binding principles
  feature.json                       # → specs/001-agentqa-mvp
specs/
  001-agentqa-mvp/
    spec.md                          # Canonical speckit spec (WHAT + WHY)
    plan.md                          # This file
    research.md                      # Phase 0 — non-obvious decisions
    data-model.md                    # Phase 1 — entities derived from contracts
    quickstart.md                    # Phase 1 — contributor bring-up
    tasks.md                         # /speckit-tasks output (Blocks 1–8)
    delivery-status.md               # Living tracker
    checklists/
      requirements.md                # Spec-quality checklist
    contracts/
      config.schema.ts               # AgentQAConfig
      intent.schema.ts               # IntentBundle, ChangedFile, LinkedIssue, PRContext, RepoDoc
      finding.schema.ts              # Finding, Severity, LineRange
      report.schema.ts               # Report, PerAgentResult, ReportStatus
```

### Source code

```
AgentQA/
├── package.json                     # ESM, Node ≥ 22, bin: agentqa
├── tsconfig.json                    # strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes
├── biome.json
├── vitest.config.ts
├── src/
│   ├── cli/
│   │   ├── index.ts                 # Commander setup, shebang
│   │   ├── init.ts                  # Framework-aware default config
│   │   └── run.ts                   # Flag parsing → orchestrator
│   ├── core/
│   │   ├── orchestrator.ts          # diff → IntentBundle → swarm → reduce → report
│   │   ├── shell.ts                 # execFile-based wrapper; argv array; no shell interpolation
│   │   ├── diff.ts                  # git diff resolver
│   │   ├── intent.ts                # IntentBundle builder
│   │   ├── swarm.ts                 # Parallel query() fan-out + budget guard
│   │   └── reducer.ts               # Dedupe + priority sort
│   ├── agents/
│   │   ├── registry.ts              # defineAgent() + built-in registry
│   │   ├── functional/{prompt.md,index.ts}
│   │   ├── regression/{prompt.md,index.ts}
│   │   └── smoke/{prompt.md,index.ts}
│   ├── config/
│   │   ├── schema.ts                # re-exports contracts/config.schema.ts
│   │   └── load.ts                  # locate, transform, parse, validate
│   ├── reporters/
│   │   ├── json.ts
│   │   ├── markdown.ts
│   │   └── github-pr-comment.ts     # sticky via <!-- agentqa-comment --> marker
│   └── types.ts                     # z.infer<> re-exports
├── tests/
│   ├── config/
│   ├── core/
│   ├── reporters/
│   └── fixtures/
│       ├── repos/basic/             # tiny git repo with base + head commits
│       ├── configs/                 # valid + invalid configs
│       └── sdk-responses/           # recorded query() streams
├── examples/
│   └── sample-next-app/
│       ├── package.json
│       └── agentqa.config.ts
└── .github/
    └── workflows/
        ├── ci.yml                   # AgentQA's own CI
        └── agentqa.yml              # Template host projects copy
```

---

## Phase 0: Outline & Research

Output: [`research.md`](research.md). Non-obvious decisions documented as Decision / Rationale / Alternatives. Highlights:

- **Claude Agent SDK** chosen over raw Anthropic API for built-in subagent dispatch + bounded budgets + hooks. Without it, the 4-hour budget is not credible.
- **`gh` CLI shell-out** chosen over `@octokit/rest` to avoid pulling Octokit + auth-token plumbing into the CLI bundle. `gh` is pre-installed on GitHub Actions runners; documented prerequisite for non-GH CI.
- **Filesystem audit trail** chosen over SQLite to keep zero-runtime-dependency install. Per-run JSON in `./.agentqa-cache/runs/<runId>/`.
- **Sticky comment via HTML-comment marker** (`<!-- agentqa-comment -->`) — simplest reliable pattern; no need for a database of comment IDs.
- **Stable finding ID = hash of (agent, ruleHint, file, lineRange)** — `ruleHint` is a required field so dedupe across runs is meaningful even when message text drifts.
- **In-memory `esbuild` transform** for `.ts` configs — no separate build step; same TS toolchain users already have.

All NEEDS CLARIFICATION resolved (zero remaining; see Technical Context).

---

## Phase 1: Design & Contracts

Output: [`data-model.md`](data-model.md), [`contracts/`](contracts/), [`quickstart.md`](quickstart.md), agent-context update (`.claude/rules/10-tech-stack.md` already aligned in Block 0).

### Pipeline detail

#### 1. Config load (`src/config/load.ts`)
- Locate `agentqa.config.{ts,json}` (CWD upward) or path from `--config`
- For `.ts` configs, transpile via `esbuild` API in-memory; never write to disk
- Validate with `AgentQAConfigSchema`; on failure, exit `3` with the offending Zod path

#### 2. Diff resolver (`src/core/diff.ts`)
- `git rev-parse <base> <head>` — validate refs exist; surface clear error if not
- `git diff --name-status <base>...<head>` → `ChangedFile[]`
- Filter against per-perspective `scope` globs at dispatch time (one diff fetched, many perspectives intersect)

#### 3. IntentBundle build (`src/core/intent.ts`)
- PR context only available in CI mode (`GITHUB_EVENT_PATH`); otherwise `pr` field omitted
- Linked-issue extraction: regex `/(?:fixes|closes|resolves)\s+#(\d+)/i` over PR body + commits
- For each ID: `gh issue view <num> --json title,body` (skip silently when `gh` not available)
- Commits: `git log --pretty=%B <base>..<head>`
- `contextDocs` paths: read once into memory
- Validate against `IntentBundleSchema` before dispatch

#### 4. Swarm dispatch (`src/core/swarm.ts`)
- Cost projection per perspective via SDK pricing constants
- If sum > `budget.maxTotalUsd` → drop lowest-priority perspectives until under budget; record drops in `Report.perAgent[].status = "budget-skipped"`
- `Promise.allSettled([query(p1), query(p2), …])` — perspectives never block one another
- Per-perspective `AbortController` timeout (`maxTurns`, `timeoutMs`)
- Each perspective's last assistant message MUST be a JSON code block matching `Finding[]`; on parse failure, synthesise a meta finding (`agent: "meta"`, `severity: "low"`)

#### 5. Reduce (`src/core/reducer.ts`)
- Group by `(file, lineRange ?? null, ruleHint)`; keep highest severity; merge messages with `"\n\n— also: "`
- Stable sort: severity DESC → file ASC → lineRange.start ASC → agent ASC
- Compute `id = sha256(agent + ruleHint + file + lineRange)` for the canonical finding in each group

#### 6. Report (`src/reporters/`)
- Always write `agentqa-report.json` validated against `ReportSchema`
- If config includes `markdown` → write `agentqa-report.md` and print to stdout
- If config includes `github-pr-comment` AND `GITHUB_TOKEN` is present → find-or-create sticky comment via `gh api`
- Set exit code: `0` clean / `1` gate triggered / `2` budget exhausted / `3` config or usage error

### Subprocess discipline

All subprocess invocations (`git`, `gh`) MUST go through `src/core/shell.ts`, which uses Node's `execFile`-style API with an explicit argv array — no shell interpolation, no string concatenation. Enforced by Constitution §IV (Pluggability) and general security hygiene.

---

## Phase 2: Task Planning Approach

This section describes what `/speckit-tasks` does — it does NOT execute it. (Already executed; output is [`tasks.md`](tasks.md).)

**Task generation strategy**:
- Each pipeline stage in §"Pipeline detail" maps to one block in `tasks.md`
- Each block ends with a verifiable test (Vitest unit, snapshot, or e2e smoke) per Constitution §II
- Blocks are ordered to permit incremental verification: contracts → config → diff → intent → swarm → agents → reduce → report → CI template → e2e

**Estimated output**: 8 blocks, ~50 individually checkboxable tasks, total ~4 hours from Block 1 start.

---

## Complexity Tracking

| Concern | Status |
|---|---|
| Custom perspectives could grow unbounded | Mitigated by cost projection + budget; perspective count is a config concern, not architectural |
| Multi-agent dedupe is the most error-prone surface | Mitigated by `ruleHint` requirement on every Finding + exhaustive Vitest cases on the reducer |
| Stochastic LLM output undermines test determinism | Mitigated by stubbing `query()` in unit tests + recording fixture responses for replay |
| `gh` CLI absence in non-GH CI | Mitigated by graceful degradation: linked-issues drop silently; documented in quickstart |
| `query()` API surface is the only external contract we can't fully mock | Mitigated by a thin `src/core/swarm.ts` adapter that the rest of the codebase calls into; SDK upgrades touch one file |

No principle violations to justify — see Constitution Check above.

---

## Progress Tracking

| Phase | Status | Output |
|---|---|---|
| Phase 0 — Research | ✅ complete | [`research.md`](research.md) |
| Phase 1 — Design & Contracts | ✅ complete | [`data-model.md`](data-model.md), [`contracts/`](contracts/), [`quickstart.md`](quickstart.md) |
| Phase 2 — Task planning (description only) | ✅ complete | [`tasks.md`](tasks.md) |
| Implementation | 🟡 in progress (Block 1 ✅; Blocks 2–8 pending) | source under `src/` |

Re-evaluation of Constitution Check post-design: 5 / 5 still pass. Subprocess-discipline addition under §"Pipeline detail" reinforces Pluggability (§IV); no change to other principles.
