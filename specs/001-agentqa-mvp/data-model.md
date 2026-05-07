# Phase 1 Data Model — AgentQA MVP

Entities derived from the spec's Key Entities section. Authoritative shape lives in [`contracts/`](contracts/) as Zod schemas — this document narrates fields, relationships, validation rules, and lifecycle. When in doubt, the schema wins.

---

## ProjectConfiguration

Source of truth: [`contracts/config.schema.ts`](contracts/config.schema.ts) — `AgentQAConfigSchema`.

| Field | Type | Default | Notes |
|---|---|---|---|
| `agents.functional` | `FunctionalAgentConfig?` | enabled | Built-in functional verifier config |
| `agents.regression` | `RegressionAgentConfig?` | enabled | Adds `depth: "shallow" \| "deep"` (default `shallow`) |
| `agents.smoke` | `SmokeAgentConfig?` | enabled iff project has `dev`/`start` script | Adds `baseUrl?`, `routes[]` |
| `agents.custom` | `CustomAgentConfig[]` | `[]` | First-class — same dispatch + budget rules as built-ins |
| `intentSources` | `IntentSource[]` | `["pr-body","linked-issues","commit-messages"]` | Which signals to fold into the IntentBundle |
| `contextDocs` | `string[]` | `[]` | Paths read once and shared with every perspective |
| `reporters` | `ReporterName[]` | `["json","markdown","github-pr-comment"]` | Order ≠ priority |
| `gate.failOn` | `Severity[]` | `["critical"]` | Any matching finding fails the merge check |
| `budget.maxTotalUsd` | `number > 0` | `0.5` | Hard cap; orchestrator refuses to over-spend |

### Custom perspective shape

`CustomAgentConfig` extends the per-perspective base with:

- `name` — `^[a-z0-9-]+$`; appears as `Finding.agent`
- `prompt` — system prompt; instructions MUST end by demanding a JSON block matching `Finding[]`
- `tools` — subset of `["Read","Grep","Glob","Bash","WebFetch"]`; default `["Read","Grep"]`

### Validation rules

- All bounded numerics are positive: `maxTurns > 0`, `timeoutMs > 0`, `maxTotalUsd > 0`
- `name` for custom perspectives is unique within `agents.custom[]` (enforced by the loader)
- `severityFloor`, when present, must be ≤ severity of any kept finding from that perspective; lower severities are dropped at the perspective boundary

### Lifecycle

`init` (CLI) writes a default config given detected framework → user may edit → `load.ts` reads + validates per run → orchestrator passes the validated record onward. The config file is never written to by the orchestrator at runtime.

---

## Diff

Source of truth: `IntentBundleSchema.diff` in [`contracts/intent.schema.ts`](contracts/intent.schema.ts).

| Field | Type | Notes |
|---|---|---|
| `base` | `string` | Resolved commit SHA |
| `head` | `string` | Resolved commit SHA |
| `files` | `ChangedFile[]` | Each entry: `{ path, kind, previousPath? }` |
| `raw` | `string` | Full unified diff text — given to perspectives that need patch context |

`ChangeKind` ∈ `{added, modified, deleted, renamed}`. `previousPath` only set when `kind === "renamed"`.

### Validation rules

- `base` and `head` must be valid Git refs (verified via `git rev-parse` before bundle is built; failure exits `3`)
- `files` may be empty (no-op PR — orchestrator skips dispatch and emits a clean report)

---

## IntentBundle

Source of truth: [`contracts/intent.schema.ts`](contracts/intent.schema.ts) — `IntentBundleSchema`.

| Field | Type | Required | Notes |
|---|---|---|---|
| `diff` | `Diff` | yes | See above |
| `pr` | `PRContext?` | no | Present only in CI mode (`GITHUB_EVENT_PATH` set) |
| `linkedIssues` | `LinkedIssue[]` | yes (may be `[]`) | Extracted via regex from PR body + commits; fetched via `gh issue view` |
| `commitMessages` | `string[]` | yes (may be `[]`) | `git log --pretty=%B base..head` |
| `repoDocs` | `RepoDoc[]` | yes (may be `[]`) | Files named in `config.contextDocs`, read once |

### PRContext

`{ number, title, body, baseRef, headRef, repo }` — present only when running under GitHub Actions on a `pull_request` event.

### LinkedIssue

`{ id, title, body, source }` where `source ∈ {github, linear, jira, other}`. v1 only fetches `github`; the `source` field is forward-compat for v2.

### Built once per run, read by all perspectives

The orchestrator builds the IntentBundle once before dispatching any perspective. Every perspective sees the identical bundle — this is what makes findings comparable across perspectives and what keeps the cost low (one fetch, many readers).

### Validation rules

- All string fields trimmed; empty strings allowed for `pr.body`, `linkedIssue.body` (degraded-context path per spec edge cases)
- `repoDocs[].path` must resolve to a file inside the repo working tree
- `IntentBundleSchema` parsed before dispatch; failure aborts with exit `3`

---

## ReviewPerspective

Not a persisted entity — a runtime construct assembled from `ProjectConfiguration` + a built-in or custom `prompt.md` + `tools`. Each perspective is a record of:

- `name` (string, unique per run)
- `systemPrompt` (string — the prompt + IntentBundle stitched in)
- `allowedTools` (subset of the SDK tool set)
- `scope` (glob list; intersected with diff files at dispatch)
- `maxTurns`, `timeoutMs`, `severityFloor?`
- `priority` (derived: built-ins fixed; customs in declaration order)

**Lifecycle**: assembled by `src/agents/registry.ts` per run → handed to `src/core/swarm.ts` → executed via `query()` → produces a `Finding[]` (parsed from the perspective's final assistant JSON block).

**Failure modes**:
- Perspective times out → `PerAgentResult.status = "timeout"`, partial findings preserved
- Perspective output unparseable as `Finding[]` → synthesise meta-finding `{agent: "meta", severity: "low", ruleHint: "perspective-output-malformed"}`
- Perspective skipped because projected cost exceeds remaining budget → `PerAgentResult.status = "budget-skipped"`, zero findings

---

## Finding

Source of truth: [`contracts/finding.schema.ts`](contracts/finding.schema.ts) — `FindingSchema`.

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | `string` | yes | sha256 hex; computed by reducer per R-010 |
| `agent` | `string` | yes | Name of the producing perspective; `meta` reserved for synthesised findings |
| `ruleHint` | `string` | yes | Stable category — e.g. `unhandled-async`, `regression-impact`, `smoke-failure-500` |
| `severity` | `Severity` | yes | `critical \| high \| medium \| low` |
| `file` | `string` | yes | Path relative to repo root |
| `lineRange` | `LineRange?` | no | `{start, end}`; both ≥ 0; `end ≥ start` |
| `message` | `string` | yes | Human-readable explanation; merged across duplicates with `"\n\n— also: "` |
| `evidence` | `string?` | no | Code snippet, log line, etc. |
| `incomplete` | `boolean?` | no | `true` when produced by a timed-out perspective |

### Stable identity invariant

Two findings produced in **different runs** that describe the same concern at the same location MUST produce the same `id`. This is what makes FR-009 / SC-006 (autonomous-tool resolved-vs-persisting determination) work.

The composition `(agent, ruleHint, file, lineRange)` is the key — `message` and `evidence` are deliberately excluded so phrasing drift doesn't change the id.

---

## ReviewReport

Source of truth: [`contracts/report.schema.ts`](contracts/report.schema.ts) — `ReportSchema`.

| Field | Type | Notes |
|---|---|---|
| `schemaVersion` | `1` (literal) | Bumped per Constitution §"Versioning" — additive = minor, breaking = major |
| `runId` | `string` | UUID; appears in `./.agentqa-cache/runs/<runId>/` paths |
| `generatedAt` | ISO-8601 string | UTC |
| `durationMs` | `number ≥ 0` | Wall-clock from orchestrator start to report write |
| `totalCostUsd` | `number ≥ 0` | Sum of `perAgent[].costUsd` |
| `budgetUsd` | `number ≥ 0` | Echoes `config.budget.maxTotalUsd` for downstream tools |
| `status` | `ReportStatus` | `pass \| gate-triggered \| budget-exhausted \| error` |
| `diff` | `{base, head, fileCount}` | Echoed for the JSON consumer |
| `perAgent` | `PerAgentResult[]` | One per perspective the orchestrator considered (including budget-skipped) |
| `findings` | `Finding[]` | Already deduplicated, prioritised, and stably-ordered |

### PerAgentResult

`{ agent, costUsd, durationMs, status, errorMessage?, findingsCount }` where `status ∈ {ok, timeout, budget-skipped, error}`.

### Status mapping → CLI exit code

| `status` | Exit code | Meaning |
|---|---|---|
| `pass` | `0` | All perspectives ran (or were skipped); no finding crossed the gate |
| `gate-triggered` | `1` | At least one finding crossed `gate.failOn` |
| `budget-exhausted` | `2` | Budget was hit before all enabled perspectives could run |
| `error` | `3` | Config / usage / unexpected runtime error |

### Sort order

Stable for diffability:

1. `findings[].severity` DESC (`critical` first)
2. `findings[].file` ASC
3. `findings[].lineRange.start ?? 0` ASC
4. `findings[].agent` ASC

`perAgent[]` ordered by perspective declaration order: built-ins (functional, regression, smoke) first, then `agents.custom[]` in array order.

---

## Relationships

```
ProjectConfiguration ──┐
                       │ informs
Diff ──────────────────┤
                       ├──▶ IntentBundle ──▶ ReviewPerspective(s) ──▶ Finding[]
PR body / issues ──────┤                                                    │
contextDocs ───────────┘                                                    │
                                                                            ▼
                                                           Reducer (group + sort)
                                                                            │
                                                                            ▼
                                                                     ReviewReport
                                                                            │
                                                                            ▼
                                                            JSON / Markdown / PR comment
```

No persistence between runs (other than `./.agentqa-cache/runs/<runId>/` audit directory). Nothing in this model is mutable in place — every run produces a fresh `runId` directory.
