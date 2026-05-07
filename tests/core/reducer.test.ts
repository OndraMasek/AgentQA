import { describe, expect, it } from "vitest";
import { computeFindingId, reduceFindings } from "../../src/core/reducer.js";
import type { Finding } from "../../src/types.js";

const placeholderId = "0".repeat(64);

function f(partial: Partial<Finding>): Finding {
  return {
    id: placeholderId,
    agent: "functional",
    ruleHint: "rule",
    severity: "low",
    file: "src/x.ts",
    message: "msg",
    ...partial,
  };
}

describe("reducer", () => {
  it("collapses duplicates by (file, lineRange, ruleHint)", () => {
    const out = reduceFindings([
      f({ severity: "low", message: "from func" }),
      f({ severity: "high", agent: "regression", message: "from regr" }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.severity).toBe("high");
    expect(out[0]?.agent).toBe("regression");
    expect(out[0]?.message).toContain("from regr");
    expect(out[0]?.message).toContain("— also: from func");
  });

  it("keeps semantically distinct findings (different ruleHint at same location)", () => {
    const out = reduceFindings([
      f({ ruleHint: "a" }),
      f({ ruleHint: "b" }),
    ]);
    expect(out).toHaveLength(2);
  });

  it("sorts severity DESC then file ASC then line ASC", () => {
    const out = reduceFindings([
      f({ file: "z.ts", severity: "low", ruleHint: "z-low" }),
      f({ file: "a.ts", severity: "critical", ruleHint: "a-crit", lineRange: { start: 10, end: 10 } }),
      f({ file: "a.ts", severity: "critical", ruleHint: "a-crit-early", lineRange: { start: 1, end: 1 } }),
    ]);
    expect(out.map((x) => x.ruleHint)).toEqual(["a-crit-early", "a-crit", "z-low"]);
  });

  it("computes a stable sha256 finding id from (agent, ruleHint, file, lineRange)", () => {
    const a = f({ ruleHint: "x", file: "src/y.ts", lineRange: { start: 5, end: 7 } });
    const id1 = computeFindingId(a);
    const id2 = computeFindingId({ ...a, message: "totally different message" });
    expect(id1).toBe(id2);
    expect(id1).toMatch(/^[a-f0-9]{64}$/);
  });

  it("differs by agent — same concern from two perspectives produces two ids", () => {
    const base = f({ ruleHint: "x", file: "src/y.ts", lineRange: { start: 5, end: 7 } });
    expect(computeFindingId(base)).not.toBe(computeFindingId({ ...base, agent: "regression" }));
  });
});
