import * as vscode from "vscode";

/**
 * Write operations (applying a format, editing the project dictionary) are
 * disabled in untrusted workspaces, matching the `limited` capability declared
 * in package.json and the write-tool descriptors in @ctr/core.
 */
export function isWriteAllowed(): boolean {
  return vscode.workspace.isTrusted;
}

/** Show a consistent message when a write is blocked by Workspace Trust. */
export function warnUntrusted(action: string): void {
  void vscode.window.showWarningMessage(
    `Code Trio: ${action} is disabled in this untrusted workspace. Trust the folder to enable it.`,
  );
}

/** Resolve the workspace folder root for a resource, if any. */
export function workspaceRootFor(uri: vscode.Uri): string | undefined {
  return vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath;
}
