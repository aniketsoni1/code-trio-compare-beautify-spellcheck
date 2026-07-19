import { describe, expect, it } from "vitest";
import { PositionMapper, detectEol, hasFinalNewline, splitLines } from "@ctr/core";

describe("splitLines", () => {
  it("keeps a trailing empty line", () => {
    expect(splitLines("a\n")).toEqual(["a", ""]);
  });
  it("handles CRLF and CR", () => {
    expect(splitLines("a\r\nb\rc")).toEqual(["a", "b", "c"]);
  });
});

describe("detectEol / hasFinalNewline", () => {
  it("detects CRLF", () => {
    expect(detectEol("a\r\nb")).toBe("\r\n");
  });
  it("detects LF default", () => {
    expect(detectEol("a\nb")).toBe("\n");
    expect(detectEol("no newline")).toBe("\n");
  });
  it("detects a final newline", () => {
    expect(hasFinalNewline("a\n")).toBe(true);
    expect(hasFinalNewline("a")).toBe(false);
  });
});

describe("PositionMapper", () => {
  const text = "const x = 1;\nconst y = 2;\n\nend";
  const m = new PositionMapper(text);

  it("maps offsets to positions", () => {
    expect(m.positionAt(0)).toEqual({ line: 0, character: 0 });
    expect(m.positionAt(6)).toEqual({ line: 0, character: 6 });
    // the newline itself sits at the end of line 0
    expect(m.positionAt(12)).toEqual({ line: 0, character: 12 });
    // first char of line 1 (after the newline at offset 12)
    expect(m.positionAt(13)).toEqual({ line: 1, character: 0 });
    // empty line 2
    expect(m.positionAt(text.indexOf("end"))).toEqual({ line: 3, character: 0 });
  });

  it("round-trips position <-> offset", () => {
    for (let o = 0; o <= text.length; o++) {
      expect(m.offsetAt(m.positionAt(o))).toBe(o);
    }
  });

  it("clamps out-of-range offsets", () => {
    expect(m.positionAt(-5)).toEqual({ line: 0, character: 0 });
    expect(m.offsetAt(m.positionAt(9999))).toBe(text.length);
  });

  it("handles CRLF documents", () => {
    const crlf = new PositionMapper("a\r\nbb\r\nccc");
    expect(crlf.positionAt(3)).toEqual({ line: 1, character: 0 });
    expect(crlf.positionAt(7)).toEqual({ line: 2, character: 0 });
  });
});
