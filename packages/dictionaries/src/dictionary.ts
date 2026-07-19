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
