import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG } from "@ctr/configuration";
import { expandGlobs, expandGlobsDetailed } from "../src/glob";
import { runDiffCommand } from "../src/commands/diff";
import { runSpellCommand } from "../src/commands/spell";
import { runFormatCommand } from "../src/commands/format";

const tmp = mkdtempSync(join(tmpdir(), "ctr-cli-"));

function captureStdout(): { text: () => string; restore: () => void } {
  let buf = "";
  const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
    buf += chunk.toString();
    return true;
  });
  return { text: () => buf, restore: () => spy.mockRestore() };
}

afterEach(() => vi.restoreAllMocks());

describe("expandGlobs", () => {
  it("matches files by extension recursively", () => {
    const dir = mkdtempSync(join(tmpdir(), "ctr-glob-"));
    writeFileSync(join(dir, "a.ts"), "a");
    writeFileSync(join(dir, "b.md"), "b");
    const matched = expandGlobs(["**/*.ts"], dir);
    expect(matched).toEqual(["a.ts"]);
  });

  it("descends into subdirectories for a recursive pattern", () => {
    const dir = mkdtempSync(join(tmpdir(), "ctr-glob-deep-"));
    mkdirSync(join(dir, "src", "nested"), { recursive: true });
    writeFileSync(join(dir, "root.ts"), "a");
    writeFileSync(join(dir, "src", "mid.ts"), "b");
    writeFileSync(join(dir, "src", "nested", "leaf.ts"), "c");
    expect(expandGlobs(["**/*.ts"], dir)).toEqual([
      "root.ts",
      "src/mid.ts",
      "src/nested/leaf.ts",
    ]);
  });

  it("never descends into node_modules", () => {
    const dir = mkdtempSync(join(tmpdir(), "ctr-glob-nm-"));
    mkdirSync(join(dir, "node_modules", "pkg"), { recursive: true });
    writeFileSync(join(dir, "keep.ts"), "a");
    writeFileSync(join(dir, "node_modules", "pkg", "skip.ts"), "b");
    expect(expandGlobs(["**/*.ts"], dir)).toEqual(["keep.ts"]);
  });

  it("applies exclude globs to matched files", () => {
    const dir = mkdtempSync(join(tmpdir(), "ctr-glob-ex-"));
    mkdirSync(join(dir, "generated"), { recursive: true });
    writeFileSync(join(dir, "keep.ts"), "a");
    writeFileSync(join(dir, "generated", "drop.ts"), "b");
    const matched = expandGlobs(["**/*.ts"], dir, { exclude: ["**/generated/**"] });
    expect(matched).toEqual(["keep.ts"]);
  });

  it("accepts a literal path without walking", () => {
    const dir = mkdtempSync(join(tmpdir(), "ctr-glob-lit-"));
    writeFileSync(join(dir, "only.ts"), "a");
    expect(expandGlobs(["only.ts"], dir)).toEqual(["only.ts"]);
    expect(expandGlobs(["missing.ts"], dir)).toEqual([]);
  });

  it("reports truncation when the file cap is reached", () => {
    const dir = mkdtempSync(join(tmpdir(), "ctr-glob-cap-"));
    for (let i = 0; i < 8; i++) writeFileSync(join(dir, `f${i}.ts`), "x");
    const result = expandGlobsDetailed(["**/*.ts"], dir, { maxFiles: 3 });
    expect(result.files).toHaveLength(3);
    expect(result.truncated).toBe(true);

    const full = expandGlobsDetailed(["**/*.ts"], dir);
    expect(full.files).toHaveLength(8);
    expect(full.truncated).toBe(false);
  });

  it("deduplicates a file matched by two patterns", () => {
    const dir = mkdtempSync(join(tmpdir(), "ctr-glob-dup-"));
    writeFileSync(join(dir, "a.ts"), "a");
    expect(expandGlobs(["**/*.ts", "*.ts", "a.ts"], dir)).toEqual(["a.ts"]);
  });
});

describe("diff command", () => {
  it("returns 0 for identical files and 1 with --exit-code when different", () => {
    const a = join(tmp, "a.ts");
    const b = join(tmp, "b.ts");
    writeFileSync(a, "const x = 1;\n");
    writeFileSync(b, "const x = 2;\n");

    const same = captureStdout();
    expect(runDiffCommand(a, a, { format: "unified" }, DEFAULT_CONFIG)).toBe(0);
    same.restore();

    const diff = captureStdout();
    const code = runDiffCommand(a, b, { exitCode: true, color: false }, DEFAULT_CONFIG);
    diff.restore();
    expect(code).toBe(1);
    expect(diff.text()).toContain("const x = 2;");
  });
});

describe("spell command", () => {
  it("flags a misspelling and can fail the build", () => {
    const f = join(tmp, "note.ts");
    writeFileSync(f, "// this is mispeled\nconst ok = 1;\n");
    const cap = captureStdout();
    const code = runSpellCommand([f], { color: false, failOn: "information" }, DEFAULT_CONFIG, tmp);
    cap.restore();
    expect(cap.text()).toContain("mispeled");
    expect(code).toBe(1);
  });
});

describe("format command", () => {
  it("reports files needing formatting under --check", async () => {
    const f = join(tmp, "messy.ts");
    writeFileSync(f, "const   z=3");
    const cap = captureStdout();
    const code = await runFormatCommand([f], { check: true, color: false }, DEFAULT_CONFIG);
    cap.restore();
    expect(code).toBe(1);
    expect(cap.text()).toContain("need formatting");
  });
});
