import type { CodeTrioConfig } from "@ctr/configuration";
import type { DiffGranularity, Document } from "@ctr/core";
import { languageFromPath } from "@ctr/core";
import {
  UnsafeGitRefError,
  gitShow,
  loadFileDocument,
  makeDocument,
  resolveRef,
  runCompare,
} from "@ctr/agent";
import { renderDiffMarkdown, renderDiffTerminal, renderUnifiedDiff } from "@ctr/reporting";
import { ExitCode, type ExitCodeValue } from "../exit-codes";

export interface DiffCommandOptions {
  words?: boolean;
  chars?: boolean;
  ignoreWhitespace?: boolean;
  ignoreCase?: boolean;
  ignoreEol?: boolean;
  format?: string;
  context?: string;
  color?: boolean;
  ref?: string;
  exitCode?: boolean;
}

export function runDiffCommand(
  a: string,
  b: string | undefined,
  opts: DiffCommandOptions,
  cfg: CodeTrioConfig,
  cwd: string = process.cwd(),
): ExitCodeValue {
  const granularity: DiffGranularity = opts.chars
    ? "char"
    : opts.words
      ? "word"
      : cfg.diff.granularity;

  let docA: Document;
  let docB: Document;
  let aName: string;
  let bName: string;

  if (opts.ref) {
    let content: string | null;
    try {
      content = gitShow(opts.ref, a, cwd);
    } catch (err) {
      // An unsafe ref is a caller mistake worth reporting precisely, not a
      // generic "could not read".
      if (err instanceof UnsafeGitRefError) {
        process.stderr.write(`error: ${err.message}\n`);
        return ExitCode.InvalidArguments;
      }
      throw err;
    }
    if (content === null) {
      process.stderr.write(
        `error: could not read "${a}" at git ref "${opts.ref}".\n` +
          `       Check that the ref exists and the file is tracked at that revision.\n`,
      );
      return ExitCode.FileError;
    }
    // Recording the resolved SHA makes a report reproducible: "vs HEAD" is
    // ambiguous a week later, "vs HEAD (a1b2c3d4)" is not.
    const sha = resolveRef(opts.ref, cwd);
    docA = makeDocument(`git:${opts.ref}:${a}`, languageFromPath(a).id, content);
    docB = loadFileDocument(a);
    aName = sha ? `${a}@${opts.ref} (${sha.slice(0, 8)})` : `${a}@${opts.ref}`;
    bName = a;
  } else {
    if (!b) {
      process.stderr.write("error: diff requires two files, or one file with --ref <ref>\n");
      return ExitCode.InvalidArguments;
    }
    try {
      docA = loadFileDocument(a);
    } catch {
      process.stderr.write(`error: could not read "${a}"\n`);
      return ExitCode.FileError;
    }
    try {
      docB = loadFileDocument(b);
    } catch {
      process.stderr.write(`error: could not read "${b}"\n`);
      return ExitCode.FileError;
    }
    aName = a;
    bName = b;
  }

  const result = runCompare(docA, docB, cfg, {
    granularity,
    ignoreWhitespace: opts.ignoreWhitespace ?? cfg.diff.ignoreWhitespace,
    ignoreCase: opts.ignoreCase ?? cfg.diff.ignoreCase,
    ignoreEol: opts.ignoreEol ?? cfg.diff.ignoreEol,
    contextLines: opts.context ? Number.parseInt(opts.context, 10) : cfg.diff.contextLines,
  });

  const format = opts.format ?? "terminal";
  if (format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else if (format === "unified") {
    const u = renderUnifiedDiff(result, { aName, bName });
    process.stdout.write(u === "" ? `# identical: ${aName} == ${bName}\n` : u);
  } else if (format === "markdown") {
    process.stdout.write(renderDiffMarkdown(result, { aName, bName }));
  } else if (format === "side-by-side") {
    process.stdout.write(renderDiffMarkdown(result, { aName, bName, sideBySide: true }));
  } else {
    process.stdout.write(
      `${renderDiffTerminal(result, { aName, bName, color: opts.color ?? true })}\n`,
    );
  }

  // A refused comparison is not "no differences". It exits as a file-level
  // problem so a script cannot read exit 0 as "these files match".
  if (result.truncation && result.hunks.length === 0) {
    return result.truncation.reason === "cancelled" ? ExitCode.Cancelled : ExitCode.FileError;
  }
  return opts.exitCode && !result.identical ? ExitCode.Findings : ExitCode.Success;
}
