/**
 * @ctr/format-engine - deterministic formatting orchestrator. It selects an
 * adapter by language and runs it, returning a FormatResult with a preview
 * diff. It never imports a third-party formatter itself (adapters do) and never
 * performs file I/O.
 */
import type { Document, FormatResult, Engine } from "@ctr/core";
import { type AdapterRegistry } from "./registry";
import { formatDocument, type FormatEngineOptions } from "./format";

export { AdapterRegistry, type AdapterReport } from "./registry";
export { formatDocument, type FormatEngineOptions } from "./format";

export interface FormatEngineInput {
  readonly document: Document;
  readonly registry: AdapterRegistry;
  readonly options?: FormatEngineOptions;
}

/** The format engine as an `Engine` (async). */
export const formatEngine: Engine<FormatEngineInput, Promise<FormatResult>> = {
  name: "format-engine",
  run({ document, registry, options }) {
    return formatDocument(document, registry, options);
  },
};
