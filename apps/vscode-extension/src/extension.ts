import * as vscode from "vscode";
import { ResultsProvider, type ResultSummary } from "./panel";
import { ResultsPanel } from "./results-panel";
import { SpellManager } from "./diagnostics";
import { SCHEME, VirtualDocProvider } from "./virtualDocs";
import {
  compareSelected,
  compareSelectionWithClipboard,
  compareWithClipboard,
  compareWithFile,
  compareWithGitRef,
  compareWithPreviousRevision,
  compareWithSaved,
} from "./compare";
import { MergeManager } from "./merge";
import { DictionaryWatcher, openDictionary } from "./dictionaries";
import {
  formatActiveDocument,
  formatChangedFiles,
  formatWorkspace,
  onWillSaveEdits,
  previewFormat,
  resetFormatterRegistry,
  showFormatterStatus,
} from "./format";

export function activate(context: vscode.ExtensionContext): void {
  const results = new ResultsProvider();
  // The webview panel is the v0.2.0 unified surface; ResultsProvider remains as
  // the compact summary feed the individual features write to.
  const panel = new ResultsPanel(context.extensionUri);
  const virtualDocs = new VirtualDocProvider();
  const spell = new SpellManager(results);
  const merge = new MergeManager(results, virtualDocs);
  const dictionaries = new DictionaryWatcher();
  dictionaries.refresh();

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ResultsPanel.viewType, panel, {
      // Keeping the webview alive across hide/show is what preserves the user's
      // tab, filter and sort without the host having to store UI state.
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.window.registerTreeDataProvider("codeTrio.summaryView", results),
    panel,
    results.onDidChangeSummary((summary) => publishSummary(panel, summary)),
    vscode.workspace.registerTextDocumentContentProvider(SCHEME, virtualDocs),
    vscode.languages.registerCodeActionsProvider({ scheme: "*" }, spell, SpellManager.metadata),
    spell,
    merge,
    virtualDocs,
    dictionaries,
    // A dictionary edit must take effect immediately; without this the user
    // adds a word, sees the diagnostic persist, and concludes it did not work.
    dictionaries.onDidChange(() => spell.recheckVisible()),
    // Folder add/remove changes which dictionaries are relevant.
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      dictionaries.refresh();
      spell.recheckVisible();
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration("codeTrio")) return;
      dictionaries.refresh();
      // Formatter paths and the enable flag live in settings, so a cached
      // registry would keep using a formatter the user just disabled.
      resetFormatterRegistry();
      spell.recheckVisible();
    }),
  );

  const activeDocument = (): vscode.TextDocument | undefined =>
    vscode.window.activeTextEditor?.document;

  const commands: Record<string, (...args: unknown[]) => unknown> = {
    "codeTrio.compareWith": () => compareWithFile(results),
    "codeTrio.compareSelected": (clicked, selection) =>
      compareSelected(results, clicked as vscode.Uri | undefined, selection as vscode.Uri[]),
    "codeTrio.compareWithClipboard": () => compareWithClipboard(results, virtualDocs),
    "codeTrio.compareSelectionWithClipboard": () =>
      compareSelectionWithClipboard(results, virtualDocs),
    "codeTrio.compareWithSaved": () => compareWithSaved(results, virtualDocs),
    "codeTrio.compareWithGitRef": () => compareWithGitRef(results, virtualDocs),
    "codeTrio.compareWithPreviousRevision": () =>
      compareWithPreviousRevision(results, virtualDocs),
    "codeTrio.mergeFromGit": () => merge.startFromGit(),
    "codeTrio.mergeFiles": () => merge.startFromFiles(),
    "codeTrio.mergeNextConflict": () => merge.nextConflict(),
    "codeTrio.mergePreviousConflict": () => merge.previousConflict(),
    "codeTrio.mergePreview": () => merge.preview(),
    "codeTrio.mergeSave": () => merge.save(),
    "codeTrio.spellCheckFile": () => {
      const doc = activeDocument();
      if (doc) spell.checkNow(doc);
    },
    "codeTrio.spellCheckWorkspace": () => spellCheckWorkspace(spell),
    "codeTrio.spellFixAllInFile": () => {
      const doc = activeDocument();
      if (doc) void spell.fixAllInFile(doc);
    },
    "codeTrio.spellAddWord": (word, uri) =>
      spell.addWord(String(word ?? ""), (uri as vscode.Uri) ?? activeDocument()?.uri),
    "codeTrio.spellIgnoreSession": (word) => spell.ignoreForSession(String(word ?? "")),
    "codeTrio.spellClearSessionIgnores": () => spell.clearSessionIgnores(),
    "codeTrio.openWorkspaceDictionary": () => {
      const doc = activeDocument();
      if (doc) void openDictionary("workspace", doc.uri);
    },
    "codeTrio.openFolderDictionary": () => {
      const doc = activeDocument();
      if (doc) void openDictionary("folder", doc.uri);
    },
    "codeTrio.openUserDictionary": () => {
      const doc = activeDocument();
      if (doc) void openDictionary("user", doc.uri);
    },
    "codeTrio.showDictionarySources": () => {
      const sources = spell.sources();
      if (sources.length === 0) {
        void vscode.window.showInformationMessage(
          "Code Trio: run a spell check first to see which dictionaries were used.",
        );
        return;
      }
      void vscode.window.showQuickPick(
        sources.map((s) => ({
          label: `$(book) ${s.scope}`,
          description: s.exists ? `${s.wordCount} word(s)` : "not created yet",
          detail: s.error ? `${s.path} — ${s.error}` : s.path,
        })),
        { title: "Dictionaries consulted, most specific first" },
      );
    },
    "codeTrio.formatDocument": () => formatActiveDocument(results, virtualDocs),
    "codeTrio.formatPreview": () => previewFormat(results, virtualDocs),
    "codeTrio.formatChangedFiles": () => formatChangedFiles(results),
    "codeTrio.formatWorkspace": () => formatWorkspace(results),
    "codeTrio.showFormatters": () => showFormatterStatus(),
    "codeTrio.showPanel": () => panel.show(),
    "codeTrio.exportResults": () => vscode.commands.executeCommand("codeTrio.showPanel"),
    "codeTrio.refreshResults": () => {
      const doc = activeDocument();
      if (doc) spell.checkNow(doc);
    },
    "codeTrio.clearResults": () => {
      results.clear();
      panel.clear();
    },
  };
  for (const [id, handler] of Object.entries(commands)) {
    context.subscriptions.push(vscode.commands.registerCommand(id, handler));
  }

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) spell.scheduleCheck(editor.document);
    }),
    vscode.workspace.onDidChangeTextDocument((event) => spell.scheduleCheck(event.document)),
    vscode.workspace.onDidOpenTextDocument((document) => spell.scheduleCheck(document)),
    vscode.workspace.onDidCloseTextDocument((document) => spell.clear(document.uri)),
    vscode.workspace.onWillSaveTextDocument((event) => {
      event.waitUntil(onWillSaveEdits(event.document));
    }),
  );

  const active = activeDocument();
  if (active) spell.scheduleCheck(active);
}

async function spellCheckWorkspace(spell: SpellManager): Promise<void> {
  const files = await vscode.workspace.findFiles(
    "**/*.{ts,tsx,js,jsx,mjs,cjs,md,markdown,json,css,scss,less,yaml,yml,py,sh}",
    "**/{node_modules,dist,out,.git}/**",
    500,
  );
  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "Code Trio: spell checking workspace" },
    async (progress) => {
      let done = 0;
      for (const uri of files) {
        try {
          const document = await vscode.workspace.openTextDocument(uri);
          spell.checkNow(document);
        } catch {
          /* skip unreadable files */
        }
        done++;
        if (done % 25 === 0) progress.report({ message: `${done}/${files.length}` });
      }
    },
  );
  void vscode.window.showInformationMessage(
    `Code Trio: spell checked ${files.length} file(s). See the Problems panel.`,
  );
}

/**
 * Mirror the compact summary into the webview panel.
 *
 * The features write one-line summaries to ResultsProvider; this translates
 * them into the panel's tool-state model so both surfaces always agree. Doing
 * it in one place means a feature never has to remember to update two things.
 */
function publishSummary(panel: ResultsPanel, summary: ResultSummary): void {
  if (summary.lastCompare !== undefined) {
    panel.setSummary("compare", summary.lastCompare);
  }
  if (summary.lastMerge !== undefined) {
    panel.setSummary("merge", summary.lastMerge);
  }
  if (summary.lastFormat !== undefined) {
    panel.setSummary("beautify", summary.lastFormat);
  }
  if (summary.spellIssues !== undefined || summary.spellSkipped !== undefined) {
    const text = summary.spellSkipped
      ? `skipped (${summary.spellSkipped})`
      : `${summary.spellIssues ?? 0} issue(s)${summary.spellFile ? ` in ${summary.spellFile}` : ""}`;
    panel.setSummary("spell", text, summary.spellSkipped ? "partial" : "success");
    if (summary.spellSources) panel.setNote(`Dictionaries: ${summary.spellSources}`);
    panel.setTruncated(summary.spellTruncated === true);
  }
}

export function deactivate(): void {
  /* subscriptions are disposed by VS Code */
}
