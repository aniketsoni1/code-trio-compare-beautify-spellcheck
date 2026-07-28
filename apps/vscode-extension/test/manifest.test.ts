import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Manifest/implementation drift guards.
 *
 * A command contributed in package.json with no registered handler appears in
 * the Command Palette and fails when invoked. A registered handler missing from
 * package.json is unreachable. Both are silent failures that no other test
 * catches, and both are explicitly called out in the release checklist, so they
 * are asserted here rather than left to a manual review.
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

interface Manifest {
  readonly contributes: {
    readonly commands: { command: string; title: string; category?: string }[];
    readonly menus: Record<string, { command?: string; submenu?: string; when?: string }[]>;
    readonly keybindings: { command: string; key: string }[];
    readonly configuration: { properties: Record<string, { scope?: string }> };
  };
  readonly activationEvents: string[];
  readonly capabilities: Record<string, { supported: string }>;
  readonly main: string;
}

const manifest = JSON.parse(
  readFileSync(resolve(root, "package.json"), "utf8"),
) as Manifest;
const extensionSource = readFileSync(resolve(root, "src/extension.ts"), "utf8");

/** Command ids registered in the `commands` map in extension.ts. */
function registeredCommands(): string[] {
  const ids = new Set<string>();
  for (const match of extensionSource.matchAll(/"(codeTrio\.[A-Za-z0-9]+)":/g)) {
    ids.add(match[1] as string);
  }
  return [...ids];
}

describe("command manifest", () => {
  it("registers a handler for every contributed command", () => {
    const registered = new Set(registeredCommands());
    const missing = manifest.contributes.commands
      .map((c) => c.command)
      .filter((id) => !registered.has(id));
    expect(missing, `contributed but never registered: ${missing.join(", ")}`).toEqual([]);
  });

  it("contributes every registered command", () => {
    const contributed = new Set(manifest.contributes.commands.map((c) => c.command));
    const missing = registeredCommands().filter((id) => !contributed.has(id));
    expect(missing, `registered but not in package.json: ${missing.join(", ")}`).toEqual([]);
  });

  it("gives every command a title and the Code Trio category", () => {
    for (const c of manifest.contributes.commands) {
      expect(c.title.length, c.command).toBeGreaterThan(0);
      expect(c.category, c.command).toBe("Code Trio");
    }
  });

  it("has no duplicate command ids", () => {
    const ids = manifest.contributes.commands.map((c) => c.command);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("only references known commands from menus and keybindings", () => {
    const contributed = new Set(manifest.contributes.commands.map((c) => c.command));
    for (const [menu, entries] of Object.entries(manifest.contributes.menus)) {
      for (const entry of entries) {
        if (entry.command) {
          expect(contributed.has(entry.command), `${menu} -> ${entry.command}`).toBe(true);
        }
      }
    }
    for (const kb of manifest.contributes.keybindings) {
      expect(contributed.has(kb.command), `keybinding -> ${kb.command}`).toBe(true);
    }
  });

  it("has no duplicate keybindings", () => {
    const keys = manifest.contributes.keybindings.map((k) => `${k.key}`);
    expect(new Set(keys).size, `duplicate keys: ${keys.join(", ")}`).toBe(keys.length);
  });
});

describe("configuration manifest", () => {
  it("scopes every setting to a resource so multi-root folders work", () => {
    for (const [key, value] of Object.entries(manifest.contributes.configuration.properties)) {
      expect(value.scope, key).toBe("resource");
    }
  });

  it("namespaces every setting under codeTrio", () => {
    for (const key of Object.keys(manifest.contributes.configuration.properties)) {
      expect(key.startsWith("codeTrio.")).toBe(true);
    }
  });
});

describe("privacy and trust declarations", () => {
  it("keeps the limited untrusted-workspace capability", () => {
    expect(manifest.capabilities.untrustedWorkspaces?.supported).toBe("limited");
  });

  it("contributes no telemetry settings or opt-in prompts", () => {
    // Checked against contribution points rather than the whole manifest: the
    // description legitimately contains the phrase "no telemetry", and a naive
    // substring search would fail on the very claim it is meant to protect.
    const settingKeys = Object.keys(manifest.contributes.configuration.properties);
    for (const key of settingKeys) {
      expect(key.toLowerCase()).not.toContain("telemetry");
      expect(key.toLowerCase()).not.toContain("analytics");
    }
    const commandIds = manifest.contributes.commands.map((c) => c.command.toLowerCase());
    for (const id of commandIds) {
      expect(id).not.toContain("telemetry");
      expect(id).not.toContain("analytics");
    }
    // VS Code's own telemetry contribution point must be absent entirely.
    expect(
      (manifest.contributes as Record<string, unknown>).telemetry,
    ).toBeUndefined();
  });

  it("keeps the extension activation lazy", () => {
    // A wildcard activation event would start Code Trio in every window,
    // including windows where it is never used.
    expect(manifest.activationEvents).not.toContain("*");
    expect(manifest.activationEvents.length).toBeGreaterThan(0);
  });

  it("points main at the bundled output", () => {
    expect(manifest.main).toBe("./out/extension.cjs");
  });
});
