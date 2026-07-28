import type { Document, FormatResult } from "./model";

/**
 * The generic engine contract. Every engine is a pure function over the
 * normalized model: no VS Code imports, no file I/O, no network. The `@ctr/agent`
 * package is the only seam that wires engines to the outside world.
 */
export interface Engine<Input, Output> {
  readonly name: string;
  run(input: Input): Output | Promise<Output>;
}

/** Options a formatter adapter may honor. */
export interface FormatOptions {
  readonly tabWidth?: number;
  readonly useTabs?: boolean;
  readonly printWidth?: number;
  /** Absolute path of the source file, when known (helps config discovery). */
  readonly filepath?: string;
}

/** What an adapter returns after attempting to format a document. */
export interface AdapterFormatOutput {
  readonly formatted: string;
  readonly formatter: { readonly name: string; readonly version: string };
}

/**
 * What an adapter can do, so callers can decide what to offer without probing.
 *
 * Every field answers a question the UI or CLI would otherwise have to guess
 * at, and guessing wrong means offering a "Format Selection" command that
 * silently reformats the whole file.
 */
export interface FormatterCapabilities {
  /** Stable identifier, e.g. `prettier`, `ruff`, `gofmt`. */
  readonly id: string;
  /** Name shown to a user. */
  readonly displayName: string;
  readonly languages: readonly string[];
  /** True when the formatter ships inside Code Trio rather than being found. */
  readonly bundled: boolean;
  /** True when a sub-range can be formatted independently. */
  readonly rangeFormatting: boolean;
  /** True when the formatter needs the file's path to choose a parser. */
  readonly needsFilePath: boolean;
  /** True when it discovers and honours its own project config files. */
  readonly configDiscovery: boolean;
  /** True when a run can be cancelled once started. */
  readonly cancellable: boolean;
}

/** The outcome of probing whether an adapter can run. */
export interface FormatterAvailability {
  readonly available: boolean;
  /** Resolved version string, when it could be determined. */
  readonly version?: string;
  /** Absolute path of the executable, for external formatters. */
  readonly executable?: string;
  /** How the executable was found: configuration, PATH, or bundled. */
  readonly source?: "configured" | "path" | "bundled";
  /** Why it is unavailable, phrased as something the user can act on. */
  readonly reason?: string;
}

/**
 * A formatter adapter wraps a third-party formatter (e.g. Prettier). Adapters
 * are the only place allowed to import/shell out to a formatter, and they must
 * degrade gracefully (return `unavailable`) rather than throw when a formatter
 * or its runtime is missing. They must never reach the network.
 */
export interface FormatterAdapter {
  readonly name: string;
  /** Pinned version string, recorded in results for reproducibility. */
  readonly version: string;
  /** Static description of what this adapter can do. */
  readonly capabilities?: FormatterCapabilities;
  supports(languageId: string): boolean;
  /** Returns false when the formatter cannot run in this environment. */
  isAvailable(): Promise<boolean>;
  /** Detailed availability, including version and resolved executable path. */
  probe?(): Promise<FormatterAvailability>;
  format(doc: Document, options?: FormatOptions): Promise<AdapterFormatOutput>;
}

/** A convenience type alias for the format engine output. */
export type { FormatResult };
