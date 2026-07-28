import { describe, expect, it } from "vitest";
import { loadDictionary } from "@ctr/dictionaries";
import { compileIgnorePatterns, isNoiseWord, maskNoise } from "../src/noise";
import { spellCheck, spellCheckDetailed } from "../src/spell";

const dictionary = loadDictionary(["base", "technical"]);

function check(text: string, languageId = "typescript"): string[] {
  return spellCheck({ uri: "t", languageId, text }, { dictionary }).map((d) =>
    String(d.data?.surface ?? ""),
  );
}

describe("maskNoise", () => {
  it("preserves length so every offset stays valid", () => {
    const inputs = [
      "see https://example.com/a/b?c=1 for more",
      "id 550e8400-e29b-41d4-a716-446655440000 here",
      "colour #1a2b3c and 0xFF00AA",
      "path /var/log/app/server.log there",
      "mail someone@example.com now",
    ];
    for (const input of inputs) {
      expect(maskNoise(input), input).toHaveLength(input.length);
    }
  });

  it("removes URLs entirely rather than leaving hostname labels", () => {
    const masked = maskNoise("see https://api.example.com/v1/users for details");
    expect(masked).not.toContain("api");
    expect(masked).not.toContain("example");
    expect(masked).not.toContain("users");
    expect(masked).toContain("see");
    expect(masked).toContain("details");
  });

  it("removes each noise class", () => {
    const cases: Array<[string, string]> = [
      ["email", "write to dev@example.com ok"],
      ["uuid", "id 550e8400-e29b-41d4-a716-446655440000 ok"],
      ["sha", "commit 3f8a9c2e4b1d5f7a8c9e0b2d4f6a8c1e3b5d7f9a ok"],
      ["hex colour", "colour #1a2b3c ok"],
      ["hex literal", "mask 0xDEADBEEF ok"],
      ["semver", "version v2.14.3-beta.1 ok"],
      ["iso date", "at 2024-03-15T10:30:00Z ok"],
      ["posix path", "file /usr/local/bin/thing ok"],
      ["relative path", "file ./src/index.ts ok"],
      ["windows path", "file C:\\Users\\dev\\app.ts ok"],
      ["scoped package", "dep @scope/package-name ok"],
      ["template placeholder", "text ${user.emailAddress} ok"],
      ["format specifier", "printf %s and %-10.4f ok"],
      ["entity", "text &nbsp; and &#8212; ok"],
      ["escape", "text \\u00e9 and \\x41 ok"],
    ];
    for (const [label, input] of cases) {
      const masked = maskNoise(input);
      // The surrounding prose survives; the noisy span does not.
      expect(masked, label).toContain("ok");
      expect(masked.trim().split(/\s+/).length, label).toBeLessThan(
        input.trim().split(/\s+/).length + 1,
      );
    }
  });

  it("keeps the visible text of a markdown link and drops the destination", () => {
    const masked = maskNoise("[read the guide](https://example.com/guide/index.html)");
    expect(masked).toContain("read the guide");
    expect(masked).not.toContain("guide/index");
  });

  it("can be disabled", () => {
    const input = "see https://example.com/thing";
    expect(maskNoise(input, { disabled: true })).toBe(input);
  });

  it("survives a caller-supplied pattern that throws", () => {
    const evil = { [Symbol.replace]: undefined } as unknown as RegExp;
    expect(() => maskNoise("text", { extraPatterns: [evil] })).not.toThrow();
  });
});

describe("isNoiseWord", () => {
  it("rejects runs containing digits", () => {
    for (const w of ["sha1", "utf8", "i18n", "x86", "md5sum"]) {
      expect(isNoiseWord(w), w).toBe(true);
    }
  });

  it("rejects long mixed-case blobs", () => {
    expect(isNoiseWord("dGhpcyBpcyBhIHRlc3Qgc3RyaW5n1")).toBe(true);
  });

  it("rejects long vowelless runs", () => {
    expect(isNoiseWord("bcdfghjk")).toBe(true);
  });

  it("rejects triple-repeated characters", () => {
    expect(isNoiseWord("aaaa")).toBe(true);
    expect(isNoiseWord("hmmmm")).toBe(true);
  });

  it("accepts ordinary long words", () => {
    for (const w of ["internationalisation", "configuration", "rhythms", "documentation"]) {
      expect(isNoiseWord(w), w).toBe(false);
    }
  });
});

describe("end-to-end noise reduction", () => {
  it("reports nothing for a comment that is entirely machine data", () => {
    const text = [
      "// https://example.com/docs?ref=abc",
      "// 550e8400-e29b-41d4-a716-446655440000",
      "// 3f8a9c2e4b1d5f7a8c9e0b2d4f6a8c1e3b5d7f9a",
      "// #1a2b3c 0xFF00AA v2.14.3",
      "// /var/log/app/server.log",
      "",
    ].join("\n");
    expect(check(text)).toEqual([]);
  });

  it("still finds a real misspelling next to noise", () => {
    const text = "// See https://example.com for the mispeling\n";
    expect(check(text)).toContain("mispeling");
  });

  it("does not report template interpolation contents", () => {
    const text = "const m = `Hello ${user.firstName}, you have ${count} msgs`;\n";
    expect(check(text)).not.toContain("firstName");
  });

  it("honours a user-supplied ignore pattern", () => {
    const text = "// the widgetron is ready\n";
    const withoutPattern = spellCheck(
      { uri: "t", languageId: "typescript", text },
      { dictionary },
    );
    const withPattern = spellCheck(
      { uri: "t", languageId: "typescript", text },
      { dictionary, ignorePatterns: ["widgetron"] },
    );
    expect(withoutPattern.some((d) => d.data?.surface === "widgetron")).toBe(true);
    expect(withPattern.some((d) => d.data?.surface === "widgetron")).toBe(false);
  });

  it("reports a broken ignore pattern instead of silently dropping it", () => {
    const result = spellCheckDetailed(
      { uri: "t", languageId: "typescript", text: "// hello\n" },
      { dictionary, ignorePatterns: ["([unclosed"] },
    );
    expect(result.invalidPatterns).toEqual(["([unclosed"]);
  });
});

describe("whole-document skipping", () => {
  const detailed = (text: string, languageId = "typescript"): ReturnType<typeof spellCheckDetailed> =>
    spellCheckDetailed({ uri: "t", languageId, text }, { dictionary });

  it("skips a generated file", () => {
    const text = "// @generated by protoc. DO NOT EDIT.\n// mispeled everywhere\n";
    const result = detailed(text);
    expect(result.skipped).toBe("generated");
    expect(result.diagnostics).toEqual([]);
  });

  it("skips a minified bundle", () => {
    const text = `// ${"a".repeat(200_000)}\n`;
    expect(detailed(text).skipped).toBe("minified");
  });

  it("skips binary content", () => {
    expect(detailed(`\u0000\u0001binary`).skipped).toBe("binary");
  });

  it("skips an oversized document", () => {
    const result = spellCheckDetailed(
      { uri: "t", languageId: "typescript", text: `// ${"word ".repeat(50_000)}\n` },
      { dictionary, maxFileSizeKb: 1 },
    );
    expect(result.skipped).toBe("too-large");
  });

  it("honours the codetrio-ignore-file marker", () => {
    expect(detailed("// codetrio-ignore-file\n// mispeled\n").skipped).toBe("ignore-file");
  });

  it("caps diagnostics and says so", () => {
    const text = `// ${new Array(200).fill(0).map((_, i) => `zzq${String.fromCharCode(97 + (i % 26))}wxv`).join(" ")}\n`;
    const result = spellCheckDetailed(
      { uri: "t", languageId: "typescript", text },
      { dictionary, maxDiagnostics: 5 },
    );
    expect(result.diagnostics.length).toBeLessThanOrEqual(5);
    expect(result.truncated).toBe(true);
  });
});

describe("compileIgnorePatterns", () => {
  it("compiles valid patterns and reports invalid ones", () => {
    const { patterns, invalid } = compileIgnorePatterns(["foo", "[bar", "\\d+"]);
    expect(patterns).toHaveLength(2);
    expect(invalid).toEqual(["[bar"]);
  });
});
