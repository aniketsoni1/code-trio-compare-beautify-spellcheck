import { describe, expect, it } from "vitest";
import { DictionaryStack, SCOPE_PRECEDENCE, type DictionaryLayer } from "../src/scopes";

function stack(...layers: DictionaryLayer[]): DictionaryStack {
  return new DictionaryStack(layers);
}

describe("precedence order", () => {
  it("is documented most-specific first", () => {
    expect(SCOPE_PRECEDENCE).toEqual([
      "session",
      "folder",
      "workspace",
      "user",
      "technical",
      "base",
    ]);
  });

  it("reports the most specific scope that accepts a word", () => {
    const d = stack(
      { scope: "base", words: ["shared"] },
      { scope: "workspace", words: ["shared"], origin: "/repo/.codetrio/dictionary.txt" },
      { scope: "folder", words: ["shared"], origin: "/repo/app/.codetrio/dictionary.txt" },
    );
    const found = d.lookup("shared");
    expect(found.known).toBe(true);
    expect(found.scope).toBe("folder");
    expect(found.origin).toBe("/repo/app/.codetrio/dictionary.txt");
  });

  it("falls through to a lower scope when higher ones are silent", () => {
    const d = stack(
      { scope: "base", words: ["ordinary"] },
      { scope: "folder", words: ["specific"] },
    );
    expect(d.lookup("ordinary").scope).toBe("base");
    expect(d.lookup("specific").scope).toBe("folder");
  });

  it("returns unknown for a word no layer has", () => {
    const d = stack({ scope: "base", words: ["known"] });
    expect(d.lookup("absent")).toEqual({ known: false });
  });
});

describe("blocking", () => {
  it("lets a more specific scope reject a word a lower scope accepted", () => {
    const d = stack(
      { scope: "base", words: ["colour"] },
      { scope: "folder", words: [], blocked: ["colour"] },
    );
    const found = d.lookup("colour");
    expect(found.known).toBe(false);
    expect(found.blocked).toBe(true);
    expect(found.scope).toBe("folder");
  });

  it("does not let a lower scope re-accept a blocked word", () => {
    const d = stack(
      { scope: "base", words: ["colour"] },
      { scope: "user", words: ["colour"] },
      { scope: "folder", words: [], blocked: ["colour"] },
    );
    expect(d.has("colour")).toBe(false);
  });

  it("lets a higher scope accept a word a lower scope blocked", () => {
    const d = stack(
      { scope: "workspace", words: [], blocked: ["colour"] },
      { scope: "session", words: ["colour"] },
    );
    expect(d.has("colour")).toBe(true);
  });

  it("excludes blocked words from the suggestion pool", () => {
    const d = stack(
      { scope: "base", words: ["colour", "color"] },
      { scope: "workspace", words: [], blocked: ["colour"] },
    );
    expect(d.list()).toContain("color");
    expect(d.list()).not.toContain("colour");
  });
});

describe("session scope", () => {
  it("accepts a word added at runtime without touching a file", () => {
    const d = stack({ scope: "base", words: [] });
    expect(d.has("widgetron")).toBe(false);
    d.add("widgetron");
    expect(d.has("widgetron")).toBe(true);
    expect(d.lookup("widgetron").scope).toBe("session");
  });

  it("includes session words in the pool", () => {
    const d = stack({ scope: "base", words: ["a"] });
    d.add("sessionword");
    expect(d.list()).toContain("sessionword");
  });
});

describe("normalisation", () => {
  it("is case-insensitive and trims", () => {
    const d = stack({ scope: "base", words: ["  MiXeD  "] });
    expect(d.has("mixed")).toBe(true);
    expect(d.has("MIXED")).toBe(true);
    expect(d.has(" Mixed ")).toBe(true);
  });

  it("treats an empty or whitespace-only word as known", () => {
    const d = stack({ scope: "base", words: [] });
    expect(d.has("")).toBe(true);
    expect(d.has("   ")).toBe(true);
  });
});

describe("reporting", () => {
  it("describes every layer in the order added", () => {
    const d = stack(
      { scope: "base", words: ["a"] },
      { scope: "workspace", words: ["b"], origin: "/repo/dict.txt" },
    );
    expect(d.describe().map((l) => l.scope)).toEqual(["base", "workspace"]);
  });

  it("reports layers that could not be loaded", () => {
    const d = stack(
      { scope: "base", words: ["a"] },
      {
        scope: "folder",
        words: [],
        origin: "/repo/app/dict.txt",
        unavailable: true,
        error: "EACCES",
      },
    );
    expect(d.problems()).toHaveLength(1);
    expect(d.problems()[0]?.error).toBe("EACCES");
    // An unreadable layer must not stop the rest of the stack working.
    expect(d.has("a")).toBe(true);
  });

  it("merges repeated layers for the same scope", () => {
    const d = stack(
      { scope: "workspace", words: ["one"] },
      { scope: "workspace", words: ["two"] },
    );
    expect(d.has("one")).toBe(true);
    expect(d.has("two")).toBe(true);
  });

  it("flattens to a plain dictionary", () => {
    const d = stack({ scope: "base", words: ["a", "b"] });
    const flat = d.flatten();
    expect(flat.has("a")).toBe(true);
    expect(flat.size).toBe(2);
  });

  it("keeps size consistent with the pool", () => {
    const d = stack({ scope: "base", words: ["a", "b"] }, { scope: "folder", words: ["c"] });
    expect(d.size).toBe(d.list().length);
    expect(d.size).toBe(3);
  });

  it("invalidates the cached pool when a session word is added", () => {
    const d = stack({ scope: "base", words: ["a"] });
    expect(d.list()).toHaveLength(1);
    d.add("b");
    expect(d.list()).toHaveLength(2);
  });
});
