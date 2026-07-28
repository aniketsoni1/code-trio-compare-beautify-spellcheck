# Code Trio v0.2.0 — Repository Audit

Audit performed against commit `bdbd469` on branch `main` before any v0.2.0 work
started. Every claim below was verified by reading the implementation, not the
README.

## Baseline environment

| Item | Value |
| --- | --- |
| Node | v22.22.3 |
| npm | 10.9.8 |
| OS | Linux (container), sources mounted from macOS host |
| Branch | `main` |
| Commit | `bdbd469` |
| Working tree | clean |

## Baseline verification (before changes)

| Command | Result |
| --- | --- |
| `npm run typecheck` | Pass |
| `npm run lint` | Pass |
| `npm run test:unit` | Pass — 16 files, 89 tests |
| `npm run build` | Pass — CLI 3.0 MB bundle, extension 2.9 MB bundle |

The repository was *not* broken at baseline. v0.2.0 is therefore an expansion
task, not a rescue task.

## Monorepo structure (verified)

```
apps/cli                     commander CLI, 6 commands
apps/vscode-extension        13 commands, TreeView results panel
packages/core                model, text utils, language registry, permissions, zod schemas
packages/diff-engine         Myers diff + diff3 merge
packages/spell-engine        tokenizer, identifier splitter, suggester, checker
packages/format-engine       adapter registry + orchestrator
packages/formatters          Prettier adapter + whitespace fallback
packages/configuration       zod config schema, defaults, merge
packages/dictionaries        base + technical word lists, parser
packages/agent               the only I/O seam (fs, git, dictionary writes)
packages/reporting           terminal / unified / JSON renderers
packages/testing             fixtures
```

Package boundaries are genuinely respected: no `vscode` import outside
`apps/vscode-extension`, no `node:fs` import inside any `packages/*-engine`.
This is the strongest part of the project and is preserved unchanged.

## Findings

### Working well

- **Pure-engine discipline.** Engines take a `Document` and return model types.
  No hidden I/O. This holds under inspection.
- **`@ctr/agent` as the single I/O seam.** Both apps consume it; no duplicated
  feature logic between CLI and extension.
- **Safe git invocation.** `packages/agent/src/git.ts` already uses
  `execFileSync` with an argument array — no shell string interpolation.
- **Workspace Trust.** `apps/vscode-extension/src/trust.ts` gates both write
  operations (`format.apply`, `spell.addWord`) and the manifest declares
  `untrustedWorkspaces: limited`. The claim is real.
- **No network.** No `fetch`, `http`, `https`, `axios`, `node-fetch`, or
  telemetry SDK appears anywhere in `apps/` or `packages/`. Prettier is imported
  from `prettier/standalone` with statically imported plugins, so there is no
  dynamic plugin resolution either.
- **Permission model.** `TOOL_DESCRIPTORS` in `@ctr/core` is a real, typed
  capability table, and the two write tools are the two operations that actually
  write.
- **Myers implementation.** Correct, with an anchored fallback above a size
  budget.

### Needs correction

1. **README claims a webview CSP that cannot exist.** README states "every
   webview uses a strict Content Security Policy". The extension contains **no
   webview at all** — `panel.ts` is a `TreeDataProvider`. The claim is
   unfalsifiable-by-absence and must either be removed or made true. *(v0.2.0
   makes it true by shipping a real webview with a nonce-based CSP.)*
2. **`getConfig` silently drops nine settings.**
   `apps/vscode-extension/src/config.ts` hardcodes `d.<default>` for
   `diff.contextLines`, `spell.checkComments`, `spell.checkStrings`,
   `spell.ignoreWords`, `spell.minWordLength`, `spell.maxSuggestions`,
   `format.tabWidth`, `format.useTabs`, and `format.printWidth`. A user changing
   these in `settings.json` sees no effect. Several are not contributed in the
   manifest at all.
3. **`codeTrio.spell.ignoreGlobs` is contributed but never read.** The extension
   uses a hardcoded `SKIP_PATH` regex instead. Dead setting.
4. **`spell.checkIdentifiers` description is wrong.** It says "Comments and
   strings are always checked when enabled" — accurate only because the two
   settings that would change that are dropped (finding 2).
5. **CLI `--fail-on` threshold is inverted for `hint`.** `SEVERITY_RANK.hint` is
   `0` and `worst` starts at `-1`, so `--fail-on hint` on a clean file correctly
   returns 0, but the code path relies on the sentinel rather than an explicit
   "no diagnostics" check. Fragile rather than wrong.
6. **Exit codes are ad hoc.** `2` is used for "no files matched" and for "bad
   diff arguments"; there is no documented, stable exit-code table.
7. **`applyFormatToFile` writes without normalising EOL** and without checking
   whether the file is binary.
8. **Myers memory guard is on the wrong axis.** `MYERS_BUDGET` guards `n * m`,
   but the actual memory risk is the `trace` array, which is `O(D * (n + m))`. A
   file pair that is small in `n * m` but maximally different still allocates a
   large trace.
9. **No line-ending fidelity.** `splitLines` splits on `\n`, `\r\n`, and `\r`
   and then discards which was used. A CRLF file compared against an otherwise
   identical LF file reports `identical`, which is defensible, but the result
   carries no record of the difference.

### Needs tests

- Three-way merge beyond the four existing cases (no adjacent-conflict, no
  delete/delete, no empty-side cases).
- Unicode in diff refinement (`splitChars` uses code points, so astral-plane
  characters are handled, but combining marks and emoji ZWJ sequences are split).
- Empty-file and single-empty-line diffs.
- Very long single-line files.
- Dictionary precedence (there is currently only one dictionary scope, so there
  is nothing to test).
- Process-argument safety (there are no external processes yet).
- Cancellation (there is no cancellation).

### Needs UX improvement

- **The "unified results panel" is three static tree rows.** It shows one
  summary string per tool with no counts by severity, no navigation to a result,
  no filtering, no sorting, no export, and no state restoration.
- **Three-way merge is engine-only.** `threeWayMerge` and `renderMerge` exist in
  `@ctr/diff-engine` and are exported through `@ctr/agent` as
  `runThreeWayMerge`, but **no CLI command and no VS Code command reaches
  them**. The README's "two-way and three-way diff" is true of the engine and
  false of both products.
- **No conflict navigation, accept-ours/theirs/both, or merge preview.**
- **No formatter availability reporting** — `doctor` reports Prettier as
  available unconditionally (`isAvailable()` returns `Promise.resolve(true)`).
- **Compare setup is opaque.** The user picks a file and gets a diff editor with
  no indication of granularity, ignore-whitespace, or EOL treatment.

### Candidate for v0.2.0

- Real webview results panel with tabs, counts, filter, sort, export, keyboard
  navigation, and typed+validated messages under a nonce CSP.
- Three-way merge surfaced in both apps with conflict navigation and resolution.
- Tokeniser noise suppression (URLs, paths, hex, UUIDs, hashes, base64, semver,
  emails) — the single largest source of spell false positives.
- Dictionary scopes with documented precedence and multi-root folder support.
- Capability-aware external formatter adapters (ruff, gofmt, rustfmt,
  clang-format, black) behind a safe `spawn`-with-argv process runner.
- Cancellation tokens threaded through the engines.
- Large-file and binary-file safeguards.
- Stable, documented CLI exit codes plus `merge`, `report`, `dictionary`, and
  `formatters` commands.
- Benchmark suite with no network dependency.

### Better deferred

- A Language Server package. The engines are LSP-shaped already, but shipping an
  LSP means a new transport, a new lifecycle, and a new test harness; it would
  consume the whole release.
- A custom in-webview diff editor. VS Code's native `vscode.diff` and merge
  editor are more reliable than anything reimplemented in a webview, and the
  prompt explicitly prefers native APIs.
- Frequency-tiered suggestion ranking. The bundled lists have no frequency data;
  adding it means regenerating the dictionaries, which is its own release.
- Bundling formatter binaries. Downloading is prohibited and vendoring binaries
  would explode VSIX size and licence surface.

## README claim verification

| Claim | Verdict |
| --- | --- |
| Two-way diff, line/word/char | True |
| Three-way diff | Engine only — **not reachable from CLI or extension** |
| Ignore whitespace / ignore case | True |
| File / clipboard / git-ref compare | True |
| Minimal Myers | True |
| Code-aware tokenisation | True, but noisy |
| camel/snake/kebab/SCREAMING splitting | True |
| Base + technical dictionary | True (~1,200 words, matches the stated figure) |
| Checked-in project dictionary | True |
| Quick fixes + add-to-dictionary | True |
| Prettier adapter | True |
| Whitespace fallback | True |
| Dry-run preview | True |
| Opt-in format-on-save | True |
| Unified results panel | Overstated — three static rows |
| Workspace Trust | True |
| **Strict webview CSP** | **False — no webview exists** |
| No network calls | True |
| No telemetry | True |
| Node 20+ | True |
| Strict TypeScript | True |
| Shared core for CLI + extension | True |

## Scope decision

v0.2.0 implements the full "Required" list from the enhancement brief. The
optional Language Server and in-extension benchmark display are deferred and
recorded here so the release notes do not claim them.
