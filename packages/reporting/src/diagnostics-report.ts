import type { Diagnostic, FormatResult, Severity } from "@ctr/core";
import pc from "picocolors";

const SEVERITY_LABEL: Record<Severity, string> = {
  error: "error",
  warning: "warning",
  information: "info",
  hint: "hint",
};

function colorSeverity(sev: Severity, color: boolean): string {
  const label = SEVERITY_LABEL[sev];
  if (!color) return label;
  switch (sev) {
    case "error":
      return pc.red(label);
    case "warning":
      return pc.yellow(label);
    default:
      return pc.blue(label);
  }
}

export interface DiagnosticsRenderOptions {
  readonly file?: string;
  readonly color?: boolean;
  readonly showSuggestions?: boolean;
}

/** Render diagnostics as `file:line:col severity message` lines. */
export function renderDiagnosticsTerminal(
  diagnostics: readonly Diagnostic[],
  options: DiagnosticsRenderOptions = {},
): string {
  const color = options.color ?? true;
  const file = options.file ?? "";
  if (diagnostics.length === 0) {
    return color ? pc.green("No spelling issues found.") : "No spelling issues found.";
  }
  const lines: string[] = [];
  for (const d of diagnostics) {
    const loc = `${file}:${d.range.start.line + 1}:${d.range.start.character + 1}`;
    const locText = color ? pc.dim(loc) : loc;
    lines.push(`${locText} ${colorSeverity(d.severity, color)} ${d.message}`);
    if ((options.showSuggestions ?? false) && d.quickFixes) {
      const replacements = d.quickFixes
        .filter((f) => f.kind === "replace")
        .map((f) => f.edits[0]?.newText)
        .filter((x): x is string => Boolean(x));
      if (replacements.length > 0) {
        const hint = `    suggestions: ${replacements.join(", ")}`;
        lines.push(color ? pc.dim(hint) : hint);
      }
    }
  }
  const summary = `${diagnostics.length} issue${diagnostics.length === 1 ? "" : "s"}`;
  lines.push(color ? pc.dim(summary) : summary);
  return lines.join("\n");
}

/** JSON-serializable diagnostics report. */
export function renderDiagnosticsJson(diagnostics: readonly Diagnostic[]): readonly Diagnostic[] {
  return diagnostics;
}

/** One-line human summary of a format result. */
export function summarizeFormat(result: FormatResult, color = true): string {
  if (result.unsupported) {
    const msg = `no formatter for "${result.languageId}"`;
    return color ? pc.yellow(msg) : msg;
  }
  if (result.error) {
    const msg = `formatter error: ${result.error}`;
    return color ? pc.red(msg) : msg;
  }
  if (!result.changed) {
    const msg = `already formatted (${result.formatter.name}@${result.formatter.version})`;
    return color ? pc.green(msg) : msg;
  }
  const stats = result.previewDiff ? ` ${result.previewDiff.stats.insertions}+/-${result.previewDiff.stats.deletions}` : "";
  const msg = `would reformat with ${result.formatter.name}@${result.formatter.version}${stats}`;
  return color ? pc.cyan(msg) : msg;
}
