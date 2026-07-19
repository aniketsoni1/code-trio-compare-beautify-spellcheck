/**
 * Bounded Damerau-Levenshtein distance and suggestion ranking. The bound lets
 * us bail out early, keeping a full dictionary scan cheap for the ~1k-word
 * built-in lists.
 */
export function boundedEditDistance(a: string, b: string, max: number): number {
  const al = a.length;
  const bl = b.length;
  if (Math.abs(al - bl) > max) return max + 1;
  if (al === 0) return bl;
  if (bl === 0) return al;

  let prevPrev = new Array<number>(bl + 1).fill(0);
  let prev = new Array<number>(bl + 1);
  let curr = new Array<number>(bl + 1);
  for (let j = 0; j <= bl; j++) prev[j] = j;

  for (let i = 1; i <= al; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    const ai = a[i - 1];
    for (let j = 1; j <= bl; j++) {
      const cost = ai === b[j - 1] ? 0 : 1;
      let v = Math.min(
        (prev[j] as number) + 1,
        (curr[j - 1] as number) + 1,
        (prev[j - 1] as number) + cost,
      );
      if (i > 1 && j > 1 && ai === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, (prevPrev[j - 2] as number) + 1);
      }
      curr[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    const tmp = prevPrev;
    prevPrev = prev;
    prev = curr;
    curr = tmp;
  }
  return prev[bl] as number;
}

function commonPrefix(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i++;
  return i;
}

/**
 * Rank suggestions for an unknown word against a dictionary word pool. Returns
 * the closest words, best first.
 */
export function suggest(
  word: string,
  pool: Iterable<string>,
  limit = 5,
  maxDistance = 2,
): string[] {
  const w = word.toLowerCase();
  const bound = w.length <= 4 ? Math.min(1, maxDistance) : maxDistance;
  const scored: Array<{ word: string; dist: number; prefix: number }> = [];
  for (const candidate of pool) {
    if (Math.abs(candidate.length - w.length) > bound) continue;
    const dist = boundedEditDistance(w, candidate, bound);
    if (dist <= bound) {
      scored.push({ word: candidate, dist, prefix: commonPrefix(w, candidate) });
    }
  }
  scored.sort((x, y) => {
    if (x.dist !== y.dist) return x.dist - y.dist;
    if (x.prefix !== y.prefix) return y.prefix - x.prefix;
    return x.word.localeCompare(y.word);
  });
  const out: string[] = [];
  for (const s of scored) {
    if (!out.includes(s.word)) out.push(s.word);
    if (out.length >= limit) break;
  }
  return out;
}
