import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { extname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Repository-wide source hygiene.
 *
 * The specific problem this prevents: a raw NUL byte reached
 * `packages/agent/test/git.test.ts` while writing a test for control-character
 * git refs. It did not break the test — TypeScript read the byte as the
 * character the test intended — but it made the file *binary* as far as `grep`
 * is concerned, and `grep` skips binary files silently.
 *
 * That is a real hole rather than an aesthetic one: the CI `offline-audit` job
 * greps shipped source for network clients and telemetry SDKs. A file that grep
 * refuses to read is a file the audit cannot check, and nothing would have said
 * so. A security gate that silently skips its input is worse than no gate.
 *
 * Control characters should be written as escapes such as a backslash-u sequence, which produce the
 * identical string value while keeping the source plain text.
 */

const REPO_ROOT = resolve(fileURLToPath(new URL("../../..", import.meta.url)));

const SCANNED_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".mjs",
  ".js",
  ".cjs",
  ".json",
  ".md",
  ".yml",
  ".yaml",
]);

const SKIPPED_DIRECTORIES = new Set([
  "node_modules",
  "dist",
  "out",
  "coverage",
  "artifacts",
  ".git",
  ".vscode-test",
]);

/** Every text file the repository owns. */
function sourceFiles(dir: string = REPO_ROOT, acc: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const entry of entries) {
    if (SKIPPED_DIRECTORIES.has(entry)) continue;
    const full = join(dir, entry);
    let stats;
    try {
      stats = statSync(full);
    } catch {
      continue;
    }
    if (stats.isDirectory()) sourceFiles(full, acc);
    else if (SCANNED_EXTENSIONS.has(extname(entry))) acc.push(full);
  }
  return acc;
}

/**
 * Control characters that make a file "binary" to POSIX tools.
 *
 * Tab (9), LF (10), FF (12) and CR (13) are legitimate in text. Vertical tab
 * (11) is not, in any file this repository owns.
 */
function controlBytes(buffer: Buffer): Array<{ offset: number; byte: number; line: number }> {
  const found: Array<{ offset: number; byte: number; line: number }> = [];
  let line = 1;
  for (let i = 0; i < buffer.length; i++) {
    const b = buffer[i] as number;
    if (b === 10) line++;
    const isAllowed = b === 9 || b === 10 || b === 12 || b === 13;
    if (b < 32 && !isAllowed) found.push({ offset: i, byte: b, line });
  }
  return found;
}

describe("source hygiene", () => {
  const files = sourceFiles();

  it("finds files to scan", () => {
    // A silent zero-file scan would make every assertion below vacuous.
    expect(files.length).toBeGreaterThan(50);
  });

  it("contains no raw control characters", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const found = controlBytes(readFileSync(file));
      if (found.length > 0) {
        const where = found
          .slice(0, 3)
          .map((f) => `line ${f.line} (0x${f.byte.toString(16).padStart(2, "0")})`)
          .join(", ");
        offenders.push(`${file.slice(REPO_ROOT.length + 1)}: ${where}`);
      }
    }
    expect(
      offenders,
      `Raw control characters found. Write them as escapes (\\u0000) instead — a file ` +
        `containing one is treated as binary by grep, and the CI offline audit ` +
        `silently skips binary files.\n  ${offenders.join("\n  ")}`,
    ).toEqual([]);
  });

  it("is valid UTF-8 throughout", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const buffer = readFileSync(file);
      // Round-tripping through UTF-8 is lossy exactly when the input was not
      // valid UTF-8, so a length mismatch is the detection.
      if (Buffer.from(buffer.toString("utf8"), "utf8").length !== buffer.length) {
        offenders.push(file.slice(REPO_ROOT.length + 1));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("has no byte-order mark", () => {
    // A BOM breaks shebang handling in .mjs entry points and is never wanted.
    const offenders = files.filter((file) => {
      const head = readFileSync(file).subarray(0, 3);
      return head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf;
    });
    expect(offenders.map((f) => f.slice(REPO_ROOT.length + 1))).toEqual([]);
  });
});
