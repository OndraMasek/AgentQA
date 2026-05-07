import { existsSync, readFileSync } from "node:fs";
import { hasBinary, runShell } from "../core/shell.js";
import { STICKY_MARKER } from "./markdown.js";

interface IssueComment {
  id: number;
  body: string;
}

interface PRContext {
  number: number;
  repo: string;
}

function readPRContext(): PRContext | null {
  if (!process.env.GITHUB_EVENT_PATH || !existsSync(process.env.GITHUB_EVENT_PATH)) return null;
  try {
    const ev = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8")) as {
      pull_request?: { number: number };
      repository?: { full_name: string };
    };
    if (ev.pull_request && ev.repository) {
      return { number: ev.pull_request.number, repo: ev.repository.full_name };
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Find the existing AgentQA sticky comment on this PR (by `<!-- agentqa-comment -->`
 * marker) and update it; otherwise, post a new one. No-op when not running in
 * a GitHub Actions PR context or when `gh` is not on PATH.
 */
export async function upsertStickyComment(body: string): Promise<{ skipped: boolean; reason?: string }> {
  const ctx = readPRContext();
  if (!ctx) return { skipped: true, reason: "not a GitHub PR context" };
  if (!(await hasBinary("gh"))) return { skipped: true, reason: "gh CLI not available" };

  const list = await runShell(
    "gh",
    ["api", `repos/${ctx.repo}/issues/${ctx.number}/comments`, "--paginate"],
    { timeoutMs: 30_000 },
  );
  if (list.exitCode !== 0) {
    return { skipped: true, reason: `gh api list failed: ${list.stderr.trim()}` };
  }

  let existing: IssueComment | null = null;
  try {
    const arr = JSON.parse(list.stdout) as IssueComment[];
    if (Array.isArray(arr)) {
      const found = arr.find((c) => typeof c.body === "string" && c.body.includes(STICKY_MARKER));
      if (found) existing = found;
    }
  } catch {
    // Malformed gh output — fall through to creating a new comment.
  }

  if (existing) {
    const r = await runShell(
      "gh",
      [
        "api",
        "--method",
        "PATCH",
        `repos/${ctx.repo}/issues/comments/${existing.id}`,
        "-f",
        `body=${body}`,
      ],
      { timeoutMs: 30_000 },
    );
    if (r.exitCode !== 0) return { skipped: true, reason: `gh api PATCH failed: ${r.stderr.trim()}` };
    return { skipped: false };
  }
  const r = await runShell(
    "gh",
    [
      "api",
      "--method",
      "POST",
      `repos/${ctx.repo}/issues/${ctx.number}/comments`,
      "-f",
      `body=${body}`,
    ],
    { timeoutMs: 30_000 },
  );
  if (r.exitCode !== 0) return { skipped: true, reason: `gh api POST failed: ${r.stderr.trim()}` };
  return { skipped: false };
}
