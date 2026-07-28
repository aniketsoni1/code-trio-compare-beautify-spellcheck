import { type Dirent, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { globToRegExp, matchesAnyGlob, toPosixPath } from "@ctr/core";

const GLOB_CHARS = /[*?[\]{}]/;

/**
 * Directories never descended into. This is a traversal optimisation, not the
 * exclusion policy: callers pass their configured exclude globs to
 * `expandGlobs` and those are applied to every candidate path.
 */
const IGNORED_DIRS = new Set(["node_modules", ".git", "dist", "out", "coverage", ".vscode-test"]);

/**
 * Hard ceiling on how many files a single expansion may return. A glob such as
 * `**` at the root of a large monorepo would otherwise build an unbounded array
 * before any per-file work starts. Callers are told when the cap was hit so
 * they can disclose truncation instead of silently under-reporting.
 */
export const DEFAULT_MAX_FILES = 20_000;

export interface ExpandOptions {
  /** Globs whose matches are dropped from the result. */
  readonly exclude?: readonly string[];
  /** Maximum number of files to return. Defaults to DEFAULT_MAX_FILES. */
  readonly maxFiles?: number;
}

export interface ExpandResult {
  readonly files: string[];
  /** True when `maxFiles` was reached and the list is incomplete. */
  readonly truncated: boolean;
}

function walk(dir: string, acc: string[], limit: number): void {
  if (acc.length >= limit) return;
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true }) as Dirent[];
  } catch {
    // Unreadable directory (permissions, a dangling mount): skip rather than
    // abort the whole expansion.
    return;
  }
  for (const entry of entries) {
    if (acc.length >= limit) return;
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      walk(join(dir, entry.name), acc, limit);
    } else if (entry.isFile()) {
      acc.push(join(dir, entry.name));
    }
    // Symlinks are deliberately neither followed nor collected: following them
    // can escape the workspace root or loop forever.
  }
}

/**
 * Expand file paths and glob patterns into concrete files relative to `cwd`.
 *
 * Pattern syntax comes from `@ctr/core`, which is the same matcher the VS Code
 * extension uses for `codeTrio.spell.ignoreGlobs`, so a glob written in
 * `codetrio.json` behaves identically in both apps. Before this, the CLI
 * carried its own translator whose `**` handling differed subtly from the
 * extension's.
 */
export function expandGlobsDetailed(
  patterns: readonly string[],
  cwd: string = process.cwd(),
  options: ExpandOptions = {},
): ExpandResult {
  const limit = options.maxFiles ?? DEFAULT_MAX_FILES;
  const exclude = options.exclude ?? [];
  const results = new Set<string>();
  let truncated = false;

  const accept = (rel: string): void => {
    if (results.size >= limit) {
      truncated = true;
      return;
    }
    if (exclude.length > 0 && matchesAnyGlob(rel, exclude)) return;
    results.add(rel);
  };

  for (const pattern of patterns) {
    const normalized = toPosixPath(pattern.split(sep).join("/"));

    // A literal path: stat it directly rather than walking a tree.
    if (!GLOB_CHARS.test(normalized)) {
      const abs = resolve(cwd, pattern);
      try {
        if (statSync(abs).isFile()) accept(toPosixPath(relative(cwd, abs)));
      } catch {
        /* skip missing */
      }
      continue;
    }

    // Walk only from the deepest directory prefix that contains no glob
    // characters, so `src/**/*.ts` does not walk the whole repository.
    const firstGlob = normalized.search(GLOB_CHARS);
    const slashBeforeGlob = normalized.lastIndexOf("/", firstGlob);
    const baseRel = slashBeforeGlob >= 0 ? normalized.slice(0, slashBeforeGlob) : "";
    const baseAbs = resolve(cwd, baseRel);
    const regex = globToRegExp(normalized);
    const files: string[] = [];
    walk(baseAbs, files, limit * 2);
    for (const file of files) {
      const rel = toPosixPath(relative(cwd, file));
      if (regex.test(rel)) accept(rel);
    }
  }

  return { files: [...results].sort(), truncated };
}

/**
 * Backwards-compatible wrapper returning just the file list. Existing callers
 * and tests use this shape; `expandGlobsDetailed` exposes the truncation flag.
 */
export function expandGlobs(
  patterns: readonly string[],
  cwd: string = process.cwd(),
  options: ExpandOptions = {},
): string[] {
  return expandGlobsDetailed(patterns, cwd, options).files;
}
