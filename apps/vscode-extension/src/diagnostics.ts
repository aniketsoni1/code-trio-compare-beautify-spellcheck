import * as vscode from "vscode";
import type { Diagnostic as CtrDiagnostic, Severity } from "@ctr/core";
import { appendProjectDictionaryWord, loadProjectDictionary, makeDocument, runSpell } from "@ctr/agent";
import { getConfig } from "./config";
import type { ResultsProvider } from "./panel";
import { isWriteAllowed, warnUntrusted, workspaceRootFor } from "./trust";

interface StoredDiag {
  range: vscode.Range;
  word: string;
  replacements: string[];
}

const SEVERITY_MAP: Record<Severity, vscode.DiagnosticSeverity> = {
  error: vscode.DiagnosticSeverity.Error,
  warning: vscode.DiagnosticSeverity.Warning,
  information: vscode.DiagnosticSeverity.Information,
  hint: vscode.DiagnosticSeverity.Hint,
};

const SKIP_PATH = /[/\\](node_modules|dist|out|\.git|\.vscode-test)[/\\]/;
const DEBOUNCE_MS = 300;

function toRange(d: CtrDiagnostic): vscode.Range {
  return new vscode.Range(
    d.range.start.line,
    d.range.start.character,
    d.range.end.line,
    d.range.end.character,
  );
}

/** Manages spell diagnostics, quick fixes, and the project-dictionary write. */
export class SpellManager implements vscode.CodeActionProvider, vscode.Disposable {
  private readonly collection = vscode.languages.createDiagnosticCollection("code-trio.spell");
  private readonly stored = new Map<string, StoredDiag[]>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(private readonly results: ResultsProvider) {}

  static readonly metadata: vscode.CodeActionProviderMetadata = {
    providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
  };

  scheduleCheck(document: vscode.TextDocument): void {
    const key = document.uri.toString();
    const existing = this.timers.get(key);
    if (existing) clearTimeout(existing);
    this.timers.set(
      key,
      setTimeout(() => {
        this.timers.delete(key);
        this.checkNow(document);
      }, DEBOUNCE_MS),
    );
  }

  checkNow(document: vscode.TextDocument): void {
    const uri = document.uri;
    if (uri.scheme !== "file" && uri.scheme !== "untitled") return;
    if (SKIP_PATH.test(uri.fsPath)) return;

    const config = getConfig(uri);
    if (!config.spell.enabled) {
      this.clear(uri);
      return;
    }

    const doc = makeDocument(uri.toString(), document.languageId, document.getText());
    const root = workspaceRootFor(uri);
    const project = root
      ? loadProjectDictionary(root, config.spell.projectDictionaryPath)
      : undefined;
    const diagnostics = runSpell(doc, config, project);

    const vsDiags: vscode.Diagnostic[] = [];
    const entries: StoredDiag[] = [];
    for (const d of diagnostics) {
      const range = toRange(d);
      const vsDiag = new vscode.Diagnostic(range, d.message, SEVERITY_MAP[d.severity]);
      vsDiag.source = "Code Trio";
      vsDiag.code = d.code;
      vsDiags.push(vsDiag);
      const replacements = (d.quickFixes ?? [])
        .filter((f) => f.kind === "replace")
        .map((f) => f.edits[0]?.newText)
        .filter((x): x is string => Boolean(x));
      entries.push({ range, word: String(d.data?.word ?? ""), replacements });
    }

    this.collection.set(uri, vsDiags);
    this.stored.set(uri.toString(), entries);
    this.results.update({
      spellIssues: diagnostics.length,
      spellFile: uri.path.split("/").pop() ?? "",
    });
  }

  clear(uri: vscode.Uri): void {
    this.collection.delete(uri);
    this.stored.delete(uri.toString());
  }

  provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
  ): vscode.CodeAction[] {
    const entries = this.stored.get(document.uri.toString()) ?? [];
    const actions: vscode.CodeAction[] = [];

    for (const diag of context.diagnostics) {
      if (diag.source !== "Code Trio") continue;
      const entry = entries.find((e) => e.range.isEqual(diag.range));
      if (!entry) continue;

      entry.replacements.forEach((replacement, i) => {
        const action = new vscode.CodeAction(
          `Replace with "${replacement}"`,
          vscode.CodeActionKind.QuickFix,
        );
        action.edit = new vscode.WorkspaceEdit();
        action.edit.replace(document.uri, entry.range, replacement);
        action.diagnostics = [diag];
        action.isPreferred = i === 0;
        actions.push(action);
      });

      const addAction = new vscode.CodeAction(
        `Add "${entry.word}" to project dictionary`,
        vscode.CodeActionKind.QuickFix,
      );
      addAction.command = {
        command: "codeTrio.spellAddWord",
        title: "Add Word To Project Dictionary",
        arguments: [entry.word, document.uri],
      };
      addAction.diagnostics = [diag];
      actions.push(addAction);
    }
    return actions;
  }

  async fixAllInFile(document: vscode.TextDocument): Promise<void> {
    const entries = this.stored.get(document.uri.toString()) ?? [];
    const edit = new vscode.WorkspaceEdit();
    let fixes = 0;
    for (const entry of entries) {
      const replacement = entry.replacements[0];
      if (replacement) {
        edit.replace(document.uri, entry.range, replacement);
        fixes++;
      }
    }
    if (fixes === 0) {
      void vscode.window.showInformationMessage("Code Trio: no auto-fixable spelling issues.");
      return;
    }
    await vscode.workspace.applyEdit(edit);
    this.checkNow(document);
    void vscode.window.showInformationMessage(`Code Trio: applied ${fixes} spelling fix(es).`);
  }

  addWord(word: string, uri: vscode.Uri): void {
    if (!word) return;
    if (!isWriteAllowed()) {
      warnUntrusted("adding to the project dictionary");
      return;
    }
    const root =
      workspaceRootFor(uri) ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) {
      void vscode.window.showWarningMessage("Code Trio: open a folder to use a project dictionary.");
      return;
    }
    const config = getConfig(uri);
    const { added, path } = appendProjectDictionaryWord(
      root,
      config.spell.projectDictionaryPath,
      word,
    );
    void vscode.window.showInformationMessage(
      added ? `Code Trio: added "${word}" to ${config.spell.projectDictionaryPath}.` : `Code Trio: "${word}" already in dictionary.`,
    );
    void path;
    for (const editor of vscode.window.visibleTextEditors) this.checkNow(editor.document);
  }

  dispose(): void {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    this.collection.dispose();
    this.stored.clear();
  }
}
