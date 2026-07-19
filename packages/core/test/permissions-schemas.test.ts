import { describe, expect, it } from "vitest";
import {
  DocumentSchema,
  ProjectDictionarySchema,
  getToolDescriptor,
  isWriteTool,
  parseOrThrow,
} from "@ctr/core";

describe("tool descriptors", () => {
  it("classifies read vs write tools", () => {
    expect(isWriteTool("diff.compare")).toBe(false);
    expect(isWriteTool("spell.check")).toBe(false);
    expect(isWriteTool("format.apply")).toBe(true);
    expect(isWriteTool("spell.addWord")).toBe(true);
  });

  it("marks write tools as audited", () => {
    expect(getToolDescriptor("format.apply").audit).toBe(true);
    expect(getToolDescriptor("diff.compare").audit).toBe(false);
  });
});

describe("schemas", () => {
  it("validates a document", () => {
    const doc = parseOrThrow(
      DocumentSchema,
      { uri: "file:///a.ts", languageId: "typescript", text: "x" },
      "document",
    );
    expect(doc.uri).toBe("file:///a.ts");
  });

  it("rejects an invalid document with a readable error", () => {
    expect(() => parseOrThrow(DocumentSchema, { uri: "", languageId: "ts" }, "document")).toThrow(
      /Invalid document/,
    );
  });

  it("defaults ignoreWords in a project dictionary", () => {
    const dict = ProjectDictionarySchema.parse({ words: ["ctr", "vsix"] });
    expect(dict.ignoreWords).toEqual([]);
    expect(dict.words).toContain("vsix");
  });
});
