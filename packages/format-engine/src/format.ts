import type { Document, FormatOptions, FormatResult, TextEdit } from "@ctr/core";
import { PositionMapper } from "@ctr/core";
import { diffText } from "@ctr/diff-engine";
import { type AdapterRegistry } from "./registry";

export interface FormatEngineOptions {
  readonly formatOptions?: FormatOptions;
  /** Compute a dry-run preview diff (default true). */
  readonly computePreview?: boolean;
}

/** A single edit that replaces the whole document with new text. */
function fullReplaceEdit(doc: Document, formatted: string): TextEdit {
  const mapper = new PositionMapper(doc.text);
  return {
    range: { start: { line: 0, character: 0 }, end: mapper.positionAt(doc.text.length) },
    newText: formatted,
  };
}

/**
 * Format a document through the registry. Deterministic and side-effect free:
 * it returns the formatted text and a dry-run preview but never writes to disk.
 * Missing or failing formatters degrade to a reported error, never a throw.
 */
export async function formatDocument(
  doc: Document,
  registry: AdapterRegistry,
  options: FormatEngineOptions = {},
): Promise<FormatResult> {
  const computePreview = options.computePreview ?? true;
  const adapter = await registry.resolve(doc.languageId);

  if (!adapter) {
    return {
      changed: false,
      formatted: doc.text,
      edits: [],
      formatter: { name: "none", version: "0.0.0" },
      languageId: doc.languageId,
      unsupported: true,
    };
  }

  try {
    const output = await adapter.format(doc, options.formatOptions);
    const changed = output.formatted !== doc.text;
    return {
      changed,
      formatted: output.formatted,
      edits: changed ? [fullReplaceEdit(doc, output.formatted)] : [],
      formatter: output.formatter,
      languageId: doc.languageId,
      unsupported: false,
      previewDiff:
        changed && computePreview
          ? diffText(doc.text, output.formatted, { granularity: "line" })
          : undefined,
    };
  } catch (err) {
    return {
      changed: false,
      formatted: doc.text,
      edits: [],
      formatter: { name: adapter.name, version: adapter.version },
      languageId: doc.languageId,
      unsupported: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
