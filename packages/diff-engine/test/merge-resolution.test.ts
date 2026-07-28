import { describe, expect, it } from "vitest";
import { renderMerge, resolveMerge, threeWayMerge } from "../src/merge";

const BASE = "a\nbase\nc\n";
const OURS = "a\nours\nc\n";
const THEIRS = "a\ntheirs\nc\n";

describe("region identity and origin", () => {
  it("assigns stable ids in document order", () => {
    const r = threeWayMerge(BASE, OURS, THEIRS);
    const ids = r.regions.map((x) => x.id);
    expect(ids).toEqual([...ids].sort((x, y) => Number(x.slice(7)) - Number(y.slice(7))));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("produces identical ids for identical inputs", () => {
    const first = threeWayMerge(BASE, OURS, THEIRS);
    const second = threeWayMerge(BASE, OURS, THEIRS);
    expect(second.regions.map((x) => x.id)).toEqual(first.regions.map((x) => x.id));
  });

  it("lists conflict ids for navigation", () => {
    const r = threeWayMerge(BASE, OURS, THEIRS);
    expect(r.conflictIds).toHaveLength(r.conflictCount);
    for (const id of r.conflictIds) {
      expect(r.regions.find((x) => x.id === id)?.conflict).toBe(true);
    }
  });

  it("records why a clean region was clean", () => {
    // Only we changed the middle line.
    const r = threeWayMerge(BASE, OURS, BASE);
    expect(r.clean).toBe(true);
    const origins = r.regions.map((x) => x.origin);
    expect(origins).toContain("ours");
  });

  it("marks a both-identical region", () => {
    const same = "a\nsame-change\nc\n";
    const r = threeWayMerge(BASE, same, same);
    expect(r.clean).toBe(true);
    expect(r.regions.some((x) => x.origin === "both-identical")).toBe(true);
  });

  it("records line spans for every region", () => {
    const r = threeWayMerge(BASE, OURS, THEIRS);
    for (const region of r.regions) {
      expect(region.spans).toBeDefined();
      expect(region.spans?.base.end).toBeGreaterThanOrEqual(region.spans?.base.start ?? 0);
    }
  });
});

describe("conflict detection", () => {
  it("conflicts when both sides change the same line differently", () => {
    const r = threeWayMerge(BASE, OURS, THEIRS);
    expect(r.clean).toBe(false);
    expect(r.conflictCount).toBe(1);
    const conflict = r.regions.find((x) => x.conflict);
    expect(conflict?.ourLines).toEqual(["ours"]);
    expect(conflict?.theirLines).toEqual(["theirs"]);
    expect(conflict?.baseLines).toEqual(["base"]);
  });

  it("does not conflict when only one side changed", () => {
    expect(threeWayMerge(BASE, OURS, BASE).clean).toBe(true);
    expect(threeWayMerge(BASE, BASE, THEIRS).clean).toBe(true);
  });

  it("does not conflict when both sides made the same change", () => {
    expect(threeWayMerge(BASE, OURS, OURS).clean).toBe(true);
  });

  it("handles an empty base (add/add)", () => {
    const r = threeWayMerge("", "ours\n", "theirs\n");
    expect(r.clean).toBe(false);
  });

  it("handles all three inputs empty", () => {
    const r = threeWayMerge("", "", "");
    expect(r.clean).toBe(true);
    expect(r.conflictCount).toBe(0);
  });

  it("handles deletion on one side and edit on the other", () => {
    const r = threeWayMerge("a\nb\nc\n", "a\nc\n", "a\nEDITED\nc\n");
    expect(r.clean).toBe(false);
  });

  it("ignores line endings when asked", () => {
    const crlfOurs = OURS.replace(/\n/g, "\r\n");
    // Without ignoreEol every line differs, so this conflicts everywhere.
    const strict = threeWayMerge(BASE, crlfOurs, BASE);
    const lenient = threeWayMerge(BASE, crlfOurs, BASE, { ignoreEol: true });
    expect(lenient.conflictCount).toBeLessThanOrEqual(strict.conflictCount);
    expect(lenient.clean).toBe(true);
  });

  it("reports the line endings of all three inputs", () => {
    const r = threeWayMerge(BASE, OURS.replace(/\n/g, "\r\n"), THEIRS);
    expect(r.eol?.ours).toBe("crlf");
    expect(r.eol?.base).toBe("lf");
    expect(r.eol?.differs).toBe(true);
  });
});

describe("resolveMerge", () => {
  it("emits diff3 markers for unresolved conflicts by default", () => {
    const r = threeWayMerge(BASE, OURS, THEIRS);
    const out = resolveMerge(r);
    expect(out.fullyResolved).toBe(false);
    expect(out.unresolvedIds).toEqual(r.conflictIds);
    expect(out.text).toContain("<<<<<<<");
    expect(out.text).toContain("|||||||");
    expect(out.text).toContain("=======");
    expect(out.text).toContain(">>>>>>>");
  });

  it("omits the base section when diff3 is off", () => {
    const r = threeWayMerge(BASE, OURS, THEIRS);
    const out = resolveMerge(r, [], { diff3: false });
    expect(out.text).toContain("<<<<<<<");
    expect(out.text).not.toContain("|||||||");
  });

  it("applies each choice", () => {
    const r = threeWayMerge(BASE, OURS, THEIRS);
    const id = r.conflictIds[0] as string;
    const pick = (choice: Parameters<typeof resolveMerge>[1][number]["choice"]): string =>
      resolveMerge(r, [{ regionId: id, choice }]).text;

    expect(pick("ours")).toBe("a\nours\nc\n");
    expect(pick("theirs")).toBe("a\ntheirs\nc\n");
    expect(pick("base")).toBe("a\nbase\nc\n");
    expect(pick("both-ours-first")).toBe("a\nours\ntheirs\nc\n");
    expect(pick("both-theirs-first")).toBe("a\ntheirs\nours\nc\n");
  });

  it("accepts manual replacement lines", () => {
    const r = threeWayMerge(BASE, OURS, THEIRS);
    const id = r.conflictIds[0] as string;
    const out = resolveMerge(r, [{ regionId: id, choice: "ours", manualLines: ["hand-written"] }]);
    expect(out.text).toBe("a\nhand-written\nc\n");
    expect(out.fullyResolved).toBe(true);
  });

  it("ignores a resolution for an id that does not exist", () => {
    const r = threeWayMerge(BASE, OURS, THEIRS);
    const out = resolveMerge(r, [{ regionId: "region-999", choice: "ours" }]);
    // The real conflict is still unresolved; the stray resolution changed nothing.
    expect(out.fullyResolved).toBe(false);
  });

  it("throws rather than writing a half-merged file", () => {
    const r = threeWayMerge(BASE, OURS, THEIRS);
    expect(() => resolveMerge(r, [], { unresolved: "throw" })).toThrow(/no resolution/);
  });

  it("can bulk-resolve to one side", () => {
    const r = threeWayMerge(BASE, OURS, THEIRS);
    const out = resolveMerge(r, [], { unresolved: "ours" });
    expect(out.text).toBe("a\nours\nc\n");
    // Still reports which ids had no explicit decision.
    expect(out.unresolvedIds).toEqual(r.conflictIds);
    expect(out.fullyResolved).toBe(false);
  });

  it("round-trips a clean merge unchanged", () => {
    const r = threeWayMerge(BASE, BASE, BASE);
    expect(resolveMerge(r).text).toBe("a\nbase\nc\n");
    expect(resolveMerge(r).fullyResolved).toBe(true);
  });

  it("honours a custom line terminator", () => {
    const r = threeWayMerge(BASE, BASE, BASE);
    expect(resolveMerge(r, [], { eol: "\r\n" }).text).toBe("a\r\nbase\r\nc\r\n");
  });

  it("keeps renderMerge backwards compatible", () => {
    const r = threeWayMerge(BASE, OURS, THEIRS);
    expect(renderMerge(r, { ours: "MINE", theirs: "YOURS" })).toContain("<<<<<<< MINE");
    expect(renderMerge(r, { ours: "MINE", theirs: "YOURS" })).toContain(">>>>>>> YOURS");
  });
});
