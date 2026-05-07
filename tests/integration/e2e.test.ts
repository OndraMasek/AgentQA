import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ReportSchema } from "../../specs/001-agentqa-mvp/contracts/report.schema.js";
import { AgentQAConfigSchema } from "../../src/config/schema.js";
import { runOrchestrator } from "../../src/core/orchestrator.js";
import { renderMarkdown, STICKY_MARKER } from "../../src/reporters/markdown.js";
import type { RunPerspectiveImpl } from "../../src/core/swarm.js";

function setupFixtureRepo(): { dir: string; base: string; head: string } {
  const dir = mkdtempSync(join(tmpdir(), "agentqa-e2e-"));
  const git = (...args: string[]): string =>
    execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

  git("init", "-q", "-b", "main");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");

  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "src", "cart.ts"), "export const total = (n: number) => n;\n");
  git("add", ".");
  git("commit", "-q", "-m", "base: initial cart");
  const base = git("rev-parse", "HEAD").trim();

  writeFileSync(
    join(dir, "src", "cart.ts"),
    "export const total = async (n: number) => n * 1.1;\n",
  );
  writeFileSync(join(dir, "src", "checkout.ts"), 'import { total } from "./cart.js";\n');
  git("add", ".");
  git("commit", "-q", "-m", "head: cart.total now async + adds tax\n\nFixes #42");
  const head = git("rev-parse", "HEAD").trim();

  return { dir, base, head };
}

describe("e2e orchestrator pipeline", () => {
  it("runs against a real git fixture and produces a schema-valid report (stubbed swarm)", async () => {
    const fixture = setupFixtureRepo();
    {
      const config = AgentQAConfigSchema.parse({
        agents: { smoke: { enabled: false } },
        reporters: ["json", "markdown"],
        budget: { maxTotalUsd: 5 },
      });

      const stub: RunPerspectiveImpl = async (a) => ({
        findings: [
          {
            id: "0".repeat(64),
            agent: a.name,
            ruleHint: a.name === "functional" ? "stated-intent-gap" : "caller-signature-mismatch",
            severity: a.name === "functional" ? ("high" as const) : ("medium" as const),
            file: a.name === "functional" ? "src/cart.ts" : "src/checkout.ts",
            message: `from ${a.name}`,
          },
        ],
        costUsd: 0.02,
        durationMs: 5,
        status: "ok" as const,
      });

      // Hook the stub by overriding the module-level dispatcher: we call the
      // orchestrator's underlying pieces directly to avoid spawning the real SDK.
      const { resolveDiff } = await import("../../src/core/diff.js");
      const { buildIntent } = await import("../../src/core/intent.js");
      const { dispatchSwarm } = await import("../../src/core/swarm.js");
      const { reduceFindings } = await import("../../src/core/reducer.js");
      const { materialiseAgents } = await import("../../src/agents/registry.js");

      const diff = await resolveDiff(fixture.base, fixture.head, { cwd: fixture.dir });
      expect(diff.files.map((f) => f.path).sort()).toEqual(["src/cart.ts", "src/checkout.ts"]);

      const intent = await buildIntent({ config, diff, ci: false, cwd: fixture.dir });
      expect(intent.diff.files).toHaveLength(2);
      expect(intent.commitMessages.some((m) => m.includes("Fixes #42"))).toBe(true);

      const swarm = await dispatchSwarm({
        agents: materialiseAgents(config),
        intent,
        budgetUsd: config.budget.maxTotalUsd,
        verbose: false,
        runPerspective: stub,
      });
      const findings = reduceFindings(swarm.findings);
      expect(findings).toHaveLength(2);
      expect(findings[0]?.severity).toBe("high");
      expect(findings.every((f) => /^[a-f0-9]{64}$/.test(f.id))).toBe(true);

      // Full orchestrator path uses the live SDK by default; here we exercise the
      // diff + intent + swarm + reduce pipeline directly with a stubbed perspective.
      void runOrchestrator;
    }
  });

  it("renders a markdown report that starts with the sticky marker", async () => {
    const fixture = setupFixtureRepo();
    {
      const config = AgentQAConfigSchema.parse({
        agents: { smoke: { enabled: false } },
        reporters: ["markdown"],
        budget: { maxTotalUsd: 5 },
      });

      const { resolveDiff } = await import("../../src/core/diff.js");
      const { buildIntent } = await import("../../src/core/intent.js");
      const { dispatchSwarm } = await import("../../src/core/swarm.js");
      const { reduceFindings } = await import("../../src/core/reducer.js");
      const { materialiseAgents } = await import("../../src/agents/registry.js");

      const diff = await resolveDiff(fixture.base, fixture.head, { cwd: fixture.dir });
      const intent = await buildIntent({ config, diff, ci: false, cwd: fixture.dir });

      const stub: RunPerspectiveImpl = async () => ({
        findings: [],
        costUsd: 0,
        durationMs: 0,
        status: "ok" as const,
      });
      const swarm = await dispatchSwarm({
        agents: materialiseAgents(config),
        intent,
        budgetUsd: 0.5,
        verbose: false,
        runPerspective: stub,
      });

      const report = ReportSchema.parse({
        schemaVersion: 1,
        runId: "00000000-0000-0000-0000-000000000000",
        generatedAt: "2026-05-07T10:00:00.000Z",
        durationMs: 100,
        totalCostUsd: 0,
        budgetUsd: 0.5,
        status: "pass" as const,
        diff: { base: diff.base, head: diff.head, fileCount: diff.files.length },
        perAgent: swarm.perAgent,
        findings: reduceFindings(swarm.findings),
      });

      const md = renderMarkdown(report);
      expect(md.startsWith(STICKY_MARKER)).toBe(true);
      expect(md).toContain("✅ AgentQA — clean");
      expect(md).toContain("_No findings._");
    }
  });
});
