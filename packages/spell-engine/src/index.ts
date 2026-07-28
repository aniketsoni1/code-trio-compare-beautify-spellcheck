/** @ctr/spell-engine - code-aware, dictionary-backed spell checking. No I/O. */
import type { Diagnostic, Document, Engine } from "@ctr/core";
import { spellCheck, type SpellOptions } from "./spell";

export {
  spellCheck,
  spellCheckDetailed,
  type SpellOptions,
  type SpellRunResult,
  type SpellSkipReason,
} from "./spell";
export { tokenize } from "./tokenizer";
export {
  splitIdentifier,
  splitIdentifierForChecking,
  isAcronym,
  wordRuns,
  normalizeForLookup,
  type SubWord,
} from "./split";
export { suggest, boundedEditDistance, applyCase, areKeysAdjacent, type SuggestOptions } from "./suggest";
export { maskNoise, isNoiseWord, compileIgnorePatterns, type NoiseOptions } from "./noise";

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
