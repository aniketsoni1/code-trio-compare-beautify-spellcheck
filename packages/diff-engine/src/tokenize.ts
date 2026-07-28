/**
 * Tokenization helpers used to refine line-level diffs into word/char spans.
 *
 * These are thin re-exports of the Unicode-aware segmenters in `@ctr/core`.
 * They previously carried their own ASCII-only implementations, which split
 * "naive" written with a diaeresis into three tokens and cut emoji sequences in
 * half. The public names are preserved so existing callers and tests keep
 * working.
 */
export { splitWordSegments as splitWords, splitGraphemes as splitChars } from "@ctr/core";
