/**
 * Myers O(ND) diff over arrays of arbitrary tokens, with an injectable
 * equality function. Returns a linear edit script of equal/insert/delete
 * operations. Kept pure and dependency-free.
 *
 * Reference: Eugene W. Myers, "An O(ND) Difference Algorithm and Its
 * Variations" (1986).
 */
import { type CancellationToken, throwIfCancelled } from "@ctr/core";

export type EditOp = "equal" | "insert" | "delete";

export interface Edit {
  readonly op: EditOp;
  /** Index into A for equal/delete. */
  readonly aIndex?: number;
  /** Index into B for equal/insert. */
  readonly bIndex?: number;
}

export interface DiffArraysOptions {
  readonly token?: CancellationToken;
  /**
   * Maximum number of array slots the backtrace may allocate. The trace is
   * `O(D * (N + M))`, so this bounds memory rather than time.
   */
  readonly maxTraceCells?: number;
}

/**
 * Memory ceiling for the backtrace, in array slots.
 *
 * The previous implementation guarded `n * m`, which is the *time* bound of the
 * classic quadratic algorithm and has nothing to do with what Myers actually
 * allocates. Two 30k-line files that are entirely different have an `n * m`
 * that trips the old guard only incidentally, while the real cost is a trace of
 * 60k rows each 120k wide. Guarding the trace directly is both tighter and
 * correct.
 */
const DEFAULT_MAX_TRACE_CELLS = 25_000_000;

/**
 * Above this edit distance the trace is skipped in favour of the anchored
 * fallback regardless of the cell budget, because the backtrace walk itself
 * becomes the bottleneck.
 */
const MAX_D_FOR_MYERS = 100_000;

/** How often, in Myers `d` iterations, to poll the cancellation token. */
const CANCEL_POLL_INTERVAL = 64;

export function diffArrays<T>(
  a: readonly T[],
  b: readonly T[],
  eq: (x: T, y: T) => boolean,
  options: DiffArraysOptions = {},
): Edit[] {
  const n = a.length;
  const m = b.length;
  if (n === 0 && m === 0) return [];
  if (n === 0) return b.map((_, i) => ({ op: "insert" as const, bIndex: i }));
  if (m === 0) return a.map((_, i) => ({ op: "delete" as const, aIndex: i }));

  // Trim the common prefix and suffix before running Myers.
  //
  // This is the highest-value optimisation for real diffs: an edit in the
  // middle of a 10,000-line file leaves a handful of differing lines for the
  // expensive search instead of 10,000. It also stabilises hunk boundaries,
  // because shared affixes can no longer be re-aligned by the search finding an
  // equally minimal but differently placed script.
  let lo = 0;
  while (lo < n && lo < m && eq(a[lo] as T, b[lo] as T)) lo++;
  let hiA = n;
  let hiB = m;
  while (hiA > lo && hiB > lo && eq(a[hiA - 1] as T, b[hiB - 1] as T)) {
    hiA--;
    hiB--;
  }

  const midA = a.slice(lo, hiA);
  const midB = b.slice(lo, hiB);

  let middle: Edit[];
  if (midA.length === 0) {
    middle = midB.map((_, i) => ({ op: "insert" as const, bIndex: lo + i }));
  } else if (midB.length === 0) {
    middle = midA.map((_, i) => ({ op: "delete" as const, aIndex: lo + i }));
  } else {
    const maxCells = options.maxTraceCells ?? DEFAULT_MAX_TRACE_CELLS;
    const worstCaseD = midA.length + midB.length;
    const rowWidth = 2 * worstCaseD + 1;
    const tooBig = worstCaseD > MAX_D_FOR_MYERS || worstCaseD * rowWidth > maxCells;
    middle = tooBig
      ? anchoredFallback(midA, midB, eq, lo, lo)
      : myers(midA, midB, eq, lo, lo, options.token);
  }

  const edits: Edit[] = [];
  for (let i = 0; i < lo; i++) edits.push({ op: "equal", aIndex: i, bIndex: i });
  edits.push(...middle);
  for (let off = 0; off < n - hiA; off++) {
    edits.push({ op: "equal", aIndex: hiA + off, bIndex: hiB + off });
  }
  return edits;
}

function myers<T>(
  a: readonly T[],
  b: readonly T[],
  eq: (x: T, y: T) => boolean,
  aOffset: number,
  bOffset: number,
  token: CancellationToken | undefined,
): Edit[] {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  const offset = max;
  const v = new Array<number>(2 * max + 1).fill(0);
  const trace: number[][] = [];

  let found = false;
  for (let d = 0; d <= max && !found; d++) {
    if (d % CANCEL_POLL_INTERVAL === 0) throwIfCancelled(token, "diff");
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      const ki = k + offset;
      const down = k === -d || (k !== d && (v[ki - 1] ?? 0) < (v[ki + 1] ?? 0));
      let x = down ? (v[ki + 1] ?? 0) : (v[ki - 1] ?? 0) + 1;
      let y = x - k;
      while (x < n && y < m && eq(a[x] as T, b[y] as T)) {
        x++;
        y++;
      }
      v[ki] = x;
      if (x >= n && y >= m) {
        found = true;
        break;
      }
    }
  }

  return backtrack(trace, n, m, offset, aOffset, bOffset);
}

function backtrack(
  trace: number[][],
  n: number,
  m: number,
  offset: number,
  aOffset: number,
  bOffset: number,
): Edit[] {
  const edits: Edit[] = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d >= 0; d--) {
    const v = trace[d] as number[];
    const k = x - y;
    const ki = k + offset;
    const down = k === -d || (k !== d && (v[ki - 1] ?? 0) < (v[ki + 1] ?? 0));
    const prevK = down ? k + 1 : k - 1;
    const prevX = v[prevK + offset] ?? 0;
    const prevY = prevX - prevK;

    while (x > prevX && y > prevY) {
      edits.push({ op: "equal", aIndex: aOffset + x - 1, bIndex: bOffset + y - 1 });
      x--;
      y--;
    }
    if (d > 0) {
      if (x === prevX) {
        edits.push({ op: "insert", bIndex: bOffset + prevY });
      } else {
        edits.push({ op: "delete", aIndex: aOffset + prevX });
      }
    }
    x = prevX;
    y = prevY;
  }
  edits.reverse();
  return edits;
}

/**
 * Fallback for very large inputs: anchor on the longest common prefix/suffix of
 * the region, then emit the middle as a block delete + insert. Correct but
 * coarse.
 *
 * `diffArrays` has already trimmed the outer affixes, so in practice this
 * re-trim finds nothing and the whole middle becomes one delete/insert block.
 * It is retained because the recursion is cheap and it keeps the function
 * correct when called with untrimmed input.
 */
function anchoredFallback<T>(
  a: readonly T[],
  b: readonly T[],
  eq: (x: T, y: T) => boolean,
  aOffset: number,
  bOffset: number,
): Edit[] {
  const n = a.length;
  const m = b.length;
  let lo = 0;
  while (lo < n && lo < m && eq(a[lo] as T, b[lo] as T)) lo++;
  let hiA = n;
  let hiB = m;
  while (hiA > lo && hiB > lo && eq(a[hiA - 1] as T, b[hiB - 1] as T)) {
    hiA--;
    hiB--;
  }
  const edits: Edit[] = [];
  for (let i = 0; i < lo; i++) {
    edits.push({ op: "equal", aIndex: aOffset + i, bIndex: bOffset + i });
  }
  for (let i = lo; i < hiA; i++) edits.push({ op: "delete", aIndex: aOffset + i });
  for (let j = lo; j < hiB; j++) edits.push({ op: "insert", bIndex: bOffset + j });
  for (let off = 0; off < n - hiA; off++) {
    edits.push({ op: "equal", aIndex: aOffset + hiA + off, bIndex: bOffset + hiB + off });
  }
  return edits;
}

/** Longest common subsequence length, used by the three-way merge. */
export function lcsLength<T>(a: readonly T[], b: readonly T[], eq: (x: T, y: T) => boolean): number {
  let equal = 0;
  for (const e of diffArrays(a, b, eq)) if (e.op === "equal") equal++;
  return equal;
}
