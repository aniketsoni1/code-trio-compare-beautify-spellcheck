import * as vscode from "vscode";

export interface ResultSummary {
  readonly spellIssues?: number;
  readonly spellFile?: string;
  /** Why the document was skipped entirely, if it was. */
  readonly spellSkipped?: string;
  /** True when the per-document diagnostic cap was reached. */
  readonly spellTruncated?: boolean;
  /** Which dictionary scopes contributed, e.g. "workspace (12), folder (3)". */
  readonly spellSources?: string;
  readonly lastCompare?: string;
  /** How the last comparison was configured, e.g. "granularity: word, ...". */
  readonly lastCompareDetail?: string;
  readonly lastMerge?: string;
  readonly lastFormat?: string;
}

class ResultNode extends vscode.TreeItem {
  constructor(label: string, description: string, icon: string, command?: vscode.Command) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.description = description;
    this.iconPath = new vscode.ThemeIcon(icon);
    if (command) this.command = command;
  }
}

/**
 * The unified results panel. All three tools report a one-line summary here so
 * they read as one product. It intentionally holds no heavy state.
 */
export class ResultsProvider implements vscode.TreeDataProvider<ResultNode>, vscode.Disposable {
  private summary: ResultSummary = {};
  private readonly emitter = new vscode.EventEmitter<void>();
  private readonly summaryEmitter = new vscode.EventEmitter<ResultSummary>();
  readonly onDidChangeTreeData = this.emitter.event;

  /**
   * Fires with the full summary whenever any part of it changes.
   *
   * The webview panel subscribes to this rather than each feature updating both
   * surfaces, so a new feature cannot forget to keep them in sync.
   */
  readonly onDidChangeSummary = this.summaryEmitter.event;

  update(patch: Partial<ResultSummary>): void {
    this.summary = { ...this.summary, ...patch };
    this.emitter.fire();
    this.summaryEmitter.fire(patch as ResultSummary);
  }

  clear(): void {
    this.summary = {};
    this.emitter.fire();
    this.summaryEmitter.fire({});
  }

  dispose(): void {
    this.emitter.dispose();
    this.summaryEmitter.dispose();
  }

  getTreeItem(element: ResultNode): vscode.TreeItem {
    return element;
  }

  getChildren(): ResultNode[] {
    const s = this.summary;
    const nodes: ResultNode[] = [];

    const spellDesc =
      s.spellSkipped !== undefined
        ? `skipped (${s.spellSkipped})`
        : s.spellIssues === undefined
          ? "run Spell Check"
          : s.spellIssues === 0
            ? "no issues"
            : `${s.spellIssues}${s.spellTruncated ? "+" : ""} issue${s.spellIssues === 1 ? "" : "s"}${s.spellFile ? ` - ${s.spellFile}` : ""}`;
    const spell = new ResultNode("Spell Check", spellDesc, "book", {
      command: "codeTrio.spellCheckFile",
      title: "Spell Check Current File",
    });
    // The hover names the dictionaries that were actually consulted, which is
    // the fastest way to diagnose "why is this word not accepted?".
    if (s.spellSources) spell.tooltip = `Dictionaries: ${s.spellSources}`;
    if (s.spellTruncated) {
      spell.tooltip = `${spell.tooltip ?? ""}\nDiagnostics were capped for this document.`;
    }
    nodes.push(spell);

    const compare = new ResultNode(
      "Compare",
      s.lastCompare ?? "compare a file",
      "git-compare",
      {
        command: "codeTrio.compareWith",
        title: "Compare Active File With File...",
      },
    );
    // The hover carries the comparison settings so the summary number can be
    // interpreted without guessing which options produced it.
    if (s.lastCompareDetail) compare.tooltip = s.lastCompareDetail;
    nodes.push(compare);

    nodes.push(
      new ResultNode("Merge", s.lastMerge ?? "three-way merge", "git-merge", {
        command: "codeTrio.mergeFromGit",
        title: "Merge Conflicted File (Git)",
      }),
    );

    nodes.push(
      new ResultNode("Beautify", s.lastFormat ?? "preview formatting", "symbol-color", {
        command: "codeTrio.formatPreview",
        title: "Preview Beautify Changes",
      }),
    );

    return nodes;
  }
}
