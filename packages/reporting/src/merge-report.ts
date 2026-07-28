import type { CleanOrigin, MergeRegion, MergeResult } from "@ctr/core";
import pc from "picocolors";

export interface MergeRenderOptions {
  readonly baseName?: string;
  readonly oursName?: string;
  readonly theirsName?: string;
  readonly color?: boolean;
  /** Show clean regions as well as conflicts. Off by default. */
  readonly showClean?: boolean;
  /** Maximum lines shown per side of a conflict before eliding. */
  readonly maxLinesPerSide?: number;
}

const ORIGIN_LABEL: Record<CleanOrigin, string> = {
  unchanged: "unchanged",
  ours: "taken from ours",
  theirs: "taken from theirs",
  "both-identical": "both sides made the same change",
};

/** One-line summary: `3 conflicts` / `clean merge`. */
export function summarizeMerge(result: MergeResult): string {
  if (result.clean) return "clean merge (no conflicts)";
  const n = result.conflictCount;
  return `${n} conflict${n === 1 ? "" : "s"} across ${result.regions.length} region${result.regions.length === 1 ? "" : "s"}`;
}

function elide(lines: readonly string[], max: number): string[] {
  if (lines.length <= max) return [...lines];
  const shown = lines.slice(0, max);
  shown.push(`… ${lines.length - max} more line(s)`);
  return shown;
}

/**
 * Render a merge for a terminal: one block per conflict with all three sides
 * labelled, plus the region id so a follow-up `--accept` flag can name it.
 */
export function renderMergeTerminal(
  result: MergeResult,
  options: MergeRenderOptions = {},
): string {
  const color = options.color ?? true;
  const max = options.maxLinesPerSide ?? 40;
  const base = options.baseName ?? "base";
  const ours = options.oursName ?? "ours";
  const theirs = options.theirsName ?? "theirs";

  const dim = (s: string): string => (color ? pc.dim(s) : s);
  const head = (s: string): string => (color ? pc.bold(pc.cyan(s)) : s);
  const del = (s: string): string => (color ? pc.red(s) : s);
  const add = (s: string): string => (color ? pc.green(s) : s);

  const out: string[] = [];
  if (result.clean) {
    out.push(color ? pc.green(summarizeMerge(result)) : summarizeMerge(result));
  } else {
    out.push(color ? pc.yellow(summarizeMerge(result)) : summarizeMerge(result));
  }
  if (result.eol?.differs) {
    out.push(
      dim(
        `note: line endings differ (base=${result.eol.base}, ours=${result.eol.ours}, theirs=${result.eol.theirs}). Use --ignore-eol to align them.`,
      ),
    );
  }

  let conflictIndex = 0;
  for (const region of result.regions) {
    if (!region.conflict) {
      if (options.showClean) {
        const origin = region.origin ? ORIGIN_LABEL[region.origin] : "clean";
        out.push(dim(`  ${region.id}: ${origin} (${region.resolved?.length ?? 0} line(s))`));
      }
      continue;
    }
    conflictIndex++;
    out.push("");
    out.push(
      head(
        `conflict ${conflictIndex}/${result.conflictCount}  [${region.id}]` +
          (region.spans ? `  base lines ${region.spans.base.start + 1}-${region.spans.base.end}` : ""),
      ),
    );
    out.push(dim(`--- ${ours}`));
    for (const line of elide(region.ourLines, max)) out.push(del(`  ${line}`));
    out.push(dim(`--- ${base}`));
    for (const line of elide(region.baseLines, max)) out.push(dim(`  ${line}`));
    out.push(dim(`--- ${theirs}`));
    for (const line of elide(region.theirLines, max)) out.push(add(`  ${line}`));
  }

  return out.join("\n");
}

/** Render a merge as a Markdown report suitable for pasting into a PR. */
export function renderMergeMarkdown(
  result: MergeResult,
  options: MergeRenderOptions = {},
): string {
  const base = options.baseName ?? "base";
  const ours = options.oursName ?? "ours";
  const theirs = options.theirsName ?? "theirs";
  const max = options.maxLinesPerSide ?? 40;

  const out: string[] = ["# Merge report", "", `**Result:** ${summarizeMerge(result)}`, ""];
  out.push("| Input | Role | Line endings |");
  out.push("| --- | --- | --- |");
  out.push(`| \`${base}\` | base (common ancestor) | ${result.eol?.base ?? "unknown"} |`);
  out.push(`| \`${ours}\` | ours | ${result.eol?.ours ?? "unknown"} |`);
  out.push(`| \`${theirs}\` | theirs | ${result.eol?.theirs ?? "unknown"} |`);
  out.push("");

  if (result.clean) {
    out.push("No conflicts. Every region resolved automatically:");
    out.push("");
    for (const region of result.regions) {
      const origin = region.origin ? ORIGIN_LABEL[region.origin] : "clean";
      out.push(`- \`${region.id}\` — ${origin} (${region.resolved?.length ?? 0} line(s))`);
    }
    return `${out.join("\n")}\n`;
  }

  out.push(`## Conflicts (${result.conflictCount})`, "");
  let index = 0;
  for (const region of result.regions) {
    if (!region.conflict) continue;
    index++;
    out.push(`### Conflict ${index} — \`${region.id}\``, "");
    if (region.spans) {
      out.push(
        `Base lines ${region.spans.base.start + 1}–${region.spans.base.end}, ` +
          `ours ${region.spans.ours.start + 1}–${region.spans.ours.end}, ` +
          `theirs ${region.spans.theirs.start + 1}–${region.spans.theirs.end}.`,
        "",
      );
    }
    out.push(`**${ours}**`, "", "```", ...elide(region.ourLines, max), "```", "");
    out.push(`**${base}**`, "", "```", ...elide(region.baseLines, max), "```", "");
    out.push(`**${theirs}**`, "", "```", ...elide(region.theirLines, max), "```", "");
  }
  return `${out.join("\n")}\n`;
}

/** JSON-serialisable merge report. Regions are already plain data. */
export function renderMergeJson(result: MergeResult): MergeResult {
  return result;
}

/** Region ids in navigation order, for next/previous conflict commands. */
export function conflictNavigationOrder(result: MergeResult): readonly MergeRegion[] {
  return result.regions.filter((r) => r.conflict);
}
