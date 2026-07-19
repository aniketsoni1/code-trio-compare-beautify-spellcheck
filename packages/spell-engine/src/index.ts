/** @ctr/spell-engine - code-aware, dictionary-backed spell checking. No I/O. */
import type { Diagnostic, Document, Engine } from "@ctr/core";
import { spellCheck, type SpellOptions } from "./spell";

export { spellCheck, type SpellOptions } from "./spell";
export { tokenize } from "./tokenizer";
export { splitIdentifier, wordRuns, type SubWord } from "./split";
export { suggest, boundedEditDistance } from "./suggest";

export interface SpellEngineInput {
  readonly document: Document;
  readonly options: SpellOptions;
}

/** The spell checker as a pure `Engine`. */
export const spellEngine: Engine<SpellEngineInput, Diagnostic[]> = {
  name: "spell-engine",
  run({ document, options }) {
    return spellCheck(document, options);
  },
};
