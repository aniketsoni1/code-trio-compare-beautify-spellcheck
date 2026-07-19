import * as vscode from "vscode";
import { gitShow, makeDocument, runCompare } from "@ctr/agent";
import { summarizeDiff } from "@ctr/reporting";
import { getConfig } from "./config";
import type { ResultsProvider } from "./panel";
import type { VirtualDocProvider } from "./virtualDocs";

function activeEditor(): vscode.TextEditor | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    void vscode.window.showInformationMessage("Code Trio: open a file to compare first.");
    return undefined;
  }
  return editor;
}

function reportSummary(results: ResultsProvider, aText: string, bText: string, uri: vscode.Uri): void {
  const config = getConfig(uri);
  const result = runCompare(
    makeDocument("a", "plaintext", aText),
    makeDocument("b", "plaintext", bText),
    config,
  );
  results.update({ lastCompare: summarizeDiff(result) });
}

/** Compare the active file against another file picked by the user. */
export async function compareWithFile(results: ResultsProvider): Promise<void> {
  const editor = activeEditor();
  if (!editor) return;
  const picks = await vscode.window.showOpenDialog({
    canSelectMany: false,
    openLabel: "Compare With Active File",
  });
  const other = picks?.[0];
  if (!other) return;
  const otherDoc = await vscode.workspace.openTextDocument(other);
  reportSummary(results, otherDoc.getText(), editor.document.getText(), editor.document.uri);
  await vscode.commands.executeCommand(
    "vscode.diff",
    other,
    editor.document.uri,
    `${other.path.split("/").pop()} <-> ${editor.document.fileName.split(/[/\\]/).pop()}`,
  );
}

/** Compare the active file against the clipboard contents. */
export async function compareWithClipboard(
  results: ResultsProvider,
  virtualDocs: VirtualDocProvider,
): Promise<void> {
  const editor = activeEditor();
  if (!editor) return;
  const clip = await vscode.env.clipboard.readText();
  const virtualUri = virtualDocs.set("clipboard", clip);
  reportSummary(results, clip, editor.document.getText(), editor.document.uri);
  await vscode.commands.executeCommand(
    "vscode.diff",
    virtualUri,
    editor.document.uri,
    `Clipboard <-> ${editor.document.fileName.split(/[/\\]/).pop()}`,
  );
}

/** Compare the active file at a git ref against the working copy. */
export async function compareWithGitRef(
  results: ResultsProvider,
  virtualDocs: VirtualDocProvider,
): Promise<void> {
  const editor = activeEditor();
  if (!editor) return;
  if (editor.document.uri.scheme !== "file") {
    void vscode.window.showInformationMessage("Code Trio: git compare needs a file on disk.");
    return;
  }
  const ref = await vscode.window.showInputBox({
    prompt: "Compare against which git ref?",
    value: "HEAD",
    placeHolder: "HEAD, main, a commit SHA, ...",
  });
  if (!ref) return;

  const fsPath = editor.document.uri.fsPath;
  const root = vscode.workspace.getWorkspaceFolder(editor.document.uri)?.uri.fsPath;
  const content = gitShow(ref, fsPath, root);
  if (content === null) {
    void vscode.window.showWarningMessage(`Code Trio: could not read this file at "${ref}".`);
    return;
  }
  const virtualUri = virtualDocs.set(`${ref}`, content);
  reportSummary(results, content, editor.document.getText(), editor.document.uri);
  await vscode.commands.executeCommand(
    "vscode.diff",
    virtualUri,
    editor.document.uri,
    `${editor.document.fileName.split(/[/\\]/).pop()} @ ${ref} <-> working tree`,
  );
}
