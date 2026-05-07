import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig, locateConfig } from "../../src/config/load.js";

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "agentqa-cfg-"));
}

describe("config/load", () => {
  it("loads a minimal JSON config", async () => {
    const dir = tmp();
    writeFileSync(join(dir, "agentqa.config.json"), JSON.stringify({}), "utf8");
    const r = await loadConfig({ from: dir });
    expect(r.config.budget.maxTotalUsd).toBe(0.5);
    expect(r.config.gate.failOn).toEqual(["critical"]);
    expect(r.config.intentSources).toEqual(["pr-body", "linked-issues", "commit-messages"]);
  });

  it("loads a TS config via in-memory esbuild transform", async () => {
    const dir = tmp();
    writeFileSync(
      join(dir, "agentqa.config.ts"),
      `export default { budget: { maxTotalUsd: 1.25 }, gate: { failOn: ["critical","high"] } };`,
      "utf8",
    );
    const r = await loadConfig({ from: dir });
    expect(r.config.budget.maxTotalUsd).toBe(1.25);
    expect(r.config.gate.failOn).toEqual(["critical", "high"]);
  });

  it("rejects a config with a negative budget and points to the path", async () => {
    const dir = tmp();
    writeFileSync(
      join(dir, "agentqa.config.json"),
      JSON.stringify({ budget: { maxTotalUsd: -1 } }),
      "utf8",
    );
    await expect(loadConfig({ from: dir })).rejects.toMatchObject({
      name: "ConfigError",
      message: expect.stringContaining("budget.maxTotalUsd"),
    });
  });

  it("throws ConfigError when no config file is found", async () => {
    const dir = tmp();
    await expect(loadConfig({ from: dir })).rejects.toBeInstanceOf(ConfigError);
  });

  it("locateConfig walks up to a parent directory", () => {
    const root = tmp();
    const sub = mkdtempSync(join(root, "deep-"));
    writeFileSync(join(root, "agentqa.config.json"), "{}", "utf8");
    expect(locateConfig(sub)).toBe(join(root, "agentqa.config.json"));
  });
});
