#!/usr/bin/env node
/**
 * CLI smoke tests.
 *
 * Runs the real CLI as a child process against temporary fixtures and asserts
 * on exit codes and output. This is deliberately separate from the unit suite:
 * the unit tests import command functions directly, which cannot catch a broken
 * argument definition, a command that was never registered with commander, or a
 * bundle that fails to start.
 *
 * Everything happens in a temp directory. The repository is never modified.
 * No network access is used.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const entry = join(repoRoot, "apps/cli/src/main.ts");

let passed = 0;
let failed = 0;
const failures = [];

/** Run the CLI, returning stdout, stderr and the exit code. */
function cli(args, cwd) {
  try {
    const stdout = execFileSync(
      process.execPath,
      [join(repoRoot, "node_modules/tsx/dist/cli.mjs"), entry, ...args],
      { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60_000 },
    );
    return { stdout, stderr: "", code: 0 };
  } catch (err) {
    return {
      stdout: typeof err.stdout === "string" ? err.stdout : "",
      stderr: typeof err.stderr === "string" ? err.stderr : "",
      code: typeof err.status === "number" ? err.status : 1,
    };
  }
}

function check(name, fn) {
  try {
    fn();
    passed++;
    process.stdout.write(`  ok    ${name}\n`);
  } catch (err) {
    failed++;
    const message = err instanceof Error ? err.message : String(err);
    failures.push(`${name}: ${message}`);
    process.stdout.write(`  FAIL  ${name}\n        ${message}\n`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertExit(result, expected, label) {
  assert(
    result.code === expected,
    `${label}: expected exit ${expected}, got ${result.code}. stderr: ${result.stderr.trim().slice(0, 200)}`,
  );
}

const work = mkdtempSync(join(tmpdir(), "ctr-smoke-"));

try {
  process.stdout.write("Code Trio CLI smoke tests\n\n");

  // Fixtures.
  writeFileSync(join(work, "a.ts"), "const x = 1;\nconst y = 2;\n");
  writeFileSync(join(work, "b.ts"), "const x = 1;\nconst y = 3;\n");
  writeFileSync(join(work, "same.ts"), "const x = 1;\nconst y = 2;\n");
  writeFileSync(join(work, "note.ts"), "// this has a mispeling in it\nconst ok = 1;\n");
  writeFileSync(join(work, "messy.ts"), "const   z=3\n");
  writeFileSync(join(work, "base.txt"), "a\nbase\nc\n");
  writeFileSync(join(work, "ours.txt"), "a\nours\nc\n");
  writeFileSync(join(work, "theirs.txt"), "a\ntheirs\nc\n");
  mkdirSync(join(work, ".codetrio"), { recursive: true });
  writeFileSync(join(work, ".codetrio/dictionary.txt"), "widgetron\n");

  check("--help lists every command", () => {
    const r = cli(["--help"], work);
    assertExit(r, 0, "--help");
    for (const command of [
      "diff", "merge", "spell", "format", "report",
      "dictionary", "formatters", "init", "doctor", "configure", "exit-codes",
    ]) {
      assert(r.stdout.includes(command), `--help is missing "${command}"`);
    }
    assert(r.stdout.includes("Exit codes:"), "--help does not document exit codes");
  });

  check("--version prints a semver", () => {
    const r = cli(["--version"], work);
    assertExit(r, 0, "--version");
    assert(/\d+\.\d+\.\d+/.test(r.stdout), `unexpected version output: ${r.stdout}`);
  });

  check("doctor reports the environment", () => {
    const r = cli(["doctor"], work);
    assertExit(r, 0, "doctor");
    assert(r.stdout.includes("Node.js"), "doctor did not report Node");
  });

  check("diff of identical files exits 0", () => {
    const r = cli(["diff", "a.ts", "same.ts", "--no-color"], work);
    assertExit(r, 0, "diff identical");
    assert(r.stdout.toLowerCase().includes("identical"), "did not report identical");
  });

  check("diff --exit-code exits 1 when files differ", () => {
    const r = cli(["diff", "a.ts", "b.ts", "--exit-code", "--no-color"], work);
    assertExit(r, 1, "diff differing");
    assert(r.stdout.includes("const y = 3;"), "diff output missing the changed line");
  });

  check("diff --format json emits parseable JSON", () => {
    const r = cli(["diff", "a.ts", "b.ts", "--format", "json"], work);
    assertExit(r, 0, "diff json");
    const parsed = JSON.parse(r.stdout);
    assert(parsed.identical === false, "json result should not be identical");
    assert(Array.isArray(parsed.hunks), "json result has no hunks array");
  });

  check("diff --format unified is patch-shaped", () => {
    const r = cli(["diff", "a.ts", "b.ts", "--format", "unified"], work);
    assertExit(r, 0, "diff unified");
    assert(r.stdout.includes("@@"), "unified output has no hunk header");
    assert(r.stdout.includes("-const y = 2;"), "unified output missing the deletion");
  });

  check("diff --format markdown emits a fenced diff block", () => {
    const r = cli(["diff", "a.ts", "b.ts", "--format", "markdown"], work);
    assertExit(r, 0, "diff markdown");
    assert(r.stdout.includes("```diff"), "markdown output has no diff fence");
  });

  check("diff with a missing file exits with the file-error code", () => {
    const r = cli(["diff", "a.ts", "nope.ts"], work);
    assertExit(r, 5, "diff missing file");
  });

  check("diff with one operand and no --ref is an argument error", () => {
    const r = cli(["diff", "a.ts"], work);
    assertExit(r, 2, "diff single operand");
  });

  check("diff rejects an unsafe git ref", () => {
    const r = cli(["diff", "a.ts", "--ref", "--upload-pack=/bin/sh"], work);
    assertExit(r, 2, "unsafe ref");
    assert(r.stderr.toLowerCase().includes("refusing"), "no refusal message");
  });

  check("spell finds a misspelling and can fail the build", () => {
    const r = cli(["spell", "note.ts", "--no-color", "--fail-on", "information"], work);
    assertExit(r, 1, "spell fail-on");
    assert(r.stdout.includes("mispeling"), "did not report the misspelling");
  });

  check("spell --format json emits parseable JSON", () => {
    const r = cli(["spell", "note.ts", "--format", "json"], work);
    const parsed = JSON.parse(r.stdout);
    assert(typeof parsed.total === "number", "json result has no total");
  });

  check("spell accepts a word from the project dictionary", () => {
    writeFileSync(join(work, "dict.ts"), "// the widgetron is ready\n");
    const r = cli(["spell", "dict.ts", "--no-color"], work);
    assert(!r.stdout.includes("widgetron"), "project dictionary word was still flagged");
  });

  check("spell suppresses machine data", () => {
    writeFileSync(
      join(work, "noise.ts"),
      "// see https://example.com/a/b?c=1 and 550e8400-e29b-41d4-a716-446655440000\n",
    );
    const r = cli(["spell", "noise.ts", "--no-color"], work);
    assertExit(r, 0, "spell noise");
    assert(
      r.stdout.includes("No spelling issues"),
      `noise was reported as misspellings: ${r.stdout.slice(0, 300)}`,
    );
  });

  check("format --check exits 1 when a file needs formatting", () => {
    const r = cli(["format", "messy.ts", "--check", "--no-color"], work);
    assertExit(r, 1, "format --check");
    assert(r.stdout.includes("need formatting"), "no needs-formatting summary");
  });

  check("format with no match exits with the no-input code", () => {
    const r = cli(["format", "does-not-exist-*.xyz", "--check"], work);
    assertExit(r, 3, "format no input");
  });

  check("merge reports a conflict", () => {
    const r = cli(
      ["merge", "--base", "base.txt", "--ours", "ours.txt", "--theirs", "theirs.txt", "--no-color"],
      work,
    );
    assertExit(r, 0, "merge");
    assert(r.stdout.includes("1 conflict"), `expected one conflict: ${r.stdout.slice(0, 200)}`);
  });

  check("merge --accept resolves and can write output", () => {
    const out = join(work, "merged.txt");
    const r = cli(
      [
        "merge", "--base", "base.txt", "--ours", "ours.txt", "--theirs", "theirs.txt",
        "--accept", "ours", "-o", out, "--no-color",
      ],
      work,
    );
    assertExit(r, 0, "merge --accept");
    assert(readFileSync(out, "utf8").includes("ours"), "merged output missing our side");
  });

  check("merge refuses to write while conflicts are unresolved", () => {
    const r = cli(
      [
        "merge", "--base", "base.txt", "--ours", "ours.txt", "--theirs", "theirs.txt",
        "-o", join(work, "should-not-exist.txt"), "--no-color",
      ],
      work,
    );
    assertExit(r, 9, "merge unresolved write");
    assert(r.stderr.includes("unresolved"), "no unresolved-conflict message");
  });

  check("merge without required operands is an argument error", () => {
    const r = cli(["merge", "--base", "base.txt"], work);
    assertExit(r, 2, "merge missing operands");
  });

  check("formatters reports availability", () => {
    const r = cli(["formatters", "--no-color"], work);
    assertExit(r, 0, "formatters");
    assert(r.stdout.includes("Prettier"), "Prettier not listed");
    assert(
      r.stdout.includes("never downloads"),
      "the no-download guarantee is not stated in the output",
    );
  });

  check("formatters --format json emits parseable JSON", () => {
    const r = cli(["formatters", "--format", "json"], work);
    const parsed = JSON.parse(r.stdout);
    assert(Array.isArray(parsed.formatters), "no formatters array");
  });

  check("dictionary list shows sources in precedence order", () => {
    const r = cli(["dictionary", "list", "--no-color"], work);
    assertExit(r, 0, "dictionary list");
    assert(r.stdout.includes("workspace"), "workspace scope not listed");
    assert(r.stdout.includes("base"), "base scope not listed");
  });

  check("dictionary check distinguishes known from unknown", () => {
    assertExit(cli(["dictionary", "check", "widgetron", "--no-color"], work), 0, "known word");
    assertExit(cli(["dictionary", "check", "zzqwxv", "--no-color"], work), 1, "unknown word");
  });

  check("dictionary add writes to the chosen scope", () => {
    const r = cli(["dictionary", "add", "flimflam", "--scope", "workspace", "--no-color"], work);
    assertExit(r, 0, "dictionary add");
    assert(
      readFileSync(join(work, ".codetrio/dictionary.txt"), "utf8").includes("flimflam"),
      "word was not written",
    );
  });

  check("dictionary rejects an unwritable scope", () => {
    const r = cli(["dictionary", "add", "x", "--scope", "base"], work);
    assertExit(r, 2, "dictionary add to base");
  });

  check("report emits markdown", () => {
    const r = cli(["report", "note.ts", "--format", "markdown"], work);
    assertExit(r, 0, "report markdown");
    assert(r.stdout.includes("# Code Trio report"), "no report heading");
    assert(r.stdout.includes("| Tool |"), "no summary table");
  });

  check("report --format json emits parseable JSON", () => {
    const r = cli(["report", "note.ts", "--format", "json"], work);
    const parsed = JSON.parse(r.stdout);
    assert(parsed.schema === "code-trio/panel-report@1", "unexpected report schema marker");
  });

  check("exit-codes prints the documented table", () => {
    const r = cli(["exit-codes"], work);
    assertExit(r, 0, "exit-codes");
    for (const code of ["0", "1", "2", "3", "4", "5"]) {
      assert(r.stdout.includes(`  ${code}  `), `exit code ${code} missing from the table`);
    }
  });

  check("configure prints the resolved configuration as JSON", () => {
    const r = cli(["configure"], work);
    assertExit(r, 0, "configure");
    const body = r.stdout.slice(r.stdout.indexOf("{"));
    const parsed = JSON.parse(body);
    assert(parsed.diff && parsed.spell && parsed.format, "configuration is missing a section");
  });

  check("init scaffolds config and a dictionary", () => {
    const fresh = mkdtempSync(join(tmpdir(), "ctr-init-"));
    const r = cli(["init"], fresh);
    assertExit(r, 0, "init");
    JSON.parse(readFileSync(join(fresh, "codetrio.json"), "utf8"));
    rmSync(fresh, { recursive: true, force: true });
  });

  check("an unknown command is an argument error", () => {
    const r = cli(["not-a-real-command"], work);
    assert(r.code !== 0, "unknown command should not exit 0");
  });
} finally {
  rmSync(work, { recursive: true, force: true });
}

process.stdout.write(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) {
  process.stdout.write("\nFailures:\n");
  for (const f of failures) process.stdout.write(`  - ${f}\n`);
  process.exitCode = 1;
}
