# Phase 0 Research — AgentQA MVP

Non-obvious decisions made during planning, with the alternatives that were considered and rejected. Documented as Decision / Rationale / Alternatives per the speckit-plan template.

---

## R-001 — Review-perspective dispatch: Claude Agent SDK vs raw Anthropic API

- **Decision**: Use `@anthropic-ai/claude-agent-sdk` (`query()` async generator) for all LLM calls.
- **Rationale**: The SDK provides subagent dispatch, hooks (PreToolUse / PostToolUse / SubagentStart / SubagentStop), tool-permission enforcement, and bounded budgets out of the box — exactly the primitives a multi-perspective swarm needs. Building these on the raw API would consume the entire 4-hour budget. The SDK also normalises tool-use across Claude versions, so model upgrades become a single-file change in `src/core/swarm.ts`.
- **Alternatives considered**:
  - **Raw Anthropic SDK** — too much undifferentiated work (tool loop, budget tracking, hooks). Rejected.
  - **LangGraph / CrewAI** — heavy multi-agent frameworks; over-fit for the simple parallel-fan-out pattern this product needs; opinionated structures collide with the "perspective is a config record + prompt" model. Rejected.
  - **Vercel AI SDK** — primarily streaming-UI focused; weaker on multi-agent and tool-use patterns. Rejected.

## R-002 — Module format: ESM-only

- **Decision**: `"type": "module"` with no CJS source. Bin entry uses an ESM file with `#!/usr/bin/env node` shebang.
- **Rationale**: Node 22 is the only supported runtime; ESM is the durable target. Avoids dual-package hazards. Most modern host repos already ship ESM.
- **Alternatives considered**:
  - **Dual ESM/CJS via tsup** — bundler complexity for zero gain; rejected.
  - **CJS only** — incompatible with several deps' newer majors and with `top-level await`; rejected.

## R-003 — Type contracts: Zod schemas as source of truth

- **Decision**: Every public type (config, IntentBundle, Finding, Report) is a Zod schema in `specs/001-agentqa-mvp/contracts/`. TS types are inferred via `z.infer<>`. `src/types.ts` re-exports them.
- **Rationale**: One artefact for runtime validation AND compile-time types. Eliminates the schema-vs-type drift class entirely. Zod is the lingua franca of modern Node tooling (Vitest, Drizzle, tRPC); contributors already know it.
- **Alternatives considered**:
  - **Hand-written interfaces + ad-hoc validation** — schema/type drift inevitable; rejected.
  - **TypeBox / valibot** — niche; smaller ecosystems; no decisive advantage; rejected.

## R-004 — CLI parser: Commander vs alternatives

- **Decision**: `commander@^13` for argv parsing.
- **Rationale**: Mature, ESM-friendly, smallest reasonable feature set, type definitions are clean. Subcommand model fits `init` / `run`.
- **Alternatives considered**:
  - **yargs** — heavier; declarative API less ergonomic for nested flags. Rejected.
  - **clipanion** — opinionated DI model; over-fit. Rejected.
  - **hand-rolled** — false economy; reinvents validation and help output. Rejected.

## R-005 — Lint + format: Biome (single binary)

- **Decision**: Biome for both lint and format. Replaces ESLint + Prettier.
- **Rationale**: One binary, native speed, ESM-friendly config, sane defaults. AgentQA is small and stays small — no need for ESLint's plugin ecosystem. Faster CI lint loop directly serves Constitution §II (Test-Before-Report) by lowering verification cost.
- **Alternatives considered**:
  - **ESLint + Prettier** — two tools, two configs, slower; not justified at this size. Rejected.
  - **dprint** — narrower than Biome; no lint. Rejected.

## R-006 — `.ts` config files: in-memory esbuild transform

- **Decision**: Load `agentqa.config.ts` by transforming with the `esbuild` JS API to a string, then `import()`-ing via a `data:` URL or temp file. No persistent build artefact.
- **Rationale**: Users get strict types in their config; AgentQA gets one transpilation path it controls. Avoids requiring the host project to have any specific build tool. esbuild is already a dep (single 5 MB binary, well-trusted).
- **Alternatives considered**:
  - **Require config to be `.json`** — loses type safety in user-facing config; bad DX. Rejected.
  - **`tsx` / `jiti` runtime hooks** — extra deps; hooked-resolver mechanics are quirky in some Node versions. Rejected.
  - **Compile config ahead of time** — defeats "single config file" UX. Rejected.

## R-007 — GitHub interactions: shell out to `gh` CLI

- **Decision**: Use `gh api …`, `gh issue view …`, `gh pr comment …` via a thin `src/core/shell.ts` wrapper (`execFile`-style; explicit argv; no shell interpolation).
- **Rationale**: `gh` is pre-installed on every GitHub Actions runner and reads `GITHUB_TOKEN` from the environment automatically — zero auth plumbing. Avoids pulling Octokit + token-handling into the bundle. Works identically on local dev when the user has `gh` installed.
- **Alternatives considered**:
  - **`@octokit/rest`** — adds bundle weight, requires explicit token wiring, doubles the auth surface. Rejected.
  - **Raw `fetch` to GitHub REST API** — auth and pagination plumbing we'd hand-roll. Rejected.

## R-008 — Audit trail: filesystem (no DB)

- **Decision**: Per-run audit lives in `./.agentqa-cache/runs/<runId>/{run.json, agents/<agent>.log}`. Gitignored.
- **Rationale**: Zero-runtime-dependency install. JSON is grep-friendly; logs are streamable. Survives across runs without any process. CI uploads the directory as an artifact.
- **Alternatives considered**:
  - **SQLite (`better-sqlite3`)** — native module = bigger install + Node version compat headaches; query power not needed at this scale. Rejected.
  - **No persistence** — defeats NFR-005 (Per-run audit trail). Rejected.

## R-009 — Sticky PR comment: HTML-comment marker

- **Decision**: Body of every AgentQA PR comment starts with `<!-- agentqa-comment -->`. To find-or-create, list comments via `gh api repos/<owner>/<repo>/issues/<n>/comments`, grep for the marker, `PATCH` the matching comment id or `POST` a new one.
- **Rationale**: Zero state — the source of truth is the comment itself. No DB of comment IDs. Idempotent across runs (NFR-006). Simple, transparent, debuggable.
- **Alternatives considered**:
  - **Persisted comment-id store** — every store needs a sync mechanism; complexity for no gain. Rejected.
  - **Always-new comments** — violates NFR-006 (no duplicates). Rejected.

## R-010 — Stable Finding identifier

- **Decision**: `id = sha256(agent + "|" + ruleHint + "|" + file + "|" + lineRange.start + "-" + lineRange.end)`. `ruleHint` is a required field on every Finding emitted by every perspective.
- **Rationale**: Required for FR-009 + SC-006 (autonomous tools must determine resolved-vs-persisting). The composite key is small enough that perspectives can produce stable IDs across runs even when message text drifts.
- **Alternatives considered**:
  - **Hash including `message`** — defeats stability across phrasing changes. Rejected.
  - **Pure positional ID (file + line)** — collapses different concerns at the same location. Rejected.
  - **Sequential / random** — useless for cross-run dedupe. Rejected.

## R-011 — Subprocess invocation discipline

- **Decision**: One module — `src/core/shell.ts` — wraps Node's `execFile`-style API. Always called with an explicit argv array. Never accepts a single concatenated command string. All other modules call this wrapper; direct subprocess imports are forbidden by lint rule.
- **Rationale**: Eliminates command-injection risk by construction. Aligned with the constitutional Pluggability principle and general security hygiene. Centralisation means timeout / cancellation / error normalisation lives in one place.
- **Alternatives considered**:
  - **Per-call ad-hoc subprocess use** — repeated risk surface, easy to slip a string-concatenated invocation. Rejected.

## R-012 — Reducer dedupe key

- **Decision**: Group by `(file, lineRange ?? null, ruleHint)`; keep highest severity; merge messages with `"\n\n— also: "`.
- **Rationale**: `ruleHint` is the right deduplication axis — same concern at same location collapses regardless of which perspective surfaced it. Without `ruleHint`, semantically distinct findings would erroneously merge; that's why it's required on every Finding (R-010).
- **Alternatives considered**:
  - **Dedupe by message text** — phrasing drift undermines it. Rejected.
  - **No dedupe** — noisy comments; multiple perspectives on the same issue look like multiple problems. Rejected.

## R-013 — Test posture: stub by default, opt-in to live SDK

- **Decision**: Unit tests stub `query()` to return canned event streams. Integration smoke tests may hit the live SDK only when `AGENTQA_TEST_BUDGET_USD` is set (and capped). Recorded responses live in `tests/fixtures/sdk-responses/`.
- **Rationale**: CI must be runnable offline. Cost discipline (Constitution §V) extends to the test suite. Recorded fixtures give us realistic regression coverage without paying every time.
- **Alternatives considered**:
  - **Always live SDK** — flaky CI, unbounded cost. Rejected.
  - **No SDK calls in any test** — loses end-to-end signal. Rejected.

---

## Outstanding NEEDS CLARIFICATION

None. All wedge / agents / trigger / form-factor / cost-cap decisions are locked.
