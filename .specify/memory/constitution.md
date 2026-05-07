<!--
Sync Impact Report
==================
Version change: — → 1.0.0
Modified principles: (initial adoption — no prior version)
Added sections: Core Principles ×5, Engineering Standards, Governance
Removed sections: none
Templates requiring updates:
  - ✅ /Users/ondrejmasek/Git/AgentQA/.claude/CLAUDE.md (workflow already aligned)
  - ✅ /Users/ondrejmasek/Git/AgentQA/.claude/rules/06-testing.md (Test-Before-Report enforced)
  - ⚠ /Users/ondrejmasek/Git/AgentQA/specs/001-agentqa-mvp/* (created in subsequent steps; principles must be honoured)
Follow-up TODOs: none
-->

# AgentQA Constitution

**Version**: 1.0.0
**Ratified**: 2026-05-07
**Last Amended**: 2026-05-07

This constitution governs every change to the AgentQA codebase. It is binding on humans, AI agents, and automated processes alike. Where it conflicts with another document, this document wins until amended through the procedure in §Governance.

---

## Core Principles

### I. Workflow Discipline

Every change that touches code MUST progress through the five-step loop:

1. **Understand** — read relevant code; for bugs, reproduce first
2. **Plan** — non-trivial work gets a plan and explicit user approval before coding
3. **Implement** — clean from the start; no TODOs, no commented-out blocks
4. **Test** — verified at runtime per §06-testing
5. **Report** — concise summary of what was done and what was tested

**Rationale**: Skipping steps produces partial work, regressions, and fictional completion claims. The cost of the loop is small; the cost of skipping it is rework, broken trust, and broken code.

### II. Test-Before-Report

Completion is NEVER claimed without runtime verification. "Tests pass" requires running them and reading the output, not asserting it. UI / CLI changes require an actual invocation of the affected surface; pure-data / contract changes require Vitest. If a change cannot be tested at runtime (docs, the constitution itself), the report must state so explicitly with the reason.

**Rationale**: AgentQA's product value is "find the issues humans miss" — we cannot ship a tool that lies about its own state. Reports that precede tests are themselves a regression we sell against.

### III. Simplicity & YAGNI

Build the smallest thing that solves the documented requirement. No speculative abstractions, no flags for hypothetical futures, no error handling for impossible states. Three similar lines beat a premature abstraction. Internal code trusts internal code; validation lives at boundaries (user input, external APIs, persisted artifacts).

**Rationale**: Every speculative line is a future maintenance tax with no proven ROI. AgentQA is a 4-hour MVP shaped to ship a working product fast — and a sustainable v2 base. Both demand restraint.

### IV. Pluggability — Zero Coupling to Host Projects

AgentQA MUST integrate into a host project via metadata only: a single config file (`agentqa.config.{ts,json}`), a single repo secret (`ANTHROPIC_API_KEY`), and a single workflow file (`.github/workflows/agentqa.yml`). No host application code may need to change for AgentQA to function. The CLI binary MUST run unmodified across Node 22 host repos regardless of framework.

**Rationale**: Adoption friction is the gating constant for the v1 wedge (small/solo teams without QA). Coupling kills it. Pluggability also enables both directions of compatibility: vibe-coded PRs and autonomous-coder loops.

### V. Cost Discipline

Every run MUST honour the configured `budget.maxTotalUsd`. The orchestrator MUST refuse to dispatch any agent whose projected cost would exceed the remaining budget. Default budgets MUST be conservative (≤ $0.50 per run unless explicitly raised in config). All test runs MUST stub the SDK by default; live SDK calls require an opt-in environment variable AND a separate `AGENTQA_TEST_BUDGET_USD` cap.

**Rationale**: An LLM swarm with no cost ceiling is a footgun aimed at small-team users — exactly the wedge we're protecting. Predictable cost is itself a feature, not an afterthought.

---

## Engineering Standards

These derive from the Core Principles and govern day-to-day code:

- **TypeScript strict** — `strict: true`, no implicit any, no untyped public surface
- **Schemas as source of truth** — every public type has a Zod schema under `specs/<phase>/contracts/`; TS types are inferred via `z.infer<>`
- **Versioned outputs** — emitted JSON includes `schemaVersion`; semver-bumped (additive = minor, breaking = major)
- **Deterministic exit codes** — `0` clean / `1` gate triggered / `2` budget exhausted / `3` config or usage error; documented and stable
- **Stable finding IDs** — `id = sha256(agent + ruleHint + file + lineRange)`; enables autonomous-coder loops to diff iterations
- **In-place PR comments** — sticky comment via `<!-- agentqa-comment -->` marker; never duplicate-post
- **No commented-out code; no TODO comments** — open an issue or do the work
- **Comments explain WHY, not WHAT** — naming carries the WHAT

---

## Governance

### Amendments

Amendments to this constitution require:

1. A written rationale (PR description or `delivery-status.md` entry)
2. Update to `Last Amended` and `Version` per the rules below
3. A Sync Impact Report (HTML comment at the top of this file) listing affected templates and their update status
4. Propagation to dependent files (`.claude/rules/*`, README, GOAL.md) in the same change

### Versioning

- **MAJOR** — backward-incompatible removal or redefinition of a Core Principle
- **MINOR** — new principle added, or materially expanded guidance under an existing principle
- **PATCH** — clarifications, wording, typo fixes, non-semantic refinements

### Compliance review

Every PR MUST be checked against the five Core Principles before merge. Failures block merge until corrected. AgentQA itself reviews its own PRs (dogfooding); a failing AgentQA gate is treated identically to any other failing required check.
