import { execFileSync } from "node:child_process";
import { isAbsolute, relative, resolve } from "node:path";

/**
 * Read a file at a git ref via `git show <ref>:<repo-relative-path>`. Runs the
 * local git binary only; never reaches the network. Returns null when git is
 * unavailable or the ref/path does not exist, so callers degrade gracefully.
 */
export function gitShow(ref: string, filePath: string, cwd = process.cwd()): string | null {
  try {
    const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const abs = isAbsolute(filePath) ? filePath : resolve(cwd, filePath);
    const rel = relative(root, abs).split("\\").join("/");
    return execFileSync("git", ["show", `${ref}:${rel}`], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch {
    return null;
  }
}

/** True when the current directory is inside a git work tree. */
export function gitAvailable(cwd = process.cwd()): boolean {
  try {
    const out = execFileSync("git", ["rev-parse", "--is-inside-work-tree"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return out === "true";
  } catch {
    return false;
  }
}
