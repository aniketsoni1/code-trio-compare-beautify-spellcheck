/** @ctr/reporting - unified terminal/json/unified rendering of engine output. */
export {
  renderDiffTerminal,
  renderUnifiedDiff,
  renderDiffJson,
  summarizeDiff,
  type DiffRenderOptions,
} from "./diff-report";
export {
  renderDiagnosticsTerminal,
  renderDiagnosticsJson,
  summarizeFormat,
  type DiagnosticsRenderOptions,
} from "./diagnostics-report";
