import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, resolve } from "node:path";
import type { CodeTrioConfig } from "@ctr/configuration";
import {
  DictionaryStack,
  type DictionaryLayer,
  type DictionaryScope,
  builtinWords,
  parseWordList,
} from "@ctr/dictionaries";

/**
 * Discovery and loading of on-disk dictionaries. This is the I/O half of the
 * dictionary-scope model; the precedence rules themselves live in
 * `@ctr/dictionaries` and stay pure.
 *
 * The point of per-folder dictionaries is that a monorepo is not one
 * vocabulary. Terms that are correct in `services/billing` are noise in
 * `apps/marketing-site`, and forcing both into one shared file means the file
 * accumulates every word from every folder until it stops rejecting anything.
 */

export interface DictionaryLocations {
  /** The workspace folder that owns the document being checked. */
  readonly folder?: string;
  /** The workspace or repository root. */
  readonly workspace?: string;
  /** Override for the user dictionary path. Defaults to the home directory. */
  readonly userPath?: string;
}

export interface LoadedDictionaries {
  readonly stack: DictionaryStack;
  /** Paths consulted, in precedence order, whether or not they existed. */
  readonly sources: readonly DictionarySource[];
}

export interface DictionarySource {
  readonly scope: DictionaryScope;
  readonly path: string;
  readonly exists: boolean;
  readonly wordCount: number;
  readonly error?: string;
}

/** Resolve `~` and relative paths against a base directory. */
function resolvePath(base: string, path: string): string {
  if (path.startsWith("~/") || path === "~") {
    return resolve(homedir(), path.slice(2));
  }
  return isAbsolute(path) ? path : resolve(base, path);
}

/**
 * Read one dictionary file into a layer.
 *
 * A missing file is normal and produces an empty layer. An unreadable or
 * malformed file produces an empty layer flagged `unavailable`, so the caller
 * can warn the user rather than silently checking against a dictionary that
 * was never loaded — the failure mode where a permissions problem looks like a
 * sudden flood of spelling errors.
 */
function readLayer(scope: DictionaryScope, path: string): {
  layer: DictionaryLayer;
  source: DictionarySource;
} {
  if (!existsSync(path)) {
    return {
      layer: { scope, words: [], origin: path },
      source: { scope, path, exists: false, wordCount: 0 },
    };
  }
  try {
    const parsed = parseWordList(readFileSync(path, "utf8"));
    return {
      layer: { scope, words: parsed.words, blocked: parsed.ignore, origin: path },
      source: { scope, path, exists: true, wordCount: parsed.words.length },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      layer: { scope, words: [], origin: path, unavailable: true, error: message },
      source: { scope, path, exists: true, wordCount: 0, error: message },
    };
  }
}

/**
 * Build the full dictionary stack for a document.
 *
 * Layers are pushed from least to most specific; `DictionaryStack` applies
 * precedence at lookup time, so push order here is purely for readability.
 *
 * The two built-in lists are registered as separate layers rather than
 * pre-merged. That is what allows a workspace to block an ordinary English word
 * without also losing the technical vocabulary, and it lets the UI tell a user
 * whether a word was accepted because it is normal English or because it is a
 * known technical term.
 */
export function loadDictionaryStack(
  config: CodeTrioConfig,
  locations: DictionaryLocations = {},
): LoadedDictionaries {
  const layers: DictionaryLayer[] = [];
  const sources: DictionarySource[] = [];

  for (const name of config.spell.dictionaries) {
    layers.push({ scope: name === "technical" ? "technical" : "base", words: builtinWords(name) });
  }

  const userPath = locations.userPath ?? config.spell.userDictionaryPath;
  if (userPath) {
    const resolved = resolvePath(homedir(), userPath);
    const { layer, source } = readLayer("user", resolved);
    layers.push(layer);
    sources.push(source);
  }

  if (locations.workspace) {
    // The workspace dictionary is the existing projectDictionaryPath, kept at
    // its original default so v0.1.0 project dictionaries keep working with no
    // migration.
    const resolved = resolvePath(locations.workspace, config.spell.projectDictionaryPath);
    const { layer, source } = readLayer("workspace", resolved);
    layers.push(layer);
    sources.push(source);
  }

  // The folder layer is only meaningful when the folder differs from the
  // workspace root; otherwise it would load the same file twice and report a
  // confusing duplicate source.
  if (locations.folder && locations.folder !== locations.workspace) {
    const resolved = resolvePath(
      locations.folder,
      config.spell.folderDictionaryPath || config.spell.projectDictionaryPath,
    );
    const alreadyLoaded = sources.some((s) => s.path === resolved);
    if (!alreadyLoaded) {
      const { layer, source } = readLayer("folder", resolved);
      layers.push(layer);
      sources.push(source);
    }
  }

  const stack = new DictionaryStack(layers);
  for (const word of config.spell.ignoreWords) stack.add(word);

  return { stack, sources };
}

/**
 * Every dictionary file path that a watcher should monitor for a given
 * workspace layout, whether or not the file currently exists.
 *
 * Non-existent paths are included deliberately: creating a dictionary file
 * should take effect without a window reload, and a watcher registered only for
 * existing files would miss the creation event.
 */
export function dictionaryWatchPaths(
  config: CodeTrioConfig,
  locations: DictionaryLocations = {},
): string[] {
  const paths = new Set<string>();
  const userPath = locations.userPath ?? config.spell.userDictionaryPath;
  if (userPath) paths.add(resolvePath(homedir(), userPath));
  if (locations.workspace) {
    paths.add(resolvePath(locations.workspace, config.spell.projectDictionaryPath));
  }
  if (locations.folder) {
    paths.add(
      resolvePath(
        locations.folder,
        config.spell.folderDictionaryPath || config.spell.projectDictionaryPath,
      ),
    );
  }
  return [...paths];
}

/** Directories containing dictionary files, for directory-level watchers. */
export function dictionaryWatchDirectories(
  config: CodeTrioConfig,
  locations: DictionaryLocations = {},
): string[] {
  return [...new Set(dictionaryWatchPaths(config, locations).map((p) => dirname(p)))];
}

/**
 * The file a word should be written to for a given scope, or null when the
 * scope has no file (session) or is not applicable to this layout.
 */
export function dictionaryPathForScope(
  scope: DictionaryScope,
  config: CodeTrioConfig,
  locations: DictionaryLocations = {},
): string | null {
  switch (scope) {
    case "user": {
      const p = locations.userPath ?? config.spell.userDictionaryPath;
      return p ? resolvePath(homedir(), p) : null;
    }
    case "workspace":
      return locations.workspace
        ? resolvePath(locations.workspace, config.spell.projectDictionaryPath)
        : null;
    case "folder":
      return locations.folder
        ? resolvePath(
            locations.folder,
            config.spell.folderDictionaryPath || config.spell.projectDictionaryPath,
          )
        : null;
    default:
      // session, technical and base have no writable file. The built-ins are
      // never edited at runtime, by design.
      return null;
  }
}
