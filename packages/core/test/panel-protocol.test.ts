import { describe, expect, it } from "vitest";
import {
  PanelStateSchema,
  countResults,
  emptyCounts,
  parseHostMessage,
  parseWebviewMessage,
} from "../src/panel-protocol";

/**
 * The webview is a separate JavaScript realm, so anything arriving from it is
 * untrusted input. These tests assert that the validator actually rejects the
 * shapes an attacker would send — not merely that valid messages pass.
 */

describe("parseWebviewMessage", () => {
  it("accepts every legitimate message", () => {
    const valid: unknown[] = [
      { type: "ready" },
      { type: "reveal", resultId: "spell-1" },
      { type: "copyResult", resultId: "spell-1" },
      { type: "copyReport", format: "markdown" },
      { type: "copyReport", format: "json" },
      { type: "export", format: "markdown" },
      { type: "clear" },
      { type: "clear", kind: "spell" },
      { type: "rerun" },
      { type: "persistView", tab: "all", sort: "severity", filter: "" },
      { type: "persistView", tab: "compare", sort: "file", filter: "todo" },
    ];
    for (const message of valid) {
      expect(parseWebviewMessage(message).ok, JSON.stringify(message)).toBe(true);
    }
  });

  it("rejects an unknown message type", () => {
    // The important negative case: there is no free-form command dispatch, so a
    // message inventing one must not be accepted.
    for (const message of [
      { type: "executeCommand", command: "workbench.action.terminal.new" },
      { type: "writeFile", path: "/etc/passwd", content: "x" },
      { type: "eval", code: "process.exit()" },
      { type: "" },
      { type: 42 },
    ]) {
      const result = parseWebviewMessage(message);
      expect(result.ok, JSON.stringify(message)).toBe(false);
    }
  });

  it("rejects a message missing its required fields", () => {
    expect(parseWebviewMessage({ type: "reveal" }).ok).toBe(false);
    expect(parseWebviewMessage({ type: "reveal", resultId: "" }).ok).toBe(false);
    expect(parseWebviewMessage({ type: "copyReport" }).ok).toBe(false);
    expect(parseWebviewMessage({ type: "copyReport", format: "pdf" }).ok).toBe(false);
  });

  it("rejects a clear for an unknown tool", () => {
    expect(parseWebviewMessage({ type: "clear", kind: "everything" }).ok).toBe(false);
  });

  it("rejects non-objects", () => {
    for (const message of [null, undefined, "reveal", 7, [], true]) {
      expect(parseWebviewMessage(message).ok).toBe(false);
    }
  });

  it("bounds the persisted filter string", () => {
    // An unbounded string here would be echoed into host state on every
    // keystroke; the cap keeps a hostile webview from growing it without limit.
    expect(
      parseWebviewMessage({
        type: "persistView",
        tab: "all",
        sort: "severity",
        filter: "x".repeat(201),
      }).ok,
    ).toBe(false);
    expect(
      parseWebviewMessage({
        type: "persistView",
        tab: "all",
        sort: "severity",
        filter: "x".repeat(200),
      }).ok,
    ).toBe(true);
  });

  it("returns a readable error rather than throwing", () => {
    const result = parseWebviewMessage({ type: "reveal" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.length).toBeGreaterThan(0);
  });

  it("does not let extra properties smuggle anything through", () => {
    // Extra keys are stripped by the schema, so a handler can never read one.
    const result = parseWebviewMessage({
      type: "reveal",
      resultId: "a",
      uri: "file:///etc/passwd",
      command: "rm -rf /",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.keys(result.message).sort()).toEqual(["resultId", "type"]);
    }
  });
});

describe("parseHostMessage", () => {
  it("accepts a well-formed state push", () => {
    const message = {
      type: "setState",
      state: {
        version: 1,
        tools: { spell: { status: "success", counts: emptyCounts() } },
        results: [],
        truncated: false,
      },
    };
    expect(parseHostMessage(message).ok).toBe(true);
  });

  it("rejects a state with the wrong version", () => {
    expect(
      parseHostMessage({
        type: "setState",
        state: { version: 2, tools: {}, results: [], truncated: false },
      }).ok,
    ).toBe(false);
  });
});

describe("PanelStateSchema", () => {
  it("defaults truncated to false", () => {
    const parsed = PanelStateSchema.parse({ version: 1, tools: {}, results: [] });
    expect(parsed.truncated).toBe(false);
  });

  it("rejects a result with a negative line number", () => {
    const state = {
      version: 1,
      tools: {},
      results: [{ id: "a", kind: "spell", severity: "error", message: "x", line: -1 }],
    };
    expect(PanelStateSchema.safeParse(state).success).toBe(false);
  });

  it("requires a non-empty result id", () => {
    const state = {
      version: 1,
      tools: {},
      results: [{ id: "", kind: "spell", severity: "error", message: "x" }],
    };
    expect(PanelStateSchema.safeParse(state).success).toBe(false);
  });
});

describe("countResults", () => {
  it("tallies by severity", () => {
    const counts = countResults([
      { id: "1", kind: "spell", severity: "error", message: "a" },
      { id: "2", kind: "spell", severity: "error", message: "b" },
      { id: "3", kind: "spell", severity: "warning", message: "c" },
      { id: "4", kind: "spell", severity: "hint", message: "d" },
    ]);
    expect(counts).toEqual({ error: 2, warning: 1, information: 0, hint: 1, total: 4 });
  });

  it("returns zeroes for an empty list", () => {
    expect(countResults([])).toEqual(emptyCounts());
  });
});
