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

/** One-line summary: `+N -M (~K unchanged)`. */
export function summarizeDiff(result: DiffResult): string {
  if (result.identical) return "identical";
  const { insertions, deletions, unchanged } = result.stats;
  return `+${insertions} -${deletions} (${unchanged} unchanged)`;
}

/** Human-friendly, colorized diff for a terminal. */
export function renderDiffTerminal(result: DiffResult, options: DiffRenderOptions = {}): string {
  const c = paint(options.color ?? true);
  const aName = options.aName ?? "a";
  const bName = options.bName ?? "b";
  if (result.identical) return c.dim(`Files are identical (${aName} == ${bName})`);

  const out: string[] = [c.head(`--- ${aName}`), c.head(`+++ ${bName}`)];
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
