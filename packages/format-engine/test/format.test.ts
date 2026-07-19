import { describe, expect, it } from "vitest";
import type { AdapterFormatOutput, Document, FormatterAdapter } from "@ctr/core";
import { AdapterRegistry, formatDocument } from "@ctr/format-engine";
import { PrettierAdapter, WhitespaceAdapter } from "@ctr/formatters";

const doc = (text: string, languageId: string): Document => ({
  uri: "file:///f",
  languageId,
  text,
});

describe("formatDocument - Prettier adapter", () => {
  const registry = new AdapterRegistry([new PrettierAdapter()]);

  it("formats messy TypeScript deterministically", async () => {
    const result = await formatDocument(doc("const   x=1", "typescript"), registry);
    expect(result.unsupported).toBe(false);
    expect(result.changed).toBe(true);
    expect(result.formatted).toBe("const x = 1;\n");
    expect(result.formatter.name).toBe("prettier");
    expect(result.previewDiff).toBeDefined();
  });

  it("reports no change for already-formatted input", async () => {
    const result = await formatDocument(doc("const x = 1;\n", "typescript"), registry);
    expect(result.changed).toBe(false);
    expect(result.edits).toHaveLength(0);
  });
});

describe("formatDocument - fallback + degradation", () => {
  it("uses the whitespace normalizer for languages Prettier ignores", async () => {
    const registry = new AdapterRegistry([new PrettierAdapter(), new WhitespaceAdapter()]);
    const result = await formatDocument(doc("x = 1   \ny = 2\t\n\n\n", "python"), registry);
    expect(result.formatter.name).toBe("whitespace-normalizer");
    expect(result.formatted).toBe("x = 1\ny = 2\n");
  });

  it("returns unsupported when no adapter claims the language", async () => {
    const registry = new AdapterRegistry([new PrettierAdapter()]);
    const result = await formatDocument(doc("hello", "plaintext"), registry);
    expect(result.unsupported).toBe(true);
    expect(result.changed).toBe(false);
  });

  it("degrades to a reported error instead of throwing", async () => {
    const brokenAdapter: FormatterAdapter = {
      name: "broken",
      version: "0.0.0",
      supports: () => true,
      isAvailable: () => Promise.resolve(true),
      format: (): Promise<AdapterFormatOutput> => Promise.reject(new Error("boom")),
    };
    const registry = new AdapterRegistry([brokenAdapter]);
    const result = await formatDocument(doc("x", "typescript"), registry);
    expect(result.error).toBe("boom");
    expect(result.changed).toBe(false);
    expect(result.formatted).toBe("x");
  });
});
