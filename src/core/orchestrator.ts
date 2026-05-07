import { randomUUID } from "node:crypto";
import { ReportSchema, SCHEMA_VERSION } from "../../specs/001-agentqa-mvp/contracts/report.schema.js";
import type { AgentQAConfig } from "../config/schema.js";
import type { Finding, PerAgentResult, Report, ReportStatus } from "../types.js";
import { resolveDiff } from "./diff.js";
import { buildIntent } from "./intent.js";
import { reduceFindings } from "./reducer.js";
import { dispatchSwarm } from "./swarm.js";
import { materialiseAgents } from "../agents/registry.js";

export interface OrchestratorInput {
  config: AgentQAConfig;
  base: string;
  head: string;
  ci: boolean;
  verbose: boolean;
  only?: string[];
}

export async function runOrchestrator(input: OrchestratorInput): Promise<Report> {
  const runId = randomUUID();
  const startedAt = Date.now();

  const diff = await resolveDiff(input.base, input.head);
  const intent = await buildIntent({
    config: input.config,
    diff,
    ci: input.ci,
  });

  const allAgents = materialiseAgents(input.config);
  const onlySet = input.only ? new Set(input.only) : null;
  const agents = onlySet ? allAgents.filter((a) => onlySet.has(a.name)) : allAgents;

  const swarmResult = await dispatchSwarm({
    agents,
    intent,
    budgetUsd: input.config.budget.maxTotalUsd,
    verbose: input.verbose,
  });

  const merged = reduceFindings(swarmResult.findings);
  const status = computeStatus({
    perAgent: swarmResult.perAgent,
    findings: merged,
    failOn: input.config.gate.failOn,
  });

  const report: Report = {
    schemaVersion: SCHEMA_VERSION,
    runId,
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    totalCostUsd: swarmResult.perAgent.reduce((s, p) => s + p.costUsd, 0),
    budgetUsd: input.config.budget.maxTotalUsd,
    status,
    diff: { base: diff.base, head: diff.head, fileCount: diff.files.length },
    perAgent: swarmResult.perAgent,
    findings: merged,
  };

  return ReportSchema.parse(report);
}

function computeStatus(opts: {
  perAgent: PerAgentResult[];
  findings: Finding[];
  failOn: AgentQAConfig["gate"]["failOn"];
}): ReportStatus {
  const failSet = new Set(opts.failOn);
  if (opts.findings.some((f) => failSet.has(f.severity))) return "gate-triggered";
  if (opts.perAgent.some((p) => p.status === "budget-skipped")) return "budget-exhausted";
  if (opts.perAgent.some((p) => p.status === "error")) return "error";
  return "pass";
}
