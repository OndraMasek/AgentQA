import { z } from "zod";
import { FindingSchema } from "./finding.schema.js";

export const SCHEMA_VERSION = 1 as const;

export const PerAgentResult = z.object({
  agent: z.string().min(1),
  costUsd: z.number().nonnegative(),
  durationMs: z.number().int().nonnegative(),
  status: z.enum(["ok", "timeout", "budget-skipped", "error"]),
  errorMessage: z.string().optional(),
  findingsCount: z.number().int().nonnegative(),
});
export type PerAgentResult = z.infer<typeof PerAgentResult>;

export const ReportStatus = z.enum([
  "pass",
  "gate-triggered",
  "budget-exhausted",
  "error",
]);
export type ReportStatus = z.infer<typeof ReportStatus>;

export const ReportSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  runId: z.string().min(1),
  generatedAt: z.string().datetime(),
  durationMs: z.number().int().nonnegative(),
  totalCostUsd: z.number().nonnegative(),
  budgetUsd: z.number().nonnegative(),
  status: ReportStatus,
  diff: z.object({
    base: z.string(),
    head: z.string(),
    fileCount: z.number().int().nonnegative(),
  }),
  perAgent: z.array(PerAgentResult),
  findings: z.array(FindingSchema),
});
export type Report = z.infer<typeof ReportSchema>;
