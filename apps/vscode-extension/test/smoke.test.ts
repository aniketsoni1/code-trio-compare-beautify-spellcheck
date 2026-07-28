/**
 * Offline smoke test for the extension's feature logic. It exercises the exact
 * @ctr/agent operations the extension commands call - Compare, spell diagnostic
 * + quick fix, and format preview - against the committed demo workspace, and
 * asserts the manifest keeps activation narrow and lazy. It does not launch VS
 * Code (see test/integration for the electron-hosted test that does).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadFileDocument, runCompare, runFormat, runSpellInWorkspace } from "@ctr/agent";
import { DEFAULT_CONFIG } from "@ctr/configuration";

const repoRoot = process.cwd();
const demo = resolve(repoRoot, "samples/demo-workspace");
const manifest = JSON.parse(
  readFileSync(resolve(repoRoot, "apps/vscode-extension/package.json"), "utf8"),
) as {
  activationEvents: string[];
  contributes: { commands: Array<{ command: string }>; configuration: { properties: Record<string, unknown> } };
  main: string;
};

describe("extension smoke - Compare", () => {
  it("diffs the two demo files", () => {
    const a = loadFileDocument(resolve(demo, "src/compare-a.ts"));
    const b = loadFileDocument(resolve(demo, "src/compare-b.ts"));
    const result = runCompare(a, b, DEFAULT_CONFIG);
    expect(result.identical).toBe(false);
    expect(result.hunks.length).toBeGreaterThan(0);
  });
});

describe("extension smoke - Spell diagnostic + quick fix", () => {
  it("flags the deliberate typo and suggests a fix", () => {
    const doc = loadFileDocument(resolve(demo, "src/greeting.ts"));
    const diags = runSpellInWorkspace(doc, demo, DEFAULT_CONFIG);
    const typo = diags.find((d) => d.data?.word === "recieve");
    expect(typo).toBeDefined();
    const replace = typo!.quickFixes?.find((f) => f.kind === "replace");
    expect(replace?.edits[0]?.newText).toBe("receive");
    expect(typo!.quickFixes?.some((f) => f.kind === "addToDictionary")).toBe(true);
  });

  it("honors the demo project dictionary (no false positive on 'payload')", () => {
    const doc = loadFileDocument(resolve(demo, "src/greeting.ts"));
    const diags = runSpellInWorkspace(doc, demo, DEFAULT_CONFIG);
    expect(diags.some((d) => d.data?.word === "payload")).toBe(false);
  });
});

describe("extension smoke - Format preview", () => {
  it("computes a dry-run preview for the messy file", async () => {
    const doc = loadFileDocument(resolve(demo, "src/messy.ts"));
    const result = await runFormat(doc, DEFAULT_CONFIG);
    expect(result.unsupported).toBe(false);
    expect(result.changed).toBe(true);
    expect(result.formatter.name).toBe("prettier");
    expect(result.previewDiff).toBeDefined();
  });
});

describe("extension manifest - lazy, independent activation", () => {
  it("activates narrowly (no wildcard) and bundles to a single entry", () => {
    // Asserted as a property rather than an exact list: v0.2.0 added a second
    // view, and pinning the literal array made an ordinary contribution look
    // like a regression. What actually matters is that every trigger is a view
    // the user opened deliberately, so Code Trio never starts in a window where
    // it is not used.
    expect(manifest.activationEvents.length).toBeGreaterThan(0);
    expect(manifest.activationEvents).not.toContain("*");
    for (const event of manifest.activationEvents) {
      expect(event.startsWith("onView:codeTrio."), event).toBe(true);
    }
    expect(manifest.main).toBe("./out/extension.cjs");
  });

  it("contributes all three tools' commands independently", () => {
    const ids = new Set(manifest.contributes.commands.map((c) => c.command));
    expect(ids.has("codeTrio.compareWith")).toBe(true);
    expect(ids.has("codeTrio.spellCheckFile")).toBe(true);
    expect(ids.has("codeTrio.formatPreview")).toBe(true);
  });

  it("namespaces settings per feature", () => {
    const keys = Object.keys(manifest.contributes.configuration.properties);
    expect(keys.some((k) => k.startsWith("codeTrio.diff."))).toBe(true);
    expect(keys.some((k) => k.startsWith("codeTrio.spell."))).toBe(true);
    expect(keys.some((k) => k.startsWith("codeTrio.format."))).toBe(true);
  });
});
