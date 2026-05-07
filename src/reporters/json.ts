import { writeFileSync } from "node:fs";
import { ReportSchema } from "../../specs/001-agentqa-mvp/contracts/report.schema.js";
import type { Report } from "../types.js";

export function writeJsonReport(path: string, report: Report): void {
  const validated = ReportSchema.parse(report);
  writeFileSync(path, `${JSON.stringify(validated, null, 2)}\n`, "utf8");
}
