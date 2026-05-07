import { describe, expect, it, vi } from "vitest";
import { dispatchSwarm, parseFindingsBlock } from "../../src/core/swarm.js";
import type { AgentDefinition } from "../../src/agents/registry.js";
import type { IntentBundle } from "../../src/types.js";

const intent: IntentBundle = {
  diff: { base: "abc", head: "def", files: [], raw: "" },
  linkedIssues: [],
  commitMessages: [],
  repoDocs: [],
};

function agent(over: Partial<AgentDefinition> = {}): AgentDefinition {
  return {
    name: "test",
    systemPrompt: "test",
    tools: ["Read"],
    scope: ["**/*"],
    maxTurns: 2,
    timeoutMs: 100,
    priority: 1,
    ...over,
  };
}

describe("swarm.dispatchSwarm", () => {
  it("runs all enabled perspectives in parallel and collects findings", async () => {
    const calls: string[] = [];
    const stub = vi.fn(async (a: AgentDefinition) => {
      calls.push(a.name);
      return {
        findings: [
          {
            id: "0".repeat(64),
            agent: a.name,
            ruleHint: "test-rule",
            severity: "high" as const,
            file: "src/x.ts",
            message: `from ${a.name}`,
          },
        ],
        costUsd: 0.01,
        durationMs: 5,
        status: "ok" as const,
      };
    });
    const r = await dispatchSwarm({
      agents: [agent({ name: "a", priority: 2 }), agent({ name: "b", priority: 1 })],
      intent,
      budgetUsd: 10,
      verbose: false,
      runPerspective: stub,
    });
    expect(r.findings).toHaveLength(2);
    expect(r.perAgent.map((p) => p.agent).sort()).toEqual(["a", "b"]);
    expect(calls.sort()).toEqual(["a", "b"]);
  });

  it("drops lowest-priority perspectives when projected cost exceeds budget", async () => {
    const stub = vi.fn(async (a: AgentDefinition) => ({
      findings: [],
      costUsd: 0.01,
      durationMs: 5,
      status: "ok" as const,
    }));
    // PER_TURN_USD = 0.04; maxTurns=15 → 0.60 each, total 1.20. Budget 0.70 → must drop one.
    const r = await dispatchSwarm({
      agents: [
        agent({ name: "high-pri", maxTurns: 15, priority: 10 }),
        agent({ name: "low-pri", maxTurns: 15, priority: 1 }),
      ],
      intent,
      budgetUsd: 0.7,
      verbose: false,
      runPerspective: stub,
    });
    const skipped = r.perAgent.filter((p) => p.status === "budget-skipped");
    expect(skipped).toHaveLength(1);
    expect(skipped[0]?.agent).toBe("low-pri");
    expect(stub).toHaveBeenCalledTimes(1);
  });

  it("marks a perspective as timeout when its run exceeds timeoutMs", async () => {
    const stub = vi.fn(
      (_a: AgentDefinition, _i: IntentBundle, ctx: { signal: AbortSignal }) =>
        new Promise<never>((_, reject) => {
          ctx.signal.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );
    const r = await dispatchSwarm({
      agents: [agent({ timeoutMs: 25 })],
      intent,
      budgetUsd: 10,
      verbose: false,
      runPerspective: stub,
    });
    expect(r.perAgent[0]?.status).toBe("timeout");
  });
});

describe("swarm.parseFindingsBlock", () => {
  it("extracts a JSON array from a fenced block", () => {
    const text =
      'Some prose.\n\n```json\n[{"ruleHint":"r","severity":"low","file":"a","message":"m"}]\n```\nMore prose.';
    const out = parseFindingsBlock(text, "functional");
    expect(out).toHaveLength(1);
    expect(out[0]?.ruleHint).toBe("r");
    expect(out[0]?.agent).toBe("functional");
  });

  it("synthesises a meta finding when the block is missing", () => {
    const out = parseFindingsBlock("no fenced json here", "functional");
    expect(out[0]?.agent).toBe("meta");
    expect(out[0]?.ruleHint).toBe("perspective-output-missing-json");
  });

  it("synthesises a meta finding when the JSON is malformed", () => {
    const out = parseFindingsBlock("```json\n{not valid\n```", "functional");
    expect(out[0]?.agent).toBe("meta");
    expect(out[0]?.ruleHint).toBe("perspective-output-malformed-json");
  });

  it("filters out items that do not match the Finding schema", () => {
    const out = parseFindingsBlock(
      '```json\n[{"ruleHint":"r","severity":"high","file":"a","message":"m"},{"foo":"bar"}]\n```',
      "x",
    );
    expect(out).toHaveLength(1);
  });
});
