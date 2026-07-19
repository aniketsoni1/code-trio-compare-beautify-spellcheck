/** @ctr/diff-engine - pure line/word/char diff and three-way merge. No I/O. */
import type { DiffResult, Document, Engine } from "@ctr/core";
import { diffDocuments, type DiffOptions } from "./diff";

export { diffText, diffDocuments, type DiffOptions } from "./diff";
export { threeWayMerge, renderMerge, type MergeLabels } from "./merge";
export { diffArrays, lcsLength, type Edit, type EditOp } from "./myers";
export { splitWords, splitChars } from "./tokenize";

export interface DiffEngineInput {
  readonly a: Document;
  readonly b: Document;
  readonly options?: DiffOptions;
}

/** The diff engine as a pure `Engine`. */
export const diffEngine: Engine<DiffEngineInput, DiffResult> = {
  name: "diff-engine",
  run({ a, b, options }) {
    return diffDocuments(a, b, options);
  },
};
