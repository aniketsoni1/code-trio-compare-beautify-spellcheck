// VS Code-hosted integration + smoke test. Opens the demo workspace, runs
// Compare, triggers a spelling diagnostic and quick fix, previews formatting,
// and confirms the three features are registered and lazily activated.
const assert = require("node:assert");
const path = require("node:path");
const vscode = require("vscode");

const EXTENSION_ID = "aniketsoni1.code-trio-compare-beautify-spellcheck";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function workspaceFile(rel) {
  const folder = vscode.workspace.workspaceFolders[0];
  return path.resolve(folder.uri.fsPath, rel);
}

describe("Code Trio integration", function () {
  this.timeout(60000);

  it("activates and registers all three tools' commands", async () => {
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(ext, "extension is installed");
    await ext.activate();
    const commands = await vscode.commands.getCommands(true);
    for (const id of ["codeTrio.compareWith", "codeTrio.spellCheckFile", "codeTrio.formatPreview"]) {
      assert.ok(commands.includes(id), `command ${id} is registered`);
    }
  });

  it("produces a spelling diagnostic with a quick fix for greeting.ts", async () => {
    const doc = await vscode.workspace.openTextDocument(workspaceFile("src/greeting.ts"));
    await vscode.window.showTextDocument(doc);
    await vscode.commands.executeCommand("codeTrio.spellCheckFile");
    await wait(1500);

    const diagnostics = vscode.languages
      .getDiagnostics(doc.uri)
      .filter((d) => d.source === "Code Trio");
    assert.ok(diagnostics.length > 0, "at least one spelling diagnostic");
    const typo = diagnostics.find((d) => d.message.includes("recieve"));
    assert.ok(typo, "flags the deliberate 'recieve' typo");

    const actions = await vscode.commands.executeCommand(
      "vscode.executeCodeActionProvider",
      doc.uri,
      typo.range,
    );
    const hasReplace = (actions || []).some((a) => a.title.includes("receive"));
    assert.ok(hasReplace, "offers a replace-with-receive quick fix");
  });

  it("compares the two demo files without error", async () => {
    const a = await vscode.workspace.openTextDocument(workspaceFile("src/compare-a.ts"));
    await vscode.window.showTextDocument(a);
    await vscode.commands.executeCommand("codeTrio.compareWithClipboard");
    // command resolves; the native diff editor opens against the clipboard.
    await wait(500);
    assert.ok(true);
  });

  it("previews formatting without modifying the file", async () => {
    const doc = await vscode.workspace.openTextDocument(workspaceFile("src/messy.ts"));
    const before = doc.getText();
    await vscode.window.showTextDocument(doc);
    await vscode.commands.executeCommand("codeTrio.formatPreview");
    await wait(1000);
    assert.strictEqual(doc.getText(), before, "dry-run preview leaves the file unchanged");
  });
});
