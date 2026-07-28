/**
 * Unicode-aware text segmentation.
 *
 * The diff engine refines a changed line into word or character spans. Doing
 * that with `[A-Za-z0-9_]` and `Array.from` produces two visible bugs:
 *
 *   - "naïve" splits into "na", "ï", "ve" because the accented character is not
 *     in the ASCII class, so a one-word change renders as three;
 *   - a family emoji or a flag splits mid-sequence, so the refined diff shows
 *     half a glyph on each side.
 *
 * `Intl.Segmenter` fixes both and is available in every Node 20+ runtime and
 * every VS Code renderer. It is still feature-detected, with a Unicode
 * property-escape fallback, so the engines never hard-depend on ICU being
 * compiled in — a `--without-intl` Node build degrades to slightly coarser
 * segmentation instead of crashing.
 *
 * Every function is concatenation-preserving: joining the output reproduces the
 * input exactly. The diff engine relies on that to rebuild lines from segments.
 */

type SegmenterCtor = typeof Intl.Segmenter;

function segmenterCtor(): SegmenterCtor | undefined {
  const intl = Intl as { Segmenter?: SegmenterCtor };
  return typeof intl.Segmenter === "function" ? intl.Segmenter : undefined;
}

let graphemeSegmenter: Intl.Segmenter | undefined;
let wordSegmenter: Intl.Segmenter | undefined;
let segmenterProbed = false;

function ensureSegmenters(): void {
  if (segmenterProbed) return;
  segmenterProbed = true;
  const Ctor = segmenterCtor();
  if (!Ctor) return;
  try {
    // The locale is fixed to "en" rather than the host locale: diff output must
    // be deterministic across machines, and word-breaking rules are
    // locale-dependent.
    graphemeSegmenter = new Ctor("en", { granularity: "grapheme" });
    wordSegmenter = new Ctor("en", { granularity: "word" });
  } catch {
    graphemeSegmenter = undefined;
    wordSegmenter = undefined;
  }
}

/** True when this runtime provides a usable `Intl.Segmenter`. */
export function hasUnicodeSegmentation(): boolean {
  ensureSegmenters();
  return graphemeSegmenter !== undefined;
}

/**
 * Split text into user-perceived characters (grapheme clusters).
 *
 * "é" written as e + combining acute is one segment, not two. A ZWJ emoji
 * sequence is one segment, not five.
 */
export function splitGraphemes(text: string): string[] {
  if (text.length === 0) return [];
  ensureSegmenters();
  if (graphemeSegmenter) {
    const out: string[] = [];
    for (const { segment } of graphemeSegmenter.segment(text)) out.push(segment);
    return out;
  }
  // Fallback: code points. Astral characters stay intact; combining marks and
  // ZWJ sequences split. Still better than UTF-16 code units, which would
  // split surrogate pairs and produce mojibake in the rendered diff.
  return Array.from(text);
}

/**
 * Fallback word splitter used when `Intl.Segmenter` is unavailable.
 *
 * Unicode property escapes (`\p{L}`, `\p{N}`, `\p{M}`) are part of the regex
 * engine rather than ICU, so they work on a `--without-intl` build. Runs of
 * letters/digits/marks form words; runs of whitespace and single other
 * characters are their own segments.
 */
const FALLBACK_WORD_RE = /(\s+|[\p{L}\p{N}\p{M}_]+|[\s\S])/gu;

/**
 * Split a line into word-ish tokens for diff refinement.
 *
 * Word segments keep their internal characters together; whitespace runs are
 * coalesced so that re-indenting a line shows as one change rather than one per
 * space. Concatenating the result reproduces the input exactly.
 */
export function splitWordSegments(text: string): string[] {
  if (text.length === 0) return [];
  ensureSegmenters();

  if (wordSegmenter) {
    const out: string[] = [];
    let pendingWhitespace = "";
    for (const { segment, isWordLike } of wordSegmenter.segment(text)) {
      if (!isWordLike && /^\s+$/.test(segment)) {
        // Coalesce adjacent whitespace segments into one token.
        pendingWhitespace += segment;
        continue;
      }
      if (pendingWhitespace) {
        out.push(pendingWhitespace);
        pendingWhitespace = "";
      }
      out.push(segment);
    }
    if (pendingWhitespace) out.push(pendingWhitespace);
    return out;
  }

  const out: string[] = [];
  FALLBACK_WORD_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = FALLBACK_WORD_RE.exec(text)) !== null) {
    const token = match[0];
    const previous = out[out.length - 1];
    // Coalesce whitespace the same way the Segmenter path does.
    if (previous !== undefined && /^\s+$/.test(previous) && /^\s+$/.test(token)) {
      out[out.length - 1] = previous + token;
    } else {
      out.push(token);
    }
  }
  return out;
}

/**
 * Split prose into word-like segments with their offsets, dropping punctuation
 * and whitespace. Used by the spell engine to find candidate words.
 *
 * Unlike `splitWordSegments`, this is lossy by design: only word-like runs are
 * returned, each with the offset it started at so a diagnostic range can be
 * reconstructed.
 */
export interface OffsetSegment {
  readonly text: string;
  readonly offset: number;
}

const FALLBACK_PROSE_RE = /[\p{L}\p{M}][\p{L}\p{N}\p{M}_'’-]*/gu;

export function splitWordsWithOffsets(text: string): OffsetSegment[] {
  if (text.length === 0) return [];
  ensureSegmenters();

  if (wordSegmenter) {
    const out: OffsetSegment[] = [];
    for (const { segment, index, isWordLike } of wordSegmenter.segment(text)) {
      if (isWordLike) out.push({ text: segment, offset: index });
    }
    return out;
  }

  const out: OffsetSegment[] = [];
  FALLBACK_PROSE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = FALLBACK_PROSE_RE.exec(text)) !== null) {
    out.push({ text: match[0], offset: match.index });
  }
  return out;
}
