import { describe, expect, it } from "vitest";
import { diffText } from "@ctr/diff-engine";
import {
  renderDiagnosticsTerminal,
  renderUnifiedDiff,
  summarizeDiff,
} from "@ctr/reporting";
import type { Diagnostic } from "@ctr/core";

describe("diff reporting", () => {
  it("summarizes stats", () => {
    expect(summarizeDiff(diffText("a\n", "a\n"))).toBe("identical");
    expect(summarizeDiff(diffText("a\nb\n", "a\nB\n"))).toMatch(/\+1 -1/);
  });

  it("emits valid unified diff", () => {
    const u = renderUnifiedDiff(diffText("one\ntwo\nthree\n", "one\n2\nthree\n"), {
      aName: "a.txt",
      bName: "b.txt",
    });
    expect(u).toContain("--- a.txt");
    expect(u).toContain("+++ b.txt");
    expect(u).toMatch(/@@ -\d+,\d+ \+\d+,\d+ @@/);
    expect(u).toContain("-two");
    expect(u).toContain("+2");
  });
});

describe("diagnostics reporting", () => {
  const diag: Diagnostic = {
    source: "code-trio.spell",
    code: "unknown-word",
    message: 'Unknown word: "mispeling".',
    severity: "warning",
    range: { start: { line: 2, character: 4 }, end: { line: 2, character: 13 } },
    quickFixes: [
      { title: "Replace", kind: "replace", edits: [{ range: { start: { line: 2, character: 4 }, end: { line: 2, character: 13 } }, newText: "misspelling" }] },
    ],
  };

  it("renders location, severity, and suggestions without color", () => {
    const text = renderDiagnosticsTerminal([diag], {
      file: "src/a.ts",
      color: false,
      showSuggestions: true,
    });
    expect(text).toContain("src/a.ts:3:5");
    expect(text).toContain("warning");
    expect(text).toContain("misspelling");
    expect(text).toContain("1 issue");
  });

  it("reports a clean result", () => {
    expect(renderDiagnosticsTerminal([], { color: false })).toContain("No spelling issues");
  });
});
