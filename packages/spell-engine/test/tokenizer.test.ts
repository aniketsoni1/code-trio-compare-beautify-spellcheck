import { describe, expect, it } from "vitest";
import { tokenize } from "@ctr/spell-engine";

describe("tokenize (code)", () => {
  const src = ['// a line comment', 'const name = "a string";', "/* block */"].join("\n");
  const tokens = tokenize(src, "typescript");

  it("classifies comments, strings, identifiers, and keywords", () => {
    const kinds = new Set(tokens.map((t) => t.kind));
    expect(kinds.has("comment")).toBe(true);
    expect(kinds.has("string")).toBe(true);
    expect(kinds.has("identifier")).toBe(true);
    expect(kinds.has("keyword")).toBe(true);
  });

  it("captures the string body including quotes", () => {
    const str = tokens.find((t) => t.kind === "string");
    expect(str?.text).toBe('"a string"');
  });

  it("marks keywords distinctly from identifiers", () => {
    const kw = tokens.find((t) => t.kind === "keyword");
    expect(kw?.text).toBe("const");
  });

  it("preserves accurate offsets", () => {
    for (const t of tokens) {
      expect(src.slice(t.offset, t.offset + t.text.length)).toBe(t.text);
    }
  });
});

describe("tokenize (markdown)", () => {
  it("skips fenced and inline code, keeping prose", () => {
    const md = ["# Title", "Some prose here.", "```", "const skipped = 1;", "```", "More `inlineCode` text."].join(
      "\n",
    );
    const tokens = tokenize(md, "markdown");
    const joined = tokens.map((t) => t.text).join(" ");
    expect(joined).toContain("prose");
    expect(joined).not.toContain("skipped");
    expect(joined).not.toContain("inlineCode");
    expect(joined).toContain("More");
    expect(joined).toContain("text");
  });
});
