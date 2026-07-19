import { describe, expect, it } from "vitest";
import type { Document } from "@ctr/core";
import { loadDictionary } from "@ctr/dictionaries";
import { boundedEditDistance, spellCheck, suggest } from "@ctr/spell-engine";

const dictionary = loadDictionary(["base", "technical"]);
const doc = (text: string, languageId = "typescript"): Document => ({
  uri: "file:///test",
  languageId,
  text,
});

describe("boundedEditDistance", () => {
  it("computes small distances and bails out past the bound", () => {
    expect(boundedEditDistance("reciever", "receiver", 2)).toBe(1); // transposition
    expect(boundedEditDistance("cat", "dog", 1)).toBe(2);
  });
});

describe("suggest", () => {
  it("ranks the correct spelling first", () => {
    const s = suggest("recieve", ["receive", "relieve", "review"]);
    expect(s[0]).toBe("receive");
  });
});

describe("spellCheck", () => {
  it("flags a misspelling in a comment, not the surrounding code", () => {
    const diags = spellCheck(doc('// this has a mispeling here\nconst ok = 1;'), { dictionary });
    expect(diags).toHaveLength(1);
    expect(diags[0]?.data?.word).toBe("mispeling");
    expect(diags[0]?.source).toBe("code-trio.spell");
  });

  it("does not check identifiers by default but can opt in", () => {
    const src = "const zzxywq = 1; // ok comment";
    expect(spellCheck(doc(src), { dictionary })).toHaveLength(0);
    const optIn = spellCheck(doc(src), { dictionary, checkIdentifiers: true });
    expect(optIn.some((d) => d.data?.word === "zzxywq")).toBe(true);
  });

  it("splits identifiers inside strings before checking", () => {
    // "userName" splits into known words; "xqzwv" is unknown
    const diags = spellCheck(doc('const s = "userName xqzwv";'), { dictionary });
    expect(diags.map((d) => d.data?.word)).toEqual(["xqzwv"]);
  });

  it("offers replace and add-to-dictionary quick fixes", () => {
    const diags = spellCheck(doc("// recieve the value"), { dictionary: loadDictionary(["base"], ["receive"]) });
    const diag = diags.find((d) => d.data?.word === "recieve");
    expect(diag).toBeDefined();
    expect(diag!.quickFixes!.some((f) => f.kind === "replace" && f.title.includes("receive"))).toBe(
      true,
    );
    expect(diag!.quickFixes!.some((f) => f.kind === "addToDictionary")).toBe(true);
  });

  it("respects codetrio-ignore on a line and for the whole file", () => {
    expect(spellCheck(doc("// mispeling codetrio-ignore"), { dictionary })).toHaveLength(0);
    expect(spellCheck(doc("// mispeling\n// codetrio-ignore-file"), { dictionary })).toHaveLength(0);
  });

  it("honors extra ignore words and severity", () => {
    const diags = spellCheck(doc("// froobly wobble"), {
      dictionary,
      ignoreWords: ["froobly", "wobble"],
      severity: "warning",
    });
    expect(diags).toHaveLength(0);
  });

  it("checks prose in markdown", () => {
    const diags = spellCheck(doc("Some mispeling in prose.", "markdown"), { dictionary });
    expect(diags.some((d) => d.data?.word === "mispeling")).toBe(true);
  });
});
