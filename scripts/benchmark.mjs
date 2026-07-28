#!/usr/bin/env node
/**
 * Code Trio benchmark suite.
 *
 * Deliberately dependency-free and offline: fixtures are generated in memory
 * from a seeded PRNG, so a run needs no network, no checked-in corpus, and
 * produces the same inputs on every machine.
 *
 * Reported numbers are medians of N runs after warm-up. Medians rather than
 * means because a single GC pause in one iteration would otherwise dominate the
 * average and make a clean run look like a regression.
 *
 * Usage:
 *   node scripts/benchmark.mjs                 human-readable table
 *   node scripts/benchmark.mjs --json          machine-readable
 *   node scripts/benchmark.mjs --runs 20       more iterations
 *   node scripts/benchmark.mjs --baseline f.json   compare against a baseline
 */
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

// Run through tsx so the TypeScript sources are measured directly - the same
// code the tests exercise, rather than a separately built bundle:
//
//   npm run bench
//
// which is `tsx scripts/benchmark.mjs`. Invoking with bare `node` fails on the
// first TypeScript import, which is the intended, obvious failure.

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const runsIndex = args.indexOf("--runs");
const RUNS = runsIndex >= 0 ? Number(args[runsIndex + 1]) : 9;
const baselineIndex = args.indexOf("--baseline");
const baselinePath = baselineIndex >= 0 ? args[baselineIndex + 1] : undefined;

/** Deterministic PRNG (mulberry32), so fixtures are identical everywhere. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORDS = [
  "const", "value", "handler", "request", "response", "config", "result",
  "context", "buffer", "stream", "worker", "session", "provider", "adapter",
  "the", "and", "with", "from", "into", "when", "where", "which", "should",
];

function makeSource(lines, seed) {
  const random = rng(seed);
  const out = [];
  for (let i = 0; i < lines; i++) {
    const kind = random();
    if (kind < 0.15) {
      out.push(`// ${pick(random)} ${pick(random)} ${pick(random)} handling for step ${i}`);
    } else if (kind < 0.25) {
      out.push("");
    } else {
      out.push(`  const ${pick(random)}${i} = ${pick(random)}(${pick(random)}, ${i});`);
    }
  }
  return out.join("\n") + "\n";
}

function pick(random) {
  return WORDS[Math.floor(random() * WORDS.length)];
}

/** Mutate roughly `ratio` of lines, simulating a realistic edit. */
function mutate(text, ratio, seed) {
  const random = rng(seed);
  return text
    .split("\n")
    .map((line) => (random() < ratio ? `${line} // edited` : line))
    .join("\n");
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

async function bench(name, fn, runs = RUNS) {
  // Warm-up: the first two runs pay for JIT compilation and lazy module init,
  // which would otherwise be attributed to the operation under test.
  await fn();
  await fn();
  const samples = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    await fn();
    samples.push(performance.now() - start);
  }
  return {
    name,
    medianMs: Number(median(samples).toFixed(3)),
    minMs: Number(Math.min(...samples).toFixed(3)),
    maxMs: Number(Math.max(...samples).toFixed(3)),
    runs,
  };
}

async function main() {
  const { diffText } = await import("../packages/diff-engine/src/diff.ts");
  const { threeWayMerge, resolveMerge } = await import("../packages/diff-engine/src/merge.ts");
  const { spellCheck } = await import("../packages/spell-engine/src/spell.ts");
  const { loadDictionary } = await import("../packages/dictionaries/src/dictionary.ts");
  const { DictionaryStack } = await import("../packages/dictionaries/src/scopes.ts");
  const { renderUnifiedDiff, renderDiffMarkdown } = await import(
    "../packages/reporting/src/diff-report.ts"
  );
  const { PrettierAdapter } = await import("../packages/formatters/src/prettier.ts");

  const small = makeSource(200, 1);
  const medium = makeSource(2_000, 2);
  const large = makeSource(20_000, 3);
  const smallEdited = mutate(small, 0.05, 11);
  const mediumEdited = mutate(medium, 0.05, 12);
  const largeEdited = mutate(large, 0.05, 13);

  const dictionary = loadDictionary(["base", "technical"]);
  const results = [];

  results.push(await bench("diff/line/small (200 lines)", () => diffText(small, smallEdited)));
  results.push(await bench("diff/line/medium (2k lines)", () => diffText(medium, mediumEdited)));
  results.push(
    await bench("diff/line/large (20k lines)", () => diffText(large, largeEdited), 5),
  );
  results.push(
    await bench("diff/word/medium (2k lines)", () =>
      diffText(medium, mediumEdited, { granularity: "word" }),
    ),
  );
  results.push(
    await bench(
      "diff/char/medium (2k lines)",
      () => diffText(medium, mediumEdited, { granularity: "char" }),
      5,
    ),
  );
  results.push(
    await bench("diff/identical/large (20k lines)", () => diffText(large, large), 5),
  );

  const base = makeSource(1_000, 21);
  const ours = mutate(base, 0.05, 22);
  const theirs = mutate(base, 0.05, 23);
  results.push(await bench("merge/3-way (1k lines)", () => threeWayMerge(base, ours, theirs)));
  const merged = threeWayMerge(base, ours, theirs);
  results.push(await bench("merge/resolve (1k lines)", () => resolveMerge(merged)));

  results.push(
    await bench("spell/small (200 lines)", () =>
      spellCheck({ uri: "b", languageId: "typescript", text: small }, { dictionary }),
    ),
  );
  results.push(
    await bench("spell/medium (2k lines)", () =>
      spellCheck({ uri: "b", languageId: "typescript", text: medium }, { dictionary }),
    ),
  );
  results.push(
    await bench(
      "spell/large (20k lines)",
      () => spellCheck({ uri: "b", languageId: "typescript", text: large }, { dictionary }),
      5,
    ),
  );
  results.push(
    await bench("spell/noise-suppression-off (2k lines)", () =>
      spellCheck(
        { uri: "b", languageId: "typescript", text: medium },
        { dictionary, ignoreNoiseTokens: false },
      ),
    ),
  );

  results.push(await bench("dictionary/load builtin", () => loadDictionary(["base", "technical"])));
  results.push(
    await bench("dictionary/stack lookup x1000", () => {
      const stack = new DictionaryStack([{ scope: "base", words: dictionary.list() }]);
      for (let i = 0; i < 1000; i++) stack.has(WORDS[i % WORDS.length]);
    }),
  );

  const diffResult = diffText(medium, mediumEdited);
  results.push(await bench("report/unified (2k lines)", () => renderUnifiedDiff(diffResult)));
  results.push(await bench("report/markdown (2k lines)", () => renderDiffMarkdown(diffResult)));

  const prettier = new PrettierAdapter();
  const tsSource = "const x={a:1,b:2,c:[1,2,3]};function f(y){return y*2}\n".repeat(200);
  results.push(
    await bench(
      "format/prettier (200 statements)",
      () => prettier.format({ uri: "b.ts", languageId: "typescript", text: tsSource }),
      5,
    ),
  );

  const report = {
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    runs: RUNS,
    results,
  };

  if (asJson) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }

  let baseline;
  if (baselinePath) {
    try {
      baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
    } catch {
      process.stderr.write(`warning: could not read baseline ${baselinePath}\n`);
    }
  }

  const width = Math.max(...results.map((r) => r.name.length));
  process.stdout.write(`Code Trio benchmarks - Node ${report.node} on ${report.platform}\n`);
  process.stdout.write(`Median of ${RUNS} runs after warm-up.\n\n`);
  process.stdout.write(
    `${"benchmark".padEnd(width)}  ${"median".padStart(10)}  ${"min".padStart(9)}  ${"max".padStart(9)}${baseline ? "  change" : ""}\n`,
  );
  process.stdout.write(`${"-".repeat(width + 34 + (baseline ? 8 : 0))}\n`);

  for (const r of results) {
    let change = "";
    if (baseline) {
      const before = baseline.results?.find((b) => b.name === r.name);
      if (before) {
        const delta = ((r.medianMs - before.medianMs) / before.medianMs) * 100;
        change = `  ${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`;
      }
    }
    process.stdout.write(
      `${r.name.padEnd(width)}  ${`${r.medianMs}ms`.padStart(10)}  ${`${r.minMs}ms`.padStart(9)}  ${`${r.maxMs}ms`.padStart(9)}${change}\n`,
    );
  }
  process.stdout.write(
    "\nNo network access is used. Fixtures are generated from a seeded PRNG, so\n" +
      "inputs are identical on every machine and across every run.\n",
  );
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
  process.exitCode = 1;
});
