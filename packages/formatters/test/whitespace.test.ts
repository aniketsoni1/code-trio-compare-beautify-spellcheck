import { describe, expect, it } from "vitest";
import type { Document } from "@ctr/core";
import { WhitespaceAdapter } from "@ctr/formatters";

const adapter = new WhitespaceAdapter();
const doc = (text: string): Document => ({ uri: "file:///f", languageId: "python", text });

describe("WhitespaceAdapter", () => {
  it("trims trailing whitespace and normalizes the final newline", async () => {
    const out = await adapter.format(doc("a = 1   \nb = 2\t\n\n\n"));
    expect(out.formatted).toBe("a = 1\nb = 2\n");
  });

  it("is idempotent", async () => {
    const once = (await adapter.format(doc("x = 1  \n"))).formatted;
    const twice = (await adapter.format(doc(once))).formatted;
    expect(twice).toBe(once);
  });

  it("preserves indentation (whitespace-sensitive safe)", async () => {
    const out = await adapter.format(doc("def f():\n    return 1  \n"));
    expect(out.formatted).toBe("def f():\n    return 1\n");
  });
});
