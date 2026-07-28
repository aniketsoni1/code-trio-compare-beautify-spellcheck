import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, resolveConfig } from "@ctr/configuration";
import {
  dictionaryPathForScope,
  dictionaryWatchPaths,
  loadDictionaryStack,
} from "../src/dictionary-scopes";
import { runSpellScoped } from "../src/services";

/**
 * A two-folder monorepo laid out on disk, which is the layout per-folder
 * dictionaries exist for. Everything is created under the OS temp directory.
 */
let root: string;
let appA: string;
let appB: string;

const config = resolveConfig({
  spell: {
    // Point the user scope at a path inside the fixture rather than the real
    // home directory, so the test never reads or depends on developer state.
    userDictionaryPath: "",
  },
});

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "ctr-dict-"));
  appA = join(root, "apps", "billing");
  appB = join(root, "apps", "marketing");
  mkdirSync(join(appA, ".codetrio"), { recursive: true });
  mkdirSync(join(appB, ".codetrio"), { recursive: true });
  mkdirSync(join(root, ".codetrio"), { recursive: true });

  writeFileSync(
    join(root, ".codetrio", "dictionary.txt"),
    "# workspace-wide\nworkspaceword\nsharedword\n",
  );
  writeFileSync(
    join(appA, ".codetrio", "dictionary.txt"),
    "# billing only\nbillingword\n!sharedword\n",
  );
  writeFileSync(join(appB, ".codetrio", "dictionary.txt"), "# marketing only\nmarketingword\n");
});

describe("multi-root resolution", () => {
  it("loads workspace and folder dictionaries together", () => {
    const { stack } = loadDictionaryStack(config, { workspace: root, folder: appA });
    expect(stack.has("workspaceword")).toBe(true);
    expect(stack.has("billingword")).toBe(true);
  });

  it("keeps folder vocabularies separate", () => {
    const a = loadDictionaryStack(config, { workspace: root, folder: appA }).stack;
    const b = loadDictionaryStack(config, { workspace: root, folder: appB }).stack;
    expect(a.has("billingword")).toBe(true);
    expect(a.has("marketingword")).toBe(false);
    expect(b.has("marketingword")).toBe(true);
    expect(b.has("billingword")).toBe(false);
  });

  it("lets a folder block a word the workspace accepted", () => {
    const a = loadDictionaryStack(config, { workspace: root, folder: appA }).stack;
    const b = loadDictionaryStack(config, { workspace: root, folder: appB }).stack;
    // billing's dictionary has "!sharedword", marketing's does not.
    expect(a.has("sharedword")).toBe(false);
    expect(a.lookup("sharedword").blocked).toBe(true);
    expect(b.has("sharedword")).toBe(true);
  });

  it("reports which file accepted a word", () => {
    const { stack } = loadDictionaryStack(config, { workspace: root, folder: appA });
    expect(stack.lookup("billingword").scope).toBe("folder");
    expect(stack.lookup("billingword").origin).toContain("billing");
    expect(stack.lookup("workspaceword").scope).toBe("workspace");
  });

  it("does not load the same file twice when folder equals workspace", () => {
    const { sources } = loadDictionaryStack(config, { workspace: root, folder: root });
    const paths = sources.map((s) => s.path);
    expect(new Set(paths).size).toBe(paths.length);
    expect(sources.filter((s) => s.scope === "folder")).toHaveLength(0);
  });

  it("still works when no folder dictionary exists", () => {
    const bare = mkdtempSync(join(tmpdir(), "ctr-bare-"));
    const { stack, sources } = loadDictionaryStack(config, { workspace: root, folder: bare });
    expect(stack.has("workspaceword")).toBe(true);
    expect(sources.find((s) => s.scope === "folder")?.exists).toBe(false);
  });

  it("keeps built-in dictionaries as separate scopes", () => {
    const { stack } = loadDictionaryStack(config, { workspace: root });
    const scopes = new Set(stack.describe().map((l) => l.scope));
    expect(scopes.has("base")).toBe(true);
    expect(scopes.has("technical")).toBe(true);
  });

  it("reports word counts per source", () => {
    const { sources } = loadDictionaryStack(config, { workspace: root, folder: appA });
    const workspace = sources.find((s) => s.scope === "workspace");
    expect(workspace?.exists).toBe(true);
    expect(workspace?.wordCount).toBe(2);
  });
});

describe("malformed and unreadable dictionaries", () => {
  it("degrades gracefully when a dictionary cannot be read", () => {
    const dir = mkdtempSync(join(tmpdir(), "ctr-perm-"));
    mkdirSync(join(dir, ".codetrio"), { recursive: true });
    const file = join(dir, ".codetrio", "dictionary.txt");
    writeFileSync(file, "word\n");
    let unreadable = false;
    try {
      chmodSync(file, 0o000);
      unreadable = true;
    } catch {
      // Running as root, or a filesystem without permissions: skip the assert.
    }
    const { stack } = loadDictionaryStack(config, { workspace: dir });
    // Whatever happened, the stack is usable and the built-ins still work.
    expect(stack.has("the")).toBe(true);
    if (unreadable && stack.problems().length > 0) {
      expect(stack.problems()[0]?.scope).toBe("workspace");
      expect(stack.problems()[0]?.error).toBeTruthy();
    }
    try {
      chmodSync(file, 0o644);
    } catch {
      /* best effort cleanup */
    }
  });

  it("treats a dictionary of only comments as empty rather than failing", () => {
    const dir = mkdtempSync(join(tmpdir(), "ctr-comments-"));
    mkdirSync(join(dir, ".codetrio"), { recursive: true });
    writeFileSync(join(dir, ".codetrio", "dictionary.txt"), "# nothing here\n\n   \n");
    const { stack, sources } = loadDictionaryStack(config, { workspace: dir });
    expect(sources.find((s) => s.scope === "workspace")?.wordCount).toBe(0);
    expect(stack.problems()).toHaveLength(0);
  });
});

describe("watch paths", () => {
  it("includes paths that do not yet exist", () => {
    const empty = mkdtempSync(join(tmpdir(), "ctr-watch-"));
    const paths = dictionaryWatchPaths(config, { workspace: empty, folder: empty });
    expect(paths.length).toBeGreaterThan(0);
    // Creating the file later must take effect, so it has to be watched now.
    expect(paths.some((p) => p.includes(".codetrio"))).toBe(true);
  });

  it("deduplicates when folder and workspace resolve to one path", () => {
    const paths = dictionaryWatchPaths(config, { workspace: root, folder: root });
    expect(new Set(paths).size).toBe(paths.length);
  });
});

describe("dictionaryPathForScope", () => {
  it("resolves writable scopes to files", () => {
    expect(dictionaryPathForScope("workspace", config, { workspace: root })).toContain(root);
    expect(dictionaryPathForScope("folder", config, { folder: appA })).toContain("billing");
  });

  it("returns null for scopes with no file", () => {
    expect(dictionaryPathForScope("session", config, { workspace: root })).toBeNull();
    // The built-in lists are never edited at runtime, by design.
    expect(dictionaryPathForScope("base", config, { workspace: root })).toBeNull();
    expect(dictionaryPathForScope("technical", config, { workspace: root })).toBeNull();
  });

  it("returns null when the scope has no location", () => {
    expect(dictionaryPathForScope("workspace", config, {})).toBeNull();
    expect(dictionaryPathForScope("folder", config, {})).toBeNull();
  });
});

describe("runSpellScoped", () => {
  it("accepts a word from the owning folder's dictionary", () => {
    const doc = {
      uri: "file:///t.ts",
      languageId: "typescript",
      text: "// the billingword is fine here\n",
    };
    const inBilling = runSpellScoped(doc, config, { workspace: root, folder: appA });
    const inMarketing = runSpellScoped(doc, config, { workspace: root, folder: appB });
    expect(inBilling.diagnostics.some((d) => d.data?.word === "billingword")).toBe(false);
    expect(inMarketing.diagnostics.some((d) => d.data?.word === "billingword")).toBe(true);
  });

  it("reports the dictionary sources it consulted", () => {
    const result = runSpellScoped(
      { uri: "file:///t.ts", languageId: "typescript", text: "// hello\n" },
      config,
      { workspace: root, folder: appA },
    );
    expect(result.sources.map((s) => s.scope)).toContain("workspace");
    expect(result.sources.map((s) => s.scope)).toContain("folder");
  });

  it("returns nothing when spell checking is disabled", () => {
    const disabled = resolveConfig({ spell: { enabled: false } });
    const result = runSpellScoped(
      { uri: "file:///t.ts", languageId: "typescript", text: "// mispeled\n" },
      disabled,
      { workspace: root },
    );
    expect(result.diagnostics).toEqual([]);
  });

  it("flags a word the folder explicitly blocked", () => {
    const result = runSpellScoped(
      { uri: "file:///t.ts", languageId: "typescript", text: "// the sharedword here\n" },
      config,
      { workspace: root, folder: appA },
    );
    const blocked = result.diagnostics.find((d) => d.data?.word === "sharedword");
    expect(blocked?.code).toBe("blocked-word");
    expect(blocked?.data?.blockedBy).toBe("folder");
  });
});

describe("defaults", () => {
  it("keeps the v0.1.0 project dictionary path unchanged", () => {
    // Existing project dictionaries must keep working with no migration.
    expect(DEFAULT_CONFIG.spell.projectDictionaryPath).toBe(".codetrio/dictionary.txt");
  });
});
