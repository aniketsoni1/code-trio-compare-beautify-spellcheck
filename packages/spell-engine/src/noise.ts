/**
 * Noise suppression: deciding which character runs are not natural language and
 * should never produce a spelling diagnostic.
 *
 * This is the single largest source of false positives in a code-aware spell
 * checker. A comment containing a URL, a SHA, a UUID, a file path, or a base64
 * blob previously produced one diagnostic per unrecognised fragment, which is
 * both wrong and loud enough that users disable the feature entirely.
 *
 * Two levels are applied:
 *
 *   1. `maskNoise` blanks whole spans inside a token before word extraction, so
 *      a URL contributes nothing at all rather than contributing its hostname
 *      labels as separate "words".
 *   2. `isNoiseWord` rejects individual extracted runs that survived masking
 *      but are still clearly not words.
 *
 * Masking preserves offsets by replacing each character with a space, so every
 * diagnostic range computed downstream still points at the right place in the
 * original document.
 */

/**
 * Patterns for whole spans that should be removed before word extraction.
 *
 * Order matters: URLs are matched before bare paths so that the path portion of
 * a URL is consumed by the URL rule rather than being matched separately.
 */
const SPAN_PATTERNS: readonly RegExp[] = [
  // Full URLs, including scheme-relative and mailto.
  /\b(?:[a-z][a-z0-9+.-]*:\/\/|mailto:|www\.)[^\s<>"'`)\]}]+/gi,
  // Email addresses.
  /\b[\w.%+-]+@[\w.-]+\.[a-z]{2,}\b/gi,
  // Markdown link targets: keep the visible text, drop the destination.
  /\]\([^)\s]+\)/g,
  // Markdown reference definitions and autolinks.
  /<[a-z][a-z0-9+.-]*:[^\s>]+>/gi,
  // POSIX and Windows file paths with at least one separator and an extension,
  // or a leading ./ ../ or drive letter.
  /(?:\.{1,2}\/|~\/|\/|\b[A-Za-z]:\\)[\w.@+-]+(?:[/\\][\w.@+-]+)*\/?/g,
  // Dotted module paths and namespaced package names.
  /\B@[\w-]+\/[\w.-]+/g,
  // HTML/XML entities.
  /&(?:#\d+|#x[0-9a-f]+|[a-z]+);/gi,
  // Percent- and backslash-escapes.
  /(?:%[0-9a-f]{2})+/gi,
  /\\(?:u\{?[0-9a-f]{1,6}\}?|x[0-9a-f]{2}|[nrtbfv0\\'"])/gi,
  // printf/format specifiers and template placeholders.
  /%[-+ #0]*\d*(?:\.\d+)?[diouxXeEfgGaAcspn%]/g,
  /\$\{[^}]*\}/g,
  /\{\{[^}]*\}\}/g,
  /\{\w*\}/g,
  // Hex colours and hex literals.
  /#[0-9a-f]{3,8}\b/gi,
  /\b0x[0-9a-f]+\b/gi,
  // Binary and octal literals.
  /\b0[bo][0-7_01]+\b/gi,
  // UUIDs.
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
  // Git SHAs and other long hex digests (sha1, sha256, md5).
  /\b[0-9a-f]{7,}\b(?=[^a-z]|$)/gi,
  // Semantic versions, with optional v prefix and pre-release/build metadata.
  /\bv?\d+\.\d+(?:\.\d+)?(?:[-+][\w.]+)?\b/g,
  // Version range operators used in package manifests.
  /[~^><=]{1,2}\s?\d+(?:\.\d+)*/g,
  // ISO-8601 timestamps and plain dates.
  /\b\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?\b/g,
  // Anything with a digit adjacent to letters is an identifier-ish token, not a
  // word: sha1sum, utf8, i18n, x86_64, md5.
  /\b[\w]*\d[\w]*\b/g,
];

/**
 * A run that looks like base64 or another opaque blob.
 *
 * Detected by shape rather than a fixed pattern: long, mixed case, and with a
 * character-class mix no English word has. The length floor is deliberately
 * high so ordinary long words such as "internationalisation" are never caught.
 */
function looksLikeBlob(word: string): boolean {
  if (word.length < 24) return false;
  let upper = 0;
  let lower = 0;
  let digit = 0;
  for (const ch of word) {
    if (ch >= "A" && ch <= "Z") upper++;
    else if (ch >= "a" && ch <= "z") lower++;
    else if (ch >= "0" && ch <= "9") digit++;
  }
  // Both cases present and either digits present or an unnatural case mix.
  if (upper > 0 && lower > 0 && digit > 0) return true;
  // Very long all-lower/all-upper runs with no vowels are also not words.
  const vowels = (word.match(/[aeiou]/gi) ?? []).length;
  return vowels / word.length < 0.15;
}

/**
 * A run with no vowel at all, longer than a typical abbreviation.
 *
 * "rhythms" has a vowel by this definition (y counts), "xyzzyqk" does not.
 * Short consonant clusters are left alone because they are usually genuine
 * acronyms the dictionary or the user should decide about.
 */
function isVowelless(word: string): boolean {
  if (word.length < 6) return false;
  return !/[aeiouy]/i.test(word);
}

export interface NoiseOptions {
  /** Extra regular expressions supplied by configuration. */
  readonly extraPatterns?: readonly RegExp[];
  /** Disable all built-in noise suppression. */
  readonly disabled?: boolean;
}

/**
 * Blank out non-language spans, preserving length and therefore all offsets.
 *
 * Replacement uses spaces rather than deletion so that every downstream offset
 * — and therefore every diagnostic range — still lines up with the original
 * document. This is why the function returns a string of identical length.
 */
export function maskNoise(text: string, options: NoiseOptions = {}): string {
  if (options.disabled) return text;
  let out = text;
  const blank = (match: string): string => " ".repeat(match.length);

  for (const pattern of SPAN_PATTERNS) {
    // Each pattern is used with a fresh lastIndex; `replace` with a /g regex
    // resets it, but being explicit avoids surprises if a pattern is reused.
    pattern.lastIndex = 0;
    out = out.replace(pattern, blank);
  }
  for (const pattern of options.extraPatterns ?? []) {
    try {
      out = out.replace(pattern, blank);
    } catch {
      // A user-supplied pattern must never break a document scan.
    }
  }
  return out;
}

/**
 * True when an already-extracted word run should not be checked.
 *
 * Applied after `maskNoise` as a second net for runs that no span pattern
 * covers: blobs, vowelless strings, and repeated-character noise.
 */
export function isNoiseWord(word: string): boolean {
  if (word.length === 0) return true;
  // Any digit means it is not a natural-language word.
  if (/\d/.test(word)) return true;
  if (looksLikeBlob(word)) return true;
  if (isVowelless(word)) return true;
  // Three or more of the same letter in a row: "aaaa", "zzzzz".
  if (/(.)\1{2,}/.test(word)) return true;
  return false;
}

/**
 * Compile user-supplied ignore patterns, discarding any that do not compile.
 *
 * Returns the usable patterns plus the sources that failed, so a caller can
 * warn about a broken setting instead of silently ignoring it.
 */
export function compileIgnorePatterns(sources: readonly string[]): {
  patterns: RegExp[];
  invalid: string[];
} {
  const patterns: RegExp[] = [];
  const invalid: string[] = [];
  for (const source of sources) {
    try {
      patterns.push(new RegExp(source, "gu"));
    } catch {
      try {
        // Retry without the unicode flag, which rejects some otherwise valid
        // patterns containing lone escapes.
        patterns.push(new RegExp(source, "g"));
      } catch {
        invalid.push(source);
      }
    }
  }
  return { patterns, invalid };
}
