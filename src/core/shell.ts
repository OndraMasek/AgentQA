import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

export interface RunShellOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  maxBuffer?: number;
}

export interface ShellResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Run a binary with an explicit argv. Never accepts a single concatenated
 * command string — argv MUST be an array. No shell, no interpolation.
 *
 * On non-zero exit codes, returns the result rather than throwing, so callers
 * can branch on `result.exitCode`. Throws only on spawn failure (binary not
 * found, etc.).
 */
export async function runShell(
  bin: string,
  args: readonly string[],
  opts: RunShellOptions = {},
): Promise<ShellResult> {
  try {
    const { stdout, stderr } = await execFileP(bin, args as string[], {
      cwd: opts.cwd ?? process.cwd(),
      env: opts.env ?? process.env,
      timeout: opts.timeoutMs ?? 30_000,
      maxBuffer: opts.maxBuffer ?? 8 * 1024 * 1024,
      shell: false,
      windowsHide: true,
    });
    return { stdout: String(stdout), stderr: String(stderr), exitCode: 0 };
  } catch (err) {
    const e = err as NodeJS.ErrnoException & {
      stdout?: string;
      stderr?: string;
      code?: string | number;
    };
    if (typeof e.code === "string") {
      // Spawn failure (e.g. ENOENT — binary not found).
      throw new Error(`Failed to run ${bin}: ${e.message}`);
    }
    return {
      stdout: String(e.stdout ?? ""),
      stderr: String(e.stderr ?? ""),
      exitCode: typeof e.code === "number" ? e.code : 1,
    };
  }
}

export async function hasBinary(bin: string): Promise<boolean> {
  try {
    const which = process.platform === "win32" ? "where" : "which";
    const r = await runShell(which, [bin], { timeoutMs: 5_000 });
    return r.exitCode === 0;
  } catch {
    return false;
  }
}
