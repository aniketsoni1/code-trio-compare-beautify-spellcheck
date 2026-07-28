import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

/**
 * Local git access.
 *
 * Every invocation uses `execFileSync` with an argument array, never a shell
 * string, so a path or ref containing shell metacharacters cannot inject a
 * command. That was already true; what this module adds is validation of the
 * *ref* itself, because `execFile` prevents shell injection but does not
 * prevent git's own argument parsing from being abused.
 */

/** Maximum bytes read from `git show`. Above this, the read is refused. */
const MAX_BLOB_BYTES = 32 * 1024 * 1024;

/** Wall-clock ceiling for any single git invocation. */
const GIT_TIMEOUT_MS = 15_000;

/**
 * Ref validation is an allowlist, not a denylist.
 *
 * A denylist of "dangerous characters" is the wrong shape for this problem: it
 * fails open on anything not yet thought of. The allowlist below admits exactly
 * the syntax users legitimately type and nothing else.
 *
 * Admitted: branch and tag names, full and abbreviated SHAs, and git's revision
 * suffixes — `HEAD~3`, `HEAD^`, `HEAD^2`, `main@{upstream}`, `v1.2.3^{commit}`.
 *
 * The security-relevant exclusions:
 *
 *   - The first character must be alphanumeric or `_`. This is what rules out a
 *     leading `-`, which git parses as an option rather than a ref. A "ref" of
 *     `--upload-pack=...` handed to a fetch-capable command is a remote code
 *     execution primitive, and the shape is refused here once rather than
 *     depending on every call site to pass `--` correctly.
 *   - No whitespace, quotes, `$`, backticks, `;`, `|`, `&`, `<`, `>`, `(`, `)`,
 *     `*`, `?`, `[`, `\`, or control characters. `execFile` already means these
 *     cannot reach a shell, but keeping them out means a ref can also be safely
 *     interpolated into a message, a filename, or a report.
 *   - `..` is rejected separately: it is valid range syntax for `git diff`, but
 *     accepting it in a single-revision position lets a caller turn a "show one
 *     file at one revision" request into something else.
 *
 * Refs are length-capped because a multi-megabyte "ref" is never legitimate and
 * would be passed straight into a subprocess argv.
 */
const REF_ALLOWED = /^[A-Za-z0-9_][A-Za-z0-9_./\-^~@{}]*$/;
const MAX_REF_LENGTH = 256;

/** Shapes that are individually valid characters but invalid in combination. */
const REF_FORBIDDEN_SEQUENCES = /\.\.|\/\/|\/$|\.$|\.lock$/;

/** True when `ref` is a syntactically valid, safe git ref or revision. */
export function isSafeGitRef(ref: string): boolean {
  if (ref.length === 0 || ref.length > MAX_REF_LENGTH) return false;
  if (!REF_ALLOWED.test(ref)) return false;
  if (REF_FORBIDDEN_SEQUENCES.test(ref)) return false;
  return true;
}

/** Thrown when a caller supplies a ref that fails validation. */
export class UnsafeGitRefError extends Error {
  override readonly name = "UnsafeGitRefError";
  constructor(readonly ref: string) {
    super(
      `Refusing to use "${ref}" as a git ref: it contains characters git treats as ` +
        `special, or looks like a command-line option.`,
    );
  }
}

function git(args: readonly string[], cwd: string, maxBuffer = 1024 * 1024): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: GIT_TIMEOUT_MS,
    maxBuffer,
    // An explicit, minimal environment. Inheriting the full environment lets a
    // hostile workspace influence git through GIT_* variables such as
    // GIT_EXTERNAL_DIFF or GIT_SSH_COMMAND, both of which execute programs.
    env: {
      PATH: process.env.PATH ?? "",
      HOME: process.env.HOME ?? "",
      GIT_TERMINAL_PROMPT: "0",
      GIT_OPTIONAL_LOCKS: "0",
      GIT_CONFIG_NOSYSTEM: "1",
    },
  });
}

/**
 * Canonicalise a path: resolve symlinks, and on Windows expand 8.3 short names
 * to their long form.
 *
 * This is required for correctness, not tidiness. `git rev-parse
 * --show-toplevel` always reports a *resolved* path, while a path handed to us
 * by an editor or a shell may contain symlinks. Comparing the two without
 * canonicalising makes a legitimate file inside the work tree look like an
 * escape attempt. The case that bites in practice is macOS, where
 * `os.tmpdir()` is `/var/folders/...` — a symlink to `/private/var/folders/...`
 * — so every git operation on a path under the temp directory failed. Windows
 * runners hit the same class of problem through `RUNNER~1` short names.
 *
 * A file that does not exist cannot be realpath'd, and that is an ordinary
 * case here: `git show <ref>:<path>` is often asked about a file that was
 * deleted, or that only exists at an older revision. So the deepest existing
 * ancestor is canonicalised and the remaining segments are re-joined.
 */
function canonicalise(path: string): string {
  const absolute = resolve(path);
  try {
    return realpathSync.native(absolute);
  } catch {
    const parent = dirname(absolute);
    // Reached the filesystem root without finding anything that exists.
    if (parent === absolute) return absolute;
    return join(canonicalise(parent), basename(absolute));
  }
}

/**
 * Resolve a file path against a work-tree root, returning the repo-relative
 * POSIX path, or null when the file lies outside the work tree.
 *
 * Both sides are canonicalised first, so the containment check compares like
 * with like.
 */
function repoRelative(root: string, filePath: string, cwd: string): string | null {
  const absolute = isAbsolute(filePath) ? filePath : resolve(cwd, filePath);
  const rel = relative(canonicalise(root), canonicalise(absolute)).split("\\").join("/");
  if (rel === "" || rel === ".." || rel.startsWith("../")) return null;
  return rel;
}

/** Absolute path of the work-tree root containing `cwd`, or null. */
export function gitRoot(cwd = process.cwd()): string | null {
  try {
    return git(["rev-parse", "--show-toplevel"], cwd).trim();
  } catch {
    return null;
  }
}

/**
 * Read a file at a git ref via `git show <ref>:<repo-relative-path>`. Runs the
 * local git binary only; never reaches the network. Returns null when git is
 * unavailable or the ref/path does not exist, so callers degrade gracefully.
 *
 * Throws `UnsafeGitRefError` for a malformed ref rather than returning null,
 * because a rejected ref is a caller mistake worth surfacing, while a missing
 * ref is an ordinary outcome.
 */
export function gitShow(ref: string, filePath: string, cwd = process.cwd()): string | null {
  if (!isSafeGitRef(ref)) throw new UnsafeGitRefError(ref);
  try {
    const root = gitRoot(cwd);
    if (root === null) return null;
    // A path that climbs out of the work tree is not something we will read.
    const rel = repoRelative(root, filePath, cwd);
    if (rel === null) return null;
    // No `--` separator here: `git show` treats everything after `--` as a
    // pathspec, so `git show -- HEAD:file` silently returns nothing instead of
    // the blob. Option injection is prevented upstream instead, by isSafeGitRef
    // rejecting a leading `-` -- and since the argument is `<ref>:<path>`, its
    // first character is always the ref's first character.
    return git(["show", `${ref}:${rel}`], root, MAX_BLOB_BYTES);
  } catch (err) {
    if (err instanceof UnsafeGitRefError) throw err;
    return null;
  }
}

/** True when the current directory is inside a git work tree. */
export function gitAvailable(cwd = process.cwd()): boolean {
  try {
    return git(["rev-parse", "--is-inside-work-tree"], cwd).trim() === "true";
  } catch {
    return false;
  }
}

/**
 * Resolve a ref to its full commit SHA, or null when it does not exist.
 * Used to record exactly which revision a comparison ran against, so a report
 * that says "vs HEAD" can also say which commit that was.
 */
export function resolveRef(ref: string, cwd = process.cwd()): string | null {
  if (!isSafeGitRef(ref)) throw new UnsafeGitRefError(ref);
  try {
    const sha = git(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], cwd).trim();
    return sha.length > 0 ? sha : null;
  } catch {
    return null;
  }
}

/**
 * Paths changed relative to a ref, as work-tree-relative POSIX paths.
 * Returns null when git is unavailable, so callers can distinguish "nothing
 * changed" from "could not ask".
 */
export function changedFiles(ref = "HEAD", cwd = process.cwd()): string[] | null {
  if (!isSafeGitRef(ref)) throw new UnsafeGitRefError(ref);
  try {
    const out = git(["diff", "--name-only", "--no-renames", ref, "--"], cwd, MAX_BLOB_BYTES);
    return out
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  } catch {
    return null;
  }
}

/**
 * The three inputs of a merge for a conflicted file, read from git's index
 * stages: 1 = base, 2 = ours, 3 = theirs.
 *
 * Returns null when the file is not conflicted or git is unavailable. This is
 * what lets `code-trio merge` operate on a real conflicted working tree instead
 * of requiring the user to extract the three versions by hand.
 */
export function conflictStages(
  filePath: string,
  cwd = process.cwd(),
): { base: string; ours: string; theirs: string } | null {
  const root = gitRoot(cwd);
  if (root === null) return null;
  const rel = repoRelative(root, filePath, cwd);
  if (rel === null) return null;

  const stage = (n: 1 | 2 | 3): string | null => {
    try {
      // Stage syntax `:<n>:<path>` always begins with a colon, so it can
      // never be parsed as an option.
      return git(["show", `:${n}:${rel}`], root, MAX_BLOB_BYTES);
    } catch {
      return null;
    }
  };
  const base = stage(1);
  const ours = stage(2);
  const theirs = stage(3);
  if (ours === null || theirs === null) return null;
  // A base of null means an add/add conflict: both sides created the file, so
  // the common ancestor is empty rather than missing.
  return { base: base ?? "", ours, theirs };
}
