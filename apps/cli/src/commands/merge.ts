import { existsSync, readFileSync } from "node:fs";
import type { CodeTrioConfig } from "@ctr/configuration";
import type { MergeChoice, MergeResolution } from "@ctr/core";
import { conflictStages, runMergeAndResolve, writeMergedFile } from "@ctr/agent";
import { renderMergeMarkdown, renderMergeTerminal, summarizeMerge } from "@ctr/reporting";
import { ExitCode, type ExitCodeValue } from "../exit-codes";

export interface MergeCommandOptions {
  base?: string;
  ours?: string;
  theirs?: string;
  /** Read the three sides from git's conflict stages for a working-tree file. */
  git?: boolean;
  output?: string;
  overwrite?: boolean;
  accept?: string;
  format?: string;
  color?: boolean;
  showClean?: boolean;
  diff3?: boolean;
  exitCode?: boolean;
}

const VALID_ACCEPT: readonly MergeChoice[] = [
  "ours",
  "theirs",
  "both-ours-first",
  "both-theirs-first",
  "base",
];

function readOrNull(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

/**
 * Three-way merge.
 *
 * The engine has supported diff3 since v0.1.0 but nothing reached it — there
 * was no CLI command and no VS Code command, so the README's "three-way diff"
 * claim was true of the engine and false of the product. This is the CLI half
 * of closing that gap.
 *
 * Two input modes:
 *
 *   code-trio merge --base b.txt --ours o.txt --theirs t.txt
 *   code-trio merge conflicted.txt --git
 *
 * The second reads git's index stages (1/2/3), so it works directly on a
 * conflicted working tree without the user extracting three files by hand.
 */
export function runMergeCommand(
  file: string | undefined,
  opts: MergeCommandOptions,
  cfg: CodeTrioConfig,
  cwd: string = process.cwd(),
): ExitCodeValue {
  let base: string;
  let ours: string;
  let theirs: string;
  let baseName: string;
  let oursName: string;
  let theirsName: string;

  if (opts.git) {
    if (!file) {
      process.stderr.write("error: --git needs the path of a conflicted file\n");
      return ExitCode.InvalidArguments;
    }
    const stages = conflictStages(file, cwd);
    if (!stages) {
      process.stderr.write(
        `error: "${file}" is not a conflicted file in this repository, or git is unavailable.\n` +
          `       Conflicted files appear under "Unmerged paths" in git status.\n`,
      );
      return ExitCode.ToolFailure;
    }
    ({ base, ours, theirs } = stages);
    baseName = `${file} (stage 1, common ancestor)`;
    oursName = `${file} (stage 2, ours)`;
    theirsName = `${file} (stage 3, theirs)`;
  } else {
    if (!opts.base || !opts.ours || !opts.theirs) {
      process.stderr.write(
        "error: merge needs --base, --ours and --theirs, or a file path with --git\n",
      );
      return ExitCode.InvalidArguments;
    }
    const b = readOrNull(opts.base);
    const o = readOrNull(opts.ours);
    const t = readOrNull(opts.theirs);
    for (const [label, value, path] of [
      ["base", b, opts.base],
      ["ours", o, opts.ours],
      ["theirs", t, opts.theirs],
    ] as const) {
      if (value === null) {
        process.stderr.write(`error: could not read ${label} file "${path}"\n`);
        return ExitCode.FileError;
      }
    }
    base = b as string;
    ours = o as string;
    theirs = t as string;
    baseName = opts.base;
    oursName = opts.ours;
    theirsName = opts.theirs;
  }

  // --accept applies one choice to every conflict. Resolutions are keyed by
  // region id, so this is a convenience over the general mechanism rather than
  // a separate code path.
  let resolutions: MergeResolution[] = [];
  if (opts.accept) {
    if (!VALID_ACCEPT.includes(opts.accept as MergeChoice)) {
      process.stderr.write(
        `error: --accept must be one of ${VALID_ACCEPT.join(", ")}; got "${opts.accept}"\n`,
      );
      return ExitCode.InvalidArguments;
    }
  }

  const preview = runMergeAndResolve(base, ours, theirs, [], cfg, {
    labels: { base: baseName, ours: oursName, theirs: theirsName },
    diff3: opts.diff3 ?? true,
  });

  if (opts.accept) {
    resolutions = preview.merge.conflictIds.map((regionId) => ({
      regionId,
      choice: opts.accept as MergeChoice,
    }));
  }

  const { merge, resolved } = runMergeAndResolve(base, ours, theirs, resolutions, cfg, {
    labels: { base: baseName, ours: oursName, theirs: theirsName },
    diff3: opts.diff3 ?? true,
    // Never throw here: the command reports unresolved conflicts and only
    // refuses at the point of writing.
    unresolved: "markers",
  });

  const format = opts.format ?? "terminal";
  if (format === "json") {
    process.stdout.write(
      `${JSON.stringify({ merge, unresolved: resolved.unresolvedIds, fullyResolved: resolved.fullyResolved }, null, 2)}\n`,
    );
  } else if (format === "markdown") {
    process.stdout.write(
      renderMergeMarkdown(merge, { baseName, oursName, theirsName }),
    );
  } else if (format === "merged") {
    // Just the merged text, for piping.
    process.stdout.write(resolved.text.endsWith("\n") ? resolved.text : `${resolved.text}\n`);
  } else {
    process.stdout.write(
      `${renderMergeTerminal(merge, {
        baseName,
        oursName,
        theirsName,
        color: opts.color ?? true,
        ...(opts.showClean === true ? { showClean: true } : {}),
      })}\n`,
    );
  }

  if (opts.output) {
    // Writing a file that still contains conflict markers would be a trap:
    // it looks merged and is not. Refuse unless every conflict was resolved.
    if (!resolved.fullyResolved) {
      process.stderr.write(
        `\nerror: refusing to write "${opts.output}": ${resolved.unresolvedIds.length} conflict(s) are unresolved.\n` +
          `       Use --accept ours|theirs|both-ours-first|both-theirs-first|base to resolve them,\n` +
          `       or --format merged to inspect the marked-up output first.\n`,
      );
      return ExitCode.PartialSuccess;
    }
    if (!opts.overwrite && existsSync(opts.output)) {
      process.stderr.write(
        `\nerror: "${opts.output}" already exists. Pass --overwrite to replace it.\n`,
      );
      return ExitCode.FileError;
    }
    const write = writeMergedFile(opts.output, resolved.text, { overwrite: true });
    if (!write.written) {
      process.stderr.write(`\nerror: ${write.reason ?? "write failed"}\n`);
      return ExitCode.FileError;
    }
    process.stdout.write(`\nWrote merged output to ${opts.output}\n`);
  }

  if (format === "terminal") {
    process.stdout.write(`\n${summarizeMerge(merge)}\n`);
    if (!merge.clean && !opts.accept) {
      process.stdout.write(
        "Resolve with --accept <ours|theirs|both-ours-first|both-theirs-first|base>, " +
          "then --output <file> to write.\n",
      );
    }
  }

  if (opts.exitCode && !merge.clean && !resolved.fullyResolved) return ExitCode.Findings;
  return ExitCode.Success;
}
