/**
 * Myers O(ND) diff over arrays of arbitrary tokens, with an injectable
 * equality function. Returns a linear edit script of equal/insert/delete
 * operations. Kept pure and dependency-free.
 *
 * Reference: Eugene W. Myers, "An O(ND) Difference Algorithm and Its
 * Variations" (1986).
 */

export type EditOp = "equal" | "insert" | "delete";

export interface Edit {
  readonly op: EditOp;
  /** Index into A for equal/delete. */
  readonly aIndex?: number;
  /** Index into B for equal/insert. */
  readonly bIndex?: number;
}

/**
 * Above this combined size the quadratic-memory trace is skipped in favor of a
 * fast anchored fallback that still produces a correct (if less minimal) script.
 */
const MYERS_BUDGET = 4_000_000;

export function diffArrays<T>(
  a: readonly T[],
  b: readonly T[],
  eq: (x: T, y: T) => boolean,
): Edit[] {
  const n = a.length;
  const m = b.length;
  if (n === 0 && m === 0) return [];
  if (n === 0) return b.map((_, i) => ({ op: "insert" as const, bIndex: i }));
  if (m === 0) return a.map((_, i) => ({ op: "delete" as const, aIndex: i }));

  if (n * m > MYERS_BUDGET) {
    return anchoredFallback(a, b, eq);
  }
  return myers(a, b, eq);
}

function myers<T>(a: readonly T[], b: readonly T[], eq: (x: T, y: T) => boolean): Edit[] {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  const offset = max;
  const v = new Array<number>(2 * max + 1).fill(0);
  const trace: number[][] = [];

  let found = false;
  for (let d = 0; d <= max && !found; d++) {
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

  return backtrack(trace, n, m, offset);
}

function backtrack(trace: number[][], n: number, m: number, offset: number): Edit[] {
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
      edits.push({ op: "equal", aIndex: x - 1, bIndex: y - 1 });
      x--;
      y--;
    }
    if (d > 0) {
      if (x === prevX) {
        edits.push({ op: "insert", bIndex: prevY });
      } else {
        edits.push({ op: "delete", aIndex: prevX });
      }
    }
    x = prevX;
    y = prevY;
  }
  edits.reverse();
  return edits;
}

/**
 * Fallback for very large inputs: anchor on the longest common prefix/suffix,
 * then emit the middle as a block delete + insert. Correct but coarse.
 */
function anchoredFallback<T>(
  a: readonly T[],
  b: readonly T[],
  eq: (x: T, y: T) => boolean,
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
  for (let i = 0; i < lo; i++) edits.push({ op: "equal", aIndex: i, bIndex: i });
  for (let i = lo; i < hiA; i++) edits.push({ op: "delete", aIndex: i });
  for (let j = lo; j < hiB; j++) edits.push({ op: "insert", bIndex: j });
  for (let off = 0; off < n - hiA; off++) {
    edits.push({ op: "equal", aIndex: hiA + off, bIndex: hiB + off });
  }
  return edits;
}

/** Longest common subsequence length, used by the three-way merge. */
export function lcsLength<T>(a: readonly T[], b: readonly T[], eq: (x: T, y: T) => boolean): number {
  let equal = 0;
  for (const e of diffArrays(a, b, eq)) if (e.op === "equal") equal++;
  return equal;
}
