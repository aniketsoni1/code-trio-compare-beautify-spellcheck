import { resolve } from "node:path";
import * as vscode from "vscode";
import type { AdapterRegistry } from "@ctr/format-engine";
import { changedFiles, makeDocument, registryFor, runFormat } from "@ctr/agent";
import { summarizeFormat } from "@ctr/reporting";
import { getConfig } from "./config";
import type { ResultsProvider } from "./panel";
import type { VirtualDocProvider } from "./virtualDocs";
import { isWriteAllowed, warnUntrusted } from "./trust";

/**
 * The registry is rebuilt when configuration changes rather than being a module
 * constant, because both the configured formatter paths and the enable flag
 * live in settings — a module-level registry would keep using a formatter the
 * user had just disabled until the window was reloaded.
 */
let registry: AdapterRegistry | undefined;

function currentRegistry(resource?: vscode.Uri): AdapterRegistry {
  registry ??= registryFor(getConfig(resource));
  return registry;
}

/** Drop the cached registry and every cached availability probe. */
export function resetFormatterRegistry(): void {
  registry?.invalidate();
  registry = undefined;
}

function fullRange(document: vscode.TextDocument): vscode.Range {
  return new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
}

function ctrDoc(document: vscode.TextDocument): ReturnType<typeof makeDocument> {
  return makeDocument(document.uri.toString(), document.languageId, document.getText());
}

function fileName(document: vscode.TextDocument): string {
  return document.fileName.split(/[/\\]/).pop() ?? document.fileName;
}

/**
 * Explain why nothing happened, naming the formatter that was looked for.
 *
 * "No formatter for python" is a dead end. "Ruff was not found on PATH; install
 * it or set codeTrio.externalFormatters.paths" is a next step, and the button
 * opens the right setting.
 */
async function reportUnsupported(document: vscode.TextDocument): Promise<void> {
  const explained = await currentRegistry(document.uri).explain(document.languageId);
  if (explained.rejected.length === 0) {
    void vscode.window.showInformationMessage(
      `Code Trio: no formatter supports "${document.languageId}".`,
    );
    return;
  }
  const first = explained.rejected[0];
  const choice = await vscode.window.showWarningMessage(
    `Code Trio: ${first?.availability.reason ?? `${first?.displayName} is unavailable.`}`,
    "Open Settings",
    "Show All Formatters",
  );
  if (choice === "Open Settings") {
    await vscode.commands.executeCommand(
      "workbench.action.openSettings",
      "codeTrio.externalFormatters",
    );
  } else if (choice === "Show All Formatters") {
    await showFormatterStatus();
  }
}

/** List every adapter and its availability, as a quick pick. */
export async function showFormatterStatus(): Promise<void> {
  const reports = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Window, title: "Code Trio: checking formatters" },
    () => currentRegistry().describeAll(),
  );
  await vscode.window.showQuickPick(
    reports.map((r) => ({
      label: `${r.availability.available ? "$(check)" : "$(circle-slash)"} ${r.displayName}`,
      description: r.availability.available
        ? `${r.availability.version ?? ""} ${r.bundled ? "(bundled)" : `(${r.availability.source ?? "found"})`}`.trim()
        : "unavailable",
      detail: r.availability.available
        ? `${r.languages.join(", ")}${r.availability.executable ? ` — ${r.availability.executable}` : ""}`
        : r.availability.reason,
    })),
    {
      title: "Code Trio formatters",
      placeHolder: "Code Trio never downloads a formatter; it uses what is already installed.",
    },
  );
}

/** Preview formatting for the active document in a side-by-side diff. */
export async function previewFormat(
  results: ResultsProvider,
  virtualDocs: VirtualDocProvider,
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  const config = getConfig(editor.document.uri);
  const result = await runFormat(
    ctrDoc(editor.document),
    config,
    currentRegistry(editor.document.uri),
  );
  results.update({ lastFormat: summarizeFormat(result, false) });

  if (result.unsupported) {
    await reportUnsupported(editor.document);
    return;
  }
  if (result.error) {
    void vscode.window.showWarningMessage(`Code Trio: ${result.error}`);
    return;
  }
  if (!result.changed) {
    void vscode.window.showInformationMessage(
      `Code Trio: already formatted (${result.formatter.name}@${result.formatter.version}).`,
    );
    return;
  }
  const preview = virtualDocs.set(`formatted-${fileName(editor.document)}`, result.formatted);
  await vscode.commands.executeCommand(
    "vscode.diff",
    editor.document.uri,
    preview,
    `${fileName(editor.document)} (dry-run beautify, ${result.formatter.name}@${result.formatter.version})`,
  );
}

/** Beautify the active document, previewing first when configured. */
export async function formatActiveDocument(
  results: ResultsProvider,
  virtualDocs: VirtualDocProvider,
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  if (!isWriteAllowed()) {
    warnUntrusted("applying formatting");
    return;
  }
  const config = getConfig(editor.document.uri);
  const result = await runFormat(
    ctrDoc(editor.document),
    config,
    currentRegistry(editor.document.uri),
  );
  results.update({ lastFormat: summarizeFormat(result, false) });

  if (result.unsupported) {
    await reportUnsupported(editor.document);
    return;
  }
  if (result.error) {
    void vscode.window.showWarningMessage(`Code Trio: ${result.error}`);
    return;
  }
  if (!result.changed) {
    void vscode.window.showInformationMessage("Code Trio: already formatted.");
    return;
  }

  if (config.format.previewBeforeApply) {
    const preview = virtualDocs.set(`formatted-${Date.now()}`, result.formatted);
    await vscode.commands.executeCommand(
      "vscode.diff",
      editor.document.uri,
      preview,
      `${fileName(editor.document)} (beautify preview)`,
    );
    const choice = await vscode.window.showInformationMessage(
      `Beautify ${fileName(editor.document)} with ${result.formatter.name}@${result.formatter.version}?`,
      "Apply",
      "Cancel",
    );
    if (choice !== "Apply") return;
  }

  await applyFormatted(editor.document, result.formatted);
  void vscode.window.showInformationMessage(
    `Code Trio: beautified with ${result.formatter.name}@${result.formatter.version}.`,
  );
}

async function applyFormatted(document: vscode.TextDocument, formatted: string): Promise<void> {
  const edit = new vscode.WorkspaceEdit();
  edit.replace(document.uri, fullRange(document), formatted);
  await vscode.workspace.applyEdit(edit);
}

interface BatchOutcome {
  formatted: number;
  unchanged: number;
  failed: Array<{ file: string; reason: string }>;
  cancelled: boolean;
}

/**
 * Format a list of files with progress, cancellation and partial-failure
 * reporting.
 *
 * A failure on one file never aborts the batch. In a workspace-wide run a
 * single unparseable file would otherwise stop the operation halfway through,
 * leaving a partially formatted tree and no explanation of where it stopped.
 */
async function formatBatch(uris: readonly vscode.Uri[], title: string): Promise<BatchOutcome> {
  const outcome: BatchOutcome = { formatted: 0, unchanged: 0, failed: [], cancelled: false };

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title, cancellable: true },
    async (progress, token) => {
      let done = 0;
      for (const uri of uris) {
        if (token.isCancellationRequested) {
          outcome.cancelled = true;
          return;
        }
        const name = uri.path.split("/").pop() ?? "";
        progress.report({
          message: `${done + 1}/${uris.length} ${name}`,
          increment: 100 / uris.length,
        });
        try {
          const document = await vscode.workspace.openTextDocument(uri);
          const config = getConfig(uri);
          const result = await runFormat(ctrDoc(document), config, currentRegistry(uri));
          if (result.error) {
            outcome.failed.push({ file: name, reason: result.error });
          } else if (result.unsupported || !result.changed) {
            outcome.unchanged++;
          } else {
            await applyFormatted(document, result.formatted);
            outcome.formatted++;
          }
        } catch (err) {
          outcome.failed.push({
            file: name,
            reason: err instanceof Error ? err.message : String(err),
          });
        }
        done++;
      }
    },
  );
  return outcome;
}

function reportBatch(outcome: BatchOutcome, results: ResultsProvider): void {
  const parts = [`${outcome.formatted} formatted`, `${outcome.unchanged} unchanged`];
  if (outcome.failed.length > 0) parts.push(`${outcome.failed.length} failed`);
  if (outcome.cancelled) parts.push("cancelled");
  const summary = parts.join(", ");
  results.update({ lastFormat: summary });

  if (outcome.failed.length > 0) {
    void vscode.window
      .showWarningMessage(`Code Trio: ${summary}.`, "Show Failures")
      .then((choice) => {
        if (choice !== "Show Failures") return;
        void vscode.window.showQuickPick(
          outcome.failed.map((f) => ({ label: f.file, detail: f.reason })),
          { title: `${outcome.failed.length} file(s) could not be formatted` },
        );
      });
  } else {
    void vscode.window.showInformationMessage(`Code Trio: ${summary}.`);
  }
}

/** Beautify only the files changed versus HEAD. */
export async function formatChangedFiles(results: ResultsProvider): Promise<void> {
  if (!isWriteAllowed()) {
    warnUntrusted("applying formatting");
    return;
  }
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    void vscode.window.showInformationMessage("Code Trio: open a folder first.");
    return;
  }
  const root = folder.uri.fsPath;
  // Via @ctr/agent rather than a local execFileSync: the agent validates the
  // ref, bounds the output, applies a timeout and passes a minimal environment.
  const changed = changedFiles("HEAD", root);
  if (changed === null) {
    void vscode.window.showWarningMessage(
      "Code Trio: could not list changed files. This needs a git work tree.",
    );
    return;
  }
  if (changed.length === 0) {
    void vscode.window.showInformationMessage("Code Trio: no files changed versus HEAD.");
    return;
  }

  const outcome = await formatBatch(
    changed.map((rel) => vscode.Uri.file(resolve(root, rel))),
    `Code Trio: beautifying ${changed.length} changed file(s)`,
  );
  reportBatch(outcome, results);
}

/**
 * Beautify every supported file in the workspace.
 *
 * Requires an explicit, modal confirmation naming the file count. A
 * workspace-wide write is the most destructive thing Code Trio can do, and a
 * non-modal notification is too easy to dismiss by accident.
 */
export async function formatWorkspace(results: ResultsProvider): Promise<void> {
  if (!isWriteAllowed()) {
    warnUntrusted("applying formatting");
    return;
  }
  const config = getConfig();
  const files = await vscode.workspace.findFiles(
    "**/*.{ts,tsx,js,jsx,mjs,cjs,json,jsonc,css,scss,less,md,markdown,yaml,yml,html,py,go,rs,c,h,cpp,hpp,java}",
    `{${config.spell.ignoreGlobs.join(",")}}`,
  );
  if (files.length === 0) {
    void vscode.window.showInformationMessage("Code Trio: no supported files found.");
    return;
  }

  const confirm = await vscode.window.showWarningMessage(
    `Beautify ${files.length} file(s) in this workspace? This writes to every file that changes.`,
    { modal: true, detail: "Changes can be reverted with Undo in each editor, or with git." },
    "Beautify All",
  );
  if (confirm !== "Beautify All") return;

  const outcome = await formatBatch(files, `Code Trio: beautifying ${files.length} file(s)`);
  reportBatch(outcome, results);
}

/** format-on-save hook: returns edits when enabled and supported. */
export async function onWillSaveEdits(document: vscode.TextDocument): Promise<vscode.TextEdit[]> {
  const config = getConfig(document.uri);
  if (!config.format.formatOnSave || !isWriteAllowed()) return [];
  const result = await runFormat(ctrDoc(document), config, currentRegistry(document.uri));
  // Silent on failure by design: a save must never turn into a dialog. The
  // outcome is still visible in the results panel.
  if (!result.changed || result.error || result.unsupported) return [];
  return [vscode.TextEdit.replace(fullRange(document), result.formatted)];
}
