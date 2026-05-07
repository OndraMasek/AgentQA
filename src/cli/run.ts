import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import pc from "picocolors";
import { ConfigError, loadConfig } from "../config/load.js";
import { runOrchestrator } from "../core/orchestrator.js";
import { renderMarkdown } from "../reporters/markdown.js";
import { writeJsonReport } from "../reporters/json.js";
import { upsertStickyComment } from "../reporters/github-pr-comment.js";
import type { ReporterName } from "../config/schema.js";

export interface RunOptions {
  configPath?: string;
  diff?: string;
  only?: string[];
  reporters?: ReporterName[];
  ci?: boolean;
  verbose?: boolean;
  outputDir?: string;
}

export async function runRun(opts: RunOptions): Promise<number> {
  let loaded;
  try {
    loaded = await loadConfig({ ...(opts.configPath !== undefined ? { configPath: opts.configPath } : {}) });
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(pc.red(err.message));
      return 3;
    }
    throw err;
  }

  const reporters = opts.reporters ?? loaded.config.reporters;
  const outputDir = resolve(opts.outputDir ?? process.cwd());

  const { base, head } = parseDiffSpec(opts.diff);

  let report;
  try {
    report = await runOrchestrator({
      config: loaded.config,
      base,
      head,
      ci: opts.ci ?? false,
      verbose: opts.verbose ?? false,
      ...(opts.only !== undefined ? { only: opts.only } : {}),
    });
  } catch (err) {
    console.error(pc.red(`Run failed: ${(err as Error).message}`));
    return 3;
  }

  if (reporters.includes("json")) {
    const path = resolve(outputDir, "agentqa-report.json");
    writeJsonReport(path, report);
    if (opts.verbose) console.log(pc.dim(`wrote ${path}`));
  }
  const md = renderMarkdown(report);
  if (reporters.includes("markdown")) {
    const path = resolve(outputDir, "agentqa-report.md");
    writeFileSync(path, md, "utf8");
    if (opts.verbose) console.log(pc.dim(`wrote ${path}`));
  }
  console.log(md);
  if (reporters.includes("github-pr-comment") && (opts.ci ?? false)) {
    await upsertStickyComment(md);
  }

  return exitCodeFor(report.status);
}

function parseDiffSpec(spec?: string): { base: string; head: string } {
  if (!spec) {
    const base = process.env.GITHUB_BASE_REF ?? "main";
    const head = process.env.GITHUB_HEAD_REF ?? "HEAD";
    return { base, head };
  }
  const m = spec.match(/^(.+?)\.\.\.?(.+)$/);
  if (!m || !m[1] || !m[2]) {
    throw new ConfigError(`Invalid --diff "${spec}" — expected "<base>..<head>" or "<base>...<head>".`);
  }
  return { base: m[1], head: m[2] };
}

function exitCodeFor(status: string): number {
  switch (status) {
    case "pass":
      return 0;
    case "gate-triggered":
      return 1;
    case "budget-exhausted":
      return 2;
    default:
      return 3;
  }
}
