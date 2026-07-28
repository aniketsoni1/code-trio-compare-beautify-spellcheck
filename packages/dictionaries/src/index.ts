/**
 * @ctr/dictionaries - built-in word lists plus parsing/lookup helpers.
 *
 * The word lists are original, curated for Code Trio, and dedicated to the
 * public domain (CC0-1.0). See docs/dictionaries.md for provenance. Discovery
 * of on-disk dictionaries is performed by @ctr/agent (I/O lives there); this
 * package stays pure and in-memory.
 */
export {
  type BuiltinName,
  type Dictionary,
  makeDictionary,
  loadDictionary,
  builtinWords,
  parseWordList,
  BUILTIN_WORD_COUNTS,
} from "./dictionary";
export {
  DictionaryStack,
  SCOPE_PRECEDENCE,
  SCOPE_LABELS,
  type DictionaryScope,
  type DictionaryLayer,
  type WordLookup,
} from "./scopes";
