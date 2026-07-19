import type { MergeRegion, MergeResult } from "@ctr/core";
import { splitLines } from "@ctr/core";
import { diffArrays } from "./myers";

export interface MergeLabels {
  readonly ours?: string;
  readonly base?: string;
  readonly theirs?: string;
}

/** Map each base-line index to its matching index in `other` (equal lines). */
function matchMap(base: readonly string[], other: readonly string[]): Map<number, number> {
  const map = new Map<number, number>();
  for (const e of diffArrays(base, other, (x, y) => x === y)) {
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

/**
 * A three-way (diff3) merge. `base` is the common ancestor; `ours` and `theirs`
 * are the two edited versions. Produces a list of regions; conflicting regions
 * keep all three sides so a UI can render a resolution view.
 */
export function threeWayMerge(
  baseText: string,
  oursText: string,
  theirsText: string,
): MergeResult {
  const base = splitLines(baseText);
  const ours = splitLines(oursText);
  const theirs = splitLines(theirsText);

  const aMatch = matchMap(base, ours);
  const bMatch = matchMap(base, theirs);

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

  const regions: MergeRegion[] = [];
  let oPrev = 0;
  let aPrev = 0;
  let bPrev = 0;

  const pushClean = (lines: readonly string[]): void => {
    if (lines.length === 0) return;
    const last = regions[regions.length - 1];
    if (last && !last.conflict) {
      const merged = [...(last.resolved ?? []), ...lines];
      regions[regions.length - 1] = {
        conflict: false,
        baseLines: merged,
        ourLines: merged,
        theirLines: merged,
        resolved: merged,
      };
    } else {
      regions.push({
        conflict: false,
        baseLines: [...lines],
        ourLines: [...lines],
        theirLines: [...lines],
        resolved: [...lines],
      });
    }
  };

  for (const s of syncs) {
    const oReg = base.slice(oPrev, s.o);
    const aReg = ours.slice(aPrev, s.a);
    const bReg = theirs.slice(bPrev, s.b);

    if (oReg.length || aReg.length || bReg.length) {
      const ourChange = !arraysEqual(oReg, aReg);
      const theirChange = !arraysEqual(oReg, bReg);
      if (!ourChange && !theirChange) pushClean(oReg);
      else if (ourChange && !theirChange) pushClean(aReg);
      else if (!ourChange && theirChange) pushClean(bReg);
      else if (arraysEqual(aReg, bReg)) pushClean(aReg);
      else {
        regions.push({
          conflict: true,
          baseLines: oReg,
          ourLines: aReg,
          theirLines: bReg,
        });
      }
    }

    if (s.o < base.length) pushClean([base[s.o] as string]);
    oPrev = s.o + 1;
    aPrev = s.a + 1;
    bPrev = s.b + 1;
  }

  const conflictCount = regions.reduce((acc, r) => acc + (r.conflict ? 1 : 0), 0);
  return { clean: conflictCount === 0, regions, conflictCount };
}

/**
 * Render a merge result to text. Clean regions emit their resolved lines;
 * conflicts emit git-style markers.
 */
export function renderMerge(result: MergeResult, labels: MergeLabels = {}): string {
  const ours = labels.ours ?? "ours";
  const base = labels.base ?? "base";
  const theirs = labels.theirs ?? "theirs";
  const out: string[] = [];
  for (const r of result.regions) {
    if (!r.conflict) {
      out.push(...(r.resolved ?? []));
      continue;
    }
    out.push(`<<<<<<< ${ours}`);
    out.push(...r.ourLines);
    out.push(`||||||| ${base}`);
    out.push(...r.baseLines);
    out.push("=======");
    out.push(...r.theirLines);
    out.push(`>>>>>>> ${theirs}`);
  }
  return out.join("\n");
}
