import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import * as vscode from "vscode";
import type { DictionaryScope } from "@ctr/dictionaries";
import { SCOPE_LABELS } from "@ctr/dictionaries";
import {
  type DictionaryLocations,
  dictionaryPathForScope,
  dictionaryWatchPaths,
} from "@ctr/agent";
import { getConfig } from "./config";
import { isWriteAllowed, warnUntrusted } from "./trust";

/**
 * Dictionary scope resolution, file watching, and the add/remove actions.
 *
 * Kept separate from the diagnostics manager so that "which dictionary owns
 * this document?" and "the user edited a dictionary file" are one concern, and
 * diagnostics lifecycle is another.
 */

/** The workspace folder and workspace root that own a resource. */
export function locationsFor(uri: vscode.Uri): DictionaryLocations {
  const folder = vscode.workspace.getWorkspaceFolder(uri);
  const first = vscode.workspace.workspaceFolders?.[0];
  const locations: DictionaryLocations = {
    ...(folder ? { folder: folder.uri.fsPath } : {}),
    // In a single-root workspace, folder and workspace are the same path and
    // the agent collapses them into one layer. In a multi-root workspace the
    // first folder acts as the workspace root, matching how VS Code resolves
    // workspace-scoped settings.
    ...(first ? { workspace: first.uri.fsPath } : {}),
  };
  return locations;
}

/** Scopes a user can actually write to, in the order they should be offered. */
const WRITABLE_SCOPES: readonly DictionaryScope[] = ["session", "folder", "workspace", "user"];

/**
 * Watches every dictionary file that could affect the open workspace.
 *
 * Uses one watcher per distinct path rather than one per document, and
 * deduplicates by resolved path, because a multi-root workspace with five
 * folders sharing a workspace dictionary would otherwise register five watchers
 * on the same file and re-run diagnostics five times per edit.
 *
 * Non-existent paths are watched too: creating a dictionary file has to take
 * effect without a window reload.
 */
export class DictionaryWatcher implements vscode.Disposable {
  private readonly watchers = new Map<string, vscode.FileSystemWatcher>();
  private readonly emitter = new vscode.EventEmitter<string>();
  /** Fires with the path of a dictionary that changed. */
  readonly onDidChange = this.emitter.event;

  refresh(): void {
    const wanted = new Set<string>();
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      const config = getConfig(folder.uri);
      for (const path of dictionaryWatchPaths(config, locationsFor(folder.uri))) {
        wanted.add(path);
      }
    }

    // Dispose watchers whose path is no longer relevant, e.g. after a folder is
    // removed from the workspace or the configured path changes.
    for (const [path, watcher] of this.watchers) {
      if (!wanted.has(path)) {
        watcher.dispose();
        this.watchers.delete(path);
      }
    }

    for (const path of wanted) {
      if (this.watchers.has(path)) continue;
      // A glob on the containing directory rather than the file itself, so
      // creation of a not-yet-existing dictionary is observed.
      const pattern = new vscode.RelativePattern(
        vscode.Uri.file(dirname(path)),
        path.split(/[/\\]/).pop() ?? "*",
      );
      const watcher = vscode.workspace.createFileSystemWatcher(pattern);
      const fire = (): void => this.emitter.fire(path);
      watcher.onDidCreate(fire);
      watcher.onDidChange(fire);
      watcher.onDidDelete(fire);
      this.watchers.set(path, watcher);
    }
  }

  dispose(): void {
    for (const watcher of this.watchers.values()) watcher.dispose();
    this.watchers.clear();
    this.emitter.dispose();
  }
}

/** Ask the user which dictionary a word should go into. */
export async function pickScope(
  word: string,
  uri: vscode.Uri,
): Promise<DictionaryScope | undefined> {
  const config = getConfig(uri);
  const locations = locationsFor(uri);

  const items: (vscode.QuickPickItem & { scope: DictionaryScope })[] = [];
  for (const scope of WRITABLE_SCOPES) {
    if (scope === "session") {
      items.push({
        label: `$(clock) ${SCOPE_LABELS.session}`,
        detail: "Nothing is written to disk.",
        scope,
      });
      continue;
    }
    const path = dictionaryPathForScope(scope, config, locations);
    if (!path) continue;
    // Folder and workspace can resolve to the same file in a single-root
    // workspace; offering both would be a distinction without a difference.
    if (items.some((i) => i.detail === path)) continue;
    items.push({
      label: `$(book) ${SCOPE_LABELS[scope]}`,
      detail: path,
      description: existsSync(path) ? undefined : "will be created",
      scope,
    });
  }

  const picked = await vscode.window.showQuickPick(items, {
    title: `Add "${word}" to which dictionary?`,
    placeHolder: "More specific scopes take precedence over less specific ones.",
  });
  return picked?.scope;
}

export interface AddResult {
  readonly added: boolean;
  readonly scope: DictionaryScope;
  readonly path?: string;
  readonly reason?: string;
}

const HEADER =
  "# Code Trio dictionary. One word per line; '#' starts a comment.\n" +
  "# Prefix a line with '!' to reject a word that a broader dictionary accepts.\n";

/**
 * Append a word to the dictionary file for a scope. WRITE operation.
 *
 * Idempotent, and blocked in untrusted workspaces along with every other write.
 */
export function addWordToScope(
  word: string,
  scope: DictionaryScope,
  uri: vscode.Uri,
): AddResult {
  const normalized = word.trim().toLowerCase();
  if (!normalized) return { added: false, scope, reason: "empty word" };
  if (scope === "session") return { added: true, scope };

  if (!isWriteAllowed()) {
    warnUntrusted("writing to a dictionary");
    return { added: false, scope, reason: "untrusted workspace" };
  }

  const config = getConfig(uri);
  const path = dictionaryPathForScope(scope, config, locationsFor(uri));
  if (!path) {
    return { added: false, scope, reason: "no dictionary file for this scope" };
  }

  try {
    if (!existsSync(path)) {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, HEADER);
    }
    const current = readFileSync(path, "utf8");
    const already = current
      .split(/\r?\n/)
      .map((l) => l.trim().toLowerCase())
      .includes(normalized);
    if (already) return { added: false, scope, path, reason: "already present" };

    // Append rather than rewrite: the file is often checked in and hand-edited,
    // and rewriting it would reorder or reformat a teammate's work.
    const needsNewline = current.length > 0 && !current.endsWith("\n");
    appendFileSync(path, `${needsNewline ? "\n" : ""}${normalized}\n`);
    return { added: true, scope, path };
  } catch (err) {
    return {
      added: false,
      scope,
      path,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Remove a word from a dictionary file. WRITE operation.
 *
 * Rewrites the file without the matching line, preserving comments, blank lines
 * and the order of everything else, so removing one word does not produce a
 * large diff in a checked-in file.
 */
export function removeWordFromScope(
  word: string,
  scope: DictionaryScope,
  uri: vscode.Uri,
): AddResult {
  const normalized = word.trim().toLowerCase();
  if (!isWriteAllowed()) {
    warnUntrusted("editing a dictionary");
    return { added: false, scope, reason: "untrusted workspace" };
  }
  const config = getConfig(uri);
  const path = dictionaryPathForScope(scope, config, locationsFor(uri));
  if (!path || !existsSync(path)) {
    return { added: false, scope, reason: "dictionary file not found" };
  }
  try {
    const lines = readFileSync(path, "utf8").split(/\r?\n/);
    const kept = lines.filter((line) => {
      const trimmed = line.trim().toLowerCase();
      return trimmed !== normalized && trimmed !== `!${normalized}`;
    });
    if (kept.length === lines.length) {
      return { added: false, scope, path, reason: "word not present" };
    }
    writeFileSync(path, kept.join("\n"));
    return { added: true, scope, path };
  } catch (err) {
    return {
      added: false,
      scope,
      path,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Open a dictionary file in the editor, creating it if the user agrees. */
export async function openDictionary(
  scope: DictionaryScope,
  uri: vscode.Uri,
): Promise<void> {
  const config = getConfig(uri);
  const path = dictionaryPathForScope(scope, config, locationsFor(uri));
  if (!path) {
    void vscode.window.showInformationMessage(
      `Code Trio: the ${SCOPE_LABELS[scope]} has no file to open.`,
    );
    return;
  }
  if (!existsSync(path)) {
    const create = await vscode.window.showInformationMessage(
      `${path} does not exist yet.`,
      "Create It",
    );
    if (create !== "Create It") return;
    if (!isWriteAllowed()) {
      warnUntrusted("creating a dictionary");
      return;
    }
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, HEADER);
  }
  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(path));
  await vscode.window.showTextDocument(doc);
}
