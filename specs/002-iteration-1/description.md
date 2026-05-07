# Iteration 1 — Solution Description (speckit input)

> This is the seed description for **Phase 002 — Iteration 1**. It will be ingested by speckit (`/speckit-specify`) to produce `spec.md`, then `plan.md`, then `tasks.md` in this folder. It is also the canonical short-form description of the AgentQA solution at the close of the MVP.

**Phase**: `002-iteration-1`
**Created**: 2026-05-07
**Predecessor phase**: [`001-agentqa-mvp`](../001-agentqa-mvp/) — MVP shipped, see [`delivery-status.md`](../001-agentqa-mvp/delivery-status.md)
**Constitution**: [`/.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.0.0 — binding

---

## 1. What AgentQA is

AgentQA is a pluggable, AI-driven QA layer that runs a small swarm of specialised Claude agents against every delivery iteration of a host software project — catching the issues unit tests, linters, and humans miss, without adding QA headcount. The wedge is **solo developers and small teams without dedicated QA**, shipping TypeScript/JavaScript projects on GitHub, who want every pull request reviewed automatically — from multiple perspectives — before merge.

The v1 form factor is a **GitHub Action** (primary surface) plus a **Node CLI** (`npx agentqa`, same logic, runnable locally). Adoption requires three things: copy a workflow file, add an `ANTHROPIC_API_KEY` repo secret, run `npx agentqa init` once. No host application code changes. No QA headcount. No new dashboard to log into.

---

## 2. The problem it solves

Small teams ship faster than their review capacity. The failure modes are concrete and recurring:

- **Regression-by-omission** — a refactor changes a function's contract; the diff looks reasonable in isolation; the bug surfaces three weeks later in a code path nobody thought to retest. Linters and unit tests don't surface it because they don't reason about caller adjacency.
- **Intent drift** — a PR titled "Add feature X" ships something that *resembles* feature X but misses an explicit requirement from the linked issue. Human reviewers, deep in the diff, miss the gap. Unit tests pass because they were written against the actual implementation, not the original intent.
- **Vibe-coded and autonomous-coder PRs** — increasingly, PRs are authored by AI assistants iterating against a goal. They produce more diffs per unit time than humans can review carefully. Without an automated review layer, quality regresses to whatever the last `npm test` confirmed.
- **No QA budget** — the team can afford neither a contractor nor an in-house QA hire. The team also cannot afford to slow down enough for senior engineers to do exhaustive reviews on every change.

AgentQA does not replace human review. It catches the class of issues that a focused reviewer with infinite time would catch, and surfaces them on the PR in seconds — so the human review can spend its limited budget on judgement calls, not bug-hunting.

---

## 3. How it works (high level)

Per pull request:

1. **Trigger** — GitHub Action fires on `pull_request` (opened / synchronize / reopened). Locally, the CLI fires on demand with `npx agentqa run --diff <base>..<head>`.
2. **Resolve diff** — the orchestrator computes the changed-file set between the PR base and head commits. Renames detected; deletes preserved.
3. **Build IntentBundle** — a single shared context package built from artifacts that *always* exist regardless of how the code was authored: the unified diff, the PR title and body, the contents of any linked issues (`Fixes #123` parsed from PR body and commit messages), the recent commit messages on the branch, and any project documents named in `agentqa.config.ts`. Every review perspective receives the *identical* IntentBundle.
4. **Dispatch swarm** — N review perspectives run in parallel via `@anthropic-ai/claude-agent-sdk`. Each perspective is a focused role with its own prompt, tool permissions, scope, severity floor, time budget, and cost share. The orchestrator enforces the configured `budget.maxTotalUsd` *before* dispatch — perspectives whose projected cost would exceed the remaining budget are dropped (lowest-priority first), and the report says so honestly.
5. **Reduce** — findings from all perspectives are merged, deduplicated by `(file, lineRange, ruleHint)`, prioritised by severity, and assigned a stable `id = sha256(agent + ruleHint + file + lineRange)` so downstream tools can diff one run against the next and tell what was resolved vs. what persists.
6. **Report** — two outputs per run:
   - A single sticky **Markdown comment** on the PR (find-or-update via the `<!-- agentqa-comment -->` marker; never duplicate-posts on subsequent pushes).
   - A versioned, Zod-validated **JSON artifact** (`agentqa-report.json`) suitable for autonomous consumers — coding agents, dashboards, future analytics.
7. **Gate** — exit code is deterministic: `0` clean, `1` gate triggered (any finding ≥ `gate.failOn`), `2` budget exhausted, `3` config or usage error. The PR check turns red iff the gate triggers.

### Built-in review perspectives (v1)

Three ship with the MVP, each scoped to a different failure mode:

- **Functional verifier** — reads the diff alongside the PR description and linked issues; judges whether the change *does what it claims*. When intent is empty (no body, no linked issue), falls back to internal-consistency mode (callers vs. signatures).
- **Regression scout** — surveys non-diff code adjacent to the change (callers, callees, modules with similar shape) and flags accidental impact zones. The reviewer that catches "you changed this function's contract but forgot the three other places that call it."
- **Smoke runner** — hits a preview URL (or boots a dev server), exercises golden-path routes, reports failures. The cheap end-to-end check that "the home page still renders."

### Custom review perspectives are first-class

`defineAgent()` in `agentqa.config.ts` adds a project-specific perspective — billing-rules compliance, terminology consistency, a domain invariant — with the same dispatch path, same budget rules, and same reporting surface as the built-ins. No fork, no plugin SDK, no separate runtime.

---

## 4. What's already shipped (Phase 001 — MVP)

The MVP is implemented end-to-end. Full implementation log: [`specs/001-agentqa-mvp/delivery-status.md`](../001-agentqa-mvp/delivery-status.md).

Highlights:

- CLI (`agentqa init`, `agentqa run`) with framework-aware scaffolding for Next.js, Vite, Remix, plain Node
- Single-process orchestrator: diff resolver, IntentBundle builder, parallel `query()` swarm, deterministic reducer
- Three built-in perspectives (functional, regression, smoke), each with its own prompt + scope
- Markdown reporter (sticky PR comment) + JSON reporter (Zod-validated, schema-versioned)
- Pre-dispatch budget projection enforces `budget.maxTotalUsd`; per-agent timeout via `AbortController`
- GitHub Action template (`.github/workflows/agentqa.yml`) — runs on every PR, uploads run artifacts, concurrency-keyed on PR number
- Per-run audit trail under `./.agentqa-cache/runs/<runId>/`
- Stable finding IDs; sticky PR comment marker; deterministic exit codes (0 / 1 / 2 / 3)
- Tests: **24 / 24 passing** in 1.48 s; typecheck and build clean
- Constitution v1.0.0 ratified; five Core Principles binding on every change
- Spec-kit phase-1 artifacts complete: spec, plan, tasks, contracts (4 schemas), research, data-model, quickstart

The MVP is **functional but unvalidated against live SDK calls**. Three success criteria from the phase-1 spec require real-PR validation outside the implementation session and remain open: SC-002 (95% under 90 s), SC-003 (intent-gap detection on real diffs), SC-005 (false-block rate under 5%).

---

## 5. Where iteration 1 picks up

Iteration 1 starts from a working MVP and a known list of open ground. The themes below are **candidates**, not commitments — the speckit run will pick the actual scope. Source of truth for every item: [`specs/001-agentqa-mvp/delivery-status.md`](../001-agentqa-mvp/delivery-status.md).

### Validation (highest leverage — unblocks the unmeasured success criteria)

- Manual smoke against a private throwaway repo: install the workflow, open a real PR, confirm the action fires within budget, posts a sticky comment, and updates the same comment on a second push (validates SC-002, SC-004, SC-006).
- Recorded SDK-response fixtures from at least one real run, persisted under `tests/fixtures/sdk-responses/` so future tests can replay without spend.
- A documented "what to expect on first install" walkthrough — the gap between `agentqa init` and a green check on a real PR.

### Hardening (de-risk before any external user touches it)

- Pin a real `@anthropic-ai/claude-agent-sdk` version (currently `^0.1.0` placeholder); verify the import surface against the actual published API.
- Address the five moderate transitive vulnerabilities from `npm audit` (deferred per Constitution §III during MVP; revisit now).
- Reconcile default `budget.maxTotalUsd: 0.5` against default per-perspective projection (15 turns × $0.04 = $0.60). Today, with both defaults, one perspective is dropped on every run. Either lower default `maxTurns`, raise default budget, or document the tradeoff explicitly. Pick one.
- Surface budget-skip events more visibly in the Markdown report — currently honest but quiet.

### Polish (adoption-friction reduction)

- Publish to npm as `agentqa` (or a scoped name if taken). Today the workflow template's `npx agentqa@latest` resolves to nothing.
- Refresh `examples/sample-next-app/` against the latest Next.js — the fixture diff is currently minimal and stale-prone.
- README "what you'll see on your first PR" section with a real screenshot.
- `agentqa --version` / `agentqa --help` parity check against `commander`'s defaults; expand `--help` examples.

### Stretch (only if validation + hardening land in budget)

- First additional built-in perspective. Most-requested candidates from the phase-1 out-of-scope list: **a11y reviewer** (semantic / contrast / keyboard issues on changed components) and **API-contract checker** (changed routes vs. OpenAPI / tRPC / GraphQL schema). Pick one, ship one. Don't ship both — Constitution §III applies.

### Explicit non-goals for iteration 1

- Web UI / dashboard — still v2 territory.
- Non-Claude model providers — still v2.
- Cross-iteration analytics ("regression rate over time").
- "Fix mode" — perspectives proposing patches.
- Editor / live-watch mode.
- Per-release / full-codebase sweep mode.

---

## 6. Constraints (binding)

These derive from [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.0.0 and from locked decisions in the phase-1 research log. Iteration 1 must not violate them.

### Five Core Principles

1. **Workflow Discipline** — every code change progresses through Understand → Plan → Implement → Test → Report. No skipped steps.
2. **Test-Before-Report** — completion is never claimed without runtime verification. Saying "tests pass" requires running them and reading the output.
3. **Simplicity & YAGNI** — build the smallest thing that solves the documented requirement. Three similar lines beat a premature abstraction.
4. **Pluggability — Zero Coupling to Host Projects** — host projects integrate via metadata only (config file + secret + workflow file). No host app code changes.
5. **Cost Discipline** — every run honours `budget.maxTotalUsd`; default ≤ $0.50; tests stub the SDK by default; live SDK calls require an opt-in env var plus a separate `AGENTQA_TEST_BUDGET_USD` cap.

### Locked technical decisions (do not re-litigate)

- TypeScript 5.5+ strict, ESM-only, Node.js 22 LTS
- `@anthropic-ai/claude-agent-sdk` is the orchestration layer; no fallback orchestrator
- Zod schemas under `specs/<phase>/contracts/` are the single source of truth; types are inferred via `z.infer<>`
- Emitted JSON carries `schemaVersion`; bumps follow semver (additive = minor; breaking = major)
- Exit codes: `0` clean, `1` gate triggered, `2` budget exhausted, `3` config or usage error — stable, documented
- Stable finding ID: `sha256(agent + ruleHint + file + lineRange)`
- Sticky PR comment marker: `<!-- agentqa-comment -->`
- All subprocess invocation goes through `src/core/shell.ts` (the only shell seam — explicit `argv` array, never string concatenation)
- GitHub-first wedge for v1; non-GitHub CI works via the CLI but is not the headline surface
- Hand-rolled Markdown templates; no rendering library

---

## What speckit should produce from this

Running `/speckit-specify` against this file should yield a `spec.md` that:

- Restates the iteration-1 user story (a maintainer of an AgentQA-installed repo wants the MVP validated, hardened, and adopted on a real project) in canonical speckit shape
- Picks 3–5 concrete iteration-1 scenarios from §5 (the human running speckit chooses the theme weighting at this point)
- Derives Functional + Non-Functional Requirements and tech-agnostic Success Criteria from the chosen scope
- Stays inside the constraints in §6 — explicitly checks against them in the Constitution Check section
- Defers all implementation detail to `plan.md`

The downstream `plan.md` and `tasks.md` then derive the architecture and the block-by-block work order from there.
