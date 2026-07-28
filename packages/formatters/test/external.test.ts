import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { Document, FormatOptions, FormatterCapabilities } from "@ctr/core";
import { AdapterRegistry } from "@ctr/format-engine";
import { ExternalFormatterAdapter } from "../src/external";
import { PrettierAdapter } from "../src/prettier";
import { WhitespaceAdapter } from "../src/whitespace";
import { GofmtAdapterFixed, RuffAdapter, RustfmtAdapter } from "../src/adapters";
import { defaultAdapters } from "../src";

const posix = process.platform !== "win32";
let dir: string;
let good: string;
let broken: string;
let empty: string;

/** A concrete adapter over the mock formatter, so the base class is exercised. */
class MockAdapter extends ExternalFormatterAdapter {
  protected readonly executableName = "mock-formatter";
  protected readonly versionArgs = ["--version"];
  readonly capabilities: FormatterCapabilities = {
    id: "mock",
    displayName: "Mock formatter",
    languages: ["mocklang"],
    bundled: false,
    rangeFormatting: false,
    needsFilePath: false,
    configDiscovery: false,
    cancellable: true,
  };
  protected formatArgs(_doc: Document, _options?: FormatOptions): readonly string[] {
    return [];
  }
}

const doc = (text: string): Document => ({ uri: "file:///t", languageId: "mocklang", text });

beforeAll(() => {
  if (!posix) return;
  dir = mkdtempSync(join(tmpdir(), "ctr-ext-"));

  good = join(dir, "good");
  writeFileSync(
    good,
    [
      "#!/bin/sh",
      '[ "$1" = "--version" ] && { echo "mockfmt 4.5.6"; exit 0; }',
      "tr '[:lower:]' '[:upper:]'",
    ].join("\n"),
  );
  chmodSync(good, 0o755);

  broken = join(dir, "broken");
  writeFileSync(
    broken,
    ["#!/bin/sh", 'echo "cannot parse line 7" >&2', "exit 3"].join("\n"),
  );
  chmodSync(broken, 0o755);

  empty = join(dir, "empty");
  writeFileSync(
    empty,
    ["#!/bin/sh", '[ "$1" = "--version" ] && { echo "empty 1.0.0"; exit 0; }', "exit 0"].join("\n"),
  );
  chmodSync(empty, 0o755);
});

describe("external adapter lifecycle", () => {
  it("probes a working formatter and reports version, path and source", async () => {
    if (!posix) return;
    const adapter = new MockAdapter({ executablePath: good });
    const probe = await adapter.probe();
    expect(probe.available).toBe(true);
    expect(probe.version).toBe("4.5.6");
    expect(probe.executable).toBe(good);
    expect(probe.source).toBe("configured");
  });

  it("formats through stdin", async () => {
    if (!posix) return;
    const adapter = new MockAdapter({ executablePath: good });
    const out = await adapter.format(doc("hello\n"));
    expect(out.formatted).toBe("HELLO\n");
    expect(out.formatter).toEqual({ name: "mock", version: "4.5.6" });
  });

  it("reports an actionable reason when the executable is missing", async () => {
    const adapter = new MockAdapter({});
    const probe = await adapter.probe();
    expect(probe.available).toBe(false);
    // The message must tell the user what to do, not just that it failed.
    expect(probe.reason).toMatch(/not found on PATH/);
    expect(probe.reason).toMatch(/codeTrio\.externalFormatters\.paths/);
  });

  it("refuses a relative configured path", async () => {
    const adapter = new MockAdapter({ executablePath: "./bin/mock" });
    const probe = await adapter.probe();
    expect(probe.available).toBe(false);
    expect(probe.reason).toContain("absolute");
  });

  it("turns a formatter error into a message containing its stderr", async () => {
    if (!posix) return;
    const adapter = new MockAdapter({ executablePath: broken });
    // The probe fails first, because --version also exits non-zero here.
    await expect(adapter.format(doc("x"))).rejects.toThrow(/cannot parse line 7/);
  });

  it("refuses to replace a non-empty document with empty output", async () => {
    if (!posix) return;
    // This is the worst failure mode a formatter adapter can have: a tool that
    // exits 0 having written nothing would silently empty the user's file.
    const adapter = new MockAdapter({ executablePath: empty });
    await expect(adapter.format(doc("real content\n"))).rejects.toThrow(/no output/i);
  });

  it("allows empty output for a document that was already empty", async () => {
    if (!posix) return;
    const adapter = new MockAdapter({ executablePath: empty });
    const out = await adapter.format(doc("   \n"));
    expect(out.formatted).toBe("");
  });

  it("reports unavailable when discovery is disabled", async () => {
    if (!posix) return;
    const adapter = new MockAdapter({ executablePath: good, disabled: true });
    const probe = await adapter.probe();
    expect(probe.available).toBe(false);
    expect(probe.reason).toContain("disabled");
  });

  it("caches a probe and can be invalidated", async () => {
    if (!posix) return;
    const adapter = new MockAdapter({ executablePath: good });
    await adapter.probe();
    expect(adapter.version).toBe("4.5.6");
    adapter.invalidate();
    expect(adapter.version).toBe("unknown");
  });
});

describe("shipped adapters", () => {
  it("declare coherent capabilities", () => {
    for (const adapter of [new RuffAdapter(), new GofmtAdapterFixed(), new RustfmtAdapter()]) {
      const c = adapter.capabilities;
      expect(c.id.length).toBeGreaterThan(0);
      expect(c.displayName.length).toBeGreaterThan(0);
      expect(c.languages.length).toBeGreaterThan(0);
      expect(c.bundled).toBe(false);
    }
  });

  it("claim the languages they format", () => {
    expect(new RuffAdapter().supports("python")).toBe(true);
    expect(new RuffAdapter().supports("go")).toBe(false);
    expect(new GofmtAdapterFixed().supports("go")).toBe(true);
    expect(new RustfmtAdapter().supports("rust")).toBe(true);
  });

  it("degrade to unavailable when the tool is not installed", async () => {
    // Whatever is or is not installed on this machine, probing must resolve to
    // a boolean rather than throwing.
    for (const adapter of [new RuffAdapter(), new GofmtAdapterFixed(), new RustfmtAdapter()]) {
      const probe = await adapter.probe();
      expect(typeof probe.available).toBe("boolean");
      if (!probe.available) expect(probe.reason).toBeTruthy();
    }
  }, 30_000);

  it("keeps rustfmt from writing files itself", () => {
    // --emit stdout is what preserves Code Trio's explicit-write guarantee;
    // without it rustfmt edits in place.
    const args = (new RustfmtAdapter() as unknown as {
      formatArgs: () => readonly string[];
    }).formatArgs();
    expect(args).toContain("--emit");
    expect(args).toContain("stdout");
  });
});

describe("default adapter chain", () => {
  it("puts Prettier first and the whitespace fallback last", () => {
    const chain = defaultAdapters();
    expect(chain[0]).toBeInstanceOf(PrettierAdapter);
    expect(chain[chain.length - 1]).toBeInstanceOf(WhitespaceAdapter);
  });

  it("omits external adapters when they are disabled", () => {
    const chain = defaultAdapters({ external: { disabled: true } });
    expect(chain).toHaveLength(2);
  });

  it("honours a preference order", () => {
    const chain = defaultAdapters({ preferred: ["black"] });
    const external = chain.slice(1, -1).map((a) => a.capabilities?.id);
    expect(external[0]).toBe("black");
  });

  it("never lets the whitespace fallback claim a language before a real formatter", async () => {
    // The fallback supports every language. If it were not last, Python would
    // get trailing-whitespace trimming while the user believed Ruff had run.
    const registry = new AdapterRegistry(defaultAdapters());
    const claimants = registry.claimAll("python").map((a) => a.capabilities?.id);
    expect(claimants[claimants.length - 1]).toBe("whitespace-normalizer");
  });
});

describe("registry reporting", () => {
  it("describes every adapter without throwing", async () => {
    const registry = new AdapterRegistry(defaultAdapters());
    const reports = await registry.describeAll();
    expect(reports.length).toBeGreaterThan(0);
    for (const r of reports) {
      expect(r.id.length).toBeGreaterThan(0);
      expect(typeof r.availability.available).toBe("boolean");
    }
  }, 30_000);

  it("explains why a language resolved to a given adapter", async () => {
    const registry = new AdapterRegistry(defaultAdapters());
    const explained = await registry.explain("typescript");
    expect(explained.selected?.id).toBe("prettier");
  });

  it("survives an adapter whose probe throws", async () => {
    const exploding = {
      name: "exploding",
      version: "0",
      supports: (): boolean => true,
      isAvailable: (): Promise<boolean> => Promise.resolve(true),
      probe: (): Promise<never> => Promise.reject(new Error("probe blew up")),
      format: (): Promise<never> => Promise.reject(new Error("no")),
    };
    const registry = new AdapterRegistry([exploding, new WhitespaceAdapter()]);
    const reports = await registry.describeAll();
    expect(reports[0]?.availability.available).toBe(false);
    expect(reports[0]?.availability.reason).toContain("probe blew up");
    // One broken adapter must not hide the others.
    expect(reports[1]?.availability.available).toBe(true);
  });

  it("looks up an adapter by id", () => {
    const registry = new AdapterRegistry(defaultAdapters());
    expect(registry.byId("prettier")).toBeInstanceOf(PrettierAdapter);
    expect(registry.byId("nope")).toBeUndefined();
  });
});
