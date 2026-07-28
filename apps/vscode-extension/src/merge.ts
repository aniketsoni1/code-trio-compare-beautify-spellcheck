import { readFileSync } from "node:fs";
import * as vscode from "vscode";
import type { MergeChoice, MergeRegion, MergeResult } from "@ctr/core";
import { conflictStages, runThreeWayMerge } from "@ctr/agent";
import { resolveMerge } from "@ctr/diff-engine";
import { summarizeMerge } from "@ctr/reporting";
import { getConfig } from "./config";
import type { ResultsProvider } from "./panel";
import { isWriteAllowed, warnUntrusted } from "./trust";
import type { VirtualDocProvider } from "./virtualDocs";

/**
 * Three-way merge in the editor.
 *
 * This deliberately does not reimplement a merge editor. VS Code ships one,
 * and the brief is explicit that native APIs are preferred where they are more
 * reliable than a custom webview. What Code Trio adds is the part VS Code does
 * not do: navigating conflicts produced by *our* diff3 engine, resolving them
 * in bulk, and previewing the result before anything is written.
 */

/** Per-editor merge state, so navigation and resolution survive between commands. */
interface MergeSession {
  readonly uri: vscode.Uri;
  readonly result: MergeResult;
  readonly resolutions: Map<string, MergeChoice>;
  cursor: number;
  readonly labels: { base: string; ours: string; theirs: string };
}

export class MergeManager implements vscode.Disposable {
  private session: MergeSession | undefined;

  constructor(
    private readonly results: ResultsProvider,
    private readonly virtualDocs: VirtualDocProvider,
  ) {}

  /** Start a merge from git's conflict stages for the active file. */
  async startFromGit(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.uri.scheme !== "file") {
      void vscode.window.showInformationMessage(
        "Code Trio: open a conflicted file on disk to start a merge.",
      );
      return;
    }
    const uri = editor.document.uri;
    const folder = vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath;
    const stages = conflictStages(uri.fsPath, folder);
    if (!stages) {
      void vscode.window.showWarningMessage(
        "Code Trio: this file is not conflicted in git. Use 'Merge Three Files...' to pick base, ours and theirs manually.",
      );
      return;
    }
    const name = uri.path.split("/").pop() ?? "file";
    await this.begin(uri, stages.base, stages.ours, stages.theirs, {
      base: `${name} (ancestor)`,
      ours: `${name} (ours)`,
      theirs: `${name} (theirs)`,
    });
  }

  /** Start a merge from three files chosen by the user. */
  async startFromFiles(): Promise<void> {
    const pick = async (label: string): Promise<vscode.Uri | undefined> => {
      const chosen = await vscode.window.showOpenDialog({
        canSelectMany: false,
        openLabel: `Use as ${label}`,
        title: `Code Trio merge: select the ${label} file`,
      });
      return chosen?.[0];
    };

    const base = await pick("base (common ancestor)");
    if (!base) return;
    const ours = await pick("ours");
    if (!ours) return;
    const theirs = await pick("theirs");
    if (!theirs) return;

    try {
      await this.begin(
        ours,
        readFileSync(base.fsPath, "utf8"),
        readFileSync(ours.fsPath, "utf8"),
        readFileSync(theirs.fsPath, "utf8"),
        {
          base: base.path.split("/").pop() ?? "base",
          ours: ours.path.split("/").pop() ?? "ours",
          theirs: theirs.path.split("/").pop() ?? "theirs",
        },
      );
    } catch (err) {
      void vscode.window.showErrorMessage(
        `Code Trio: could not read one of the merge inputs - ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async begin(
    uri: vscode.Uri,
    base: string,
    ours: string,
    theirs: string,
    labels: { base: string; ours: string; theirs: string },
  ): Promise<void> {
    const config = getConfig(uri);
    const result = runThreeWayMerge(base, ours, theirs, config);
    this.session = { uri, result, resolutions: new Map(), cursor: -1, labels };
    this.results.update({ lastMerge: summarizeMerge(result) });

    if (result.clean) {
      const choice = await vscode.window.showInformationMessage(
        `Code Trio: clean merge, no conflicts (${result.regions.length} region(s)).`,
        "Preview Result",
      );
      if (choice === "Preview Result") await this.preview();
      return;
    }

    void vscode.window.showWarningMessage(
      `Code Trio: ${result.conflictCount} conflict(s). Use "Next Conflict" to review them.`,
    );
    await this.nextConflict();
  }

  private requireSession(): MergeSession | undefined {
    if (!this.session) {
      void vscode.window.showInformationMessage(
        "Code Trio: no merge in progress. Run 'Merge Conflicted File (Git)' or 'Merge Three Files...' first.",
      );
      return undefined;
    }
    return this.session;
  }

  /** Move to the next unresolved conflict, wrapping at the end. */
  async nextConflict(): Promise<void> {
    await this.move(1);
  }

  async previousConflict(): Promise<void> {
    await this.move(-1);
  }

  private async move(delta: number): Promise<void> {
    const session = this.requireSession();
    if (!session) return;
    const ids = session.result.conflictIds;
    if (ids.length === 0) {
      void vscode.window.showInformationMessage("Code Trio: this merge has no conflicts.");
      return;
    }
    session.cursor = (session.cursor + delta + ids.length) % ids.length;
    await this.showCurrent();
  }

  private async showCurrent(): Promise<void> {
    const session = this.requireSession();
    if (!session) return;
    const id = session.result.conflictIds[session.cursor];
    const region = session.result.regions.find((r) => r.id === id);
    if (!region) return;

    const resolved = session.resolutions.get(region.id);
    const position = `${session.cursor + 1}/${session.result.conflictCount}`;
    const status = resolved ? `resolved: ${resolved}` : "unresolved";

    // A quick pick rather than a webview: it is keyboard-native, screen-reader
    // friendly, and themed correctly with no work on our part.
    const items: (vscode.QuickPickItem & { choice?: MergeChoice | "view" })[] = [
      {
        label: "$(check) Accept ours",
        detail: preview(region.ourLines),
        choice: "ours",
      },
      {
        label: "$(check) Accept theirs",
        detail: preview(region.theirLines),
        choice: "theirs",
      },
      {
        label: "$(fold) Accept both — ours first",
        detail: preview([...region.ourLines, ...region.theirLines]),
        choice: "both-ours-first",
      },
      {
        label: "$(fold) Accept both — theirs first",
        detail: preview([...region.theirLines, ...region.ourLines]),
        choice: "both-theirs-first",
      },
      {
        label: "$(history) Revert to base",
        detail: preview(region.baseLines),
        choice: "base",
      },
      { label: "", kind: vscode.QuickPickItemKind.Separator },
      { label: "$(diff) Open three-way preview in editors", choice: "view" },
    ];

    const picked = await vscode.window.showQuickPick(items, {
      title: `Conflict ${position} — ${status}`,
      placeHolder: `Region ${region.id}${region.spans ? `, base lines ${region.spans.base.start + 1}-${region.spans.base.end}` : ""}`,
      matchOnDetail: true,
    });
    if (!picked?.choice) return;

    if (picked.choice === "view") {
      await this.openRegionDiff(region);
      return;
    }
    session.resolutions.set(region.id, picked.choice);
    const remaining = session.result.conflictIds.filter(
      (cid) => !session.resolutions.has(cid),
    ).length;
    this.results.update({
      lastMerge: `${session.result.conflictCount - remaining}/${session.result.conflictCount} conflicts resolved`,
    });
    if (remaining === 0) {
      const next = await vscode.window.showInformationMessage(
        "Code Trio: all conflicts resolved.",
        "Preview Result",
        "Save As...",
      );
      if (next === "Preview Result") await this.preview();
      else if (next === "Save As...") await this.save();
    } else {
      await this.nextConflict();
    }
  }

  /** Open ours and theirs for one region side by side in a native diff. */
  private async openRegionDiff(region: MergeRegion): Promise<void> {
    const session = this.requireSession();
    if (!session) return;
    const ours = this.virtualDocs.set(
      `${region.id}-ours`,
      region.ourLines.join("\n"),
    );
    const theirs = this.virtualDocs.set(
      `${region.id}-theirs`,
      region.theirLines.join("\n"),
    );
    await vscode.commands.executeCommand(
      "vscode.diff",
      ours,
      theirs,
      `${region.id}: ${session.labels.ours} ↔ ${session.labels.theirs}`,
    );
  }

  /** Show the merged result as a read-only preview, without writing anything. */
  async preview(): Promise<void> {
    const session = this.requireSession();
    if (!session) return;
    const out = this.resolveCurrent(session);
    const doc = await vscode.workspace.openTextDocument(
      this.virtualDocs.set("merged-preview", out.text),
    );
    await vscode.window.showTextDocument(doc, { preview: true });
    if (!out.fullyResolved) {
      void vscode.window.showWarningMessage(
        `Code Trio: preview contains conflict markers for ${out.unresolvedIds.length} unresolved conflict(s).`,
      );
    }
  }

  /**
   * Write the merged result.
   *
   * Saves to a new file by default and requires an explicit confirmation to
   * overwrite, per the brief. Refuses outright while conflicts remain, because
   * a file containing conflict markers looks merged and is not.
   */
  async save(): Promise<void> {
    const session = this.requireSession();
    if (!session) return;
    if (!isWriteAllowed()) {
      warnUntrusted("saving a merged file");
      return;
    }
    const out = this.resolveCurrent(session);
    if (!out.fullyResolved) {
      void vscode.window.showErrorMessage(
        `Code Trio: ${out.unresolvedIds.length} conflict(s) are still unresolved. Resolve them before saving.`,
      );
      return;
    }

    const suggested = session.uri.with({ path: `${session.uri.path}.merged` });
    const target = await vscode.window.showSaveDialog({
      defaultUri: suggested,
      title: "Save merged result",
      saveLabel: "Save Merged",
    });
    if (!target) return;

    // showSaveDialog already confirms an overwrite, so a second prompt would
    // only be noise -- except when the target is the original, which is the one
    // case worth calling out explicitly.
    if (target.toString() === session.uri.toString()) {
      const confirm = await vscode.window.showWarningMessage(
        `Overwrite the original ${session.uri.path.split("/").pop()} with the merged result?`,
        { modal: true },
        "Overwrite",
      );
      if (confirm !== "Overwrite") return;
    }

    await vscode.workspace.fs.writeFile(target, Buffer.from(out.text, "utf8"));
    this.results.update({ lastMerge: `saved ${target.path.split("/").pop()}` });
    void vscode.window.showInformationMessage(
      `Code Trio: merged result written to ${target.path.split("/").pop()}. Git staging is unchanged.`,
    );
  }

  private resolveCurrent(session: MergeSession): ReturnType<typeof resolveMerge> {
    return resolveMerge(
      session.result,
      [...session.resolutions].map(([regionId, choice]) => ({ regionId, choice })),
      {
        labels: session.labels,
        unresolved: "markers",
        diff3: true,
      },
    );
  }

  dispose(): void {
    this.session = undefined;
  }
}

/** A short, single-line preview of a region side for a quick-pick detail row. */
function preview(lines: readonly string[]): string {
  if (lines.length === 0) return "(empty)";
  const first = (lines[0] ?? "").trim();
  const suffix = lines.length > 1 ? ` … +${lines.length - 1} more line(s)` : "";
  return `${first.slice(0, 80)}${first.length > 80 ? "…" : ""}${suffix}`;
}
