import { execFile } from "node:child_process";
import { accessSync, constants, statSync } from "node:fs";
import { delimiter, isAbsolute, join } from "node:path";

/**
 * Safe local process invocation for external formatters.
 *
 * Every rule here exists because the alternative is a vulnerability:
 *
 *   - `execFile` with an argument array, never `exec` with a command string.
 *     A file path containing `; rm -rf ~` is data, not syntax.
 *   - `shell: false` explicitly, so no shell is spawned even on Windows, where
 *     Node will otherwise use cmd.exe for `.cmd` and `.bat` shims.
 *   - A minimal, explicit environment. Inheriting the full environment lets a
 *     hostile workspace steer an interpreter through NODE_OPTIONS,
 *     PYTHONSTARTUP, RUSTC_WRAPPER and similar.
 *   - A hard timeout with SIGKILL follow-up, so a formatter that waits on stdin
 *     cannot wedge the extension host forever.
 *   - Bounded stdout and stderr, so a formatter that emits gigabytes cannot
 *     exhaust memory.
 *   - Executables are resolved from PATH by directory scan rather than by
 *     handing a bare name to the OS resolver, and a configured path must be an
 *     existing executable file.
 *
 * No formatter is ever downloaded. Discovery only ever finds what the user has
 * already installed.
 */

/** Default ceiling on a formatter's runtime. */
export const DEFAULT_TIMEOUT_MS = 10_000;

/** Default ceiling on captured output, per stream. */
export const DEFAULT_MAX_BUFFER = 8 * 1024 * 1024;

export interface RunOptions {
  readonly cwd?: string;
  readonly timeoutMs?: number;
  readonly maxBuffer?: number;
  /** Text piped to the process's stdin. */
  readonly input?: string;
  /**
   * Extra environment entries. Merged onto the minimal base environment; a
   * caller cannot remove the base entries, only add to them.
   */
  readonly env?: Readonly<Record<string, string>>;
}

export interface RunResult {
  readonly ok: boolean;
  readonly stdout: string;
  readonly stderr: string;
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly timedOut: boolean;
  /** Populated when the process could not be started at all. */
  readonly spawnError?: string;
  readonly durationMs: number;
}

/**
 * The environment every formatter subprocess starts from.
 *
 * PATH and HOME are needed for interpreters to find their own runtime and user
 * configuration. Everything else is omitted deliberately.
 */
function baseEnv(): Record<string, string> {
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? "",
    HOME: process.env.HOME ?? "",
    // Formatters that colourise output would otherwise embed ANSI escapes in
    // the formatted source.
    NO_COLOR: "1",
    TERM: "dumb",
    LANG: process.env.LANG ?? "C.UTF-8",
  };
  // Windows needs these to locate its own system libraries.
  for (const key of ["SYSTEMROOT", "COMSPEC", "PATHEXT", "USERPROFILE", "TEMP", "TMP"]) {
    const value = process.env[key];
    if (value) env[key] = value;
  }
  return env;
}

/**
 * Run a local executable with an argument array.
 *
 * Never throws for a non-zero exit or a missing binary: both are ordinary
 * outcomes for optional formatters, and a caller needs the detail to report a
 * useful message rather than a stack trace.
 */
export function runProcess(
  executable: string,
  args: readonly string[],
  options: RunOptions = {},
): Promise<RunResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBuffer = options.maxBuffer ?? DEFAULT_MAX_BUFFER;
  const started = Date.now();

  return new Promise<RunResult>((resolve) => {
    let settled = false;
    const finish = (r: Omit<RunResult, "durationMs">): void => {
      if (settled) return;
      settled = true;
      resolve({ ...r, durationMs: Date.now() - started });
    };

    const child = execFile(
      executable,
      [...args],
      {
        ...(options.cwd ? { cwd: options.cwd } : {}),
        env: { ...baseEnv(), ...options.env },
        timeout: timeoutMs,
        maxBuffer,
        encoding: "utf8",
        // Explicit: never route through a shell, on any platform.
        shell: false,
        windowsHide: true,
        // execFile's own timeout sends SIGTERM; a process ignoring it is killed
        // by the watchdog below.
        killSignal: "SIGTERM",
      },
      (error, stdout, stderr) => {
        const err = error as (Error & { code?: number | string; signal?: NodeJS.Signals }) | null;
        const timedOut = err?.signal === "SIGTERM" || err?.signal === "SIGKILL";
        // ENOENT/EACCES mean the process never started, which is different from
        // a formatter that ran and rejected the input.
        const spawnFailed =
          typeof err?.code === "string" && ["ENOENT", "EACCES", "EPERM"].includes(err.code);
        finish({
          ok: !err,
          stdout: typeof stdout === "string" ? stdout : "",
          stderr: typeof stderr === "string" ? stderr : "",
          code: typeof err?.code === "number" ? err.code : err ? 1 : 0,
          signal: err?.signal ?? null,
          timedOut,
          ...(spawnFailed ? { spawnError: `${err?.code}: ${executable} could not be started` } : {}),
        });
      },
    );

    // Watchdog: execFile's timeout only sends SIGTERM. A formatter blocked on a
    // read, or one that installs a SIGTERM handler, survives it.
    const watchdog = setTimeout(() => {
      if (!child.killed) child.kill("SIGKILL");
    }, timeoutMs + 2_000);
    watchdog.unref?.();
    child.on("exit", () => clearTimeout(watchdog));

    child.on("error", (err: NodeJS.ErrnoException) => {
      clearTimeout(watchdog);
      finish({
        ok: false,
        stdout: "",
        stderr: "",
        code: null,
        signal: null,
        timedOut: false,
        spawnError: `${err.code ?? "spawn failed"}: ${err.message}`,
      });
    });

    if (options.input !== undefined && child.stdin) {
      // A formatter that exits before reading stdin makes this write fail with
      // EPIPE. That is not an error worth surfacing: the exit code already
      // tells the real story.
      child.stdin.on("error", () => {});
      child.stdin.end(options.input);
    }
  });
}

/** Executable file extensions to try on Windows, in order. */
function windowsExtensions(): string[] {
  const pathext = process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD";
  return pathext.split(";").filter(Boolean);
}

function isExecutableFile(path: string): boolean {
  try {
    if (!statSync(path).isFile()) return false;
    if (process.platform !== "win32") accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Find an executable on PATH.
 *
 * Scans PATH directories explicitly rather than handing a bare name to the OS
 * resolver, so the resolved absolute path can be recorded in the result — which
 * is what makes a formatting run reproducible ("formatted by /usr/bin/gofmt",
 * not "formatted by whatever gofmt meant that day").
 *
 * Returns null rather than throwing: an absent optional formatter is normal.
 */
export function findExecutable(name: string): string | null {
  // A name containing a separator is a path, not a PATH lookup.
  if (name.includes("/") || name.includes("\\")) {
    return isExecutableFile(name) ? name : null;
  }
  const dirs = (process.env.PATH ?? "").split(delimiter).filter(Boolean);
  const candidates = process.platform === "win32" ? ["", ...windowsExtensions()] : [""];
  for (const dir of dirs) {
    for (const ext of candidates) {
      const full = join(dir, name + ext);
      if (isExecutableFile(full)) return full;
    }
  }
  return null;
}

/**
 * Validate a user-configured executable path.
 *
 * A configured path must be absolute and must already exist as an executable
 * file. Relative paths are refused because they would resolve against whatever
 * the process working directory happens to be, which in an extension host is
 * not something the user can reason about — and a workspace-relative setting
 * pointing at a checked-in binary is exactly the supply-chain shape to avoid.
 */
export function validateConfiguredPath(path: string): { ok: true; path: string } | { ok: false; reason: string } {
  if (!path) return { ok: false, reason: "empty path" };
  if (!isAbsolute(path)) {
    return {
      ok: false,
      reason: `"${path}" is not an absolute path. Configure the full path to the executable.`,
    };
  }
  if (!isExecutableFile(path)) {
    return { ok: false, reason: `"${path}" is not an executable file.` };
  }
  return { ok: true, path };
}

/** Trim captured output to a sane length for an error message. */
export function summarizeStderr(stderr: string, maxLines = 8, maxChars = 800): string {
  const trimmed = stderr.trim();
  if (!trimmed) return "";
  const lines = trimmed.split("\n").slice(0, maxLines);
  const text = lines.join("\n");
  return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
}
