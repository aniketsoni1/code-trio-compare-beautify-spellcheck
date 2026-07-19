import type { CodeTrioConfig } from "@ctr/configuration";
import type { DiffGranularity, Document } from "@ctr/core";
import { languageFromPath } from "@ctr/core";
import { gitShow, loadFileDocument, makeDocument, runCompare } from "@ctr/agent";
import { renderDiffTerminal, renderUnifiedDiff } from "@ctr/reporting";

export interface DiffCommandOptions {
  words?: boolean;
  chars?: boolean;
  ignoreWhitespace?: boolean;
  ignoreCase?: boolean;
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
): number {
  const granularity: DiffGranularity = opts.chars ? "char" : opts.words ? "word" : cfg.diff.granularity;

  let docA: Document;
  let docB: Document;
  let aName: string;
  let bName: string;

  if (opts.ref) {
    const content = gitShow(opts.ref, a, cwd);
    if (content === null) {
      process.stderr.write(`error: could not read "${a}" at git ref "${opts.ref}"\n`);
      return 2;
    }
    docA = makeDocument(`git:${opts.ref}:${a}`, languageFromPath(a).id, content);
    docB = loadFileDocument(a);
    aName = `${a}@${opts.ref}`;
    bName = a;
  } else {
    if (!b) {
      process.stderr.write("error: diff requires two files, or one file with --ref <ref>\n");
      return 2;
    }
    docA = loadFileDocument(a);
    docB = loadFileDocument(b);
    aName = a;
    bName = b;
  }

  const result = runCompare(docA, docB, cfg, {
    granularity,
    ignoreWhitespace: opts.ignoreWhitespace ?? cfg.diff.ignoreWhitespace,
    ignoreCase: opts.ignoreCase ?? cfg.diff.ignoreCase,
    contextLines: opts.context ? Number.parseInt(opts.context, 10) : cfg.diff.contextLines,
  });

  const format = opts.format ?? "terminal";
  if (format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else if (format === "unified") {
    const u = renderUnifiedDiff(result, { aName, bName });
    process.stdout.write(u === "" ? `# identical: ${aName} == ${bName}\n` : u);
  } else {
    process.stdout.write(`${renderDiffTerminal(result, { aName, bName, color: opts.color ?? true })}\n`);
  }
  return opts.exitCode && !result.identical ? 1 : 0;
}
