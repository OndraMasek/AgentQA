import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import type { ZodError } from "zod";
import { AgentQAConfigSchema } from "./schema.js";
import type { AgentQAConfig } from "./schema.js";

const CONFIG_FILENAMES = [
  "agentqa.config.ts",
  "agentqa.config.mjs",
  "agentqa.config.js",
  "agentqa.config.json",
];

export class ConfigError extends Error {
  public readonly reason?: unknown;
  constructor(message: string, reason?: unknown) {
    super(message);
    this.name = "ConfigError";
    if (reason !== undefined) this.reason = reason;
  }
}

/** Walk up from `from` looking for the first known config filename. */
export function locateConfig(from: string = process.cwd()): string | null {
  let dir = isAbsolute(from) ? from : resolve(from);
  while (true) {
    for (const name of CONFIG_FILENAMES) {
      const candidate = resolve(dir, name);
      if (existsSync(candidate)) return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

async function loadAsModule(filePath: string): Promise<unknown> {
  if (filePath.endsWith(".json")) {
    return JSON.parse(readFileSync(filePath, "utf8"));
  }
  if (filePath.endsWith(".mjs") || filePath.endsWith(".js")) {
    const mod = await import(pathToFileURL(filePath).href);
    return mod.default ?? mod;
  }
  // .ts — transform in memory and import via data: URL
  const result = await build({
    entryPoints: [filePath],
    bundle: false,
    format: "esm",
    platform: "node",
    target: "node22",
    write: false,
    sourcemap: "inline",
  });
  const file = result.outputFiles[0];
  if (!file) throw new ConfigError("esbuild produced no output");
  const dataUrl = `data:text/javascript;base64,${Buffer.from(file.text).toString("base64")}`;
  const mod = await import(dataUrl);
  return mod.default ?? mod;
}

export interface LoadedConfig {
  path: string;
  config: AgentQAConfig;
}

export async function loadConfig(opts: { configPath?: string; from?: string } = {}): Promise<LoadedConfig> {
  const path =
    opts.configPath !== undefined
      ? resolve(opts.configPath)
      : locateConfig(opts.from);
  if (!path) {
    throw new ConfigError(
      "No agentqa.config.{ts,mjs,js,json} found in CWD or any parent directory. Run `agentqa init` to scaffold one.",
    );
  }
  if (!existsSync(path)) {
    throw new ConfigError(`Config file not found: ${path}`);
  }
  let raw: unknown;
  try {
    raw = await loadAsModule(path);
  } catch (err) {
    throw new ConfigError(`Failed to load ${path}`, err);
  }
  const parsed = AgentQAConfigSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ConfigError(formatZodError(parsed.error, path), parsed.error);
  }
  return { path, config: parsed.data };
}

function formatZodError(err: ZodError, path: string): string {
  const issues = err.issues
    .map((i) => `  - ${i.path.length === 0 ? "<root>" : i.path.join(".")}: ${i.message}`)
    .join("\n");
  return `Invalid config (${path}):\n${issues}`;
}
