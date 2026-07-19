import type {
  DiffGranularity,
  DiffHunk,
  DiffLine,
  DiffResult,
  DiffSegment,
  Document,
} from "@ctr/core";
import { splitLines } from "@ctr/core";
import { diffArrays, type Edit } from "./myers";
import { splitChars, splitWords } from "./tokenize";

export interface DiffOptions {
  readonly granularity?: DiffGranularity;
  readonly ignoreWhitespace?: boolean;
  readonly ignoreCase?: boolean;
  /** Lines of unchanged context to keep around each change in a hunk. */
  readonly contextLines?: number;
}

interface ResolvedOptions {
  granularity: DiffGranularity;
  ignoreWhitespace: boolean;
  ignoreCase: boolean;
  contextLines: number;
}

function resolve(options: DiffOptions | undefined): ResolvedOptions {
  return {
    granularity: options?.granularity ?? "line",
    ignoreWhitespace: options?.ignoreWhitespace ?? false,
    ignoreCase: options?.ignoreCase ?? false,
    contextLines: Math.max(0, options?.contextLines ?? 3),
  };
}

function normalizeLine(line: string, opts: ResolvedOptions): string {
  let s = line;
  if (opts.ignoreWhitespace) s = s.replace(/\s+/g, "");
  if (opts.ignoreCase) s = s.toLowerCase();
  return s;
}

/** Compute a two-way diff between two texts. */
export function diffText(aText: string, bText: string, options?: DiffOptions): DiffResult {
  const opts = resolve(options);
  const aLines = splitLines(aText);
  const bLines = splitLines(bText);
  const aKeys = aLines.map((l) => normalizeLine(l, opts));
  const bKeys = bLines.map((l) => normalizeLine(l, opts));

  const script = diffArrays(aKeys, bKeys, (x, y) => x === y);
  const lines = alignLines(script, aLines, bLines, opts);

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
  const hunks = identical ? [] : buildHunks(lines, opts.contextLines);

  return {
    granularity: opts.granularity,
    identical,
    hunks,
    stats: { insertions, deletions, unchanged },
  };
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
        segments: opts.granularity === "line" ? undefined : refine(aText, bText, opts),
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

function refine(aText: string, bText: string, opts: ResolvedOptions): DiffSegment[] {
  const aTok = opts.granularity === "char" ? splitChars(aText) : splitWords(aText);
  const bTok = opts.granularity === "char" ? splitChars(bText) : splitWords(bText);
  const keyOf = (t: string): string => {
    let s = t;
    if (opts.ignoreWhitespace) s = s.replace(/\s+/g, "");
    if (opts.ignoreCase) s = s.toLowerCase();
    return s;
  };
  const aKeys = aTok.map(keyOf);
  const bKeys = bTok.map(keyOf);
  const script = diffArrays(aKeys, bKeys, (x, y) => x === y);

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
