# Changelog

## [0.2.1] - 2026-07-28

Patch release superseding 0.2.0. No feature changes.

### Fixed

- Compare against a git ref, and merge from git conflict stages, failed for any
  repository reached through a symlinked path. This affected macOS in
  particular, where `/var` is a symlink to `/private/var`, and Windows via 8.3
  short names.

### Documentation

- Marketplace description and README updated for the v0.2.0 feature set: four
  tools rather than three, all 32 commands listed, and merge, external
  formatters and dictionary scopes described.
- Workspace Trust description now names all three write operations.
- The welcome view offers a merge action.
- "Add Word To Project Dictionary" renamed to "Add Word To Dictionary...",
  since it asks which dictionary scope to use.

## [0.2.0] - 2026-07-28

### Added

- Three-way merge in the editor: read git's conflict stages or pick three files,
  navigate conflicts with `Ctrl/Cmd+Alt+]` and `[`, accept ours/theirs/both/base
  or resolve by hand, preview the result, and save to a new file. Saving is
  refused while any conflict is unresolved. Git staging is never touched.
- A real results panel: a webview with per-tool tabs, severity counts, search,
  five sort orders, keyboard navigation, copy, and Markdown/JSON export.
- Per-folder dictionaries and six scopes with documented precedence. Adding a
  word asks which dictionary it belongs in.
- "Ignore for this session" — accepts a word for this window, writes nothing.
- External formatters: Ruff, Black, gofmt, rustfmt and clang-format, used when
  already installed. Nothing is ever downloaded.
- "Show Available Formatters" reports every adapter, its version, its resolved
  executable, and why an unavailable one is unavailable.
- Beautify Entire Workspace, behind a modal confirmation naming the file count.
- Four new compare workflows: two Explorer selections, selection against
  clipboard, buffer against the saved file, and the previous revision.

### Improved

- Spell-check noise: URLs, paths, hashes, UUIDs, hex, versions, timestamps and
  base64 are suppressed before word extraction. 28 diagnostics down to 9 on a
  fixture of realistic comments.
- Unicode-correct diffing and word extraction.
- Batch formatting reports progress, is cancellable, and no longer aborts the
  whole run when one file fails.

### Fixed

- Nine settings were read from the settings store and then overwritten with
  compiled-in defaults, so editing them had no effect. Six of those were not
  contributed in the manifest either.
- `codeTrio.spell.ignoreGlobs` was contributed and documented but never read.
- Compare summaries were computed with a hardcoded language and default options,
  so the panel figure could disagree with the diff on screen.

### Security

- The results panel enforces `default-src 'none'` with per-load nonces and no
  remote origin. Messages from the webview are validated at runtime.
- Git refs are validated against an allowlist; child processes run with a
  minimal environment, a timeout and bounded output.

## [0.1.0] - 2026-07-19

### Added

- Initial release of the Code Trio VS Code extension.
- Compare active file with another file, the clipboard, or a git ref.
- Code-aware spell diagnostics with replace and "add to project dictionary"
  quick fixes, plus "Fix all spelling in file".
- Beautify with a dry-run preview, opt-in format-on-save, and "beautify changed
  files only".
- Unified Code Trio results panel in the Activity Bar.
- Fully offline: no network access, no telemetry. Write actions respect
  Workspace Trust.
