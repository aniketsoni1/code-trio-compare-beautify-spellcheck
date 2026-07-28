import { splitWordsWithOffsets } from "@ctr/core";

/** A sub-word extracted from an identifier or prose word, with its offset. */
export interface SubWord {
  readonly text: string;
  /** Offset of the sub-word relative to the start of the input word. */
  readonly offset: number;
}

const isUpper = (c: string): boolean => c >= "A" && c <= "Z";
const isLower = (c: string): boolean => c >= "a" && c <= "z";
const isLetter = (c: string): boolean => isUpper(c) || isLower(c);

/**
 * Split an identifier/word into its component words, handling camelCase,
 * snake_case, kebab-case, SCREAMING_CASE, and acronym runs (HTTPServer ->
 * HTTP, Server). Digits and separators are treated as boundaries and dropped.
 * Offsets are preserved so callers can map a flagged sub-word back to a range.
 */
export function splitIdentifier(word: string): SubWord[] {
  const words: SubWord[] = [];
  let start = -1;

  const flush = (end: number): void => {
    if (start >= 0 && end > start) {
      words.push({ text: word.slice(start, end), offset: start });
    }
    start = -1;
  };

  for (let i = 0; i < word.length; i++) {
    const c = word[i] as string;
    if (!isLetter(c)) {
      flush(i);
      continue;
    }
    if (start < 0) {
      start = i;
      continue;
    }
    const prev = word[i - 1] as string;
    // lower/digit -> Upper starts a new word: camelCase
    if (isUpper(c) && !isUpper(prev)) {
      flush(i);
      start = i;
      continue;
    }
    // Upper -> Upper followed by lower ends an acronym: HTTPServer -> HTTP | Server
    if (isUpper(c) && isUpper(prev)) {
      const next = word[i + 1];
      if (next !== undefined && isLower(next)) {
        flush(i);
        start = i;
      }
    }
  }
  flush(word.length);
  return words;
}

/**
 * True when a fragment is an acronym or initialism rather than a word.
 *
 * Two or more letters, all upper case. The caller can choose to skip these
 * rather than reporting "URL" and "API" on every line, which is the noisiest
 * failure mode of identifier checking.
 */
export function isAcronym(fragment: string): boolean {
  return fragment.length >= 2 && fragment === fragment.toUpperCase() && /^[A-Z]+$/.test(fragment);
}

/**
 * Split an identifier and drop the fragments not worth checking.
 *
 * `minLength` filters the two- and three-letter fragments camelCase splitting
 * produces in quantity (`getId` -> "get", "Id"), which are almost never real
 * misspellings. Acronyms are dropped unless `checkAcronyms` is set, because a
 * codebase's acronyms belong in its dictionary rather than in a diagnostic
 * stream.
 *
 * Duplicate fragments within one identifier are reported once, at their first
 * occurrence, so `parseParser` yields one diagnostic rather than two for the
 * same unknown stem.
 */
export function splitIdentifierForChecking(
  word: string,
  options: { minLength?: number; checkAcronyms?: boolean } = {},
): SubWord[] {
  const minLength = options.minLength ?? 3;
  const checkAcronyms = options.checkAcronyms ?? false;
  const seen = new Set<string>();
  const out: SubWord[] = [];
  for (const part of splitIdentifier(word)) {
    if (part.text.length < minLength) continue;
    if (!checkAcronyms && isAcronym(part.text)) continue;
    const key = part.text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(part);
  }
  return out;
}

/**
 * Extract candidate word runs from arbitrary text (a comment or string body),
 * returning each run with its offset relative to the text.
 *
 * Delegates to the Unicode segmenter in `@ctr/core`, so accented and
 * non-Latin-script words form single runs. The previous ASCII-only regex
 * (`[A-Za-z][A-Za-z0-9_$]*`) split "café" into "caf" plus a dropped tail and
 * ignored non-Latin text entirely.
 *
 * Contractions and possessives are stitched back together, so "don't" is one
 * run rather than "don" plus "t" — two fragments that produced two useless
 * diagnostics every time they appeared.
 */
export function wordRuns(text: string): SubWord[] {
  const runs: SubWord[] = [];
  for (const segment of splitWordsWithOffsets(text)) {
    const previous = runs[runs.length - 1];
    const precedingChar = text[segment.offset - 1] ?? "";
    if (
      previous &&
      segment.offset === previous.offset + previous.text.length + 1 &&
      (precedingChar === "'" || precedingChar === "’") &&
      segment.text.length <= 2
    ) {
      runs[runs.length - 1] = {
        text: `${previous.text}${precedingChar}${segment.text}`,
        offset: previous.offset,
      };
      continue;
    }
    runs.push({ text: segment.text, offset: segment.offset });
  }
  return runs;
}

/**
 * Strip a trailing possessive or stray apostrophe for dictionary lookup.
 *
 * "developer's" is looked up as "developer". A contraction such as "don't"
 * keeps its apostrophe, so the dictionary can carry common contractions
 * directly rather than having them mangled into non-words.
 */
export function normalizeForLookup(word: string): string {
  const lower = word.toLowerCase();
  const possessive = lower.replace(/['’]s$/, "");
  return possessive.replace(/['’]$/, "");
}
