import { runShell } from "./shell.js";
import type { ChangedFile } from "../types.js";

export interface DiffResult {
  base: string;
  head: string;
  files: ChangedFile[];
  raw: string;
}

export interface DiffOptions {
  cwd?: string;
}

export async function resolveDiff(
  base: string,
  head: string,
  opts: DiffOptions = {},
): Promise<DiffResult> {
  const cwd = opts.cwd ?? process.cwd();

  const baseSha = await revParse(base, cwd);
  const headSha = await revParse(head, cwd);

  const nameStatus = await runShell(
    "git",
    ["diff", "--name-status", "-M", `${baseSha}...${headSha}`],
    { cwd },
  );
  if (nameStatus.exitCode !== 0) {
    throw new Error(`git diff --name-status failed: ${nameStatus.stderr.trim()}`);
  }
  const files = parseNameStatus(nameStatus.stdout);

  const raw = await runShell(
    "git",
    ["diff", "--unified=3", `${baseSha}...${headSha}`],
    { cwd, maxBuffer: 32 * 1024 * 1024 },
  );
  if (raw.exitCode !== 0) {
    throw new Error(`git diff failed: ${raw.stderr.trim()}`);
  }

  return { base: baseSha, head: headSha, files, raw: raw.stdout };
}

async function revParse(ref: string, cwd: string): Promise<string> {
  const r = await runShell("git", ["rev-parse", "--verify", `${ref}^{commit}`], { cwd });
  if (r.exitCode !== 0) {
    throw new Error(`Unknown ref "${ref}": ${r.stderr.trim()}`);
  }
  return r.stdout.trim();
}

function parseNameStatus(out: string): ChangedFile[] {
  const files: ChangedFile[] = [];
  for (const line of out.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cols = line.split("\t");
    const code = cols[0];
    if (!code) continue;
    const k = code[0];
    if (k === "A" && cols[1]) {
      files.push({ path: cols[1], kind: "added" });
    } else if (k === "M" && cols[1]) {
      files.push({ path: cols[1], kind: "modified" });
    } else if (k === "D" && cols[1]) {
      files.push({ path: cols[1], kind: "deleted" });
    } else if (k === "R" && cols[1] && cols[2]) {
      files.push({ path: cols[2], kind: "renamed", previousPath: cols[1] });
    } else if (cols[1]) {
      // Unknown / copied — fall back to "modified".
      files.push({ path: cols[1], kind: "modified" });
    }
  }
  return files;
}
