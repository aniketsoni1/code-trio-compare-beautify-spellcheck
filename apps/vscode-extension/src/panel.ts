import * as vscode from "vscode";

export interface ResultSummary {
  readonly spellIssues?: number;
  readonly spellFile?: string;
  readonly lastCompare?: string;
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
export class ResultsProvider implements vscode.TreeDataProvider<ResultNode> {
  private summary: ResultSummary = {};
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;

  update(patch: Partial<ResultSummary>): void {
    this.summary = { ...this.summary, ...patch };
    this.emitter.fire();
  }

  clear(): void {
    this.summary = {};
    this.emitter.fire();
  }

  getTreeItem(element: ResultNode): vscode.TreeItem {
    return element;
  }

  getChildren(): ResultNode[] {
    const s = this.summary;
    const nodes: ResultNode[] = [];

    const spellDesc =
      s.spellIssues === undefined
        ? "run Spell Check"
        : s.spellIssues === 0
          ? "no issues"
          : `${s.spellIssues} issue${s.spellIssues === 1 ? "" : "s"}${s.spellFile ? ` - ${s.spellFile}` : ""}`;
    nodes.push(
      new ResultNode("Spell Check", spellDesc, "book", {
        command: "codeTrio.spellCheckFile",
        title: "Spell Check Current File",
      }),
    );

    nodes.push(
      new ResultNode("Compare", s.lastCompare ?? "compare a file", "git-compare", {
        command: "codeTrio.compareWith",
        title: "Compare Active File With File...",
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
