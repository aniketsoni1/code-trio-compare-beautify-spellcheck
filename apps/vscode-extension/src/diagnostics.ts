import * as vscode from "vscode";
import type { Diagnostic as CtrDiagnostic, Severity } from "@ctr/core";
import { matchesAnyGlob, toPosixPath } from "@ctr/core";
import type { DictionaryScope } from "@ctr/dictionaries";
import { makeDocument, runSpellScoped, type DictionarySource } from "@ctr/agent";
import { getConfig } from "./config";
import { addWordToScope, locationsFor, pickScope } from "./dictionaries";
import type { ResultsProvider } from "./panel";

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

/**
 * Directories that are never worth scanning regardless of user configuration.
 * This is a floor, not the policy: the user-configurable policy is
 * `codeTrio.spell.ignoreGlobs`, which is applied on top of this.
 */
const ALWAYS_SKIP_PATH = /[/\\](node_modules|\.git|\.vscode-test)[/\\]/;
const DEBOUNCE_MS = 300;

/**
 * True when a document should not be spell-checked.
 *
 * `codeTrio.spell.ignoreGlobs` was previously contributed in package.json but
 * never read — the extension used a hardcoded regex instead, so editing the
 * setting did nothing. The configured globs are now matched against both the
 * workspace-relative path (so a recursive `dist` glob behaves as users expect)
 * and the absolute path (so an absolute glob also works).
 */
function isExcluded(uri: vscode.Uri, ignoreGlobs: readonly string[]): boolean {
  if (ALWAYS_SKIP_PATH.test(uri.fsPath)) return true;
  if (ignoreGlobs.length === 0) return false;

  const absolute = toPosixPath(uri.fsPath);
  if (matchesAnyGlob(absolute, ignoreGlobs)) return true;

  const folder = vscode.workspace.getWorkspaceFolder(uri);
  if (folder) {
    const relative = toPosixPath(vscode.workspace.asRelativePath(uri, false));
    if (matchesAnyGlob(relative, ignoreGlobs)) return true;
  }
  return false;
}

/** Manages spell diagnostics, quick fixes, and dictionary writes. */
export class SpellManager implements vscode.CodeActionProvider, vscode.Disposable {
  private readonly collection = vscode.languages.createDiagnosticCollection("code-trio.spell");
  private readonly stored = new Map<string, StoredDiag[]>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Words ignored for the lifetime of this window only. */
  private readonly sessionIgnores = new Set<string>();
  /** Dictionary sources consulted for the most recent check, for reporting. */
  private lastSources: readonly DictionarySource[] = [];
  /** Patterns already warned about, so a broken setting warns once, not per keystroke. */
  private readonly warnedPatterns = new Set<string>();

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

  /** Re-check every visible editor. Used after a dictionary file changes. */
  recheckVisible(): void {
    for (const editor of vscode.window.visibleTextEditors) this.checkNow(editor.document);
  }

  checkNow(document: vscode.TextDocument, token?: vscode.CancellationToken): void {
    const uri = document.uri;
    if (uri.scheme !== "file" && uri.scheme !== "untitled") return;

    const config = getConfig(uri);
    if (!config.spell.enabled) {
      this.clear(uri);
      return;
    }
    if (isExcluded(uri, config.spell.ignoreGlobs)) {
      // Clear rather than return: a document can become excluded after the
      // user edits ignoreGlobs, and stale diagnostics would otherwise linger.
      this.clear(uri);
      return;
    }

    const doc = makeDocument(uri.toString(), document.languageId, document.getText());
    const result = runSpellScoped(
      doc,
      {
        ...config,
        spell: {
          ...config.spell,
          // Session ignores are merged in as configured ignore words, which is
          // the same precedence the pure engine gives the session scope.
          ignoreWords: [...config.spell.ignoreWords, ...this.sessionIgnores],
        },
      },
      locationsFor(uri),
      token,
    );
    this.lastSources = result.sources;

    // A malformed ignorePattern is a configuration mistake the user must see;
    // warning once per distinct pattern keeps it from firing on every keystroke.
    for (const pattern of result.invalidPatterns) {
      if (this.warnedPatterns.has(pattern)) continue;
      this.warnedPatterns.add(pattern);
      void vscode.window.showWarningMessage(
        `Code Trio: codeTrio.spell.ignorePatterns entry "${pattern}" is not a valid regular expression and was ignored.`,
      );
    }

    if (result.skipped) {
      this.clear(uri);
      this.results.update({ spellIssues: 0, spellFile: basename(uri), spellSkipped: result.skipped });
      return;
    }

    const vsDiags: vscode.Diagnostic[] = [];
    const entries: StoredDiag[] = [];
    for (const d of result.diagnostics) {
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
      spellIssues: result.diagnostics.length,
      spellFile: basename(uri),
      spellTruncated: result.truncated,
      spellSources: result.sources
        .filter((s) => s.exists)
        .map((s) => `${s.scope} (${s.wordCount})`)
        .join(", "),
    });
  }

  clear(uri: vscode.Uri): void {
    this.collection.delete(uri);
    this.stored.delete(uri.toString());
  }

  /** Dictionary files consulted by the most recent check. */
  sources(): readonly DictionarySource[] {
    return this.lastSources;
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
        `Add "${entry.word}" to a dictionary...`,
        vscode.CodeActionKind.QuickFix,
      );
      addAction.command = {
        command: "codeTrio.spellAddWord",
        title: "Add Word To Dictionary",
        arguments: [entry.word, document.uri],
      };
      addAction.diagnostics = [diag];
      actions.push(addAction);

      const ignoreAction = new vscode.CodeAction(
        `Ignore "${entry.word}" for this session`,
        vscode.CodeActionKind.QuickFix,
      );
      ignoreAction.command = {
        command: "codeTrio.spellIgnoreSession",
        title: "Ignore For This Session",
        arguments: [entry.word],
      };
      ignoreAction.diagnostics = [diag];
      actions.push(ignoreAction);
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

  /**
   * Add a word, asking which scope it belongs in.
   *
   * v0.1.0 always wrote to the single project dictionary. With six scopes the
   * destination is a real decision — a personal preference should not require a
   * commit to a shared file, and a term specific to one package should not be
   * accepted repository-wide.
   */
  async addWord(word: string, uri: vscode.Uri, scope?: DictionaryScope): Promise<void> {
    if (!word) return;
    const chosen = scope ?? (await pickScope(word, uri));
    if (!chosen) return;

    if (chosen === "session") {
      this.ignoreForSession(word);
      return;
    }

    const result = addWordToScope(word, chosen, uri);
    if (result.added) {
      void vscode.window.showInformationMessage(
        `Code Trio: added "${word}" to ${result.path}.`,
      );
    } else if (result.reason === "already present") {
      void vscode.window.showInformationMessage(`Code Trio: "${word}" is already there.`);
    } else if (result.reason !== "untrusted workspace") {
      void vscode.window.showWarningMessage(
        `Code Trio: could not add "${word}" — ${result.reason ?? "unknown error"}.`,
      );
    }
    this.recheckVisible();
  }

  /** Accept a word for this window only, writing nothing. */
  ignoreForSession(word: string): void {
    const normalized = word.trim().toLowerCase();
    if (!normalized) return;
    this.sessionIgnores.add(normalized);
    this.recheckVisible();
    void vscode.window.showInformationMessage(
      `Code Trio: ignoring "${normalized}" for this session. Nothing was written to disk.`,
    );
  }

  /** Forget every session ignore, restoring the on-disk dictionaries alone. */
  clearSessionIgnores(): void {
    const count = this.sessionIgnores.size;
    this.sessionIgnores.clear();
    this.recheckVisible();
    void vscode.window.showInformationMessage(
      `Code Trio: cleared ${count} session ignore(s).`,
    );
  }

  dispose(): void {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    this.collection.dispose();
    this.stored.clear();
    this.sessionIgnores.clear();
    this.warnedPatterns.clear();
  }
}

function toRange(d: CtrDiagnostic): vscode.Range {
  return new vscode.Range(
    d.range.start.line,
    d.range.start.character,
    d.range.end.line,
    d.range.end.character,
  );
}

function basename(uri: vscode.Uri): string {
  return uri.path.split("/").pop() ?? "";
}
