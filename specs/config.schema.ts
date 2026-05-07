import { z } from "zod";
import { Severity } from "./001-agentqa-mvp/contracts/finding.schema.js";

export const AgentTool = z.enum([
  "Read",
  "Grep",
  "Glob",
  "Bash",
  "WebFetch",
]);
export type AgentTool = z.infer<typeof AgentTool>;

export const BuiltInAgentName = z.enum(["functional", "regression", "smoke"]);
export type BuiltInAgentName = z.infer<typeof BuiltInAgentName>;

const AgentBaseConfig = z.object({
  enabled: z.boolean().default(true),
  scope: z.array(z.string()).default(["**/*"]),
  severityFloor: Severity.optional(),
  maxTurns: z.number().int().positive().default(15),
  timeoutMs: z.number().int().positive().default(60_000),
  extraContext: z.string().optional(),
});

export const FunctionalAgentConfig = AgentBaseConfig;
export const RegressionAgentConfig = AgentBaseConfig.extend({
  depth: z.enum(["shallow", "deep"]).default("shallow"),
});
export const SmokeAgentConfig = AgentBaseConfig.extend({
  baseUrl: z.string().url().optional(),
  routes: z.array(z.string()).default(["/"]),
});

export const CustomAgentConfig = AgentBaseConfig.extend({
  name: z.string().min(1).regex(/^[a-z0-9-]+$/),
  prompt: z.string().min(1),
  tools: z.array(AgentTool).default(["Read", "Grep"]),
});
export type CustomAgentConfig = z.infer<typeof CustomAgentConfig>;

export const ReporterName = z.enum(["json", "markdown", "github-pr-comment"]);
export type ReporterName = z.infer<typeof ReporterName>;

export const IntentSource = z.enum([
  "pr-body",
  "linked-issues",
  "commit-messages",
]);

export const AgentQAConfigSchema = z.object({
  agents: z
    .object({
      functional: FunctionalAgentConfig.optional(),
      regression: RegressionAgentConfig.optional(),
      smoke: SmokeAgentConfig.optional(),
      custom: z.array(CustomAgentConfig).default([]),
    })
    .default({}),
  intentSources: z
    .array(IntentSource)
    .default(["pr-body", "linked-issues", "commit-messages"]),
  contextDocs: z.array(z.string()).default([]),
  reporters: z
    .array(ReporterName)
    .default(["json", "markdown", "github-pr-comment"]),
  gate: z
    .object({
      failOn: z.array(Severity).default(["critical"]),
    })
    .default({ failOn: ["critical"] }),
  budget: z
    .object({
      maxTotalUsd: z.number().positive().default(0.5),
    })
    .default({ maxTotalUsd: 0.5 }),
});
export type AgentQAConfig = z.infer<typeof AgentQAConfigSchema>;
