/**
 * A tiny, dependency-free glob matcher shared by the CLI (file discovery) and
 * the extension (`codeTrio.spell.ignoreGlobs`). Kept in `@ctr/core` so both
 * apps agree on exactly which paths are excluded — previously the CLI used one
 * implementation and the extension used a hardcoded regex that ignored the
 * user's configured globs entirely.
 *
 * Supported syntax (a deliberate subset of POSIX/`minimatch`):
 *
 * - `*`  — any run of characters except `/`
 * - `**` — any run of characters including `/`
 * - a `**` immediately followed by a slash — zero or more whole path segments
 * - `?`  — exactly one character except `/`
 * - `[abc]` / `[!abc]` / `[a-z]` — character classes
 * - `{a,b}` — alternation
 *
 * Everything else is matched literally. Paths are compared with `/` separators;
 * callers on Windows must normalise before calling.
 */

/** Cache compiled patterns — the same globs are re-tested on every document. */
const cache = new Map<string, RegExp>();
const CACHE_LIMIT = 512;

function escapeLiteral(ch: string): string {
  return /[.+^${}()|\\]/.test(ch) ? `\\${ch}` : ch;
}

/**
 * Compile a glob to an anchored regular expression.
 *
 * Throws nothing: an unterminated `[` or `{` is treated as a literal character
 * so that a malformed user setting degrades to "matches less" instead of
 * crashing a document scan.
 */
export function globToRegExp(glob: string): RegExp {
  const cached = cache.get(glob);
  if (cached) return cached;

  let re = "";
  let i = 0;
  const n = glob.length;
  let braceDepth = 0;

  while (i < n) {
    const c = glob[i] as string;

    if (c === "*") {
      const isDouble = glob[i + 1] === "*";
      if (isDouble) {
        if (glob[i + 2] === "/") {
          // A `**` followed by a slash means zero or more leading segments.
          re += "(?:[^/]*/)*";
          i += 3;
          continue;
        }
        re += ".*";
        i += 2;
        continue;
      }
      re += "[^/]*";
      i += 1;
      continue;
    }

    if (c === "?") {
      re += "[^/]";
      i += 1;
      continue;
    }

    if (c === "[") {
      const close = glob.indexOf("]", i + 1);
      if (close < 0) {
        re += "\\[";
        i += 1;
        continue;
      }
      let body = glob.slice(i + 1, close);
      let negate = false;
      if (body.startsWith("!") || body.startsWith("^")) {
        negate = true;
        body = body.slice(1);
      }
      // Escape the two characters that change meaning inside a JS class.
      const safe = body.replace(/\\/g, "\\\\").replace(/\]/g, "\\]");
      re += `[${negate ? "^" : ""}${safe}]`;
      i = close + 1;
      continue;
    }

    if (c === "{") {
      braceDepth++;
      re += "(?:";
      i += 1;
      continue;
    }

    if (c === "}" && braceDepth > 0) {
      braceDepth--;
      re += ")";
      i += 1;
      continue;
    }

    if (c === "," && braceDepth > 0) {
      re += "|";
      i += 1;
      continue;
    }

    re += escapeLiteral(c);
    i += 1;
  }

  // An unterminated `{` would produce an invalid regex; close it defensively.
  while (braceDepth > 0) {
    re += ")";
    braceDepth--;
  }

  let compiled: RegExp;
  try {
    compiled = new RegExp(`^${re}$`);
  } catch {
    // Should be unreachable, but a malformed setting must never throw into a
    // document scan. `(?!)` never matches.
    compiled = /(?!)/;
  }

  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(glob, compiled);
  return compiled;
}

/** True when `path` matches `glob`. `path` must use `/` separators. */
export function matchesGlob(path: string, glob: string): boolean {
  return globToRegExp(glob).test(path);
}

/**
 * True when `path` matches any of `globs`. An empty list matches nothing, so
 * clearing `ignoreGlobs` means "exclude nothing" rather than "exclude
 * everything".
 */
export function matchesAnyGlob(path: string, globs: readonly string[]): boolean {
  for (const glob of globs) {
    if (matchesGlob(path, glob)) return true;
  }
  return false;
}

/** Normalise a filesystem path to the `/`-separated form the matcher expects. */
export function toPosixPath(path: string): string {
  return path.split("\\").join("/");
}
