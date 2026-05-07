import { z } from "zod";

export const Severity = z.enum(["critical", "high", "medium", "low"]);
export type Severity = z.infer<typeof Severity>;

export const LineRange = z.object({
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
});
export type LineRange = z.infer<typeof LineRange>;

export const FindingSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{64}$/),
  agent: z.string().min(1),
  ruleHint: z.string().min(1),
  severity: Severity,
  file: z.string().min(1),
  lineRange: LineRange.optional(),
  message: z.string().min(1),
  evidence: z.string().optional(),
  incomplete: z.boolean().optional(),
});
export type Finding = z.infer<typeof FindingSchema>;
