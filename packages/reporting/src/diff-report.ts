import type { DiffLine, DiffResult } from "@ctr/core";
import pc from "picocolors";

export interface DiffRenderOptions {
  readonly aName?: string;
  readonly bName?: string;
  readonly color?: boolean;
}

function paint(color: boolean): {
  add: (s: string) => string;
  del: (s: string) => string;
  dim: (s: string) => string;
  head: (s: string) => string;
} {
  if (!color) {
    const id = (s: string): string => s;
    return { add: id, del: id, dim: id, head: id };
  }
  return {
    add: (s) => pc.green(s),
    del: (s) => pc.red(s),
    dim: (s) => pc.dim(s),
    head: (s) => pc.cyan(pc.bold(s)),
  };
}

/**
 * One-line summary: `+N -M (~K unchanged)`.
 *
 * A truncated result never reports as identical or as a clean diff; the reason
 * is prefixed so the summary alone is honest about incompleteness.
 */
export function summarizeDiff(result: DiffResult): string {
  if (result.truncation && result.hunks.length === 0) {
    return `not compared (${result.truncation.reason})`;
  }
  if (result.identical) {
    return result.eolOnlyDifference ? "identical apart from line endings" : "identical";
  }
  const { insertions, deletions, unchanged } = result.stats;
  const base = `+${insertions} -${deletions} (${unchanged} unchanged)`;
  return result.truncation ? `${base} [${result.truncation.reason}]` : base;
}

/**
 * Lines that must precede any rendered diff so an incomplete or surprising
 * result is disclosed rather than presented as a plain comparison.
 */
function disclosures(result: DiffResult): string[] {
  const out: string[] = [];
  if (result.truncation) out.push(`! ${result.truncation.message}`);
  if (result.eolOnlyDifference) {
    out.push(
      `! Contents match but line endings differ (${result.eol?.a} vs ${result.eol?.b}).`,
    );
  } else if (result.eol?.mixed) {
    out.push("! One or both inputs mix line-ending conventions within the same file.");
  }
  return out;
}

/** Human-friendly, colorized diff for a terminal. */
export function renderDiffTerminal(result: DiffResult, options: DiffRenderOptions = {}): string {
  const c = paint(options.color ?? true);
  const aName = options.aName ?? "a";
  const bName = options.bName ?? "b";

  const notes = disclosures(result).map((n) => c.dim(n));
  if (result.truncation && result.hunks.length === 0) {
    return notes.join("\n");
  }
  if (result.identical) {
    return [...notes, c.dim(`Files are identical (${aName} == ${bName})`)].join("\n");
  }

  const out: string[] = [...notes, c.head(`--- ${aName}`), c.head(`+++ ${bName}`)];
  for (const hunk of result.hunks) {
    out.push(
      c.head(`@@ -${hunk.aStart + 1},${hunk.aLines} +${hunk.bStart + 1},${hunk.bLines} @@`),
    );
    for (const line of hunk.lines) out.push(...renderLine(line, c));
  }
  out.push(c.dim(summarizeDiff(result)));
  return out.join("\n");
}

function renderLine(line: DiffLine, c: ReturnType<typeof paint>): string[] {
  switch (line.op) {
    case "equal":
      return [c.dim(` ${line.aText ?? ""}`)];
    case "insert":
      return [c.add(`+${line.bText ?? ""}`)];
    case "delete":
      return [c.del(`-${line.aText ?? ""}`)];
    case "replace":
      return [c.del(`-${line.aText ?? ""}`), c.add(`+${line.bText ?? ""}`)];
    default:
      return [];
  }
}

/** Standard unified-diff text (no color), suitable for piping to `patch`. */
export function renderUnifiedDiff(result: DiffResult, options: DiffRenderOptions = {}): string {
  const aName = options.aName ?? "a";
  const bName = options.bName ?? "b";
  if (result.identical) return "";
  const out: string[] = [`--- ${aName}`, `+++ ${bName}`];
  for (const hunk of result.hunks) {
    out.push(`@@ -${hunk.aStart + 1},${hunk.aLines} +${hunk.bStart + 1},${hunk.bLines} @@`);
    for (const line of hunk.lines) {
      if (line.op === "equal") out.push(` ${line.aText ?? ""}`);
      else if (line.op === "insert") out.push(`+${line.bText ?? ""}`);
      else if (line.op === "delete") out.push(`-${line.aText ?? ""}`);
      else {
        out.push(`-${line.aText ?? ""}`);
        out.push(`+${line.bText ?? ""}`);
      }
    }
  }
  return out.join("\n") + "\n";
}

/** JSON-serializable diff report. */
export function renderDiffJson(result: DiffResult): DiffResult {
  return result;
}

export interface SideBySideRow {
  readonly op: DiffLine["op"];
  readonly aLine?: number;
  readonly bLine?: number;
  readonly aText: string;
  readonly bText: string;
  readonly segments?: DiffLine["segments"];
}

/**
 * A structured side-by-side view.
 *
 * Deliberately returns data rather than a formatted string: the terminal, the
 * webview, and a Markdown export each need different presentation of the same
 * alignment, and duplicating the alignment logic in three renderers is how the
 * three drift apart. Pure inserts and deletes get an empty cell on the missing
 * side so both columns stay row-aligned.
 */
export function toSideBySide(result: DiffResult): SideBySideRow[] {
  const rows: SideBySideRow[] = [];
  for (const hunk of result.hunks) {
    for (const line of hunk.lines) {
      rows.push({
        op: line.op,
        ...(line.aLine !== undefined ? { aLine: line.aLine } : {}),
        ...(line.bLine !== undefined ? { bLine: line.bLine } : {}),
        aText: line.op === "insert" ? "" : (line.aText ?? ""),
        bText:
          line.op === "delete" ? "" : (line.bText ?? (line.op === "equal" ? line.aText : "") ?? ""),
        ...(line.segments ? { segments: line.segments } : {}),
      });
    }
  }
  return rows;
}

const OP_MARK: Record<DiffLine["op"], string> = {
  equal: " ",
  insert: "+",
  delete: "-",
  replace: "~",
};

/** Escape the characters that would break out of a Markdown table cell. */
function mdCell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\r?\n/g, " ") || " ";
}

export interface MarkdownDiffOptions extends DiffRenderOptions {
  /** Render hunks as a side-by-side table instead of a unified code block. */
  readonly sideBySide?: boolean;
  /** Cap on rendered lines, so a huge diff does not produce an unusable file. */
  readonly maxLines?: number;
}

/**
 * Render a diff as Markdown suitable for a PR comment or an exported report.
 *
 * Unified mode emits a fenced `diff` block, which every Markdown renderer
 * syntax-highlights. Side-by-side mode emits a table, which is more readable
 * for wide changes but cannot be copied into `patch`.
 */
export function renderDiffMarkdown(
  result: DiffResult,
  options: MarkdownDiffOptions = {},
): string {
  const aName = options.aName ?? "a";
  const bName = options.bName ?? "b";
  const maxLines = options.maxLines ?? 2_000;

  const out: string[] = [`## Compare: \`${aName}\` → \`${bName}\``, ""];
  out.push(`**Summary:** ${summarizeDiff(result)}`, "");

  if (result.eol) {
    out.push(
      `**Line endings:** ${aName} = ${result.eol.a}, ${bName} = ${result.eol.b}` +
        (result.eol.mixed ? " (one or both files mix conventions)" : ""),
      "",
    );
  }
  for (const note of disclosures(result)) out.push(`> ${note.replace(/^!\s*/, "")}`, "");

  if (result.truncation && result.hunks.length === 0) return `${out.join("\n")}\n`;
  if (result.identical) {
    out.push("No differences.", "");
    return `${out.join("\n")}\n`;
  }

  let emitted = 0;
  if (options.sideBySide) {
    out.push(`| # | ${aName} | # | ${bName} |`, "| ---: | --- | ---: | --- |");
    for (const row of toSideBySide(result)) {
      if (emitted++ >= maxLines) break;
      const mark = OP_MARK[row.op];
      out.push(
        `| ${row.aLine !== undefined ? row.aLine + 1 : ""} | ${mark}${mdCell(row.aText)} ` +
          `| ${row.bLine !== undefined ? row.bLine + 1 : ""} | ${mark}${mdCell(row.bText)} |`,
      );
    }
  } else {
    out.push("```diff");
    for (const hunk of result.hunks) {
      if (emitted >= maxLines) break;
      out.push(`@@ -${hunk.aStart + 1},${hunk.aLines} +${hunk.bStart + 1},${hunk.bLines} @@`);
      for (const line of hunk.lines) {
        if (emitted++ >= maxLines) break;
        if (line.op === "equal") out.push(` ${line.aText ?? ""}`);
        else if (line.op === "insert") out.push(`+${line.bText ?? ""}`);
        else if (line.op === "delete") out.push(`-${line.aText ?? ""}`);
        else {
          out.push(`-${line.aText ?? ""}`);
          out.push(`+${line.bText ?? ""}`);
        }
      }
    }
    out.push("```");
  }

  if (emitted > maxLines) {
    out.push("", `_Output truncated at ${maxLines} lines._`);
  }
  return `${out.join("\n")}\n`;
}
