#!/usr/bin/env node
import { Command } from "commander";
import pc from "picocolors";
import { printInitResult, runInit } from "./init.js";
import { runRun } from "./run.js";
import type { ReporterName } from "../config/schema.js";

const VALID_REPORTERS: readonly ReporterName[] = ["json", "markdown", "github-pr-comment"];

function buildProgram(): Command {
  const program = new Command();
  program
    .name("agentqa")
    .description("Pluggable AI-driven QA layer — multi-agent swarm via the Claude Agent SDK.")
    .version("0.1.0-alpha.0");

  program
    .command("init")
    .description("Scaffold agentqa.config.ts in the current project, with framework-aware defaults.")
    .option("--force", "overwrite an existing agentqa.config.ts", false)
    .option("--cwd <path>", "project root (default: process.cwd())")
    .action((opts: { force: boolean; cwd?: string }) => {
      const init: { force: boolean; cwd?: string } = { force: opts.force };
      if (opts.cwd !== undefined) init.cwd = opts.cwd;
      const r = runInit(init);
      printInitResult(r);
    });

  program
    .command("run")
    .description("Run AgentQA against a diff and produce a review report.")
    .option("-c, --config <path>", "path to agentqa.config.{ts,mjs,js,json}")
    .option("-d, --diff <spec>", '"<base>..<head>" or "<base>...<head>" (default: GITHUB_BASE_REF..HEAD)')
    .option("--only <names...>", "run only the named perspectives (built-in or custom)")
    .option(
      "-r, --reporter <name...>",
      `subset of reporters to run (${VALID_REPORTERS.join(", ")})`,
    )
    .option("--ci", "CI mode — read PR context from GITHUB_EVENT_PATH; allow github-pr-comment", false)
    .option("--verbose", "stream tool calls and per-perspective progress", false)
    .option("--out <dir>", "output directory for report files (default: cwd)")
    .action(
      async (opts: {
        config?: string;
        diff?: string;
        only?: string[];
        reporter?: string[];
        ci: boolean;
        verbose: boolean;
        out?: string;
      }) => {
        const reporters = (opts.reporter ?? []).filter((r): r is ReporterName =>
          (VALID_REPORTERS as readonly string[]).includes(r),
        );
        if ((opts.reporter ?? []).length > 0 && reporters.length !== (opts.reporter ?? []).length) {
          const bad = (opts.reporter ?? []).filter(
            (r) => !(VALID_REPORTERS as readonly string[]).includes(r),
          );
          console.error(pc.red(`Unknown reporter(s): ${bad.join(", ")}`));
          process.exit(3);
        }
        const runOpts: Parameters<typeof runRun>[0] = {
          ci: opts.ci,
          verbose: opts.verbose,
        };
        if (opts.config !== undefined) runOpts.configPath = opts.config;
        if (opts.diff !== undefined) runOpts.diff = opts.diff;
        if (opts.only !== undefined) runOpts.only = opts.only;
        if (reporters.length > 0) runOpts.reporters = reporters;
        if (opts.out !== undefined) runOpts.outputDir = opts.out;
        const code = await runRun(runOpts);
        process.exit(code);
      },
    );

  return program;
}

const program = buildProgram();
program.parseAsync(process.argv).catch((err) => {
  console.error(pc.red(`Fatal: ${(err as Error).message}`));
  process.exit(3);
});

export { buildProgram };
