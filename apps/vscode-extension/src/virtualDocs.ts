import * as vscode from "vscode";

export const SCHEME = "codetrio";

/**
 * Serves read-only virtual documents (formatted previews, clipboard/git-ref
 * snapshots, merged output) used as one side of a native diff editor. Content
 * is keyed by the uri's `path`.
 */
export class VirtualDocProvider implements vscode.TextDocumentContentProvider {
  private readonly store = new Map<string, string>();
  private readonly emitter = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this.emitter.event;

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.store.get(uri.path) ?? "";
  }

  /** Build a codetrio: uri for a labeled snapshot and store its content. */
  set(label: string, content: string): vscode.Uri {
    const safe = label.replace(/[^A-Za-z0-9._-]/g, "_");
    const uri = vscode.Uri.from({ scheme: SCHEME, path: `/${Date.now()}-${safe}` });
    this.store.set(uri.path, content);
    this.emitter.fire(uri);
    return uri;
  }

  dispose(): void {
    this.emitter.dispose();
    this.store.clear();
  }
}
