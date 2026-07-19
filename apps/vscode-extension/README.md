# Code Trio - Compare Beautify Spellcheck

Three offline developer tools in one VS Code extension: a **code compare/diff** view, a **code-aware spell checker**, and a **code beautifier/formatter**. Deterministic, private, and fully offline - no network calls, no telemetry.

![Code Trio](https://raw.githubusercontent.com/aniketsoni1/code-trio-compare-beautify-spellcheck/main/assets/banner.png)

## What you get

Compare / Diff - two-way and three-way diff at line, word, or character granularity with ignore-whitespace and ignore-case options. Compare two files, a file against the clipboard, or a file against any git ref, using the native side-by-side diff editor.

Spell Check - code-aware diagnostics that check comments and strings by default (identifiers opt-in), split `camelCase`/`snake_case`/`kebab-case`/`SCREAMING_CASE` before lookup, and offer quick fixes plus "Add to project dictionary". A checked-in `.codetrio/dictionary.txt` lets your whole team share custom words.

Beautify / Format - Prettier-powered formatting with a dry-run diff preview before anything is applied, a format command, and opt-in format-on-save. Formatter versions are pinned and reported for reproducibility.

All three surface through one Activity Bar panel and one diagnostics model, so they feel like a single product.

## Screenshots

![Spell quick fixes](https://raw.githubusercontent.com/aniketsoni1/code-trio-compare-beautify-spellcheck/main/assets/screenshots/diagnostics.png)

![Beautify dry-run preview](https://raw.githubusercontent.com/aniketsoni1/code-trio-compare-beautify-spellcheck/main/assets/screenshots/format-preview.png)

## Commands

All commands are under the `Code Trio:` category in the Command Palette:

- Compare Active File With File / Clipboard / Git Ref
- Spell Check Current File / Workspace, Fix All Spelling In File
- Beautify Document, Preview Beautify Changes, Beautify Changed Files Only
- Show Results Panel

Default keybindings: `Ctrl/Cmd+Alt+B` (beautify preview), `Ctrl/Cmd+Alt+S` (spell check file).

## Settings

Namespaced per feature: `codeTrio.diff.*`, `codeTrio.spell.*`, `codeTrio.format.*`. Notable defaults: identifiers are not spell-checked unless you opt in, formatting shows a preview before applying, and format-on-save is off until you enable it.

## Privacy and trust

No network access and no telemetry. Applying a format and writing to the project dictionary are the only operations that change files; both are disabled in untrusted workspaces (this extension supports Workspace Trust in `limited` mode).

## Links

- Source, docs, and issues: https://github.com/aniketsoni1/code-trio-compare-beautify-spellcheck
- License: Apache-2.0

Built on a shared, pure TypeScript core that also powers the `code-trio` CLI.
