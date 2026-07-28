import type {
  CancellationToken,
  CleanOrigin,
  MergeChoice,
  MergeRegion,
  MergeResolution,
  MergeResult,
} from "@ctr/core";
import { analyzeEol, normalizeEol, splitLines, throwIfCancelled } from "@ctr/core";
import { diffArrays } from "./myers";

export interface MergeLabels {
  readonly ours?: string;
  readonly base?: string;
  readonly theirs?: string;
}

export interface MergeOptions {
  /** Treat CRLF, LF and CR as equivalent when aligning the three inputs. */
  readonly ignoreEol?: boolean;
  readonly token?: CancellationToken;
}

/** Map each base-line index to its matching index in `other` (equal lines). */
function matchMap(
  base: readonly string[],
  other: readonly string[],
  token: CancellationToken | undefined,
): Map<number, number> {
  const map = new Map<number, number>();
  for (const e of diffArrays(base, other, (x, y) => x === y, { token })) {
    if (e.op === "equal" && e.aIndex !== undefined && e.bIndex !== undefined) {
      map.set(e.aIndex, e.bIndex);
    }
  }
  return map;
}

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Accumulates regions, assigning stable ids and merging adjacent clean runs. */
class RegionBuilder {
  private readonly regions: MergeRegion[] = [];
  private nextId = 0;

  private id(): string {
    return `region-${this.nextId++}`;
  }

  /**
   * Append a clean region.
   *
   * Adjacent clean regions are coalesced so a merge of a file with one conflict
   * yields three regions (clean, conflict, clean) rather than one per matched
   * line. That keeps region ids meaningful as navigation targets.
   *
   * Coalescing keeps the *first* region's origin. A run that begins as
   * "unchanged" and continues with an "ours" edit is reported as unchanged,
   * which understates it; the conservative direction, since origin is
   * explanatory metadata and the resolved text is unaffected either way.
   */
  pushClean(
    lines: readonly string[],
    origin: CleanOrigin,
    spans: MergeRegion["spans"],
  ): void {
    if (lines.length === 0) return;
    const last = this.regions[this.regions.length - 1];
    if (last && !last.conflict) {
      const merged = [...(last.resolved ?? []), ...lines];
      this.regions[this.regions.length - 1] = {
        ...last,
        baseLines: merged,
        ourLines: merged,
        theirLines: merged,
        resolved: merged,
        ...(last.spans && spans
          ? {
              spans: {
                base: { start: last.spans.base.start, end: spans.base.end },
                ours: { start: last.spans.ours.start, end: spans.ours.end },
                theirs: { start: last.spans.theirs.start, end: spans.theirs.end },
              },
            }
          : {}),
      };
      return;
    }
    this.regions.push({
      id: this.id(),
      conflict: false,
      baseLines: [...lines],
      ourLines: [...lines],
      theirLines: [...lines],
      resolved: [...lines],
      origin,
      ...(spans ? { spans } : {}),
    });
  }

  pushConflict(
    baseLines: readonly string[],
    ourLines: readonly string[],
    theirLines: readonly string[],
    spans: MergeRegion["spans"],
  ): void {
    this.regions.push({
      id: this.id(),
      conflict: true,
      baseLines: [...baseLines],
      ourLines: [...ourLines],
      theirLines: [...theirLines],
      ...(spans ? { spans } : {}),
    });
  }

  build(): MergeRegion[] {
    return this.regions;
  }
}

/**
 * A three-way (diff3) merge. `base` is the common ancestor; `ours` and `theirs`
 * are the two edited versions. Produces a list of regions; conflicting regions
 * keep all three sides so a UI can render a resolution view.
 *
 * Every region carries a stable id and, for clean regions, the reason it was
 * clean. Both are what let a caller build conflict navigation and a reviewable
 * merge report instead of an opaque blob of markers.
 */
export function threeWayMerge(
  baseText: string,
  oursText: string,
  theirsText: string,
  options: MergeOptions = {},
): MergeResult {
  throwIfCancelled(options.token, "merge");

  const eolBase = analyzeEol(baseText);
  const eolOurs = analyzeEol(oursText);
  const eolTheirs = analyzeEol(theirsText);

  const normalize = (t: string): string => (options.ignoreEol ? normalizeEol(t) : t);
  const base = splitLines(normalize(baseText));
  const ours = splitLines(normalize(oursText));
  const theirs = splitLines(normalize(theirsText));

  const aMatch = matchMap(base, ours, options.token);
  const bMatch = matchMap(base, theirs, options.token);

  interface Sync {
    o: number;
    a: number;
    b: number;
  }
  const syncs: Sync[] = [];
  for (let oi = 0; oi < base.length; oi++) {
    const a = aMatch.get(oi);
    const b = bMatch.get(oi);
    if (a !== undefined && b !== undefined) syncs.push({ o: oi, a, b });
  }
  syncs.push({ o: base.length, a: ours.length, b: theirs.length });

  const builder = new RegionBuilder();
  let oPrev = 0;
  let aPrev = 0;
  let bPrev = 0;

  for (const s of syncs) {
    throwIfCancelled(options.token, "merge");
    const oReg = base.slice(oPrev, s.o);
    const aReg = ours.slice(aPrev, s.a);
    const bReg = theirs.slice(bPrev, s.b);
    const spans = {
      base: { start: oPrev, end: s.o },
      ours: { start: aPrev, end: s.a },
      theirs: { start: bPrev, end: s.b },
    };

    if (oReg.length || aReg.length || bReg.length) {
      const ourChange = !arraysEqual(oReg, aReg);
      const theirChange = !arraysEqual(oReg, bReg);
      if (!ourChange && !theirChange) builder.pushClean(oReg, "unchanged", spans);
      else if (ourChange && !theirChange) builder.pushClean(aReg, "ours", spans);
      else if (!ourChange && theirChange) builder.pushClean(bReg, "theirs", spans);
      else if (arraysEqual(aReg, bReg)) builder.pushClean(aReg, "both-identical", spans);
      else builder.pushConflict(oReg, aReg, bReg, spans);
    }

    if (s.o < base.length) {
      builder.pushClean([base[s.o] as string], "unchanged", {
        base: { start: s.o, end: s.o + 1 },
        ours: { start: s.a, end: s.a + 1 },
        theirs: { start: s.b, end: s.b + 1 },
      });
    }
    oPrev = s.o + 1;
    aPrev = s.a + 1;
    bPrev = s.b + 1;
  }

  const regions = builder.build();
  const conflictIds = regions.filter((r) => r.conflict).map((r) => r.id);
  return {
    clean: conflictIds.length === 0,
    regions,
    conflictCount: conflictIds.length,
    conflictIds,
    eol: {
      base: eolBase.dominant,
      ours: eolOurs.dominant,
      theirs: eolTheirs.dominant,
      differs:
        eolBase.dominant !== eolOurs.dominant || eolOurs.dominant !== eolTheirs.dominant,
    },
  };
}

/** The lines a given choice selects for a conflicting region. */
function linesForChoice(region: MergeRegion, choice: MergeChoice): readonly string[] {
  switch (choice) {
    case "ours":
      return region.ourLines;
    case "theirs":
      return region.theirLines;
    case "base":
      return region.baseLines;
    case "both-ours-first":
      return [...region.ourLines, ...region.theirLines];
    case "both-theirs-first":
      return [...region.theirLines, ...region.ourLines];
    default:
      return region.ourLines;
  }
}

export interface ResolveOptions {
  /** Line terminator for the produced text. Defaults to `\n`. */
  readonly eol?: string;
  /**
   * What to do with conflicts that have no resolution. `markers` (the default)
   * writes git-style conflict markers; `ours`/`theirs` pick a side; `throw`
   * refuses, which is what a "save merged file" action should use so an
   * unresolved conflict can never be written silently.
   */
  readonly unresolved?: "markers" | "ours" | "theirs" | "throw";
  readonly labels?: MergeLabels;
  /** Include the base section in emitted markers (git's `diff3` style). */
  readonly diff3?: boolean;
}

export interface ResolveResult {
  readonly text: string;
  /** Ids of conflicts that had no resolution and were handled by the fallback. */
  readonly unresolvedIds: readonly string[];
  /** True when every conflict had an explicit resolution. */
  readonly fullyResolved: boolean;
}

/**
 * Apply a set of per-region decisions and produce merged text.
 *
 * Resolutions are keyed by region id rather than by index, so a caller that
 * re-runs the merge after an unrelated edit does not silently apply a decision
 * to the wrong conflict.
 *
 * The default for unresolved conflicts is to emit markers rather than to guess.
 * Callers writing to disk should pass `unresolved: "throw"` so an incomplete
 * resolution surfaces as an error instead of a half-merged file.
 */
export function resolveMerge(
  result: MergeResult,
  resolutions: readonly MergeResolution[] = [],
  options: ResolveOptions = {},
): ResolveResult {
  const eol = options.eol ?? "\n";
  const mode = options.unresolved ?? "markers";
  const byId = new Map(resolutions.map((r) => [r.regionId, r]));
  const out: string[] = [];
  const unresolvedIds: string[] = [];

  for (const region of result.regions) {
    if (!region.conflict) {
      out.push(...(region.resolved ?? region.baseLines));
      continue;
    }

    const resolution = byId.get(region.id);
    if (resolution) {
      out.push(...(resolution.manualLines ?? linesForChoice(region, resolution.choice)));
      continue;
    }

    unresolvedIds.push(region.id);
    if (mode === "throw") {
      throw new Error(
        `Cannot produce merged output: conflict "${region.id}" has no resolution. ` +
          `Resolve all ${result.conflictCount} conflict(s) first.`,
      );
    }
    if (mode === "ours") {
      out.push(...region.ourLines);
    } else if (mode === "theirs") {
      out.push(...region.theirLines);
    } else {
      out.push(...conflictMarkers(region, options.labels ?? {}, options.diff3 ?? true));
    }
  }

  return {
    text: out.join(eol),
    unresolvedIds,
    fullyResolved: unresolvedIds.length === 0,
  };
}

function conflictMarkers(
  region: MergeRegion,
  labels: MergeLabels,
  diff3: boolean,
): string[] {
  const ours = labels.ours ?? "ours";
  const base = labels.base ?? "base";
  const theirs = labels.theirs ?? "theirs";
  const out: string[] = [`<<<<<<< ${ours}`, ...region.ourLines];
  if (diff3) out.push(`||||||| ${base}`, ...region.baseLines);
  out.push("=======", ...region.theirLines, `>>>>>>> ${theirs}`);
  return out;
}

/**
 * Render a merge result to text. Clean regions emit their resolved lines;
 * conflicts emit git-style markers.
 *
 * Retained for backwards compatibility; `resolveMerge` is the richer entry
 * point and is what the CLI and extension use.
 */
export function renderMerge(result: MergeResult, labels: MergeLabels = {}): string {
  return resolveMerge(result, [], { labels, unresolved: "markers", diff3: true }).text;
}
