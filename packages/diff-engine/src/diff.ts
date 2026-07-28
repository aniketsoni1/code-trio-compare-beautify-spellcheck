import type {
  CancellationToken,
  DiffEolInfo,
  DiffGranularity,
  DiffHunk,
  DiffLine,
  DiffResult,
  DiffSegment,
  DiffTruncation,
  Document,
} from "@ctr/core";
import {
  analyzeEol,
  analyzeMinified,
  isProbablyBinary,
  normalizeEol,
  splitGraphemes,
  splitLines,
  splitWordSegments,
  throwIfCancelled,
} from "@ctr/core";
import { diffArrays, type Edit } from "./myers";

export interface DiffOptions {
  readonly granularity?: DiffGranularity;
  readonly ignoreWhitespace?: boolean;
  readonly ignoreCase?: boolean;
  /** Lines of unchanged context to keep around each change in a hunk. */
  readonly contextLines?: number;
  /**
   * Treat CRLF, LF and CR as equivalent. Off by default, because a line-ending
   * change is a real change that a reviewer may need to see; on, it stops a
   * checkout-normalised file from showing every line as modified.
   */
  readonly ignoreEol?: boolean;
  /** Refuse inputs longer than this many lines. */
  readonly maxLines?: number;
  /** Refuse inputs longer than this many UTF-16 code units. */
  readonly maxLength?: number;
  /** Refuse binary-looking input. Defaults to true. */
  readonly rejectBinary?: boolean;
  /**
   * Downgrade refinement to line granularity for minified/bundled input.
   * Defaults to true: refining a character diff across a 2 MB single line is
   * the pathological case, and the output would be unreadable anyway.
   */
  readonly degradeMinified?: boolean;
  /** Skip word/char refinement on lines longer than this. */
  readonly maxRefineLineLength?: number;
  readonly token?: CancellationToken;
}

interface ResolvedOptions {
  granularity: DiffGranularity;
  ignoreWhitespace: boolean;
  ignoreCase: boolean;
  contextLines: number;
  ignoreEol: boolean;
  maxLines: number;
  maxLength: number;
  rejectBinary: boolean;
  degradeMinified: boolean;
  maxRefineLineLength: number;
  token: CancellationToken | undefined;
}

/** Default ceilings. Generous enough for real source, low enough to bound work. */
export const DIFF_DEFAULT_MAX_LINES = 300_000;
export const DIFF_DEFAULT_MAX_LENGTH = 20 * 1024 * 1024;
export const DIFF_DEFAULT_MAX_REFINE_LINE_LENGTH = 10_000;

function resolve(options: DiffOptions | undefined): ResolvedOptions {
  return {
    granularity: options?.granularity ?? "line",
    ignoreWhitespace: options?.ignoreWhitespace ?? false,
    ignoreCase: options?.ignoreCase ?? false,
    contextLines: Math.max(0, options?.contextLines ?? 3),
    ignoreEol: options?.ignoreEol ?? false,
    maxLines: options?.maxLines ?? DIFF_DEFAULT_MAX_LINES,
    maxLength: options?.maxLength ?? DIFF_DEFAULT_MAX_LENGTH,
    rejectBinary: options?.rejectBinary ?? true,
    degradeMinified: options?.degradeMinified ?? true,
    maxRefineLineLength: options?.maxRefineLineLength ?? DIFF_DEFAULT_MAX_REFINE_LINE_LENGTH,
    token: options?.token,
  };
}

function normalizeLine(line: string, opts: ResolvedOptions): string {
  let s = line;
  if (opts.ignoreWhitespace) s = s.replace(/\s+/g, "");
  if (opts.ignoreCase) s = s.toLowerCase();
  return s;
}

/** An empty, non-identical result carrying only a truncation disclosure. */
function refused(
  granularity: DiffGranularity,
  truncation: DiffTruncation,
  eol: DiffEolInfo,
): DiffResult {
  return {
    granularity,
    identical: false,
    hunks: [],
    stats: { insertions: 0, deletions: 0, unchanged: 0 },
    truncation,
    eol,
  };
}

function eolInfo(aText: string, bText: string): DiffEolInfo {
  const a = analyzeEol(aText);
  const b = analyzeEol(bText);
  return {
    a: a.dominant,
    b: b.dominant,
    mixed: a.mixed || b.mixed,
    differs: a.dominant !== b.dominant,
  };
}

/**
 * Compute a two-way diff between two texts.
 *
 * Guards run before any expensive work: binary content, oversized input and
 * minified geometry are all decided from cheap scans so a pathological file is
 * refused in milliseconds rather than after a multi-second diff. A refusal is
 * reported through `truncation`, never as a silently empty diff.
 */
export function diffText(aText: string, bText: string, options?: DiffOptions): DiffResult {
  const opts = resolve(options);
  throwIfCancelled(opts.token, "diff");

  const eol = eolInfo(aText, bText);

  if (opts.rejectBinary && (isProbablyBinary(aText) || isProbablyBinary(bText))) {
    return refused(
      opts.granularity,
      {
        reason: "binary",
        message:
          "One or both inputs look like binary content. Comparing them as text would produce meaningless output.",
      },
      eol,
    );
  }

  const longest = Math.max(aText.length, bText.length);
  if (longest > opts.maxLength) {
    return refused(
      opts.granularity,
      {
        reason: "max-length",
        message: `Input is ${formatBytes(longest)}, above the ${formatBytes(opts.maxLength)} compare limit. Raise codeTrio.diff.maxLength to compare it anyway.`,
        limit: opts.maxLength,
        actual: longest,
      },
      eol,
    );
  }

  // Comparing normalised copies keeps the reported line text authentic: the
  // user still sees their real CRLF-terminated content, we simply do not treat
  // the terminator as a difference.
  const aCompare = opts.ignoreEol ? normalizeEol(aText) : aText;
  const bCompare = opts.ignoreEol ? normalizeEol(bText) : bText;

  const aLines = splitLines(aCompare);
  const bLines = splitLines(bCompare);
  const lineCount = Math.max(aLines.length, bLines.length);
  if (lineCount > opts.maxLines) {
    return refused(
      opts.granularity,
      {
        reason: "max-lines",
        message: `Input has ${lineCount.toLocaleString("en-US")} lines, above the ${opts.maxLines.toLocaleString("en-US")}-line compare limit.`,
        limit: opts.maxLines,
        actual: lineCount,
      },
      eol,
    );
  }

  // Minified input is diffed, but only at line granularity: a character-level
  // refinement of a single 2 MB line is both ruinously slow and unreadable.
  let granularity = opts.granularity;
  let truncation: DiffTruncation | undefined;
  if (opts.degradeMinified && granularity !== "line") {
    const aMin = analyzeMinified(aText);
    const bMin = analyzeMinified(bText);
    if (aMin.minified || bMin.minified) {
      granularity = "line";
      truncation = {
        reason: "minified",
        message:
          "Input looks minified or bundled, so refinement was reduced to line granularity. Word and character diffs of very long lines are not readable.",
        actual: Math.max(aMin.longestLineLength, bMin.longestLineLength),
      };
    }
  }

  const effective: ResolvedOptions = { ...opts, granularity };
  const aKeys = aLines.map((l) => normalizeLine(l, effective));
  const bKeys = bLines.map((l) => normalizeLine(l, effective));

  const script = diffArrays(aKeys, bKeys, (x, y) => x === y, { token: effective.token });
  const lines = alignLines(script, aLines, bLines, effective);

  let insertions = 0;
  let deletions = 0;
  let unchanged = 0;
  for (const l of lines) {
    if (l.op === "equal") unchanged++;
    else if (l.op === "insert") insertions++;
    else if (l.op === "delete") deletions++;
    else {
      insertions++;
      deletions++;
    }
  }

  const identical = insertions === 0 && deletions === 0;
  const hunks = identical ? [] : buildHunks(lines, effective.contextLines);

  // "Identical" with differing line endings is the one case where the headline
  // verdict would mislead a reviewer, so it is flagged explicitly.
  const eolOnlyDifference = identical && aText !== bText && eol.differs;

  return {
    granularity,
    identical,
    hunks,
    stats: { insertions, deletions, unchanged },
    eol,
    ...(eolOnlyDifference ? { eolOnlyDifference } : {}),
    ...(truncation ? { truncation } : {}),
  };
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Convenience overload operating on normalized Documents. */
export function diffDocuments(a: Document, b: Document, options?: DiffOptions): DiffResult {
  return diffText(a.text, b.text, options);
}

function alignLines(
  script: readonly Edit[],
  aLines: readonly string[],
  bLines: readonly string[],
  opts: ResolvedOptions,
): DiffLine[] {
  const out: DiffLine[] = [];
  let pendingDel: number[] = [];
  let pendingIns: number[] = [];

  const flush = (): void => {
    const pairs = Math.min(pendingDel.length, pendingIns.length);
    for (let i = 0; i < pairs; i++) {
      const ai = pendingDel[i] as number;
      const bi = pendingIns[i] as number;
      const aText = aLines[ai] as string;
      const bText = bLines[bi] as string;
      out.push({
        op: "replace",
        aLine: ai,
        bLine: bi,
        aText,
        bText,
        segments: shouldRefine(aText, bText, opts) ? refine(aText, bText, opts) : undefined,
      });
    }
    for (let i = pairs; i < pendingDel.length; i++) {
      const ai = pendingDel[i] as number;
      out.push({ op: "delete", aLine: ai, aText: aLines[ai] as string });
    }
    for (let i = pairs; i < pendingIns.length; i++) {
      const bi = pendingIns[i] as number;
      out.push({ op: "insert", bLine: bi, bText: bLines[bi] as string });
    }
    pendingDel = [];
    pendingIns = [];
  };

  for (const e of script) {
    if (e.op === "equal") {
      flush();
      const ai = e.aIndex as number;
      const bi = e.bIndex as number;
      out.push({ op: "equal", aLine: ai, bLine: bi, aText: aLines[ai] as string });
    } else if (e.op === "delete") {
      pendingDel.push(e.aIndex as number);
    } else {
      pendingIns.push(e.bIndex as number);
    }
  }
  flush();
  return out;
}

/**
 * Refinement is skipped for line granularity and for individually huge lines.
 * A single very long line (a base64 blob, a bundled source map) would otherwise
 * run a second Myers pass over tens of thousands of tokens to produce output no
 * one can read.
 */
function shouldRefine(aText: string, bText: string, opts: ResolvedOptions): boolean {
  if (opts.granularity === "line") return false;
  return (
    aText.length <= opts.maxRefineLineLength && bText.length <= opts.maxRefineLineLength
  );
}

function refine(aText: string, bText: string, opts: ResolvedOptions): DiffSegment[] {
  // Grapheme clusters, not code units: an accented character or an emoji ZWJ
  // sequence must not be split down the middle by a character diff.
  const aTok = opts.granularity === "char" ? splitGraphemes(aText) : splitWordSegments(aText);
  const bTok = opts.granularity === "char" ? splitGraphemes(bText) : splitWordSegments(bText);
  const keyOf = (t: string): string => {
    let s = t;
    if (opts.ignoreWhitespace) s = s.replace(/\s+/g, "");
    if (opts.ignoreCase) s = s.toLowerCase();
    return s;
  };
  const aKeys = aTok.map(keyOf);
  const bKeys = bTok.map(keyOf);
  const script = diffArrays(aKeys, bKeys, (x, y) => x === y, { token: opts.token });

  const segs: DiffSegment[] = [];
  const push = (op: DiffSegment["op"], text: string): void => {
    const last = segs[segs.length - 1];
    if (last && last.op === op) segs[segs.length - 1] = { op, text: last.text + text };
    else segs.push({ op, text });
  };
  for (const e of script) {
    if (e.op === "equal") push("equal", aTok[e.aIndex as number] as string);
    else if (e.op === "delete") push("delete", aTok[e.aIndex as number] as string);
    else push("insert", bTok[e.bIndex as number] as string);
  }
  return segs;
}

function isChanged(line: DiffLine): boolean {
  return line.op !== "equal";
}

function buildHunks(lines: readonly DiffLine[], context: number): DiffHunk[] {
  const n = lines.length;
  const keep = new Array<boolean>(n).fill(false);
  for (let i = 0; i < n; i++) {
    if (isChanged(lines[i] as DiffLine)) {
      for (let j = Math.max(0, i - context); j <= Math.min(n - 1, i + context); j++) {
        keep[j] = true;
      }
    }
  }

  const hunks: DiffHunk[] = [];
  let i = 0;
  while (i < n) {
    if (!keep[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j < n && keep[j]) j++;
    hunks.push(makeHunk(lines.slice(i, j)));
    i = j;
  }
  return hunks;
}

function makeHunk(group: readonly DiffLine[]): DiffHunk {
  let aStart = Number.POSITIVE_INFINITY;
  let bStart = Number.POSITIVE_INFINITY;
  let aLines = 0;
  let bLines = 0;
  for (const l of group) {
    if (l.aLine !== undefined) {
      aStart = Math.min(aStart, l.aLine);
      aLines++;
    }
    if (l.bLine !== undefined) {
      bStart = Math.min(bStart, l.bLine);
      bLines++;
    }
  }
  return {
    aStart: Number.isFinite(aStart) ? aStart : 0,
    aLines,
    bStart: Number.isFinite(bStart) ? bStart : 0,
    bLines,
    lines: group,
  };
}
