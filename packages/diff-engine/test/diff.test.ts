import { describe, expect, it } from "vitest";
import { diffArrays } from "@ctr/diff-engine";
import { diffText } from "@ctr/diff-engine";

describe("diffArrays (Myers)", () => {
  it("finds a minimal edit script", () => {
    const script = diffArrays(["a", "b", "c"], ["a", "x", "c"], (x, y) => x === y);
    expect(script.map((e) => e.op)).toEqual(["equal", "delete", "insert", "equal"]);
  });

  it("handles pure insertion and deletion", () => {
    expect(diffArrays([], ["a", "b"], (x, y) => x === y).map((e) => e.op)).toEqual([
      "insert",
      "insert",
    ]);
    expect(diffArrays(["a", "b"], [], (x, y) => x === y).map((e) => e.op)).toEqual([
      "delete",
      "delete",
    ]);
  });

  it("reconstructs B from the edit script", () => {
    const a = "the quick brown fox".split(" ");
    const b = "the lazy brown dog jumps".split(" ");
    const script = diffArrays(a, b, (x, y) => x === y);
    const rebuilt: string[] = [];
    for (const e of script) {
      if (e.op === "equal") rebuilt.push(a[e.aIndex as number] as string);
      else if (e.op === "insert") rebuilt.push(b[e.bIndex as number] as string);
    }
    expect(rebuilt).toEqual(b);
  });
});

describe("diffText - line level", () => {
  it("reports identical files", () => {
    const r = diffText("a\nb\n", "a\nb\n");
    expect(r.identical).toBe(true);
    expect(r.hunks).toHaveLength(0);
    expect(r.stats).toEqual({ insertions: 0, deletions: 0, unchanged: 3 });
  });

  it("detects a single changed line as a replace", () => {
    const r = diffText("line1\nline2\nline3\n", "line1\nCHANGED\nline3\n");
    expect(r.identical).toBe(false);
    const ops = r.hunks.flatMap((h) => h.lines.map((l) => l.op));
    expect(ops).toContain("replace");
    expect(r.stats.insertions).toBe(1);
    expect(r.stats.deletions).toBe(1);
  });

  it("keeps context lines in a hunk", () => {
    const a = Array.from({ length: 20 }, (_, i) => `l${i}`).join("\n");
    const b = a.replace("l10", "CHANGED");
    const r = diffText(a, b, { contextLines: 2 });
    expect(r.hunks).toHaveLength(1);
    const hunk = r.hunks[0]!;
    // 2 context each side + 1 changed line
    expect(hunk.lines.filter((l) => l.op === "equal").length).toBe(4);
  });
});

describe("diffText - options", () => {
  it("ignores whitespace when asked", () => {
    const changed = diffText("const x=1", "const x = 1");
    expect(changed.identical).toBe(false);
    const ignored = diffText("const x=1", "const x = 1", { ignoreWhitespace: true });
    expect(ignored.identical).toBe(true);
  });

  it("ignores case when asked", () => {
    expect(diffText("Hello", "hello", { ignoreCase: true }).identical).toBe(true);
    expect(diffText("Hello", "hello").identical).toBe(false);
  });
});

describe("diffText - word refinement", () => {
  it("produces inline segments for a replaced line", () => {
    const r = diffText("the quick brown fox", "the slow brown fox", { granularity: "word" });
    const replace = r.hunks[0]?.lines.find((l) => l.op === "replace");
    expect(replace?.segments).toBeDefined();
    const segs = replace!.segments!;
    // unchanged prefix/suffix survive, "quick" -> "slow" is the only change
    expect(segs.some((s) => s.op === "equal" && s.text.includes("the "))).toBe(true);
    expect(segs.some((s) => s.op === "delete" && s.text.includes("quick"))).toBe(true);
    expect(segs.some((s) => s.op === "insert" && s.text.includes("slow"))).toBe(true);
    // segments concatenate back to the original texts
    const aRebuilt = segs
      .filter((s) => s.op !== "insert")
      .map((s) => s.text)
      .join("");
    expect(aRebuilt).toBe("the quick brown fox");
  });
});
