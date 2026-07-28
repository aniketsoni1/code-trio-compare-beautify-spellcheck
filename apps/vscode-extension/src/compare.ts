import * as vscode from "vscode";
import type { DiffResult } from "@ctr/core";
import { languageFromPath } from "@ctr/core";
import { UnsafeGitRefError, gitShow, makeDocument, resolveRef, runCompare } from "@ctr/agent";
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

function baseName(uriOrPath: string): string {
  return uriOrPath.split(/[/\\]/).pop() ?? uriOrPath;
}

/**
 * Everything about a comparison, computed once and reported everywhere.
 *
 * The v0.1.0 code recomputed a summary with hardcoded "plaintext" documents and
 * default options, so the number shown in the results panel could disagree with
 * what the diff editor displayed. Threading one descriptor through fixes that
 * and gives the panel enough context to explain *how* the comparison was made,
 * not just what it found.
 */
export interface CompareDescriptor {
  readonly leftLabel: string;
  readonly rightLabel: string;
  readonly leftSource: string;
  readonly rightSource: string;
  readonly languageId: string;
  readonly result: DiffResult;
  readonly settings: string;
}

function describeSettings(uri: vscode.Uri): string {
  const c = getConfig(uri);
  const parts = [`granularity: ${c.diff.granularity}`, `context: ${c.diff.contextLines}`];
  if (c.diff.ignoreWhitespace) parts.push("ignoring whitespace");
  if (c.diff.ignoreCase) parts.push("ignoring case");
  if (c.diff.ignoreEol) parts.push("ignoring line endings");
  return parts.join(", ");
}

/**
 * Run the comparison and publish it to the results panel.
 *
 * Both sides are tagged with the real language id rather than "plaintext", so
 * word-granularity refinement behaves the same here as it does in the CLI.
 */
function report(
  results: ResultsProvider,
  uri: vscode.Uri,
  left: { label: string; source: string; text: string },
  right: { label: string; source: string; text: string },
  languageId: string,
): CompareDescriptor {
  const config = getConfig(uri);
  const result = runCompare(
    makeDocument(left.source, languageId, left.text),
    makeDocument(right.source, languageId, right.text),
    config,
  );
  const descriptor: CompareDescriptor = {
    leftLabel: left.label,
    rightLabel: right.label,
    leftSource: left.source,
    rightSource: right.source,
    languageId,
    result,
    settings: describeSettings(uri),
  };
  results.update({
    lastCompare: summarizeDiff(result),
    lastCompareDetail: `${left.label} ↔ ${right.label} (${descriptor.settings})`,
  });

  // Disclosures that would otherwise be invisible in a diff editor: a refused
  // comparison, or files that match apart from their line endings.
  if (result.truncation && result.hunks.length === 0) {
    void vscode.window.showWarningMessage(`Code Trio: ${result.truncation.message}`);
  } else if (result.eolOnlyDifference) {
    void vscode.window.showInformationMessage(
      `Code Trio: contents are identical; only the line endings differ (${result.eol?.a} vs ${result.eol?.b}).`,
    );
  }
  return descriptor;
}

/** Compare the active file against another file picked by the user. */
export async function compareWithFile(results: ResultsProvider): Promise<void> {
  const editor = activeEditor();
  if (!editor) return;
  const picks = await vscode.window.showOpenDialog({
    canSelectMany: false,
    openLabel: "Compare With Active File",
    title: "Code Trio: select the file to compare against",
  });
  const other = picks?.[0];
  if (!other) return;
  const otherDoc = await vscode.workspace.openTextDocument(other);
  report(
    results,
    editor.document.uri,
    { label: baseName(other.path), source: other.toString(), text: otherDoc.getText() },
    {
      label: baseName(editor.document.fileName),
      source: editor.document.uri.toString(),
      text: editor.document.getText(),
    },
    editor.document.languageId,
  );
  await vscode.commands.executeCommand(
    "vscode.diff",
    other,
    editor.document.uri,
    `${baseName(other.path)} ↔ ${baseName(editor.document.fileName)}`,
  );
}

/**
 * Compare two files selected in the Explorer.
 *
 * Explorer multi-select passes the clicked resource first and the full
 * selection second; when the menu is invoked from the command palette neither
 * is present, so the command falls back to the file picker.
 */
export async function compareSelected(
  results: ResultsProvider,
  _clicked: vscode.Uri | undefined,
  selection: vscode.Uri[] | undefined,
): Promise<void> {
  const chosen = (selection ?? []).filter((u) => u.scheme === "file");
  if (chosen.length !== 2) {
    void vscode.window.showInformationMessage(
      "Code Trio: select exactly two files in the Explorer to compare them.",
    );
    return;
  }
  const [left, right] = chosen as [vscode.Uri, vscode.Uri];
  const leftDoc = await vscode.workspace.openTextDocument(left);
  const rightDoc = await vscode.workspace.openTextDocument(right);
  report(
    results,
    right,
    { label: baseName(left.path), source: left.toString(), text: leftDoc.getText() },
    { label: baseName(right.path), source: right.toString(), text: rightDoc.getText() },
    rightDoc.languageId,
  );
  await vscode.commands.executeCommand(
    "vscode.diff",
    left,
    right,
    `${baseName(left.path)} ↔ ${baseName(right.path)}`,
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
  if (clip.length === 0) {
    void vscode.window.showInformationMessage("Code Trio: the clipboard is empty.");
    return;
  }
  const virtualUri = virtualDocs.set("clipboard", clip);
  report(
    results,
    editor.document.uri,
    { label: "Clipboard", source: "clipboard:", text: clip },
    {
      label: baseName(editor.document.fileName),
      source: editor.document.uri.toString(),
      text: editor.document.getText(),
    },
    editor.document.languageId,
  );
  await vscode.commands.executeCommand(
    "vscode.diff",
    virtualUri,
    editor.document.uri,
    `Clipboard ↔ ${baseName(editor.document.fileName)}`,
  );
}

/** Compare the current selection against the clipboard contents. */
export async function compareSelectionWithClipboard(
  results: ResultsProvider,
  virtualDocs: VirtualDocProvider,
): Promise<void> {
  const editor = activeEditor();
  if (!editor) return;
  if (editor.selection.isEmpty) {
    void vscode.window.showInformationMessage("Code Trio: select some text first.");
    return;
  }
  const selected = editor.document.getText(editor.selection);
  const clip = await vscode.env.clipboard.readText();
  const left = virtualDocs.set("clipboard", clip);
  const right = virtualDocs.set("selection", selected);
  report(
    results,
    editor.document.uri,
    { label: "Clipboard", source: "clipboard:", text: clip },
    { label: "Selection", source: "selection:", text: selected },
    editor.document.languageId,
  );
  await vscode.commands.executeCommand("vscode.diff", left, right, "Clipboard ↔ Selection");
}

/**
 * Compare an unsaved buffer against the version on disk.
 *
 * This is the "what have I actually changed since I last saved?" question, and
 * it works on a dirty buffer, which the git-ref comparison cannot answer.
 */
export async function compareWithSaved(
  results: ResultsProvider,
  virtualDocs: VirtualDocProvider,
): Promise<void> {
  const editor = activeEditor();
  if (!editor) return;
  const uri = editor.document.uri;
  if (uri.scheme !== "file") {
    void vscode.window.showInformationMessage("Code Trio: this needs a file on disk.");
    return;
  }
  if (!editor.document.isDirty) {
    void vscode.window.showInformationMessage(
      "Code Trio: this file has no unsaved changes.",
    );
    return;
  }
  let saved: string;
  try {
    saved = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString("utf8");
  } catch {
    void vscode.window.showWarningMessage("Code Trio: could not read the saved version.");
    return;
  }
  const savedUri = virtualDocs.set(`saved-${baseName(uri.path)}`, saved);
  report(
    results,
    uri,
    { label: `${baseName(uri.path)} (on disk)`, source: `saved:${uri.toString()}`, text: saved },
    {
      label: `${baseName(uri.path)} (editor)`,
      source: uri.toString(),
      text: editor.document.getText(),
    },
    editor.document.languageId,
  );
  await vscode.commands.executeCommand(
    "vscode.diff",
    savedUri,
    uri,
    `${baseName(uri.path)}: on disk ↔ unsaved`,
  );
}

/** Compare the active file at a git ref against the working copy. */
export async function compareWithGitRef(
  results: ResultsProvider,
  virtualDocs: VirtualDocProvider,
  presetRef?: string,
): Promise<void> {
  const editor = activeEditor();
  if (!editor) return;
  if (editor.document.uri.scheme !== "file") {
    void vscode.window.showInformationMessage("Code Trio: git compare needs a file on disk.");
    return;
  }

  const ref =
    presetRef ??
    (await vscode.window.showInputBox({
      prompt: "Compare against which git ref?",
      value: "HEAD",
      placeHolder: "HEAD, HEAD~1, main, a commit SHA, ...",
      // Validating as the user types beats failing after they press Enter.
      validateInput: (value) => {
        const trimmed = value.trim();
        if (trimmed.length === 0) return "Enter a git ref.";
        if (/^-/.test(trimmed)) return "A ref cannot begin with '-'.";
        if (/[\s~^:?*[\\]/.test(trimmed.replace(/[~^]\d*$/, ""))) {
          return "That contains characters git treats as special.";
        }
        return null;
      },
    }));
  if (!ref) return;

  const fsPath = editor.document.uri.fsPath;
  const root = vscode.workspace.getWorkspaceFolder(editor.document.uri)?.uri.fsPath;

  let content: string | null;
  try {
    content = gitShow(ref, fsPath, root);
  } catch (err) {
    if (err instanceof UnsafeGitRefError) {
      void vscode.window.showErrorMessage(`Code Trio: ${err.message}`);
      return;
    }
    throw err;
  }
  if (content === null) {
    void vscode.window.showWarningMessage(
      `Code Trio: could not read this file at "${ref}". Is it tracked at that revision?`,
    );
    return;
  }

  const sha = resolveRef(ref, root);
  const label = sha ? `${ref} (${sha.slice(0, 8)})` : ref;
  const virtualUri = virtualDocs.set(ref, content);
  report(
    results,
    editor.document.uri,
    { label, source: `git:${ref}:${fsPath}`, text: content },
    {
      label: "working tree",
      source: editor.document.uri.toString(),
      text: editor.document.getText(),
    },
    editor.document.languageId ||
      languageFromPath(fsPath).id,
  );
  await vscode.commands.executeCommand(
    "vscode.diff",
    virtualUri,
    editor.document.uri,
    `${baseName(editor.document.fileName)} @ ${label} ↔ working tree`,
  );
}

/** Compare against the previous revision (`HEAD~1`), without prompting. */
export function compareWithPreviousRevision(
  results: ResultsProvider,
  virtualDocs: VirtualDocProvider,
): Promise<void> {
  return compareWithGitRef(results, virtualDocs, "HEAD~1");
}
