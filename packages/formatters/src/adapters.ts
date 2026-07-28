import type { Document, FormatOptions, FormatterCapabilities } from "@ctr/core";
import { ExternalFormatterAdapter, type ExternalAdapterConfig } from "./external";

/**
 * Adapters for locally installed formatters.
 *
 * Each one is a thin, declarative description: which executable, how to ask for
 * its version, and which arguments format stdin. All the risky work — discovery,
 * process spawning, timeouts, bounded output, error reporting — lives in the
 * shared base class, so adding a formatter cannot accidentally introduce a
 * shell invocation.
 *
 * Argument choices are deliberate. Every adapter uses the formatter's own
 * stdin-formatting mode, which means:
 *
 *   - no temporary file is created,
 *   - the user's file is never written by the formatter itself, only by Code
 *     Trio after an explicit action,
 *   - and each tool applies its own configuration discovery relative to the
 *     working directory, which is set to the document's directory.
 */

/** Ruff, the Rust-based Python formatter. */
export class RuffAdapter extends ExternalFormatterAdapter {
  protected readonly executableName = "ruff";
  protected readonly versionArgs = ["--version"];

  readonly capabilities: FormatterCapabilities = {
    id: "ruff",
    displayName: "Ruff",
    languages: ["python"],
    bundled: false,
    rangeFormatting: false,
    // --stdin-filename lets Ruff locate pyproject.toml and apply per-file
    // settings; without it every file is formatted with defaults.
    needsFilePath: true,
    configDiscovery: true,
    cancellable: true,
  };

  constructor(config: ExternalAdapterConfig = {}) {
    super(config);
  }

  protected formatArgs(_doc: Document, options?: FormatOptions): readonly string[] {
    const args = ["format", "-"];
    if (options?.filepath) args.push("--stdin-filename", options.filepath);
    return args;
  }
}

/** gofmt, the canonical Go formatter. */
export class GofmtAdapter extends ExternalFormatterAdapter {
  protected readonly executableName = "gofmt";
  // gofmt has no --version flag; -h exits non-zero but prints usage, so the
  // Go toolchain version is asked for instead where available.
  protected readonly versionArgs = ["-h"];

  readonly capabilities: FormatterCapabilities = {
    id: "gofmt",
    displayName: "gofmt",
    languages: ["go"],
    bundled: false,
    rangeFormatting: false,
    needsFilePath: false,
    // gofmt is not configurable by design: canonical formatting is the point.
    configDiscovery: false,
    cancellable: true,
  };

  constructor(config: ExternalAdapterConfig = {}) {
    super(config);
  }

  protected override parseVersion(output: string): string {
    const match = /go\d+\.\d+(?:\.\d+)?/.exec(output);
    // gofmt's version is the toolchain's; when it cannot be read, say so rather
    // than inventing a number that would end up in a reproducibility record.
    return match?.[0] ?? "bundled-with-go";
  }

  protected formatArgs(): readonly string[] {
    // gofmt reads stdin when given no file operands.
    return [];
  }
}

/**
 * gofmt's `-h` exits non-zero, which the base class would read as unavailable.
 * Availability is therefore decided by the executable resolving at all.
 */
export class GofmtAdapterFixed extends GofmtAdapter {
  override async probe(): ReturnType<ExternalFormatterAdapter["probe"]> {
    const base = await super.probe();
    if (base.available || !base.executable) return base;
    // The executable exists and is runnable; `-h` returning non-zero is gofmt
    // behaving normally, not a broken installation.
    return {
      available: true,
      version: "bundled-with-go",
      executable: base.executable,
      source: base.source ?? "path",
    };
  }
}

/** rustfmt, the canonical Rust formatter. */
export class RustfmtAdapter extends ExternalFormatterAdapter {
  protected readonly executableName = "rustfmt";
  protected readonly versionArgs = ["--version"];

  readonly capabilities: FormatterCapabilities = {
    id: "rustfmt",
    displayName: "rustfmt",
    languages: ["rust"],
    bundled: false,
    rangeFormatting: false,
    needsFilePath: false,
    configDiscovery: true,
    cancellable: true,
  };

  constructor(config: ExternalAdapterConfig = {}) {
    super(config);
  }

  protected formatArgs(): readonly string[] {
    // --emit stdout keeps rustfmt from writing files itself. Without it,
    // rustfmt edits in place, which would bypass Code Trio's explicit-write
    // guarantee entirely.
    return ["--emit", "stdout", "--quiet"];
  }
}

/** Black, the widely used Python formatter. Offered when Ruff is absent. */
export class BlackAdapter extends ExternalFormatterAdapter {
  protected readonly executableName = "black";
  protected readonly versionArgs = ["--version"];

  readonly capabilities: FormatterCapabilities = {
    id: "black",
    displayName: "Black",
    languages: ["python"],
    bundled: false,
    rangeFormatting: false,
    needsFilePath: true,
    configDiscovery: true,
    cancellable: true,
  };

  constructor(config: ExternalAdapterConfig = {}) {
    super(config);
  }

  protected formatArgs(_doc: Document, options?: FormatOptions): readonly string[] {
    // `-q -` formats stdin to stdout. Black writes its own progress messages to
    // stderr, which -q suppresses so they cannot be mistaken for an error.
    const args = ["-q", "-"];
    if (options?.filepath) args.push("--stdin-filename", options.filepath);
    return args;
  }
}

/** clang-format, for C, C++, Objective-C, Java and friends. */
export class ClangFormatAdapter extends ExternalFormatterAdapter {
  protected readonly executableName = "clang-format";
  protected readonly versionArgs = ["--version"];

  readonly capabilities: FormatterCapabilities = {
    id: "clang-format",
    displayName: "clang-format",
    languages: ["c", "cpp", "objective-c", "objective-cpp", "java", "csharp", "cuda", "proto"],
    bundled: false,
    // clang-format supports --offset/--length, which is genuine range support.
    rangeFormatting: true,
    needsFilePath: true,
    configDiscovery: true,
    cancellable: true,
  };

  constructor(config: ExternalAdapterConfig = {}) {
    super(config);
  }

  protected formatArgs(_doc: Document, options?: FormatOptions): readonly string[] {
    const args: string[] = [];
    // --assume-filename is what lets clang-format find the nearest .clang-format
    // and pick the right language from the extension.
    if (options?.filepath) args.push(`--assume-filename=${options.filepath}`);
    return args;
  }
}

/** Every external adapter, constructed with the same configuration. */
export function externalAdapters(config: ExternalAdapterConfig = {}): ExternalFormatterAdapter[] {
  return [
    new RuffAdapter(config),
    new BlackAdapter(config),
    new GofmtAdapterFixed(config),
    new RustfmtAdapter(config),
    new ClangFormatAdapter(config),
  ];
}
