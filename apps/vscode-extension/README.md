# Code Trio - Compare Beautify Spellcheck

Four offline developer tools in one VS Code extension: **compare/diff**, **three-way merge**, a **code-aware spell checker**, and a **beautifier/formatter**. Deterministic, private, and fully offline - no network calls, no telemetry, ever.

![Code Trio](https://raw.githubusercontent.com/aniketsoni1/code-trio-compare-beautify-spellcheck/main/assets/banner.png)

## What you get

**Compare / Diff** - line, word, or character granularity with ignore-whitespace, ignore-case and ignore-line-ending options, rendered in the native side-by-side diff editor. Compare the active file against another file, two files selected in the Explorer, the clipboard, your current selection, the version saved on disk, any git ref, or the previous revision. Word and character refinement is Unicode-correct, so accented characters and emoji are never split mid-glyph. Binary, oversized and minified input is refused or downgraded with a reason you can read, rather than producing a misleading empty diff.

**Three-way merge** - diff3 with conflict navigation, accept ours / theirs / both / base, and manual resolution. Reads git's conflict stages directly, so it works on a real conflicted working tree with no manual extraction. Preview the merged result before anything is written; saving goes to a new file by default and is refused outright while any conflict is unresolved. Git staging is never touched.

**Spell Check** - code-aware diagnostics that check comments and strings by default (identifiers opt-in) and split `camelCase`/`snake_case`/`kebab-case`/`SCREAMING_CASE` before lookup. URLs, file paths, hashes, UUIDs, hex values, versions, timestamps and base64 blobs are suppressed *before* any word is extracted, which is what makes it quiet enough to leave switched on. Six dictionary scopes with documented precedence - including **per-folder dictionaries** for monorepos and multi-root workspaces - plus a session ignore list that writes nothing to disk.

**Beautify / Format** - Prettier is bundled. Ruff, Black, gofmt, rustfmt and clang-format are used when you already have them installed; nothing is ever downloaded. A missing formatter tells you which executable it looked for and offers the setting to fix it, instead of silently doing something else. Dry-run diff preview before anything is applied, opt-in format-on-save, and workspace-wide formatting behind an explicit confirmation.

All four surface through one Activity Bar panel with per-tool tabs, severity counts, search, sorting, keyboard navigation and Markdown/JSON export.

## Screenshots

![Spell quick fixes](https://raw.githubusercontent.com/aniketsoni1/code-trio-compare-beautify-spellcheck/main/assets/screenshots/diagnostics.png)

![Beautify dry-run preview](https://raw.githubusercontent.com/aniketsoni1/code-trio-compare-beautify-spellcheck/main/assets/screenshots/format-preview.png)

## Commands

All commands live under the `Code Trio:` category in the Command Palette.

**Compare** - Compare Active File With File / Clipboard / Git Ref, Compare Two Selected Files, Compare Selection With Clipboard, Compare With Saved Version On Disk, Compare With Previous Revision

**Merge** - Merge Conflicted File (Git), Merge Three Files, Next / Previous Merge Conflict, Preview Merged Result, Save Merged Result As

**Spell** - Spell Check Current File / Workspace, Fix All Spelling In File, Add Word To Dictionary, Ignore Word For This Session, Clear Session Ignore List, Open Workspace / Workspace Folder / User Dictionary, Show Dictionary Sources

**Beautify** - Beautify Document, Preview Beautify Changes, Beautify Changed Files Only, Beautify Entire Workspace, Show Available Formatters

**Results** - Show Results Panel, Export Results, Refresh, Clear

Default keybindings: `Ctrl/Cmd+Alt+B` (beautify preview), `Ctrl/Cmd+Alt+S` (spell check file), `Ctrl/Cmd+Alt+]` and `Ctrl/Cmd+Alt+[` (next / previous merge conflict).

## Settings

Namespaced per feature: `codeTrio.diff.*`, `codeTrio.spell.*`, `codeTrio.dictionaries.*`, `codeTrio.format.*`, `codeTrio.externalFormatters.*`. Every setting is resource-scoped, so a multi-root workspace can configure each folder differently.

Notable defaults: identifiers are not spell-checked unless you opt in, formatting shows a preview before applying, format-on-save is off until you enable it, and external formatter discovery is on but finds only what you have already installed.

## Privacy and trust

No network access and no telemetry. Applying a format, writing to a dictionary and saving a merge are the only operations that change files, and all three are disabled in untrusted workspaces (this extension supports Workspace Trust in `limited` mode - compare and spell diagnostics keep working).

The results panel runs under a strict Content Security Policy: `default-src 'none'`, scripts and styles allowed only via a per-load nonce, and no remote origin of any kind. Git and external formatters are invoked with argument arrays and a minimal environment, never through a shell. Each of these is asserted by a test rather than merely claimed.

## Also available as a CLI

The same engines power a cross-platform `code-trio` CLI with `diff`, `merge`, `spell`, `format`, `report`, `dictionary`, `formatters`, `init`, `doctor` and `configure` commands, machine-readable JSON output, and a documented, stable exit-code contract.

## Links

- Source, docs, and issues: https://github.com/aniketsoni1/code-trio-compare-beautify-spellcheck
- Changelog: https://github.com/aniketsoni1/code-trio-compare-beautify-spellcheck/blob/main/CHANGELOG.md
- License: Apache-2.0

Built on a shared, pure TypeScript core that also powers the `code-trio` CLI.
