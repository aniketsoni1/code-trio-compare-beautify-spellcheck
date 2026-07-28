# Changelog

All notable changes to Code Trio are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). The manifest
version, git tag, and VSIX filename are kept in sync.

## [0.2.1] - 2026-07-28

Patch release. v0.2.0 was published to the Marketplace before these fixes
landed, so this supersedes it. No feature changes.

### Fixed

- `gitShow` and `conflictStages` returned null for files reached through a
  symlinked path. `git rev-parse --show-toplevel` always reports a resolved
  path, so comparing it against an unresolved caller path made a legitimate
  file inside the work tree look like an escape attempt. This broke git-ref
  compare and git-stage merge on macOS for any repository under a symlinked
  directory - including anything under the temp directory, since `/var` is a
  symlink to `/private/var` - and on Windows via 8.3 short names. Both paths
  are now canonicalised before the containment check; the check itself is
  unchanged in strength.
- Raw control bytes in two test files made them binary to `grep`, so the CI
  offline audit was silently skipping them. Rewritten as escapes, with a
  repository-wide guard to stop it recurring.

### Documentation

- The extension's Marketplace description and README described the v0.1.0
  feature set: "three offline dev tools" rather than four, 10 of 32 commands
  listed, and no mention of merge, external formatters or dictionary scopes.
  Keywords omitted `merge conflict`, `ruff`, `gofmt` and `rustfmt`.
- Workspace Trust text named two write operations; saving a merge is a third.
- The welcome view offered no route to merge.
- "Add Word To Project Dictionary" renamed to "Add Word To Dictionary...",
  since it now asks which scope to write to.

## [0.2.0] - 2026-07-28

### Added

- **Three-way merge, reachable at last.** The diff3 engine shipped in v0.1.0 but
  nothing could reach it: there was no CLI command and no VS Code command, so
  "three-way diff" was true of the engine and false of the product. There is now
  a `code-trio merge` command and six editor commands, with conflict navigation,
  accept ours/theirs/both/base, manual resolution, and a preview before any
  write. `--git` reads git's conflict stages directly, so it works on a real
  conflicted working tree. Git staging is never touched.
- **A real results panel.** A webview replacing three static tree rows, with
  per-tool tabs, severity counts, search, five sort orders, keyboard navigation,
  copy and Markdown/JSON export, and state that survives the panel being hidden.
- **Per-folder dictionaries** and six documented scopes (session, folder,
  workspace, user, technical, base). A scope can *reject* a word with a `!`
  prefix, which is what makes precedence mean anything rather than being purely
  additive.
- **External formatter adapters**: Ruff, Black, gofmt, rustfmt and clang-format,
  used when already installed. Nothing is ever downloaded.
- **Formatter availability reporting**: `code-trio formatters` and "Show
  Available Formatters" report every adapter, its version, its resolved
  executable and, when unavailable, what to do about it.
- New compare workflows: two Explorer selections, selection against clipboard,
  buffer against the version on disk, and the previous revision.
- New CLI commands: `merge`, `report`, `dictionary`, `formatters`, `exit-codes`.
- **A documented, stable exit-code contract**, distinguishing "found something"
  (1) from "could not do the job" (2+). Previously `2` meant both "bad
  arguments" and "no files matched".
- **Cancellation** across the engines, and an offline, deterministic benchmark
  suite (`npm run bench`).
- Session ignore list — accept a word for this window without writing anything.
- Beautify Entire Workspace, behind a modal confirmation naming the file count.

### Improved

- **Spell-check noise**: URLs, paths, hashes, UUIDs, hex, versions, timestamps,
  base64 and template placeholders are suppressed before word extraction.
  Measured: 28 diagnostics down to 9 on a fixture of realistic comments, at no
  measurable time cost.
- **Unicode correctness** in diff refinement and word extraction. Accented
  characters and emoji ZWJ sequences are no longer split mid-glyph, and
  non-Latin scripts are no longer ignored.
- **Diff performance**: common prefix/suffix trimming before the Myers search.
  Comparing two identical 20k-line files is now faster than diffing them.
- Suggestions rank transpositions and adjacent-key substitutions first, prefer
  technical terms, and preserve the original capitalisation.
- Markdown tokenisation skips front matter, indented code, reference
  definitions, HTML tags and link destinations.
- Markdown, side-by-side and merge report renderers, shared between the panel
  export and the CLI so both emit identical bytes.

### Fixed

- **`getConfig` silently discarded nine settings.** `diff.contextLines`,
  `spell.checkComments`, `spell.checkStrings`, `spell.ignoreWords`,
  `spell.minWordLength`, `spell.maxSuggestions`, `format.tabWidth`,
  `format.useTabs` and `format.printWidth` were read from the settings store and
  then overwritten with compiled-in defaults on the next line. Six were not
  contributed in the manifest at all.
- **`codeTrio.spell.ignoreGlobs` was contributed, documented, and never read.**
  Exclusion used a hardcoded regex, so editing the setting did nothing.
- The Myers memory guard checked `n * m`, the time bound of a different
  algorithm, rather than the backtrace it actually allocates.
- Compare summaries were computed with a hardcoded `plaintext` language and
  default options, so the figure in the panel could disagree with the diff on
  screen.
- Files identical apart from line endings reported a bare "identical".
- Clean-region coalescing in the merge engine merged across differing origins,
  so a leading unchanged region absorbed every later edit and reported the whole
  file as untouched.

### Security

- Git refs are validated against an allowlist rather than a denylist. A ref may
  not begin with `-`: git parses a leading dash as an option, and
  `--upload-pack=` is a code-execution primitive.
- Git and formatter child processes get a minimal environment, so a hostile
  workspace cannot steer them through `GIT_EXTERNAL_DIFF`, `GIT_SSH_COMMAND`,
  `NODE_OPTIONS`, `PYTHONSTARTUP` or `RUSTC_WRAPPER`.
- Every child process has a timeout with a `SIGKILL` watchdog and bounded
  output.
- Configured formatter paths must be absolute and executable; relative paths are
  refused.
- An external formatter returning empty output for a non-empty document is
  refused rather than emptying the file.
- The webview enforces `default-src 'none'` with per-load nonces, no
  `unsafe-inline`, no `unsafe-eval` and no remote origin. Inbound messages are
  validated at runtime; `reveal` carries a result id and the host resolves the
  location from its own state.
- Full threat review in `docs/security-review.md`.

### Performance

- Measured results in `docs/performance.md`; `npm run bench` reproduces them
  offline from seeded fixtures.
- The suggestion pool is built once per document rather than once per unknown
  word.
- Formatter availability probes are cached for 60 seconds.
- Whole documents are skipped when binary, generated, minified or oversized.

### Documentation

- `docs/audit-v0.2.0.md` — the pre-release audit, including the README claims
  that did not match the code.
- `docs/security-review.md`, `docs/performance.md`, rewritten
  `docs/dictionaries.md`.
- README reconciled with actual behaviour, including removing the claim that
  "every webview uses a strict Content Security Policy" when no webview existed.

### Known limitations

- The bundled base dictionary is ~1,200 words, so ordinary English words are
  sometimes flagged. Shipping a full lexicon would add megabytes and a licensing
  question; downloading one would break the offline guarantee.
- External formatters are used only if already installed; Code Trio does not
  verify the identity of an executable you configure.
- Character-granularity diffs of very long lines are slow by nature. Minified
  input is downgraded to line granularity automatically.
- No Language Server package yet.
- Benchmarks measure engine throughput, not extension activation time.

## [0.1.0] - 2026-07-19

### Added

- Shared `@ctr/core` model: `Document`, `Token`, `Diagnostic`, `DiffHunk`,
  `FormatResult`, Zod schemas, `LanguageId` registry, and a `ToolDescriptor`
  permission model.
- `@ctr/diff-engine`: pure Myers line diff with word/char refinement, ignore
  whitespace/case options, and a three-way (diff3) merge model.
- `@ctr/spell-engine`: code-aware tokenizer, identifier splitter
  (camel/snake/kebab/screaming), edit-distance suggestions, and inline ignores.
- `@ctr/format-engine` + `@ctr/formatters`: adapter registry with a Prettier
  standalone adapter and a safe whitespace-normalizer fallback.
- `@ctr/dictionaries`: original CC0 base + technical word lists and project
  dictionary parsing.
- `code-trio` CLI: `diff`, `spell`, `format`, `init`, `doctor`, `configure`.
- VS Code extension: Compare, spell diagnostics with quick fixes, beautify with
  dry-run preview and opt-in format-on-save, and a unified results panel.
- Full repository tooling: CI, security, release, and extension workflows;
  branding assets; reproducible VSIX packaging and verification.

[0.1.0]: https://github.com/aniketsoni1/code-trio-compare-beautify-spellcheck/releases/tag/v0.1.0
