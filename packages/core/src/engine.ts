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
 * A formatter adapter wraps a third-party formatter (e.g. Prettier). Adapters
 * are the only place allowed to import/shell out to a formatter, and they must
 * degrade gracefully (return `unavailable`) rather than throw when a formatter
 * or its runtime is missing. They must never reach the network.
 */
export interface FormatterAdapter {
  readonly name: string;
  /** Pinned version string, recorded in results for reproducibility. */
  readonly version: string;
  supports(languageId: string): boolean;
  /** Returns false when the formatter cannot run in this environment. */
  isAvailable(): Promise<boolean>;
  format(doc: Document, options?: FormatOptions): Promise<AdapterFormatOutput>;
}

/** A convenience type alias for the format engine output. */
export type { FormatResult };
