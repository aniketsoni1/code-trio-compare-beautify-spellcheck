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

function commonSuffix(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[a.length - 1 - i] === b[b.length - 1 - i]) i++;
  return i;
}

/**
 * QWERTY neighbour map, used to prefer typos over coincidental near-matches.
 *
 * Both "hte" -> "the" and "hte" -> "ate" are one edit away. The first is a
 * transposition of adjacent keys and is overwhelmingly the intended word; the
 * second is a coincidence. Weighting substitutions by physical key distance is
 * what separates them.
 *
 * QWERTY only. A Dvorak or AZERTY user gets slightly worse ranking, never a
 * wrong result, and detecting the host layout would make suggestions
 * machine-dependent — which would break the determinism guarantee the whole
 * product rests on.
 */
const KEYBOARD_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"] as const;

const ADJACENCY: ReadonlyMap<string, ReadonlySet<string>> = (() => {
  const map = new Map<string, Set<string>>();
  const add = (a: string, b: string): void => {
    if (!a || !b) return;
    if (!map.has(a)) map.set(a, new Set());
    (map.get(a) as Set<string>).add(b);
  };
  KEYBOARD_ROWS.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      const key = row[c] as string;
      add(key, row[c - 1] ?? "");
      add(key, row[c + 1] ?? "");
      for (const dr of [-1, 1]) {
        const other = KEYBOARD_ROWS[r + dr];
        if (!other) continue;
        for (const dc of [-1, 0, 1]) {
          add(key, other[c + dc] ?? "");
        }
      }
    }
  });
  return map;
})();

/** True when two letters are physically adjacent on a QWERTY keyboard. */
export function areKeysAdjacent(a: string, b: string): boolean {
  return ADJACENCY.get(a.toLowerCase())?.has(b.toLowerCase()) ?? false;
}

/**
 * Count single-character substitutions between two equal-length strings that
 * involve adjacent keys. Only meaningful for same-length candidates, which is
 * why the caller checks length first.
 */
function adjacentSubstitutions(a: string, b: string): number {
  if (a.length !== b.length) return 0;
  let adjacent = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] as string;
    const y = b[i] as string;
    if (x !== y && areKeysAdjacent(x, y)) adjacent++;
  }
  return adjacent;
}

/** True when the two strings differ only by transposing one adjacent pair. */
function isTransposition(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const diff: number[] = [];
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) diff.push(i);
    if (diff.length > 2) return false;
  }
  if (diff.length !== 2) return false;
  const [i, j] = diff as [number, number];
  return j === i + 1 && a[i] === b[j] && a[j] === b[i];
}

export interface SuggestOptions {
  readonly limit?: number;
  readonly maxDistance?: number;
  /**
   * Words to rank above equally-distant alternatives. The spell engine passes
   * the technical dictionary here, so in a codebase "kubernets" resolves to
   * "kubernetes" rather than to a similarly-distant ordinary English word.
   */
  readonly preferred?: ReadonlySet<string>;
  /** Cap on candidates examined, so a huge dictionary cannot stall a scan. */
  readonly maxCandidates?: number;
}

interface Scored {
  word: string;
  dist: number;
  prefix: number;
  suffix: number;
  transposed: boolean;
  adjacent: number;
  preferred: boolean;
}

/**
 * Rank suggestions for an unknown word against a dictionary word pool.
 * Returns the closest words, best first.
 *
 * Ranking is deterministic and, at every stage, resolves ties by a defined rule
 * ending in alphabetical order — so the same input always produces the same
 * list, on any machine, in any order of dictionary iteration.
 */
export function suggest(
  word: string,
  pool: Iterable<string>,
  limitOrOptions: number | SuggestOptions = 5,
  maxDistanceArg = 2,
): string[] {
  const options: SuggestOptions =
    typeof limitOrOptions === "number"
      ? { limit: limitOrOptions, maxDistance: maxDistanceArg }
      : limitOrOptions;
  const limit = options.limit ?? 5;
  const maxDistance = options.maxDistance ?? 2;
  const maxCandidates = options.maxCandidates ?? 200_000;

  const w = word.toLowerCase();
  // Short words get a tighter bound: at distance 2, a four-letter word is
  // closer to half the dictionary than to anything useful.
  const bound = w.length <= 4 ? Math.min(1, maxDistance) : maxDistance;

  const scored: Scored[] = [];
  let examined = 0;
  for (const candidate of pool) {
    if (++examined > maxCandidates) break;
    if (Math.abs(candidate.length - w.length) > bound) continue;
    const dist = boundedEditDistance(w, candidate, bound);
    if (dist > bound) continue;
    scored.push({
      word: candidate,
      dist,
      prefix: commonPrefix(w, candidate),
      suffix: commonSuffix(w, candidate),
      transposed: isTransposition(w, candidate),
      adjacent: adjacentSubstitutions(w, candidate),
      preferred: options.preferred?.has(candidate) ?? false,
    });
  }

  scored.sort((x, y) => {
    if (x.dist !== y.dist) return x.dist - y.dist;
    // A transposition of adjacent characters is the most common typo of all.
    if (x.transposed !== y.transposed) return x.transposed ? -1 : 1;
    // Then substitutions of physically adjacent keys.
    if (x.adjacent !== y.adjacent) return y.adjacent - x.adjacent;
    // Then domain vocabulary over general vocabulary.
    if (x.preferred !== y.preferred) return x.preferred ? -1 : 1;
    // Then shared beginnings, then shared endings.
    if (x.prefix !== y.prefix) return y.prefix - x.prefix;
    if (x.suffix !== y.suffix) return y.suffix - x.suffix;
    return x.word.localeCompare(y.word, "en");
  });

  const out: string[] = [];
  for (const s of scored) {
    if (!out.includes(s.word)) out.push(s.word);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Re-apply the original word's capitalisation to a suggestion.
 *
 * Without this, accepting a fix for "Recieve" at the start of a sentence
 * silently lowercases it, and fixing "URL_PARSE" yields "url_parse". Three
 * cases are recognised: all upper, leading upper, and everything else.
 */
export function applyCase(original: string, suggestion: string): string {
  if (original.length > 1 && original === original.toUpperCase()) {
    return suggestion.toUpperCase();
  }
  const first = original[0];
  if (first && first === first.toUpperCase() && first !== first.toLowerCase()) {
    return suggestion.charAt(0).toUpperCase() + suggestion.slice(1);
  }
  return suggestion;
}
