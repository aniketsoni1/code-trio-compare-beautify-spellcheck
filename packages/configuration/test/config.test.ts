import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, mergeConfig, resolveConfig } from "@ctr/configuration";

describe("configuration", () => {
  it("provides sensible defaults", () => {
    expect(DEFAULT_CONFIG.diff.granularity).toBe("word");
    expect(DEFAULT_CONFIG.spell.checkIdentifiers).toBe(false);
    expect(DEFAULT_CONFIG.format.formatOnSave).toBe(false);
    expect(DEFAULT_CONFIG.spell.dictionaries).toEqual(["base", "technical"]);
  });

  it("fills gaps in a partial config", () => {
    const cfg = resolveConfig({ spell: { checkIdentifiers: true } });
    expect(cfg.spell.checkIdentifiers).toBe(true);
    expect(cfg.spell.severity).toBe("information");
    expect(cfg.diff.contextLines).toBe(3);
  });

  it("rejects invalid values", () => {
    expect(() => resolveConfig({ diff: { granularity: "nonsense" } })).toThrow();
    expect(() => resolveConfig({ spell: { severity: "critical" } })).toThrow();
  });

  it("merges overrides per section", () => {
    const merged = mergeConfig(DEFAULT_CONFIG, { format: { formatOnSave: true } });
    expect(merged.format.formatOnSave).toBe(true);
    expect(merged.format.tabWidth).toBe(2);
    expect(merged.diff.granularity).toBe("word");
  });
});
