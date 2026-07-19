import { describe, expect, it } from "vitest";
import {
  getLanguage,
  isWhitespaceSensitive,
  languageFromPath,
  languageIds,
  resolveLanguage,
} from "@ctr/core";

describe("language registry", () => {
  it("resolves by id and alias", () => {
    expect(getLanguage("typescript")?.id).toBe("typescript");
    expect(getLanguage("ts")?.id).toBe("typescript");
    expect(getLanguage("py")?.id).toBe("python");
    expect(getLanguage("unknown-lang")).toBeUndefined();
  });

  it("falls back to plaintext", () => {
    expect(resolveLanguage(undefined).id).toBe("plaintext");
    expect(resolveLanguage("nope").id).toBe("plaintext");
  });

  it("infers language from path", () => {
    expect(languageFromPath("/a/b/main.ts").id).toBe("typescript");
    expect(languageFromPath("styles.css").id).toBe("css");
    expect(languageFromPath("README.md").id).toBe("markdown");
    expect(languageFromPath("noext").id).toBe("plaintext");
  });

  it("marks whitespace-sensitive languages", () => {
    expect(isWhitespaceSensitive("python")).toBe(true);
    expect(isWhitespaceSensitive("yaml")).toBe(true);
    expect(isWhitespaceSensitive("typescript")).toBe(false);
  });

  it("exposes comment/string syntax used by the tokenizer", () => {
    const ts = getLanguage("typescript");
    expect(ts?.lineComments).toContain("//");
    expect(ts?.stringDelimiters).toContain("`");
    expect(languageIds().length).toBeGreaterThan(5);
  });
});
