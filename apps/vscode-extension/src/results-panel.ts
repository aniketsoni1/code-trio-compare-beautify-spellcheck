import { randomBytes } from "node:crypto";
import * as vscode from "vscode";
import type { PanelResult, PanelState, ResultKind, ToolState, WebviewToHost } from "@ctr/core";
import { countResults, emptyCounts, parseWebviewMessage } from "@ctr/core";
import { renderPanelJson, renderPanelMarkdown, renderPanelText, formatResultLine } from "@ctr/reporting";
import { panelHtml } from "./webview-html";

/**
 * The unified results panel, as a webview view.
 *
 * The v0.1.0 panel was a TreeDataProvider showing three static rows of summary
 * text, which is why the README's claim of a "strict webview CSP" described
 * something that did not exist. This is the real thing.
 *
 * Two rules govern the split:
 *
 *   1. No business logic in the webview. It filters, sorts and renders the
 *      state the host gives it. Every report is built in `@ctr/reporting`, so
 *      the panel's "Export as Markdown" and the CLI's `report` command produce
 *      identical bytes from identical code.
 *   2. Every inbound message is validated at runtime against a zod schema, not
 *      merely typed. A webview is a separate realm and its messages are
 *      untrusted input.
 */

/** What the host needs in order to re-run whatever produced the results. */
export interface RerunHandler {
  readonly label: string;
  run(): Promise<void> | void;
}

export class ResultsPanel implements vscode.WebviewViewProvider, vscode.Disposable {
  public static readonly viewType = "codeTrio.resultsView";

  private view: vscode.WebviewView | undefined;
  private readonly tools = new Map<ResultKind, ToolState>();
  private results: PanelResult[] = [];
  private truncated = false;
  private note: string | undefined;
  private rerun: RerunHandler | undefined;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      // No local resource roots beyond the extension itself. The panel loads no
      // images, fonts or stylesheets from disk, so this stays as tight as it
      // can be while still allowing the CSP's img-src/font-src source.
      localResourceRoots: [this.extensionUri],
    };
    // A fresh nonce per load. Reusing one across loads would let a value
    // captured from an earlier render authorise a later injected script.
    const nonce = randomBytes(16).toString("base64");
    view.webview.html = panelHtml(nonce, view.webview.cspSource);

    this.disposables.push(
      view.webview.onDidReceiveMessage((raw: unknown) => {
        const parsed = parseWebviewMessage(raw);
        if (!parsed.ok) {
          // Dropped rather than thrown: a malformed message must not take down
          // the handler and with it the whole panel.
          console.warn(`Code Trio: ignoring malformed webview message — ${parsed.error}`);
          return;
        }
        void this.handle(parsed.message);
      }),
      view.onDidChangeVisibility(() => {
        // The webview is torn down when hidden and rebuilt when shown; pushing
        // state on every visibility change is what makes it look preserved.
        if (view.visible) this.post();
      }),
    );

    this.post();
  }

  /** Replace one tool's state and results. */
  setTool(kind: ResultKind, tool: Omit<ToolState, "counts">, results: readonly PanelResult[] = []): void {
    this.results = this.results.filter((r) => r.kind !== kind).concat(results);
    this.tools.set(kind, { ...tool, counts: countResults(results) });
    this.post();
  }

  /** Update a tool's headline without touching its result rows. */
  setSummary(kind: ResultKind, summary: string, status: ToolState["status"] = "success"): void {
    const existing = this.tools.get(kind);
    this.tools.set(kind, {
      status,
      summary,
      counts: existing?.counts ?? emptyCounts(),
      ...(existing?.problem ? { problem: existing.problem } : {}),
    });
    this.post();
  }

  setTruncated(truncated: boolean): void {
    this.truncated = truncated;
    this.post();
  }

  setNote(note: string | undefined): void {
    this.note = note;
    this.post();
  }

  setRerun(handler: RerunHandler | undefined): void {
    this.rerun = handler;
    this.post();
  }

  clear(kind?: ResultKind): void {
    if (kind) {
      this.results = this.results.filter((r) => r.kind !== kind);
      this.tools.delete(kind);
    } else {
      this.results = [];
      this.tools.clear();
      this.truncated = false;
      this.note = undefined;
    }
    this.post();
  }

  /** Reveal the panel, focusing it. */
  async show(): Promise<void> {
    await vscode.commands.executeCommand(`${ResultsPanel.viewType}.focus`);
  }

  private snapshot(): PanelState {
    return {
      version: 1,
      tools: Object.fromEntries(this.tools) as PanelState["tools"],
      results: this.results,
      truncated: this.truncated,
      ...(this.note ? { note: this.note } : {}),
      ...(this.rerun ? { rerunLabel: this.rerun.label } : {}),
    };
  }

  private post(): void {
    // Posting to a hidden view is a no-op in VS Code, and the visibility
    // listener re-posts on show, so there is nothing to queue.
    this.view?.webview.postMessage({ type: "setState", state: this.snapshot() });
  }

  private find(resultId: string): PanelResult | undefined {
    return this.results.find((r) => r.id === resultId);
  }

  private async handle(message: WebviewToHost): Promise<void> {
    switch (message.type) {
      case "ready":
        this.post();
        return;

      case "reveal": {
        // The location comes from state the host already holds, keyed by id.
        // Trusting coordinates sent by the webview would let a forged message
        // open an arbitrary file at an arbitrary position.
        const result = this.find(message.resultId);
        if (!result?.uri) return;
        await this.revealResult(result);
        return;
      }

      case "copyResult": {
        const result = this.find(message.resultId);
        if (!result) return;
        await vscode.env.clipboard.writeText(formatResultLine(result));
        return;
      }

      case "copyReport": {
        const text =
          message.format === "json"
            ? renderPanelJson(this.snapshot())
            : renderPanelText(this.snapshot());
        await vscode.env.clipboard.writeText(text);
        void vscode.window.showInformationMessage("Code Trio: report copied to the clipboard.");
        return;
      }

      case "export":
        await this.export(message.format);
        return;

      case "clear":
        this.clear(message.kind);
        return;

      case "rerun": {
        if (!this.rerun) {
          void vscode.window.showInformationMessage("Code Trio: nothing to re-run yet.");
          return;
        }
        await this.rerun.run();
        return;
      }

      case "persistView":
        // Purely a UI preference; the webview already persisted it with
        // setState. Nothing to do host-side, but the message is accepted so the
        // contract stays symmetric and the schema documents what is sent.
        return;

      default:
        return;
    }
  }

  private async revealResult(result: PanelResult): Promise<void> {
    try {
      const uri = vscode.Uri.parse(result.uri as string, true);
      const document = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(document, { preview: true });
      if (result.line === undefined) return;
      const range = new vscode.Range(
        result.line,
        result.character ?? 0,
        result.endLine ?? result.line,
        result.endCharacter ?? (result.character ?? 0),
      );
      editor.selection = new vscode.Selection(range.start, range.end);
      editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    } catch (err) {
      void vscode.window.showWarningMessage(
        `Code Trio: could not open ${result.file ?? "the result"} — ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private async export(format: "markdown" | "json"): Promise<void> {
    const state = this.snapshot();
    const content = format === "json" ? renderPanelJson(state) : renderPanelMarkdown(state);
    const extension = format === "json" ? "json" : "md";
    const target = await vscode.window.showSaveDialog({
      title: "Export Code Trio report",
      saveLabel: "Export",
      filters: format === "json" ? { JSON: ["json"] } : { Markdown: ["md", "markdown"] },
      defaultUri: vscode.workspace.workspaceFolders?.[0]
        ? vscode.Uri.joinPath(
            vscode.workspace.workspaceFolders[0].uri,
            `code-trio-report.${extension}`,
          )
        : undefined,
    });
    if (!target) return;
    await vscode.workspace.fs.writeFile(target, Buffer.from(content, "utf8"));
    void vscode.window.showInformationMessage(
      `Code Trio: report written to ${target.path.split("/").pop()}.`,
    );
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables.length = 0;
    this.view = undefined;
  }
}
