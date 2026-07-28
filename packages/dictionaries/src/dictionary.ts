import { BASE_WORDS } from "./data/base";
import { TECHNICAL_WORDS } from "./data/technical";

export type BuiltinName = "base" | "technical";

/** A case-insensitive membership set of known words. */
export interface Dictionary {
  has(word: string): boolean;
  add(word: string): void;
  /** All known words (lowercased), for suggestion generation. */
  list(): readonly string[];
  readonly size: number;
}

class SetDictionary implements Dictionary {
  private readonly words: Set<string>;
  constructor(words: Iterable<string>) {
    this.words = new Set();
    for (const w of words) {
      const n = w.trim().toLowerCase();
      if (n) this.words.add(n);
    }
  }
  has(word: string): boolean {
    return this.words.has(word.trim().toLowerCase());
  }
  add(word: string): void {
    const n = word.trim().toLowerCase();
    if (n) this.words.add(n);
  }
  list(): readonly string[] {
    return [...this.words];
  }
  get size(): number {
    return this.words.size;
  }
}

/**
 * Parse a newline word list. Blank lines and `#` comment lines are ignored, so
 * the same parser handles the built-in lists and a checked-in project
 * dictionary. A leading `!` marks an explicit ignore/allow entry, returned
 * separately.
 */
export function parseWordList(text: string): { words: string[]; ignore: string[] } {
  const words: string[] = [];
  const ignore: string[] = [];
  for (const raw of text.split(/\r\n|\r|\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("!")) {
      const w = line.slice(1).trim();
      if (w) ignore.push(w.toLowerCase());
    } else {
      words.push(line.toLowerCase());
    }
  }
  return { words, ignore };
}

const BUILTIN: Record<BuiltinName, () => string> = {
  base: () => BASE_WORDS,
  technical: () => TECHNICAL_WORDS,
};

/** Build a dictionary from any set of words. */
export function makeDictionary(words: Iterable<string>): Dictionary {
  return new SetDictionary(words);
}

/** Load and merge one or more built-in dictionaries plus extra words. */
export function loadDictionary(
  names: readonly BuiltinName[] = ["base", "technical"],
  extraWords: readonly string[] = [],
): Dictionary {
  const dict = new SetDictionary([]);
  for (const name of names) {
    for (const w of BUILTIN[name]().split("\n")) dict.add(w);
  }
  for (const w of extraWords) dict.add(w);
  return dict;
}

export const BUILTIN_WORD_COUNTS: Record<BuiltinName, number> = {
  base: BASE_WORDS.split("\n").filter(Boolean).length,
  technical: TECHNICAL_WORDS.split("\n").filter(Boolean).length,
};

/**
 * The words of one built-in list, as an array.
 *
 * Exposed so `DictionaryStack` can register `base` and `technical` as distinct
 * layers with their own precedence, rather than pre-merging them into a single
 * opaque set the way `loadDictionary` does. Merging them early would make it
 * impossible to answer "was this word accepted because it is ordinary English
 * or because it is a technical term?", which is exactly what a user needs to
 * know when deciding whether to add it to a project dictionary.
 *
 * Memoised: the lists are immutable, so splitting them once and sharing the
 * frozen array avoids re-splitting a few thousand lines on every document scan.
 */
const builtinCache = new Map<BuiltinName, readonly string[]>();

export function builtinWords(name: BuiltinName): readonly string[] {
  const cached = builtinCache.get(name);
  if (cached) return cached;
  const words = Object.freeze(
    BUILTIN[name]()
      .split("\n")
      .map((w) => w.trim().toLowerCase())
      .filter(Boolean),
  );
  builtinCache.set(name, words);
  return words;
}
