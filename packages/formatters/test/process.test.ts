import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { findExecutable, runProcess, summarizeStderr, validateConfiguredPath } from "../src/process";

/**
 * Process-safety tests.
 *
 * These use a small shell script as a stand-in formatter so the behaviour under
 * test (argument passing, timeouts, bounded output, spawn failures) is exercised
 * for real, without depending on ruff or gofmt being installed on the machine
 * running the suite. Skipped on Windows, where the script cannot run.
 */
const posix = process.platform !== "win32";
let dir: string;
let script: string;

beforeAll(() => {
  if (!posix) return;
  dir = mkdtempSync(join(tmpdir(), "ctr-proc-"));
  script = join(dir, "fakefmt");
  writeFileSync(
    script,
    [
      "#!/bin/sh",
      'case "$1" in',
      '  --version) echo "fakefmt 1.2.3"; exit 0 ;;',
      '  --fail) echo "boom: syntax error at line 3" >&2; exit 2 ;;',
      '  --hang) sleep 30; exit 0 ;;',
      '  --empty) exit 0 ;;',
      '  --echo-args) shift; for a in "$@"; do echo "[$a]"; done; exit 0 ;;',
      '  --flood) i=0; while [ $i -lt 200000 ]; do echo "0123456789012345678901234567890123456789"; i=$((i+1)); done ;;',
      "esac",
      "tr '[:lower:]' '[:upper:]'",
    ].join("\n"),
  );
  chmodSync(script, 0o755);
});

describe("runProcess", () => {
  it("pipes stdin through to stdout", async () => {
    if (!posix) return;
    const r = await runProcess(script, [], { input: "hello world\n" });
    expect(r.ok).toBe(true);
    expect(r.stdout).toBe("HELLO WORLD\n");
  });

  it("passes arguments as data, not as shell syntax", async () => {
    if (!posix) return;
    // If any of these reached a shell they would delete files, substitute
    // commands, or chain a second process.
    const hostile = ["; rm -rf /tmp/nope", "$(whoami)", "`id`", "&& echo pwned", "|| echo pwned"];
    const r = await runProcess(script, ["--echo-args", ...hostile], {});
    expect(r.ok).toBe(true);
    for (const arg of hostile) {
      expect(r.stdout).toContain(`[${arg}]`);
    }
    // Nothing was expanded or executed. Checked per line rather than by
    // substring, because the payloads legitimately *contain* the word "pwned"
    // as data; what must not exist is a bare line produced by running `echo`.
    const lines = r.stdout.split("\n").map((l) => l.trim());
    expect(lines).not.toContain("pwned");
    // `$(whoami)` and `id` would produce a username or a uid= line.
    expect(r.stdout).not.toContain("uid=");
    expect(lines.every((l) => l === "" || l.startsWith("["))).toBe(true);
  });

  it("reports a non-zero exit with its stderr rather than throwing", async () => {
    if (!posix) return;
    const r = await runProcess(script, ["--fail"], {});
    expect(r.ok).toBe(false);
    expect(r.stderr).toContain("syntax error");
    expect(r.timedOut).toBe(false);
  });

  it("kills a hung process at the timeout", async () => {
    if (!posix) return;
    const started = Date.now();
    const r = await runProcess(script, ["--hang"], { timeoutMs: 300 });
    expect(r.ok).toBe(false);
    expect(r.timedOut).toBe(true);
    // Well under the script's own 30s sleep.
    expect(Date.now() - started).toBeLessThan(10_000);
  }, 20_000);

  it("bounds captured output", async () => {
    if (!posix) return;
    const r = await runProcess(script, ["--flood"], { maxBuffer: 4096, timeoutMs: 15_000 });
    // Either the buffer cap or the timeout stops it; what matters is that the
    // process does not return megabytes into memory.
    expect(r.stdout.length).toBeLessThan(1_000_000);
  }, 25_000);

  it("reports a missing executable instead of throwing", async () => {
    const r = await runProcess("/nonexistent/definitely-not-here", [], {});
    expect(r.ok).toBe(false);
    expect(r.spawnError).toBeTruthy();
  });

  it("does not leak the ambient environment to the child", async () => {
    if (!posix) return;
    const envScript = join(dir, "printenv-test");
    writeFileSync(envScript, "#!/bin/sh\necho \"${CTR_SECRET:-absent}\"\n");
    chmodSync(envScript, 0o755);
    process.env.CTR_SECRET = "leaked";
    try {
      const r = await runProcess(envScript, [], {});
      expect(r.stdout.trim()).toBe("absent");
    } finally {
      delete process.env.CTR_SECRET;
    }
  });

  it("still passes PATH so interpreters can find their runtime", async () => {
    if (!posix) return;
    const pathScript = join(dir, "path-test");
    writeFileSync(pathScript, '#!/bin/sh\ntest -n "$PATH" && echo has-path\n');
    chmodSync(pathScript, 0o755);
    const r = await runProcess(pathScript, [], {});
    expect(r.stdout.trim()).toBe("has-path");
  });

  it("survives a formatter that exits before reading stdin", async () => {
    if (!posix) return;
    // Writing to a closed stdin raises EPIPE; it must not surface as a failure
    // beyond what the exit code already reports.
    const r = await runProcess(script, ["--empty"], { input: "x".repeat(100_000) });
    expect(r.ok).toBe(true);
  });
});

describe("findExecutable", () => {
  it("finds a program on PATH and returns an absolute path", () => {
    if (!posix) return;
    const found = findExecutable("sh");
    expect(found).toBeTruthy();
    expect(found?.startsWith("/")).toBe(true);
  });

  it("returns null for a program that is not installed", () => {
    expect(findExecutable("definitely-not-a-real-program-xyzzy")).toBeNull();
  });

  it("treats a name containing a separator as a path", () => {
    if (!posix) return;
    expect(findExecutable(script)).toBe(script);
    expect(findExecutable("/nonexistent/thing")).toBeNull();
  });
});

describe("validateConfiguredPath", () => {
  it("accepts an absolute path to an executable", () => {
    if (!posix) return;
    expect(validateConfiguredPath(script)).toEqual({ ok: true, path: script });
  });

  it("rejects a relative path", () => {
    const result = validateConfiguredPath("./bin/formatter");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("absolute");
  });

  it("rejects a path that is not an executable file", () => {
    if (!posix) return;
    const plain = join(dir, "not-executable.txt");
    writeFileSync(plain, "text");
    chmodSync(plain, 0o644);
    const result = validateConfiguredPath(plain);
    expect(result.ok).toBe(false);
  });

  it("rejects an empty path", () => {
    expect(validateConfiguredPath("").ok).toBe(false);
  });
});

describe("summarizeStderr", () => {
  it("trims to a readable length", () => {
    const long = new Array(50).fill("error line").join("\n");
    const summary = summarizeStderr(long, 3);
    expect(summary.split("\n")).toHaveLength(3);
  });

  it("returns empty for empty input", () => {
    expect(summarizeStderr("   \n  ")).toBe("");
  });
});
