import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type {
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
import { spellCheck } from "@ctr/spell-engine";
import { AdapterRegistry, formatDocument } from "@ctr/format-engine";
import { defaultAdapters } from "@ctr/formatters";
import { type Dictionary, loadDictionary } from "@ctr/dictionaries";
import { loadProjectDictionary, type ProjectWords } from "./dictionary-io";

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

/** Spell check a document with the resolved config and dictionary. */
export function runSpell(
  doc: Document,
  config: CodeTrioConfig = DEFAULT_CONFIG,
  project?: ProjectWords,
): Diagnostic[] {
  if (!config.spell.enabled) return [];
  const dictionary = buildSpellDictionary(config, project);
  return spellCheck(doc, {
    dictionary,
    checkComments: config.spell.checkComments,
    checkStrings: config.spell.checkStrings,
    checkIdentifiers: config.spell.checkIdentifiers,
    severity: config.spell.severity,
    minWordLength: config.spell.minWordLength,
    maxSuggestions: config.spell.maxSuggestions,
    ignoreWords: config.spell.ignoreWords,
  });
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
