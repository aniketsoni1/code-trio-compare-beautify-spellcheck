import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG } from "@ctr/configuration";
import { expandGlobs } from "../src/glob";
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
