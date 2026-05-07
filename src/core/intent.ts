import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { IntentBundleSchema } from "../../specs/001-agentqa-mvp/contracts/intent.schema.js";
import type { AgentQAConfig } from "../config/schema.js";
import type { IntentBundle, LinkedIssue, RepoDoc } from "../types.js";
import type { DiffResult } from "./diff.js";
import { hasBinary, runShell } from "./shell.js";

export interface BuildIntentInput {
  config: AgentQAConfig;
  diff: DiffResult;
  ci: boolean;
  cwd?: string;
}

const ISSUE_REF_RE = /(?:fixes|closes|resolves)\s+#(\d+)/gi;

export async function buildIntent(input: BuildIntentInput): Promise<IntentBundle> {
  const cwd = input.cwd ?? process.cwd();
  const sources = new Set(input.config.intentSources);

  let pr: IntentBundle["pr"];
  let prBody = "";
  if (input.ci && process.env.GITHUB_EVENT_PATH && existsSync(process.env.GITHUB_EVENT_PATH)) {
    try {
      const ev = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8")) as {
        pull_request?: {
          number: number;
          title: string;
          body: string | null;
          base: { ref: string };
          head: { ref: string };
        };
        repository?: { full_name: string };
      };
      if (ev.pull_request && ev.repository) {
        prBody = sources.has("pr-body") ? (ev.pull_request.body ?? "") : "";
        pr = {
          number: ev.pull_request.number,
          title: ev.pull_request.title,
          body: prBody,
          baseRef: ev.pull_request.base.ref,
          headRef: ev.pull_request.head.ref,
          repo: ev.repository.full_name,
        };
      }
    } catch {
      // Malformed event JSON — degrade silently; spec edge case 1 still applies.
    }
  }

  let commitMessages: string[] = [];
  if (sources.has("commit-messages")) {
    const r = await runShell(
      "git",
      ["log", "--pretty=%B%n--AGENTQA-COMMIT-DELIM--", `${input.diff.base}..${input.diff.head}`],
      { cwd },
    );
    if (r.exitCode === 0) {
      commitMessages = r.stdout
        .split("--AGENTQA-COMMIT-DELIM--")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    }
  }

  let linkedIssues: LinkedIssue[] = [];
  if (sources.has("linked-issues")) {
    const ids = collectIssueRefs(prBody, commitMessages);
    if (ids.length > 0 && (await hasBinary("gh"))) {
      linkedIssues = await fetchIssues(ids, cwd);
    }
  }

  const repoDocs: RepoDoc[] = readRepoDocs(input.config.contextDocs, cwd);

  const bundle: IntentBundle = {
    diff: {
      base: input.diff.base,
      head: input.diff.head,
      files: input.diff.files,
      raw: input.diff.raw,
    },
    ...(pr !== undefined ? { pr } : {}),
    linkedIssues,
    commitMessages,
    repoDocs,
  };
  return IntentBundleSchema.parse(bundle);
}

export function collectIssueRefs(prBody: string, commits: string[]): string[] {
  const ids = new Set<string>();
  const collect = (text: string) => {
    for (const m of text.matchAll(ISSUE_REF_RE)) {
      if (m[1]) ids.add(m[1]);
    }
  };
  collect(prBody);
  for (const c of commits) collect(c);
  return [...ids];
}

async function fetchIssues(ids: string[], cwd: string): Promise<LinkedIssue[]> {
  const out: LinkedIssue[] = [];
  for (const id of ids) {
    const r = await runShell("gh", ["issue", "view", id, "--json", "number,title,body"], {
      cwd,
      timeoutMs: 10_000,
    });
    if (r.exitCode !== 0) continue;
    try {
      const j = JSON.parse(r.stdout) as { number: number; title: string; body: string };
      out.push({
        id: String(j.number),
        title: j.title ?? "",
        body: j.body ?? "",
        source: "github",
      });
    } catch {
      // Malformed gh output — skip.
    }
  }
  return out;
}

function readRepoDocs(paths: string[], cwd: string): RepoDoc[] {
  const out: RepoDoc[] = [];
  for (const p of paths) {
    const abs = resolve(cwd, p);
    if (!existsSync(abs)) continue;
    try {
      out.push({ path: p, content: readFileSync(abs, "utf8") });
    } catch {
      // Unreadable — skip; not fatal.
    }
  }
  return out;
}
