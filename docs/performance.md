# Performance and large-file resilience

Every number on this page was measured with `npm run bench` on the machine and
Node version stated. Nothing here is estimated, and no claim appears that the
suite does not measure.

## Running the suite

```bash
npm run bench                      # human-readable table
npm run bench:json > base.json     # machine-readable
npm run bench -- --baseline base.json   # compare against a saved baseline
npm run bench -- --runs 25         # more iterations
```

The suite needs no network. Fixtures are generated in memory from a seeded
PRNG (mulberry32), so the inputs are byte-identical on every machine and on
every run — a benchmark that regenerates random data each time cannot detect a
regression, only weather.

Reported values are the **median** of N runs after two warm-up iterations.
Medians rather than means: one GC pause in one iteration otherwise dominates the
average and makes a clean run look like a regression.

## Measured results

Node v22.22.3, linux-arm64, median of 9 runs.

| Benchmark | Median | Min | Max |
| --- | ---: | ---: | ---: |
| diff/line/small (200 lines) | 0.225 ms | 0.193 ms | 2.161 ms |
| diff/line/medium (2k lines) | 1.037 ms | 0.924 ms | 1.328 ms |
| diff/line/large (20k lines) | 10.790 ms | 6.821 ms | 13.996 ms |
| diff/word/medium (2k lines) | 27.648 ms | 26.436 ms | 36.700 ms |
| diff/char/medium (2k lines) | 44.111 ms | 41.682 ms | 47.252 ms |
| diff/identical/large (20k lines) | 6.488 ms | 5.966 ms | 8.058 ms |
| merge/3-way (1k lines) | 1.895 ms | 1.401 ms | 2.581 ms |
| merge/resolve (1k lines) | 0.028 ms | 0.028 ms | 0.031 ms |
| spell/small (200 lines) | 7.976 ms | 7.109 ms | 10.319 ms |
| spell/medium (2k lines) | 71.367 ms | 70.760 ms | 74.008 ms |
| spell/large (20k lines) | 181.131 ms | 166.146 ms | 192.740 ms |
| spell/noise-suppression-off (2k lines) | 71.341 ms | 69.934 ms | 72.314 ms |
| dictionary/load builtin | 0.123 ms | 0.106 ms | 0.364 ms |
| dictionary/stack lookup x1000 | 0.289 ms | 0.267 ms | 0.677 ms |
| report/unified (2k lines) | 0.305 ms | 0.292 ms | 0.371 ms |
| report/markdown (2k lines) | 0.426 ms | 0.408 ms | 0.447 ms |
| format/prettier (200 statements) | 26.009 ms | 20.118 ms | 43.589 ms |

Absolute numbers will differ on other hardware. What should hold anywhere is the
*shape*: line diffs are roughly linear in file size, word refinement costs about
25× a line diff, character refinement about 40×, and spell checking is dominated
by tokenisation rather than by dictionary lookup.

### Two results worth reading carefully

**Noise suppression is free.** `spell/medium` and
`spell/noise-suppression-off` differ by 0.03 ms — well inside the noise floor.
The masking pass is a handful of regex replacements over text that is about to
be scanned anyway, so the 68% reduction in false positives (measured separately:
28 diagnostics down to 9 on a fixture of realistic comments) costs nothing
measurable. There is no speed argument for turning it off.

**Comparing identical large files is faster than diffing them.**
`diff/identical/large` at 6.5 ms versus `diff/line/large` at 10.8 ms is the
affix-trimming optimisation working: identical input is consumed entirely by the
common-prefix scan and never reaches the Myers search.

## Where the time goes, and what was done about it

### Common prefix/suffix trimming

The single largest win. An edit in the middle of a 10,000-line file used to hand
all 10,000 lines to the O(ND) search; it now hands over only the differing
middle. It also stabilises hunk boundaries, because shared affixes can no longer
be re-aligned by the search finding an equally minimal but differently placed
edit script.

### The memory guard guards memory

v0.1.0 checked `n * m` before running Myers. That is the *time* bound of the
classic quadratic algorithm and has nothing to do with what Myers allocates,
which is a backtrace of `O(D · (N + M))`. Two 30k-line files that are entirely
different sail past an `n * m` check while allocating an enormous trace. The
budget is now expressed in trace cells and checked against the actual worst-case
trace shape, with an anchored fallback above it.

### The suggestion pool is built once per document

Previously the dictionary word list was materialised once per unknown word. On a
file with 200 unknown words against a 1,200-word dictionary that is 240,000
iterations instead of 1,200.

### Formatter probes are cached

Asking an external formatter for `--version` means spawning a process. Doing
that on every format-on-save would be absurd, so a successful probe is trusted
for 60 seconds — short enough that installing a formatter is noticed promptly.

## Limits and safeguards

Each limit is configurable, and every refusal is *reported* rather than silent.
A refused comparison never renders as an empty diff that reads like "no
differences", and the CLI exits with a file-level error code rather than 0.

| Guard | Default | Setting |
| --- | --- | --- |
| Diff line ceiling | 300,000 lines | `codeTrio.diff.maxLines` |
| Diff byte ceiling | 20 MB | `codeTrio.diff.maxBytes` |
| Refinement skipped above | 10,000 chars/line | engine constant |
| Binary input | refused | engine, `rejectBinary` |
| Minified input | forced to line granularity | engine, `degradeMinified` |
| Spell file ceiling | 2,048 KB | `codeTrio.spell.maxFileSizeKb` |
| Spell diagnostics per file | 1,000 | `codeTrio.spell.maxDiagnostics` |
| External formatter timeout | 10,000 ms | `codeTrio.externalFormatters.timeoutMs` |
| Formatter output buffer | 8 MB per stream | process layer |
| Git invocation timeout | 15,000 ms | agent |
| Git blob read ceiling | 32 MB | agent |
| CLI file expansion cap | 20,000 files | CLI |

Whole documents are skipped, rather than filtered result-by-result, when they
are binary, generated (a `@generated` or "DO NOT EDIT" banner in the first 20
lines), minified, oversized, or carry a `codetrio-ignore-file` marker. Skipping a
generated API client beats producing two thousand diagnostics for it and then
hiding them.

## Cancellation

`CancellationToken` in `@ctr/core` is structurally compatible with
`vscode.CancellationToken`, so the extension passes VS Code's own token straight
into an engine without the engine importing `vscode`. Engines poll at loop
boundaries — every 64 Myers iterations, once per token in the spell checker — and
throw `CancellationError` rather than returning a partial result, so a cancelled
run can never be mistaken for a complete one.

Workspace-wide formatting reports progress and is cancellable, and a failure on
one file no longer aborts the batch.

## Known limitations

- Character-granularity diffs of files with very long lines are slow by nature.
  Minified input is downgraded to line granularity automatically; a
  non-minified file with a few long lines simply skips refinement on those lines.
- Spell checking is single-pass and synchronous. A 20k-line file takes ~180 ms,
  which is fine on save and on a debounce, but a workspace scan of thousands of
  files is proportionally slow. It is chunked and cancellable rather than fast.
- The benchmark suite measures engine throughput, not extension activation time
  or first-paint of the results panel. Those need a running VS Code instance and
  are covered by the manual checklist in `docs/media.md` instead of being
  claimed here.
