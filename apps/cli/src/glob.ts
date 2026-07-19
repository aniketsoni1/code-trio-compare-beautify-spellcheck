import { type Dirent, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

const GLOB_CHARS = /[*?[\]{}]/;

const IGNORED_DIRS = new Set(["node_modules", ".git", "dist", "out", "coverage", ".vscode-test"]);

function toRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i] as string;
    if (c === "*") {
      if (glob[i + 1] === "*") {
        // ** possibly followed by /
        if (glob[i + 2] === "/") {
          re += "(?:.*/)?";
          i += 2;
        } else {
          re += ".*";
          i += 1;
        }
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else if (".+^${}()|[]\\".includes(c)) {
      re += `\\${c}`;
    } else {
      re += c;
    }
  }
  return new RegExp(`^${re}$`);
}

function walk(dir: string, acc: string[]): void {
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true }) as Dirent[];
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      walk(join(dir, entry.name), acc);
    } else if (entry.isFile()) {
      acc.push(join(dir, entry.name));
    }
  }
}

/**
 * Expand a list of file paths and glob patterns into concrete files (relative
 * to cwd). Dependency-free and cross-platform. `node_modules`, `.git`, and
 * build output are skipped during traversal.
 */
export function expandGlobs(patterns: readonly string[], cwd: string = process.cwd()): string[] {
  const results = new Set<string>();
  for (const pattern of patterns) {
    const normalized = pattern.split(sep).join("/");
    if (!GLOB_CHARS.test(normalized)) {
      const abs = resolve(cwd, pattern);
      try {
        if (statSync(abs).isFile()) results.add(relative(cwd, abs).split(sep).join("/"));
      } catch {
        /* skip missing */
      }
      continue;
    }
    const firstGlob = normalized.search(GLOB_CHARS);
    const slashBeforeGlob = normalized.lastIndexOf("/", firstGlob);
    const baseRel = slashBeforeGlob >= 0 ? normalized.slice(0, slashBeforeGlob) : "";
    const baseAbs = resolve(cwd, baseRel);
    const regex = toRegExp(normalized);
    const files: string[] = [];
    walk(baseAbs, files);
    for (const file of files) {
      const rel = relative(cwd, file).split(sep).join("/");
      if (regex.test(rel)) results.add(rel);
    }
  }
  return [...results].sort();
}
