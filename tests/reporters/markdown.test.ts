import { describe, expect, it } from "vitest";
import { renderMarkdown, STICKY_MARKER } from "../../src/reporters/markdown.js";
import type { Report } from "../../src/types.js";

const baseReport: Report = {
  schemaVersion: 1,
  runId: "00000000-0000-0000-0000-000000000000",
  generatedAt: "2026-05-07T10:00:00.000Z",
  durationMs: 47000,
  totalCostUsd: 0.18,
  budgetUsd: 0.5,
  status: "pass",
  diff: { base: "abcdef0123", head: "fedcba0987", fileCount: 12 },
  perAgent: [
    { agent: "functional", costUsd: 0.08, durationMs: 20000, status: "ok", findingsCount: 0 },
    { agent: "regression", costUsd: 0.06, durationMs: 18000, status: "ok", findingsCount: 0 },
    { agent: "smoke", costUsd: 0.04, durationMs: 9000, status: "ok", findingsCount: 0 },
  ],
  findings: [],
};

describe("markdown reporter", () => {
  it("starts with the sticky-comment marker (idempotent commenting)", () => {
    expect(renderMarkdown(baseReport).startsWith(STICKY_MARKER)).toBe(true);
  });

  it("renders a clean-pass header for status=pass with no findings", () => {
    const md = renderMarkdown(baseReport);
    expect(md).toContain("✅ AgentQA — clean");
    expect(md).toContain("3 perspectives reviewed your diff");
    expect(md).toContain("12 files");
    expect(md).toContain("$0.18");
    expect(md).toContain("47.0s");
    expect(md).toContain("_No findings._");
  });

  it("renders a gate-triggered header for status=gate-triggered with a findings table", () => {
    const md = renderMarkdown({
      ...baseReport,
      status: "gate-triggered",
      findings: [
        {
          id: "0".repeat(64),
          agent: "functional",
          ruleHint: "stated-intent-gap",
          severity: "critical",
          file: "src/cart.ts",
          lineRange: { start: 42, end: 51 },
          message: "Discount path skips tax calc",
        },
      ],
    });
    expect(md).toContain("❌ AgentQA — gate triggered");
    expect(md).toContain("🔴 critical");
    expect(md).toContain("src/cart.ts:42-51");
    expect(md).toContain("Discount path skips tax calc");
  });

  it("uses singular nouns for counts of 1", () => {
    const md = renderMarkdown({
      ...baseReport,
      perAgent: [{ agent: "functional", costUsd: 0, durationMs: 0, status: "ok", findingsCount: 0 }],
      diff: { ...baseReport.diff, fileCount: 1 },
    });
    expect(md).toContain("1 perspective reviewed");
    expect(md).toContain("1 file");
  });

  it("escapes pipe characters in cell content", () => {
    const md = renderMarkdown({
      ...baseReport,
      status: "gate-triggered",
      findings: [
        {
          id: "0".repeat(64),
          agent: "functional",
          ruleHint: "x",
          severity: "high",
          file: "src/x.ts",
          message: "uses A | B notation",
        },
      ],
    });
    expect(md).toContain("uses A \\| B notation");
  });
});
