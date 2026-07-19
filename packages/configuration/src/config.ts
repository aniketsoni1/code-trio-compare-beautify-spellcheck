import { z } from "zod";

/**
 * The Code Trio configuration model, namespaced per feature (diff/spell/format)
 * to mirror the VS Code settings (`codeTrio.diff.*`, `codeTrio.spell.*`,
 * `codeTrio.format.*`). This package owns the schema and defaults; discovery of
 * on-disk config and dictionaries is performed by @ctr/agent.
 */

export const DiffConfigSchema = z.object({
  granularity: z.enum(["line", "word", "char"]).default("word"),
  ignoreWhitespace: z.boolean().default(false),
  ignoreCase: z.boolean().default(false),
  contextLines: z.number().int().min(0).max(50).default(3),
});

export const SpellConfigSchema = z.object({
  enabled: z.boolean().default(true),
  checkComments: z.boolean().default(true),
  checkStrings: z.boolean().default(true),
  checkIdentifiers: z.boolean().default(false),
  severity: z.enum(["error", "warning", "information", "hint"]).default("information"),
  dictionaries: z.array(z.enum(["base", "technical"])).default(["base", "technical"]),
  projectDictionaryPath: z.string().default(".codetrio/dictionary.txt"),
  ignoreGlobs: z
    .array(z.string())
    .default(["**/node_modules/**", "**/dist/**", "**/out/**"]),
  ignoreWords: z.array(z.string()).default([]),
  minWordLength: z.number().int().min(1).max(20).default(3),
  maxSuggestions: z.number().int().min(0).max(20).default(5),
});

export const FormatConfigSchema = z.object({
  formatOnSave: z.boolean().default(false),
  previewBeforeApply: z.boolean().default(true),
  pinnedVersions: z.boolean().default(true),
  tabWidth: z.number().int().min(1).max(16).default(2),
  useTabs: z.boolean().default(false),
  printWidth: z.number().int().min(20).max(400).default(80),
});

export const CodeTrioConfigSchema = z.object({
  diff: DiffConfigSchema.default({}),
  spell: SpellConfigSchema.default({}),
  format: FormatConfigSchema.default({}),
});

export type DiffConfig = z.infer<typeof DiffConfigSchema>;
export type SpellConfig = z.infer<typeof SpellConfigSchema>;
export type FormatConfig = z.infer<typeof FormatConfigSchema>;
export type CodeTrioConfig = z.infer<typeof CodeTrioConfigSchema>;

/** The fully-defaulted configuration. */
export const DEFAULT_CONFIG: CodeTrioConfig = CodeTrioConfigSchema.parse({});

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends readonly unknown[]
    ? T[K]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

/** Validate and default a (possibly partial) configuration object. */
export function resolveConfig(input: unknown = {}): CodeTrioConfig {
  return CodeTrioConfigSchema.parse(input ?? {});
}

/** Shallow-per-section merge of a partial override onto a base config. */
export function mergeConfig(
  base: CodeTrioConfig,
  override: DeepPartial<CodeTrioConfig> | undefined,
): CodeTrioConfig {
  if (!override) return base;
  return {
    diff: { ...base.diff, ...override.diff },
    spell: { ...base.spell, ...override.spell },
    format: { ...base.format, ...override.format },
  };
}

export type { DeepPartial };
