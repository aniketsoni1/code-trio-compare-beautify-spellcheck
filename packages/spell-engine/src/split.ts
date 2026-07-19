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
 * Extract candidate word runs from arbitrary text (a comment or string body),
 * returning each run with its offset relative to the text. Runs are maximal
 * sequences of identifier characters; hyphens and other punctuation split them.
 */
export function wordRuns(text: string): SubWord[] {
  const runs: SubWord[] = [];
  const re = /[A-Za-z][A-Za-z0-9_$]*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    runs.push({ text: m[0], offset: m.index });
  }
  return runs;
}
