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
  /**
   * Treat CRLF, LF and CR as equivalent.
   *
   * Off by default: a line-ending change is a real change a reviewer may need
   * to see. Turning it on is the right move on a mixed-platform team where
   * checkout normalisation would otherwise mark every line as modified.
   */
  ignoreEol: z.boolean().default(false),
  /**
   * Refuse to compare inputs above this many lines. Beyond roughly this size a
   * textual diff stops being useful to read, and the memory cost of the edit
   * script grows faster than the value of the output.
   */
  maxLines: z.number().int().min(1_000).max(5_000_000).default(300_000),
  /** Refuse to compare inputs above this many bytes. */
  maxBytes: z
    .number()
    .int()
    .min(64 * 1024)
    .max(512 * 1024 * 1024)
    .default(20 * 1024 * 1024),
});

export const SpellConfigSchema = z.object({
  enabled: z.boolean().default(true),
  checkComments: z.boolean().default(true),
  checkStrings: z.boolean().default(true),
  checkIdentifiers: z.boolean().default(false),
  severity: z.enum(["error", "warning", "information", "hint"]).default("information"),
  dictionaries: z.array(z.enum(["base", "technical"])).default(["base", "technical"]),
  /**
   * The workspace-level dictionary. Kept at its v0.1.0 name and default so
   * existing project dictionaries keep working with no migration step.
   */
  projectDictionaryPath: z.string().default(".codetrio/dictionary.txt"),
  /**
   * Per-workspace-folder dictionary, relative to each folder root. Only
   * consulted when the folder differs from the workspace root, which is what
   * makes it meaningful in a multi-root workspace or a monorepo: terms correct
   * in one package are noise in another.
   */
  folderDictionaryPath: z.string().default(".codetrio/dictionary.txt"),
  /**
   * The user's personal dictionary, outside any repository. Resolved against
   * the home directory. Empty disables the scope entirely.
   */
  userDictionaryPath: z.string().default(".codetrio/user-dictionary.txt"),
  /** Suppress URLs, hashes, UUIDs, paths, versions and similar machine data. */
  ignoreNoiseTokens: z.boolean().default(true),
  /** Additional regular expressions whose matches are never reported. */
  ignorePatterns: z.array(z.string()).default([]),
  /** Also check ALL-CAPS acronym fragments when identifier checking is on. */
  checkAcronyms: z.boolean().default(false),
  /** Skip documents above this size rather than scanning them. */
  maxFileSizeKb: z.number().int().min(1).max(102_400).default(2_048),
  /** Cap on diagnostics reported for a single document. */
  maxDiagnostics: z.number().int().min(1).max(100_000).default(1_000),
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
