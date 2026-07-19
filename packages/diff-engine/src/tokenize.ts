/** Tokenization helpers used to refine line-level diffs into word/char spans. */

/**
 * Splits a line into display tokens: runs of word characters, runs of
 * whitespace, and single punctuation characters. Concatenating the result
 * reproduces the input exactly.
 */
export function splitWords(line: string): string[] {
  const tokens: string[] = [];
  const re = /(\s+|[A-Za-z0-9_]+|[^\sA-Za-z0-9_])/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(line)) !== null) {
    tokens.push(match[0]);
  }
  return tokens;
}

/** Splits a line into Unicode characters (code points). */
export function splitChars(line: string): string[] {
  return Array.from(line);
}
