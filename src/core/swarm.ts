import { FindingSchema } from "../../specs/001-agentqa-mvp/contracts/finding.schema.js";
import type { Finding, IntentBundle, PerAgentResult, Severity } from "../types.js";
import type { AgentDefinition } from "../agents/registry.js";

/**
 * Adapter over the Claude Agent SDK. The rest of the codebase calls into
 * `dispatchSwarm`; this file is the only place that imports the SDK.
 *
 * The implementation is injectable (`runPerspectiveImpl`) so tests can stub
 * it without touching the network.
 */

export interface SwarmInput {
  agents: AgentDefinition[];
  intent: IntentBundle;
  budgetUsd: number;
  verbose: boolean;
  /** Test seam — defaults to `runPerspectiveLive`. */
  runPerspective?: RunPerspectiveImpl;
}

export interface SwarmResult {
  findings: Finding[];
  perAgent: PerAgentResult[];
}

export interface PerspectiveOutcome {
  findings: Finding[];
  costUsd: number;
  durationMs: number;
  status: PerAgentResult["status"];
  errorMessage?: string;
}

export type RunPerspectiveImpl = (
  agent: AgentDefinition,
  intent: IntentBundle,
  ctx: { signal: AbortSignal; verbose: boolean },
) => Promise<PerspectiveOutcome>;

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

export async function dispatchSwarm(input: SwarmInput): Promise<SwarmResult> {
  const run = input.runPerspective ?? runPerspectiveLive;
  const projected = projectCosts(input.agents, input.budgetUsd);

  const tasks = input.agents.map<Promise<PerAgentResult & { findings: Finding[] }>>((agent) => {
    const dropped = projected.dropped.has(agent.name);
    if (dropped) {
      return Promise.resolve({
        agent: agent.name,
        costUsd: 0,
        durationMs: 0,
        status: "budget-skipped" as const,
        findingsCount: 0,
        findings: [],
      });
    }
    return runWithTimeout(agent, input.intent, run, input.verbose);
  });

  const settled = await Promise.all(tasks);

  const findings: Finding[] = [];
  const perAgent: PerAgentResult[] = [];
  for (const r of settled) {
    findings.push(...r.findings);
    const { findings: _ignored, ...meta } = r;
    perAgent.push(meta);
  }
  return { findings, perAgent };
}

async function runWithTimeout(
  agent: AgentDefinition,
  intent: IntentBundle,
  run: RunPerspectiveImpl,
  verbose: boolean,
): Promise<PerAgentResult & { findings: Finding[] }> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), agent.timeoutMs);
  const start = Date.now();
  try {
    const outcome = await run(agent, intent, { signal: ac.signal, verbose });
    return {
      agent: agent.name,
      costUsd: outcome.costUsd,
      durationMs: outcome.durationMs,
      status: outcome.status,
      ...(outcome.errorMessage !== undefined ? { errorMessage: outcome.errorMessage } : {}),
      findingsCount: outcome.findings.length,
      findings: outcome.findings.map((f) => applySeverityFloor(f, agent.severityFloor)).filter(notNull),
    };
  } catch (err) {
    return {
      agent: agent.name,
      costUsd: 0,
      durationMs: Date.now() - start,
      status: ac.signal.aborted ? "timeout" : "error",
      errorMessage: (err as Error).message,
      findingsCount: 0,
      findings: [],
    };
  } finally {
    clearTimeout(timer);
  }
}

function applySeverityFloor(f: Finding, floor: Severity | undefined): Finding | null {
  if (!floor) return f;
  return SEVERITY_RANK[f.severity] >= SEVERITY_RANK[floor] ? f : null;
}

function notNull<T>(v: T | null): v is T {
  return v !== null;
}

interface CostProjection {
  perAgent: Map<string, number>;
  dropped: Set<string>;
}

/**
 * Coarse pre-dispatch cost projection. We don't know the SDK's exact
 * pricing without a live call; we use a conservative envelope based on
 * `maxTurns` and a flat per-turn dollar estimate. The point isn't precision;
 * it's a hard cap per Constitution §V (Cost Discipline).
 */
function projectCosts(agents: AgentDefinition[], budgetUsd: number): CostProjection {
  const PER_TURN_USD = 0.04; // conservative envelope
  const perAgent = new Map<string, number>();
  for (const a of agents) {
    perAgent.set(a.name, a.maxTurns * PER_TURN_USD);
  }
  const total = [...perAgent.values()].reduce((s, v) => s + v, 0);
  const dropped = new Set<string>();
  if (total <= budgetUsd) return { perAgent, dropped };
  // Drop in reverse priority order until we're under budget.
  const ordered = [...agents].sort((a, b) => b.priority - a.priority); // highest priority kept
  let running = total;
  for (let i = ordered.length - 1; i >= 0 && running > budgetUsd; i--) {
    const agent = ordered[i];
    if (!agent) continue;
    dropped.add(agent.name);
    running -= perAgent.get(agent.name) ?? 0;
  }
  return { perAgent, dropped };
}

/**
 * Live SDK invocation. Imported lazily so that test environments with the
 * SDK stubbed never load it.
 */
const runPerspectiveLive: RunPerspectiveImpl = async (agent, intent, ctx) => {
  const start = Date.now();
  try {
    // Lazy import — keeps unit tests offline by default.
    const sdk = (await import("@anthropic-ai/claude-agent-sdk")) as unknown as {
      query: (input: {
        prompt: string;
        options: {
          systemPrompt: string;
          allowedTools: string[];
          maxTurns: number;
          abortSignal?: AbortSignal;
        };
      }) => AsyncIterable<unknown>;
    };
    const systemPrompt = renderSystemPrompt(agent, intent);
    const stream = sdk.query({
      prompt: "Begin your review now and produce the final JSON block.",
      options: {
        systemPrompt,
        allowedTools: agent.tools as string[],
        maxTurns: agent.maxTurns,
        abortSignal: ctx.signal,
      },
    });
    let lastText = "";
    let costUsd = 0;
    for await (const ev of stream) {
      const e = ev as {
        type?: string;
        message?: { content?: Array<{ type?: string; text?: string }>; usage?: unknown };
        result?: string;
        total_cost_usd?: number;
        cost_usd?: number;
      };
      if (e.type === "assistant" && Array.isArray(e.message?.content)) {
        for (const c of e.message.content) {
          if (c.type === "text" && typeof c.text === "string") lastText = c.text;
        }
      }
      if (e.type === "result") {
        if (typeof e.total_cost_usd === "number") costUsd = e.total_cost_usd;
        else if (typeof e.cost_usd === "number") costUsd = e.cost_usd;
        if (typeof e.result === "string" && e.result.length > 0) lastText = e.result;
      }
    }
    const findings = parseFindingsBlock(lastText, agent.name);
    return {
      findings,
      costUsd,
      durationMs: Date.now() - start,
      status: "ok",
    };
  } catch (err) {
    return {
      findings: [],
      costUsd: 0,
      durationMs: Date.now() - start,
      status: ctx.signal.aborted ? "timeout" : "error",
      errorMessage: (err as Error).message,
    };
  }
};

function renderSystemPrompt(agent: AgentDefinition, intent: IntentBundle): string {
  const parts: string[] = [agent.systemPrompt.trim()];
  parts.push("\n## Context\n");
  parts.push(
    `Diff: ${intent.diff.files.length} files between ${intent.diff.base.slice(0, 7)} and ${intent.diff.head.slice(0, 7)}.`,
  );
  if (intent.pr) {
    parts.push(`PR #${intent.pr.number}: ${intent.pr.title}\n${intent.pr.body || "(no body)"}`);
  }
  if (intent.linkedIssues.length > 0) {
    parts.push("Linked issues:");
    for (const i of intent.linkedIssues) parts.push(`- #${i.id} ${i.title}\n${i.body}`);
  }
  if (intent.commitMessages.length > 0) {
    parts.push("Commits:");
    for (const c of intent.commitMessages) parts.push(`- ${c.split("\n")[0]}`);
  }
  if (intent.repoDocs.length > 0) {
    parts.push("Repo docs:");
    for (const d of intent.repoDocs) parts.push(`### ${d.path}\n${d.content}`);
  }
  parts.push("\n## Diff (unified)\n```diff\n" + intent.diff.raw + "\n```");
  parts.push(
    "\n## Output\nYour final assistant message MUST contain a single fenced JSON block (```json … ```) holding an array of findings matching the schema {agent,ruleHint,severity,file,lineRange?,message,evidence?}. No prose outside the block.",
  );
  if (agent.extraContext) parts.push(`\n## Extra context\n${agent.extraContext}`);
  return parts.join("\n");
}

export function parseFindingsBlock(text: string, agentName: string): Finding[] {
  const m = text.match(/```json\s*([\s\S]*?)```/);
  if (!m || !m[1]) {
    return [makeMetaFinding(agentName, "perspective-output-missing-json", text.slice(0, 200))];
  }
  let raw: unknown;
  try {
    raw = JSON.parse(m[1]);
  } catch {
    return [makeMetaFinding(agentName, "perspective-output-malformed-json", m[1].slice(0, 200))];
  }
  if (!Array.isArray(raw)) {
    return [makeMetaFinding(agentName, "perspective-output-not-array", String(raw).slice(0, 200))];
  }
  const out: Finding[] = [];
  for (const item of raw) {
    const candidate = {
      // id is filled by reducer; provide a placeholder hash-shaped string
      id: "0".repeat(64),
      agent: agentName,
      ...(item as Record<string, unknown>),
    };
    const parsed = FindingSchema.safeParse(candidate);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

function makeMetaFinding(agent: string, ruleHint: string, evidence: string): Finding {
  return {
    id: "0".repeat(64),
    agent: "meta",
    ruleHint,
    severity: "low",
    file: "<perspective-output>",
    message: `Perspective "${agent}" produced output that could not be parsed as Finding[]; see evidence.`,
    evidence,
  };
}
