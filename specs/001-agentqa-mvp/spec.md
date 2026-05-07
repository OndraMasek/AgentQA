# Feature Specification: AgentQA MVP

**Feature Directory**: `specs/001-agentqa-mvp/`
**Created**: 2026-05-07
**Status**: Draft (re-authored to canonical speckit format)
**Input**: AgentQA — pluggable, AI-driven QA layer that runs a swarm of specialised review perspectives on every delivery iteration of a host project, catching the issues unit tests, linters, and humans miss, without adding QA headcount. v1 wedge: small/solo dev teams without dedicated QA, shipping TS/JS web projects on GitHub.

---

## User Scenarios & Testing

### Primary User Story

A small dev team without dedicated QA wants every pull request reviewed automatically, from multiple perspectives, before merge. They install AgentQA once on their project, then on every PR a single sticky comment appears with prioritised findings — the team reads it, fixes anything that matters, and merges with confidence. When a finding is severe enough, the merge check blocks the merge until it's addressed.

### Acceptance Scenarios

1. **First-time install** — Given a TS/JS web project on GitHub, when the project owner copies in the workflow file, adds an LLM-provider secret, and runs the one-time setup command, then the project is ready to receive automated reviews on the next pull request, with no application code changes required.

2. **Pull request opened** — Given a configured project, when a developer opens a pull request, then within roughly 90 seconds a single comment appears on the PR containing prioritised findings from multiple review perspectives, organised by severity.

3. **Pull request updated** — Given a pull request that already has an AgentQA review comment, when the developer pushes a fix, then the same comment is updated in place; the PR timeline never accumulates duplicate review comments.

4. **Severe finding gates merge** — Given a configuration that gates on critical findings, when any review perspective surfaces a critical issue, then the merge check fails until the issue is addressed; otherwise the check passes.

5. **Hand-coded PR with linked issue** — Given a pull request whose body says "Fixes #123" but contains no other description, when AgentQA runs, then the linked issue's title and body are pulled in and inform the functional review of whether the change addresses the issue.

6. **Custom review perspective** — Given a project-specific concern not covered by built-in perspectives (e.g. billing-rules compliance), when the project owner defines a custom perspective in configuration, then it runs alongside the built-ins on every PR with the same outputs and gating.

7. **Local reproduction** — Given a developer wants to debug a finding before pushing, when they run AgentQA locally against the same diff range as the CI run, then they see the same review the CI would produce.

8. **Iteration by an autonomous tool** — Given an autonomous tool that opens PRs and reads back review output to push fixes, when the tool runs against a PR multiple times, then it can determine from the machine-readable output alone which findings were resolved and which persist.

### Edge Cases

- **No stated intent** — When both the PR description and linked issues are empty, functional review must still produce useful output by examining internal consistency of the diff (e.g. callers vs. signatures); it must not fail or block.
- **Cost ceiling reached mid-run** — When projected work would exceed the configured budget, the system drops lower-priority perspectives and reports the partial result honestly (rather than silently truncating).
- **Perspective times out** — When a perspective exceeds its time budget, it is marked incomplete in the report; any partial findings already produced are preserved; other perspectives are unaffected.
- **Non-GitHub CI** — The local CLI works the same way; only the GitHub-specific commenter is skipped.
- **Repository not a Git repo** — Setup command fails fast with a clear message rather than producing a broken config.
- **No LLM-provider key configured** — Run fails fast with a clear message identifying the missing secret.

---

## Requirements

### Functional Requirements

- **FR-001 — Per-PR automated review**: System MUST run automatically on every pull request, scoped to the diff between the PR's base and head commits.
- **FR-002 — Multi-perspective review**: System MUST run multiple specialised review perspectives in parallel on each pull request. Initial release ships three built-in perspectives: functional verification, regression scouting, and smoke verification of golden-path behaviour.
- **FR-003 — Custom perspectives**: System MUST allow the project owner to define custom review perspectives in configuration, specifying name, role instructions, scope, and outputs. Custom perspectives MUST be first-class — same dispatch, same budget rules, same reporting path as built-ins.
- **FR-004 — Single-file configuration**: System MUST be configurable through one configuration file at the project root. A one-time setup command MUST scaffold sensible defaults based on detected project type, with no application code changes required.
- **FR-005 — Shared review context**: Before review, the system MUST gather context that exists regardless of how the code was authored: the diff, the pull request title and description, contents of any linked issues, commit messages on the branch, and project documents named in the configuration. Every perspective MUST receive the identical context package.
- **FR-006 — Two output forms**: System MUST publish results per run in two forms — a single human-readable comment on the pull request, updated in place on subsequent pushes, and a machine-readable artefact suitable for downstream automation.
- **FR-007 — Configurable merge gate**: System MUST signal merge readiness through a check based on a configurable severity threshold. When any finding meets or exceeds the threshold, the merge check MUST fail.
- **FR-008 — Local equivalence**: System MUST support running the same review locally on demand, scoped to any chosen diff range, producing the same outputs as the CI run.
- **FR-009 — Stable finding identifiers**: System MUST emit a stable identifier per finding such that downstream automation can determine, across runs, whether a finding from a previous run was resolved or persists.

### Non-Functional Requirements

- **NFR-001 — Cost ceiling**: Every run MUST honour a configurable per-run cost ceiling. The system MUST NOT initiate work that would exceed the remaining budget; instead it MUST drop lower-priority perspectives and report the reduction honestly. Default ceiling MUST be conservative enough that solo teams cannot incur surprise charges from default usage.
- **NFR-002 — Time to result**: A typical pull request review (small diff, default perspectives) MUST complete within 90 seconds wall-clock end-to-end.
- **NFR-003 — Adoption friction**: A new project MUST be able to adopt the system in under 5 minutes of one-time setup. The only secrets required MUST be the LLM-provider key.
- **NFR-004 — Versioned, stable machine output**: The machine-readable output MUST carry a schema version and use stable finding identifiers, enabling downstream tools to consume results reliably across runs.
- **NFR-005 — Per-run audit trail**: Every run MUST persist an inspectable record of the configuration used, the context gathered, and the per-perspective outcomes and costs.
- **NFR-006 — Idempotent commenting**: When the same pull request is reviewed multiple times, the project's PR timeline MUST show exactly one AgentQA comment, updated in place — never duplicates.

---

## Success Criteria

- **SC-001**: A project owner completes first-time setup on a TS/JS web project in 5 minutes or less, with no application code changes.
- **SC-002**: 95% of pull requests under default configuration receive their review comment within 90 seconds of opening.
- **SC-003**: For pull requests where the change does not match the stated intent (PR description or linked issue), at least one review perspective surfaces the discrepancy.
- **SC-004**: After 5 consecutive pushes to the same pull request, the project's PR timeline shows exactly one AgentQA review comment.
- **SC-005**: For pull requests that should pass, the merge gate produces a false-block in fewer than 5% of cases under default settings (measured on a representative 100-PR sample).
- **SC-006**: An autonomous tool can determine, using only the machine-readable output, which findings from the previous run were resolved and which persist — with no human reading or text matching required.
- **SC-007**: A team using default configuration stays under USD 1.00 per pull request on the median pull request.
- **SC-008**: For pull requests with both an empty body and no linked issues, functional review still produces at least one well-formed finding or a clean pass — never a runtime failure.

---

## Key Entities

- **Project Configuration** — Declares which review perspectives are enabled, their scope, the merge-gate threshold, and the cost ceiling.
- **Diff** — The set of files changed between two commits, including each file's change kind (added, modified, deleted, renamed).
- **Context Bundle** — The shared package given to every review perspective: diff, PR title and description, linked-issue contents, commit messages, named project documents.
- **Review Perspective** — One reviewer (built-in or custom) with a focused role, scope, time budget, and cost budget. Produces a list of findings.
- **Finding** — One observation: severity, location (file and optional line range), category hint, message, optional evidence, stable identifier.
- **Review Report** — The merged, deduplicated, prioritised output of a single run: overall status, total cost, total time, per-perspective summary, the list of findings.

---

## Assumptions

- Host project lives in a Git repository.
- Host project uses GitHub for code review. Other platforms are supported via the local CLI but not the headline experience in v1.
- Host project's primary language is TypeScript or JavaScript. Initial framework detection covers Next.js, Vite, Remix, and plain Node.
- The project owner can set repository secrets.
- An LLM-provider key is available to the project owner.
- Pull request authors include a description, a linked issue, or both for non-trivial changes. (When both are absent, see SC-008 for the fallback behaviour.)

---

## Out of Scope (v1)

- Accessibility, API contract, security, and copy/UX review perspectives (deferred to a later phase).
- Per-release or full-codebase sweep mode — v1 reviews per-PR diffs only.
- Web UI or dashboard.
- Cross-iteration analytics ("regression rate over time").
- "Fix mode" — perspectives proposing patches in addition to surfacing findings.
- On-premises deployment, SSO, audit logging beyond the per-run audit trail.
- Non-GitHub primary CI (works via CLI; not the polished surface in v1).
- Non-Claude model providers (architecture allows it; not exposed in v1).
- Editor / live-watch mode.
