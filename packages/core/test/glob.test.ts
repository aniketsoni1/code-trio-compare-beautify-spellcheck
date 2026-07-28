import { describe, expect, it } from "vitest";
import { globToRegExp, matchesAnyGlob, matchesGlob, toPosixPath } from "../src/glob";

describe("matchesGlob", () => {
  it("matches a literal path", () => {
    expect(matchesGlob("src/index.ts", "src/index.ts")).toBe(true);
    expect(matchesGlob("src/other.ts", "src/index.ts")).toBe(false);
  });

  it("treats * as a single-segment wildcard", () => {
    expect(matchesGlob("src/index.ts", "src/*.ts")).toBe(true);
    expect(matchesGlob("src/deep/index.ts", "src/*.ts")).toBe(false);
  });

  it("treats ** as a multi-segment wildcard", () => {
    expect(matchesGlob("src/deep/nested/index.ts", "src/**")).toBe(true);
    expect(matchesGlob("src/index.ts", "**/*.ts")).toBe(true);
    expect(matchesGlob("index.ts", "**/*.ts")).toBe(true);
  });

  it("matches the canonical node_modules exclusion at any depth", () => {
    const glob = "**/node_modules/**";
    expect(matchesGlob("node_modules/pkg/index.js", glob)).toBe(true);
    expect(matchesGlob("apps/cli/node_modules/pkg/index.js", glob)).toBe(true);
    expect(matchesGlob("src/node_modules_helper.ts", glob)).toBe(false);
  });

  it("supports ? for exactly one character", () => {
    expect(matchesGlob("a.ts", "?.ts")).toBe(true);
    expect(matchesGlob("ab.ts", "?.ts")).toBe(false);
    expect(matchesGlob("a/b.ts", "?/?.ts")).toBe(true);
  });

  it("supports character classes and negation", () => {
    expect(matchesGlob("a.ts", "[abc].ts")).toBe(true);
    expect(matchesGlob("d.ts", "[abc].ts")).toBe(false);
    expect(matchesGlob("d.ts", "[!abc].ts")).toBe(true);
    expect(matchesGlob("m.ts", "[a-z].ts")).toBe(true);
  });

  it("supports brace alternation", () => {
    expect(matchesGlob("src/a.ts", "src/*.{ts,tsx}")).toBe(true);
    expect(matchesGlob("src/a.tsx", "src/*.{ts,tsx}")).toBe(true);
    expect(matchesGlob("src/a.js", "src/*.{ts,tsx}")).toBe(false);
  });

  it("escapes regex metacharacters in literal segments", () => {
    expect(matchesGlob("a+b.ts", "a+b.ts")).toBe(true);
    expect(matchesGlob("aab.ts", "a+b.ts")).toBe(false);
    expect(matchesGlob("v1.2.3/notes.md", "v1.2.3/*.md")).toBe(true);
    expect(matchesGlob("v1x2x3/notes.md", "v1.2.3/*.md")).toBe(false);
  });

  it("degrades instead of throwing on a malformed pattern", () => {
    expect(() => globToRegExp("src/[unterminated")).not.toThrow();
    expect(matchesGlob("src/[unterminated", "src/[unterminated")).toBe(true);
    expect(() => globToRegExp("src/{a,b")).not.toThrow();
  });

  it("returns a cached, reusable regex without lastIndex drift", () => {
    const first = globToRegExp("**/*.ts");
    const second = globToRegExp("**/*.ts");
    expect(second).toBe(first);
    // A non-global regex has no lastIndex state, so repeated tests are stable.
    expect(first.test("a.ts")).toBe(true);
    expect(first.test("a.ts")).toBe(true);
  });
});

describe("matchesAnyGlob", () => {
  it("returns false for an empty pattern list", () => {
    expect(matchesAnyGlob("anything.ts", [])).toBe(false);
  });

  it("returns true when any pattern matches", () => {
    const globs = ["**/node_modules/**", "**/dist/**", "**/out/**"];
    expect(matchesAnyGlob("apps/cli/dist/index.cjs", globs)).toBe(true);
    expect(matchesAnyGlob("apps/cli/src/index.ts", globs)).toBe(false);
  });
});

describe("toPosixPath", () => {
  it("converts Windows separators", () => {
    expect(toPosixPath("C:\\repo\\src\\index.ts")).toBe("C:/repo/src/index.ts");
  });

  it("leaves posix paths untouched", () => {
    expect(toPosixPath("/repo/src/index.ts")).toBe("/repo/src/index.ts");
  });
});
