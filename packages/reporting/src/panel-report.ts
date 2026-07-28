import type { PanelResult, PanelState, ResultKind, ResultSeverity } from "@ctr/core";

/**
 * Export renderers for the unified results panel.
 *
 * These live in `@ctr/reporting` rather than in the webview because building a
 * report is business logic, and the brief is explicit that business logic stays
 * out of the webview. It also means the CLI's `report` command and the panel's
 * "Export as Markdown" produce byte-identical output from the same code.
 */

const SEVERITY_LABEL: Record<ResultSeverity, string> = {
  error: "Error",
  warning: "Warning",
  information: "Info",
  hint: "Hint",
};

const KIND_LABEL: Record<ResultKind, string> = {
  compare: "Compare",
  spell: "Spell check",
  beautify: "Beautify",
  merge: "Merge",
};

/** Escape the characters that would break out of a Markdown table cell. */
function cell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim() || " ";
}

/** `file:line:col`, or just the file when there is no position. */
export function formatLocation(result: PanelResult): string {
  if (!result.file) return "";
  if (result.line === undefined) return result.file;
  return `${result.file}:${result.line + 1}${
    result.character === undefined ? "" : `:${result.character + 1}`
  }`;
}

/** A single result as one line, for "copy result". */
export function formatResultLine(result: PanelResult): string {
  const location = formatLocation(result);
  const parts = [location, SEVERITY_LABEL[result.severity].toLowerCase(), result.message];
  return parts.filter(Boolean).join(" ");
}

export interface PanelReportOptions {
  /** Title line. Defaults to "Code Trio report". */
  readonly title?: string;
  /** Include an ISO timestamp. Off by default, because it makes output
   *  non-deterministic and therefore awkward to diff or snapshot-test. */
  readonly timestamp?: string;
  /** Only include these tools. */
  readonly kinds?: readonly ResultKind[];
}

/**
 * Render the whole panel as Markdown.
 *
 * Grouped by tool, then listed as a table. Deterministic: no timestamp unless
 * one is supplied, and results are emitted in the order the host supplied them,
 * which is already sorted.
 */
export function renderPanelMarkdown(
  state: PanelState,
  options: PanelReportOptions = {},
): string {
  const title = options.title ?? "Code Trio report";
  const kinds = options.kinds ?? (Object.keys(state.tools) as ResultKind[]);
  const out: string[] = [`# ${title}`, ""];

  if (options.timestamp) out.push(`_Generated ${options.timestamp}_`, "");
  if (state.note) out.push(`> ${state.note}`, "");
  if (state.truncated) {
    out.push("> **Note:** results were capped; this report is incomplete.", "");
  }

  // Summary table first: the counts are the thing most readers want.
  out.push("| Tool | Status | Errors | Warnings | Info | Hints | Summary |");
  out.push("| --- | --- | ---: | ---: | ---: | ---: | --- |");
  for (const kind of kinds) {
    const tool = state.tools[kind];
    if (!tool) continue;
    out.push(
      `| ${KIND_LABEL[kind]} | ${tool.status} | ${tool.counts.error} | ${tool.counts.warning} ` +
        `| ${tool.counts.information} | ${tool.counts.hint} | ${cell(tool.summary ?? "")} |`,
    );
  }
  out.push("");

  for (const kind of kinds) {
    const results = state.results.filter((r) => r.kind === kind);
    const tool = state.tools[kind];
    if (!tool && results.length === 0) continue;

    out.push(`## ${KIND_LABEL[kind]}`, "");
    if (tool?.problem) out.push(`**Problem:** ${tool.problem}`, "");
    if (results.length === 0) {
      out.push(tool?.summary ?? "No results.", "");
      continue;
    }

    out.push("| Location | Severity | Message |");
    out.push("| --- | --- | --- |");
    for (const r of results) {
      out.push(
        `| ${cell(formatLocation(r))} | ${SEVERITY_LABEL[r.severity]} | ${cell(r.message)} |`,
      );
    }
    out.push("");
  }

  return `${out.join("\n")}\n`;
}

/**
 * Render the panel as JSON.
 *
 * Returns the state unchanged apart from an added schema marker, so a consumer
 * can tell which shape it is reading without guessing.
 */
export function renderPanelJson(state: PanelState): string {
  return `${JSON.stringify({ schema: "code-trio/panel-report@1", ...state }, null, 2)}\n`;
}

/** Plain-text rendering, for "copy complete report" into a chat or an email. */
export function renderPanelText(state: PanelState): string {
  const out: string[] = [];
  for (const [kind, tool] of Object.entries(state.tools)) {
    if (!tool) continue;
    out.push(`${KIND_LABEL[kind as ResultKind]}: ${tool.summary ?? tool.status}`);
  }
  if (state.results.length > 0) out.push("");
  for (const r of state.results) out.push(formatResultLine(r));
  if (state.truncated) out.push("", "(results were capped; this report is incomplete)");
  return `${out.join("\n")}\n`;
}
