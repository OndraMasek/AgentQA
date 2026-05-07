import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentQAConfig, AgentTool, CustomAgentConfig } from "../config/schema.js";
import type { Severity } from "../types.js";

export interface AgentDefinition {
  name: string;
  systemPrompt: string;
  tools: AgentTool[];
  scope: string[];
  maxTurns: number;
  timeoutMs: number;
  severityFloor?: Severity;
  extraContext?: string;
  /** Higher = kept first when budget pressure forces drops. */
  priority: number;
}

const HERE = dirname(fileURLToPath(import.meta.url));

function loadPrompt(name: string): string {
  // After build, prompt.md sits next to the compiled index.js.
  // Before build (tests), it sits in src/agents/<name>/prompt.md.
  const candidates = [
    resolve(HERE, name, "prompt.md"),
    resolve(HERE, "..", "..", "src", "agents", name, "prompt.md"),
  ];
  for (const p of candidates) {
    try {
      return readFileSync(p, "utf8");
    } catch {
      // try next
    }
  }
  throw new Error(`Could not locate prompt.md for built-in agent "${name}"`);
}

export function defineAgent(input: AgentDefinition): AgentDefinition {
  return input;
}

export function materialiseAgents(config: AgentQAConfig): AgentDefinition[] {
  const out: AgentDefinition[] = [];
  let priority = 100;

  if (config.agents.functional?.enabled !== false) {
    const c = config.agents.functional;
    out.push(
      defineAgent({
        name: "functional",
        systemPrompt: loadPrompt("functional"),
        tools: ["Read", "Grep", "Glob"],
        scope: c?.scope ?? ["**/*"],
        maxTurns: c?.maxTurns ?? 15,
        timeoutMs: c?.timeoutMs ?? 60_000,
        ...(c?.severityFloor !== undefined ? { severityFloor: c.severityFloor } : {}),
        ...(c?.extraContext !== undefined ? { extraContext: c.extraContext } : {}),
        priority: priority--,
      }),
    );
  }

  if (config.agents.regression?.enabled !== false) {
    const c = config.agents.regression;
    out.push(
      defineAgent({
        name: "regression",
        systemPrompt:
          loadPrompt("regression") +
          (c?.depth === "deep" ? "\n\n[depth=deep] Investigate transitive callers up to 2 hops." : ""),
        tools: ["Read", "Grep", "Glob"],
        scope: c?.scope ?? ["**/*"],
        maxTurns: c?.maxTurns ?? 15,
        timeoutMs: c?.timeoutMs ?? 60_000,
        ...(c?.severityFloor !== undefined ? { severityFloor: c.severityFloor } : {}),
        ...(c?.extraContext !== undefined ? { extraContext: c.extraContext } : {}),
        priority: priority--,
      }),
    );
  }

  if (config.agents.smoke?.enabled !== false) {
    const c = config.agents.smoke;
    const baseUrl = c?.baseUrl ?? process.env.AGENTQA_PREVIEW_URL;
    const routes = c?.routes ?? ["/"];
    out.push(
      defineAgent({
        name: "smoke",
        systemPrompt:
          loadPrompt("smoke") +
          `\n\nbaseUrl: ${baseUrl ?? "(unset — agent should report a meta finding)"}\nroutes: ${JSON.stringify(routes)}`,
        tools: ["Bash", "WebFetch"],
        scope: c?.scope ?? ["**/*"],
        maxTurns: c?.maxTurns ?? 15,
        timeoutMs: c?.timeoutMs ?? 60_000,
        ...(c?.severityFloor !== undefined ? { severityFloor: c.severityFloor } : {}),
        ...(c?.extraContext !== undefined ? { extraContext: c.extraContext } : {}),
        priority: priority--,
      }),
    );
  }

  for (const cu of config.agents.custom) {
    out.push(materialiseCustom(cu, priority--));
  }
  return out;
}

function materialiseCustom(c: CustomAgentConfig, priority: number): AgentDefinition {
  return defineAgent({
    name: c.name,
    systemPrompt: c.prompt,
    tools: c.tools,
    scope: c.scope,
    maxTurns: c.maxTurns,
    timeoutMs: c.timeoutMs,
    ...(c.severityFloor !== undefined ? { severityFloor: c.severityFloor } : {}),
    ...(c.extraContext !== undefined ? { extraContext: c.extraContext } : {}),
    priority,
  });
}
