import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  appendProjectDictionaryWord,
  applyFormatToFile,
  loadProjectDictionary,
  makeDocument,
  runCompare,
  runFormat,
  runSpell,
} from "@ctr/agent";
import { DEFAULT_CONFIG, resolveConfig } from "@ctr/configuration";

const tmp = mkdtempSync(join(tmpdir(), "ctr-agent-"));

describe("agent - pure orchestration", () => {
  it("compares two documents", () => {
    const a = makeDocument("mem:a", "typescript", "const a = 1;\n");
    const b = makeDocument("mem:b", "typescript", "const a = 2;\n");
    const result = runCompare(a, b);
    expect(result.identical).toBe(false);
    expect(result.stats.deletions).toBe(1);
  });

  it("spell checks with the default config", () => {
    const doc = makeDocument("mem:c", "typescript", "// this is mispeled\n");
    const diags = runSpell(doc, DEFAULT_CONFIG);
    expect(diags.some((d) => d.data?.word === "mispeled")).toBe(true);
  });

  it("honors spell.enabled = false", () => {
    const doc = makeDocument("mem:d", "typescript", "// mispeled\n");
    const off = resolveConfig({ spell: { enabled: false } });
    expect(runSpell(doc, off)).toHaveLength(0);
  });

  it("formats a document as a dry run", async () => {
    const doc = makeDocument("file:///x.ts", "typescript", "const   x=1");
    const result = await runFormat(doc);
    expect(result.changed).toBe(true);
    expect(result.formatted).toBe("const x = 1;\n");
  });
});

describe("agent - dictionary + file I/O", () => {
  it("round-trips a project dictionary word", () => {
    const rel = "dict.txt";
    const first = appendProjectDictionaryWord(tmp, rel, "Frobnicate");
    expect(first.added).toBe(true);
    const again = appendProjectDictionaryWord(tmp, rel, "frobnicate");
    expect(again.added).toBe(false);
    const loaded = loadProjectDictionary(tmp, rel);
    expect(loaded.words).toContain("frobnicate");
  });

  it("applies formatting to a file on disk", async () => {
    const file = join(tmp, "sample.ts");
    writeFileSync(file, "const   y=2");
    const { applied } = await applyFormatToFile(file, "typescript");
    expect(applied).toBe(true);
    expect(readFileSync(file, "utf8")).toBe("const y = 2;\n");
  });
});

afterAll(() => {
  // tmp dir is left for OS cleanup; nothing sensitive is written.
});
