import { describe, expect, it } from "vitest";
import { renderMerge, threeWayMerge } from "@ctr/diff-engine";

const base = ["one", "two", "three", "four"].join("\n");

describe("threeWayMerge", () => {
  it("merges non-overlapping changes cleanly", () => {
    const ours = ["one", "TWO", "three", "four"].join("\n");
    const theirs = ["one", "two", "three", "FOUR"].join("\n");
    const result = threeWayMerge(base, ours, theirs);
    expect(result.clean).toBe(true);
    expect(result.conflictCount).toBe(0);
    expect(renderMerge(result)).toBe(["one", "TWO", "three", "FOUR"].join("\n"));
  });

  it("keeps identical edits on both sides without conflict", () => {
    const both = ["one", "two", "CHANGED", "four"].join("\n");
    const result = threeWayMerge(base, both, both);
    expect(result.clean).toBe(true);
    expect(renderMerge(result)).toBe(both);
  });

  it("flags a genuine conflict on the same line", () => {
    const ours = ["one", "two", "OURS", "four"].join("\n");
    const theirs = ["one", "two", "THEIRS", "four"].join("\n");
    const result = threeWayMerge(base, ours, theirs);
    expect(result.clean).toBe(false);
    expect(result.conflictCount).toBe(1);
    const rendered = renderMerge(result, { ours: "HEAD", theirs: "branch" });
    expect(rendered).toContain("<<<<<<< HEAD");
    expect(rendered).toContain("OURS");
    expect(rendered).toContain("=======");
    expect(rendered).toContain("THEIRS");
    expect(rendered).toContain(">>>>>>> branch");
  });

  it("takes one side when only it changed", () => {
    const ours = ["one", "two", "three", "four", "five"].join("\n");
    const result = threeWayMerge(base, ours, base);
    expect(result.clean).toBe(true);
    expect(renderMerge(result)).toBe(ours);
  });
});
