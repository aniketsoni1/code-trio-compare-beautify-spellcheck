/** @ctr/reporting - unified terminal/json/markdown rendering of engine output. */
export {
  renderDiffTerminal,
  renderUnifiedDiff,
  renderDiffJson,
  renderDiffMarkdown,
  toSideBySide,
  summarizeDiff,
  type DiffRenderOptions,
  type MarkdownDiffOptions,
  type SideBySideRow,
} from "./diff-report";
export {
  renderMergeTerminal,
  renderMergeMarkdown,
  renderMergeJson,
  summarizeMerge,
  conflictNavigationOrder,
  type MergeRenderOptions,
} from "./merge-report";
export {
  renderDiagnosticsTerminal,
  renderDiagnosticsJson,
  summarizeFormat,
  type DiagnosticsRenderOptions,
} from "./diagnostics-report";
