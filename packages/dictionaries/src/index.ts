/**
 * @ctr/dictionaries - built-in word lists plus parsing/lookup helpers.
 *
 * The word lists are original, curated for Code Trio, and dedicated to the
 * public domain (CC0-1.0). See docs/dictionaries.md for provenance. Discovery
 * of a workspace project dictionary is performed by @ctr/agent (I/O lives
 * there); this package stays pure and in-memory.
 */
export {
  type BuiltinName,
  type Dictionary,
  makeDictionary,
  loadDictionary,
  parseWordList,
  BUILTIN_WORD_COUNTS,
} from "./dictionary";
