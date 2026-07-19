import { describe, expect, it } from "vitest";
import { BUILTIN_WORD_COUNTS, loadDictionary, makeDictionary, parseWordList } from "@ctr/dictionaries";

describe("built-in dictionaries", () => {
  it("loads base + technical and looks up case-insensitively", () => {
    const dict = loadDictionary(["base", "technical"]);
    expect(dict.has("the")).toBe(true);
    expect(dict.has("THE")).toBe(true);
    expect(dict.has("typescript")).toBe(true);
    expect(dict.has("prettier")).toBe(true);
    expect(dict.has("zzznotaword")).toBe(false);
  });

  it("reports non-trivial word counts", () => {
    expect(BUILTIN_WORD_COUNTS.base).toBeGreaterThan(300);
    expect(BUILTIN_WORD_COUNTS.technical).toBeGreaterThan(100);
  });

  it("can add words at runtime", () => {
    const dict = loadDictionary(["base"], ["quux"]);
    expect(dict.has("quux")).toBe(true);
    dict.add("Zorp");
    expect(dict.has("zorp")).toBe(true);
  });
});

describe("parseWordList", () => {
  it("ignores comments and blank lines and reads ignore entries", () => {
    const { words, ignore } = parseWordList("# header\n\nFoo\nbar\n!allowed\n");
    expect(words).toEqual(["foo", "bar"]);
    expect(ignore).toEqual(["allowed"]);
  });

  it("makeDictionary normalizes input", () => {
    const dict = makeDictionary([" Hello ", "WORLD"]);
    expect(dict.size).toBe(2);
    expect(dict.has("hello")).toBe(true);
    expect(dict.has("world")).toBe(true);
  });
});
