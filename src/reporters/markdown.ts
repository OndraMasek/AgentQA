import type { Finding, Report, Severity } from "../types.js";

const SEVERITY_BADGE: Record<Severity, string> = {
  critical: "🔴 critical",
  high: "🟠 high",
  medium: "🟡 medium",
  low: "🔵 low",
};

const STATUS_HEADER: Record<Report["status"], string> = {
  pass: "✅ AgentQA — clean",
  "gate-triggered": "❌ AgentQA — gate triggered",
  "budget-exhausted": "⚠️ AgentQA — budget exhausted (partial review)",
  error: "⚠️ AgentQA — run errored",
};

export const STICKY_MARKER = "<!-- agentqa-comment -->";

export function renderMarkdown(report: Report): string {
  const ran = report.perAgent.filter((p) => p.status === "ok" || p.status === "timeout");
  const usd = report.totalCostUsd.toFixed(2);
  const seconds = (report.durationMs / 1000).toFixed(1);
  const summary = `**${STATUS_HEADER[report.status]}** — ${ran.length} perspective${ran.length === 1 ? "" : "s"} reviewed your diff (${report.diff.fileCount} file${report.diff.fileCount === 1 ? "" : "s"}, $${usd}, ${seconds}s)`;

  const sections: string[] = [STICKY_MARKER, "", summary, ""];

  if (report.findings.length === 0) {
    sections.push("_No findings._");
  } else {
    sections.push("| Severity | Perspective | File | Message |");
    sections.push("|---|---|---|---|");
    for (const f of report.findings) {
      sections.push(
        `| ${SEVERITY_BADGE[f.severity]} | ${escapeCell(f.agent)} | ${escapeCell(formatLocation(f))} | ${escapeCell(firstLine(f.message))} |`,
      );
    }
  }

  sections.push("", "<details><summary>Per-perspective details</summary>", "");
  for (const p of report.perAgent) {
    sections.push(
      `- **${p.agent}** — status \`${p.status}\`, ${p.findingsCount} finding${p.findingsCount === 1 ? "" : "s"}, $${p.costUsd.toFixed(3)}, ${(p.durationMs / 1000).toFixed(1)}s${p.errorMessage ? `, error: \`${escapeCell(p.errorMessage)}\`` : ""}`,
    );
  }
  sections.push("", "</details>", "");
  sections.push(`<sub>schema v${report.schemaVersion} · run \`${report.runId}\` · base \`${report.diff.base.slice(0, 7)}\` → head \`${report.diff.head.slice(0, 7)}\`</sub>`);
  return sections.join("\n");
}

function formatLocation(f: Finding): string {
  if (!f.lineRange) return f.file;
  return `${f.file}:${f.lineRange.start}${f.lineRange.end !== f.lineRange.start ? `-${f.lineRange.end}` : ""}`;
}

function firstLine(s: string): string {
  const i = s.indexOf("\n");
  return i === -1 ? s : s.slice(0, i);
}

function escapeCell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}
