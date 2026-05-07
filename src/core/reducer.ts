import { createHash } from "node:crypto";
import type { Finding, Severity } from "../types.js";

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

interface GroupKey {
  file: string;
  startLine: number | null;
  endLine: number | null;
  ruleHint: string;
}

function keyOf(f: Finding): GroupKey {
  return {
    file: f.file,
    startLine: f.lineRange ? f.lineRange.start : null,
    endLine: f.lineRange ? f.lineRange.end : null,
    ruleHint: f.ruleHint,
  };
}

function keyToStr(k: GroupKey): string {
  return `${k.file}|${k.startLine ?? "-"}|${k.endLine ?? "-"}|${k.ruleHint}`;
}

export function computeFindingId(f: Finding): string {
  const k = keyOf(f);
  return createHash("sha256")
    .update(`${f.agent}|${k.ruleHint}|${k.file}|${k.startLine ?? ""}-${k.endLine ?? ""}`)
    .digest("hex");
}

/**
 * Group findings by `(file, lineRange ?? null, ruleHint)`. For each group,
 * keep the highest-severity instance, merge the messages of the others,
 * compute a stable id, and emit one canonical finding.
 */
export function reduceFindings(findings: Finding[]): Finding[] {
  const groups = new Map<string, Finding[]>();
  for (const f of findings) {
    const s = keyToStr(keyOf(f));
    const arr = groups.get(s);
    if (arr) arr.push(f);
    else groups.set(s, [f]);
  }

  const merged: Finding[] = [];
  for (const arr of groups.values()) {
    arr.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
    const head = arr[0];
    if (!head) continue;
    const tail = arr.slice(1);
    const message =
      tail.length > 0
        ? `${head.message}${tail.map((t) => `\n\n— also: ${t.message}`).join("")}`
        : head.message;
    const merged_finding: Finding = {
      ...head,
      message,
      id: computeFindingId(head),
    };
    merged.push(merged_finding);
  }

  merged.sort((a, b) => {
    const r = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    if (r !== 0) return r;
    if (a.file !== b.file) return a.file < b.file ? -1 : 1;
    const as = a.lineRange?.start ?? 0;
    const bs = b.lineRange?.start ?? 0;
    if (as !== bs) return as - bs;
    return a.agent < b.agent ? -1 : a.agent > b.agent ? 1 : 0;
  });

  return merged;
}
