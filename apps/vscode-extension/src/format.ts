import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import * as vscode from "vscode";
import { defaultRegistry, makeDocument, runFormat } from "@ctr/agent";
import { summarizeFormat } from "@ctr/reporting";
import { getConfig } from "./config";
import type { ResultsProvider } from "./panel";
import type { VirtualDocProvider } from "./virtualDocs";
import { isWriteAllowed, warnUntrusted } from "./trust";

const registry = defaultRegistry();

function fullRange(document: vscode.TextDocument): vscode.Range {
  return new vscode.Range(
    document.positionAt(0),
    document.positionAt(document.getText().length),
  );
}

function ctrDoc(document: vscode.TextDocument) {
  return makeDocument(document.uri.toString(), document.languageId, document.getText());
}

/** Preview formatting for the active document in a side-by-side diff. */
export async function previewFormat(
  results: ResultsProvider,
  virtualDocs: VirtualDocProvider,
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  const config = getConfig(editor.document.uri);
  const result = await runFormat(ctrDoc(editor.document), config, registry);
  results.update({ lastFormat: summarizeFormat(result, false) });

  if (result.unsupported) {
    void vscode.window.showInformationMessage(
      `Code Trio: no formatter for "${editor.document.languageId}".`,
    );
    return;
  }
  if (result.error) {
    void vscode.window.showWarningMessage(`Code Trio: formatter error - ${result.error}`);
    return;
  }
  if (!result.changed) {
    void vscode.window.showInformationMessage("Code Trio: already formatted.");
    return;
  }
  const preview = virtualDocs.set(`formatted-${editor.document.fileName.split(/[/\\]/).pop()}`, result.formatted);
  await vscode.commands.executeCommand(
    "vscode.diff",
    editor.document.uri,
    preview,
    `${editor.document.fileName.split(/[/\\]/).pop()} (dry-run beautify)`,
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
  const result = await runFormat(ctrDoc(editor.document), config, registry);
  results.update({ lastFormat: summarizeFormat(result, false) });

  if (result.unsupported) {
    void vscode.window.showInformationMessage(
      `Code Trio: no formatter for "${editor.document.languageId}".`,
    );
    return;
  }
  if (result.error) {
    void vscode.window.showWarningMessage(`Code Trio: formatter error - ${result.error}`);
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
      `${editor.document.fileName.split(/[/\\]/).pop()} (beautify preview)`,
    );
    const choice = await vscode.window.showInformationMessage(
      `Beautify ${editor.document.fileName.split(/[/\\]/).pop()} with ${result.formatter.name}@${result.formatter.version}?`,
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
  let changed: string[];
  try {
    const out = execFileSync("git", ["diff", "--name-only", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    });
    changed = out.split("\n").map((l) => l.trim()).filter(Boolean);
  } catch {
    void vscode.window.showWarningMessage("Code Trio: could not list changed files (git required).");
    return;
  }

  const config = getConfig(folder.uri);
  let formatted = 0;
  for (const rel of changed) {
    const abs = resolve(root, rel);
    try {
      const document = await vscode.workspace.openTextDocument(abs);
      const result = await runFormat(ctrDoc(document), config, registry);
      if (result.changed && !result.error && !result.unsupported) {
        await applyFormatted(document, result.formatted);
        formatted++;
      }
    } catch {
      /* skip files that cannot be opened */
    }
  }
  results.update({ lastFormat: `beautified ${formatted} changed file(s)` });
  void vscode.window.showInformationMessage(`Code Trio: beautified ${formatted} changed file(s).`);
}

/** format-on-save hook: returns edits when enabled and supported. */
export async function onWillSaveEdits(
  document: vscode.TextDocument,
): Promise<vscode.TextEdit[]> {
  const config = getConfig(document.uri);
  if (!config.format.formatOnSave || !isWriteAllowed()) return [];
  const result = await runFormat(ctrDoc(document), config, registry);
  if (!result.changed || result.error || result.unsupported) return [];
  return [vscode.TextEdit.replace(fullRange(document), result.formatted)];
}
