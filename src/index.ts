import { AgentQAConfigSchema } from "./config/schema.js";
import type { AgentQAConfig } from "./config/schema.js";

/**
 * Identity helper — just runs Zod validation eagerly so users see config
 * errors at edit time. Prefer this in `agentqa.config.ts`.
 */
export function defineConfig(input: AgentQAConfig): AgentQAConfig {
  return AgentQAConfigSchema.parse(input);
}

export type {
  AgentQAConfig,
  ChangedFile,
  CustomAgentConfig,
  Finding,
  IntentBundle,
  LinkedIssue,
  PerAgentResult,
  Report,
  ReportStatus,
  Severity,
} from "./types.js";
