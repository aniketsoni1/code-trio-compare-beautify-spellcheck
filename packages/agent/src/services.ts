import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type {
  CancellationToken,
  Diagnostic,
  DiffResult,
  Document,
  FormatResult,
  MergeResolution,
  MergeResult,
} from "@ctr/core";
import type { CodeTrioConfig } from "@ctr/configuration";
import { DEFAULT_CONFIG } from "@ctr/configuration";
import {
  diffDocuments,
  resolveMerge,
  threeWayMerge,
  type DiffOptions,
  type MergeOptions,
  type ResolveOptions,
  type ResolveResult,
} from "@ctr/diff-engine";
import {
  spellCheck,
  spellCheckDetailed,
  type SpellOptions,
  type SpellRunResult,
} from "@ctr/spell-engine";
import { AdapterRegistry, formatDocument } from "@ctr/format-engine";
import { defaultAdapters } from "@ctr/formatters";
import { type Dictionary, builtinWords, loadDictionary } from "@ctr/dictionaries";
import { loadProjectDictionary, type ProjectWords } from "./dictionary-io";
import {
  loadDictionaryStack,
  type DictionaryLocations,
  type DictionarySource,
} from "./dictionary-scopes";

/** Compare two documents using the diff section of a config. */
export function runCompare(
  a: Document,
  b: Document,
  config: CodeTrioConfig = DEFAULT_CONFIG,
  overrides?: Partial<DiffOptions>,
): DiffResult {
  const options: DiffOptions = {
    granularity: config.diff.granularity,
    ignoreWhitespace: config.diff.ignoreWhitespace,
    ignoreCase: config.diff.ignoreCase,
    contextLines: config.diff.contextLines,
    ignoreEol: config.diff.ignoreEol,
    maxLines: config.diff.maxLines,
    maxLength: config.diff.maxBytes,
    ...overrides,
  };
  return diffDocuments(a, b, options);
}

/**
 * Three-way merge convenience.
 *
 * `ignoreEol` is honoured from the diff config rather than taking a separate
 * setting: a user who has told Code Trio to ignore line endings when comparing
 * means the same thing when merging, and two settings that must agree are two
 * settings that eventually disagree.
 */
export function runThreeWayMerge(
  base: string,
  ours: string,
  theirs: string,
  config: CodeTrioConfig = DEFAULT_CONFIG,
  overrides?: MergeOptions,
): MergeResult {
  return threeWayMerge(base, ours, theirs, {
    ignoreEol: config.diff.ignoreEol,
    ...overrides,
  });
}

/**
 * Merge, apply resolutions, and return the text plus whether it is complete.
 *
 * Deliberately does not write. Writing a merge result is a separate, explicit
 * step so a caller cannot accidentally overwrite a working-tree file with a
 * partially resolved merge — see `writeMergedFile`.
 */
export function runMergeAndResolve(
  base: string,
  ours: string,
  theirs: string,
  resolutions: readonly MergeResolution[] = [],
  config: CodeTrioConfig = DEFAULT_CONFIG,
  options: ResolveOptions = {},
): { merge: MergeResult; resolved: ResolveResult } {
  const merge = runThreeWayMerge(base, ours, theirs, config);
  const resolved = resolveMerge(merge, resolutions, options);
  return { merge, resolved };
}

/**
 * Write merged text to a path. WRITE operation.
 *
 * Refuses to overwrite an existing file unless `overwrite` is explicitly set,
 * because the safe default for a merge tool is to produce a new file and let
 * the user diff it against the original.
 */
export function writeMergedFile(
  path: string,
  text: string,
  options: { readonly overwrite?: boolean } = {},
): { written: boolean; reason?: string } {
  if (!options.overwrite && existsSync(path)) {
    return {
      written: false,
      reason: `${path} already exists. Pass an explicit overwrite flag to replace it.`,
    };
  }
  writeFileSync(path, text);
  return { written: true };
}

/**
 * Build the spell dictionary for a run: the configured built-in lists plus any
 * words from the discovered project dictionary and configured ignore words.
 */
export function buildSpellDictionary(
  config: CodeTrioConfig = DEFAULT_CONFIG,
  project?: ProjectWords,
): Dictionary {
  const extra = [...config.spell.ignoreWords, ...(project?.words ?? []), ...(project?.ignore ?? [])];
  return loadDictionary(config.spell.dictionaries, extra);
}

/** Translate a config into the engine's option shape. Shared by every caller. */
function spellOptions(
  config: CodeTrioConfig,
  dictionary: Dictionary,
  token?: CancellationToken,
): SpellOptions {
  return {
    dictionary,
    checkComments: config.spell.checkComments,
    checkStrings: config.spell.checkStrings,
    checkIdentifiers: config.spell.checkIdentifiers,
    checkAcronyms: config.spell.checkAcronyms,
    severity: config.spell.severity,
    minWordLength: config.spell.minWordLength,
    maxSuggestions: config.spell.maxSuggestions,
    ignoreWords: config.spell.ignoreWords,
    ignorePatterns: config.spell.ignorePatterns,
    ignoreNoiseTokens: config.spell.ignoreNoiseTokens,
    maxFileSizeKb: config.spell.maxFileSizeKb,
    maxDiagnostics: config.spell.maxDiagnostics,
    // Technical terms outrank equally-distant ordinary words, so in a codebase
    // "kubernets" suggests "kubernetes" rather than a coincidental near-match.
    preferredWords: technicalWordSet(config),
    ...(token ? { token } : {}),
  };
}

let technicalCache: ReadonlySet<string> | undefined;
function technicalWordSet(config: CodeTrioConfig): ReadonlySet<string> | undefined {
  if (!config.spell.dictionaries.includes("technical")) return undefined;
  technicalCache ??= new Set(builtinWords("technical"));
  return technicalCache;
}

/** Spell check a document with the resolved config and dictionary. */
export function runSpell(
  doc: Document,
  config: CodeTrioConfig = DEFAULT_CONFIG,
  project?: ProjectWords,
  token?: CancellationToken,
): Diagnostic[] {
  if (!config.spell.enabled) return [];
  const dictionary = buildSpellDictionary(config, project);
  return spellCheck(doc, spellOptions(config, dictionary, token));
}

/**
 * Spell check against a scoped dictionary stack, reporting run metadata.
 *
 * This is the entry point the extension uses, because it needs to know which
 * dictionary sources were consulted (to offer "remove from the right file"),
 * whether the document was skipped and why, and whether the diagnostic cap was
 * hit.
 */
export function runSpellScoped(
  doc: Document,
  config: CodeTrioConfig = DEFAULT_CONFIG,
  locations: DictionaryLocations = {},
  token?: CancellationToken,
): SpellRunResult & { sources: readonly DictionarySource[] } {
  if (!config.spell.enabled) {
    return { diagnostics: [], truncated: false, invalidPatterns: [], sources: [] };
  }
  const { stack, sources } = loadDictionaryStack(config, locations);
  const result = spellCheckDetailed(doc, spellOptions(config, stack, token));
  return { ...result, sources };
}

/** Discover the project dictionary for a workspace root, then spell check. */
export function runSpellInWorkspace(
  doc: Document,
  root: string,
  config: CodeTrioConfig = DEFAULT_CONFIG,
): Diagnostic[] {
  const project = loadProjectDictionary(root, config.spell.projectDictionaryPath);
  return runSpell(doc, config, project);
}

/** A ready-to-use registry with the default adapter chain. */
export function defaultRegistry(): AdapterRegistry {
  return new AdapterRegistry(defaultAdapters());
}

/**
 * Build a registry honouring the format section of a config.
 *
 * Per-adapter executable paths are passed through so a user on a machine
 * without a global install can point Code Trio at a virtualenv's ruff without
 * changing PATH for their whole shell.
 */
export function registryFor(config: CodeTrioConfig = DEFAULT_CONFIG): AdapterRegistry {
  const paths = config.format.externalFormatterPaths;
  const adapters = defaultAdapters({
    external: {
      disabled: !config.format.externalFormatters,
      timeoutMs: config.format.externalTimeoutMs,
    },
    preferred: config.format.preferredFormatters,
  });
  // Re-create the external adapters with their own configured path, if any.
  for (const adapter of adapters) {
    const id = adapter.capabilities?.id;
    if (!id) continue;
    const configured = paths[id];
    if (!configured) continue;
    const withPath = adapter as unknown as { config?: { executablePath?: string } };
    if (withPath.config) withPath.config.executablePath = configured;
  }
  return new AdapterRegistry(adapters);
}

/** Format a document (dry run) with the format section of a config. */
export function runFormat(
  doc: Document,
  config: CodeTrioConfig = DEFAULT_CONFIG,
  registry: AdapterRegistry = defaultRegistry(),
): Promise<FormatResult> {
  return formatDocument(doc, registry, {
    formatOptions: {
      tabWidth: config.format.tabWidth,
      useTabs: config.format.useTabs,
      printWidth: config.format.printWidth,
      filepath: safeFsPath(doc.uri),
    },
    computePreview: true,
  });
}

/**
 * Format a file and, if changed, write it back. WRITE operation (see the
 * `format.apply` tool descriptor). Returns the result and whether it was
 * applied.
 */
export async function applyFormatToFile(
  path: string,
  languageId: string,
  config: CodeTrioConfig = DEFAULT_CONFIG,
  registry: AdapterRegistry = defaultRegistry(),
): Promise<{ result: FormatResult; applied: boolean }> {
  const text = readFileSync(path, "utf8");
  const doc: Document = { uri: path, languageId, text };
  const result = await formatDocument(doc, registry, {
    formatOptions: {
      tabWidth: config.format.tabWidth,
      useTabs: config.format.useTabs,
      printWidth: config.format.printWidth,
      filepath: path,
    },
    computePreview: false,
  });
  if (result.changed && !result.error && !result.unsupported) {
    writeFileSync(path, result.formatted);
    return { result, applied: true };
  }
  return { result, applied: false };
}

function safeFsPath(uri: string): string | undefined {
  if (uri.startsWith("file:")) {
    try {
      return fileURLToPath(uri);
    } catch {
      return undefined;
    }
  }
  return undefined;
}
