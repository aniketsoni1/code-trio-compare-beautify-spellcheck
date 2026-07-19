<p align="center">
  <img src="assets/banner.png" alt="Code Trio - Compare, Spell Check, Beautify" width="900" />
</p>

<p align="center">
  <a href="https://github.com/aniketsoni1/code-trio-compare-beautify-spellcheck/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/aniketsoni1/code-trio-compare-beautify-spellcheck/actions/workflows/ci.yml/badge.svg" /></a>
  <a href="LICENSE"><img alt="License: Apache-2.0" src="https://img.shields.io/badge/license-Apache--2.0-blue.svg" /></a>
  <img alt="Node >= 20" src="https://img.shields.io/badge/node-%3E%3D20-3c873a.svg" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178c6.svg" />
  <a href="https://marketplace.visualstudio.com/items?itemName=aniketsoni1.code-trio-compare-beautify-spellcheck"><img alt="VS Marketplace" src="https://img.shields.io/visual-studio-marketplace/v/aniketsoni1.code-trio-compare-beautify-spellcheck?label=marketplace" /></a>
  <img alt="Offline" src="https://img.shields.io/badge/network-none-brightgreen.svg" />
</p>

# Code Trio - Compare Beautify Spellcheck

**Code Trio** bundles the three tools you reach for every day - a **code compare/diff** view, a **code-aware spell checker**, and a **code beautifier/formatter** - into one deterministic, offline, privacy-respecting package. It ships as both a cross-platform CLI (`code-trio`) and a VS Code extension, both built on one shared TypeScript core so the three features compose instead of colliding.

Everything runs locally. There are no network calls and no telemetry, ever.

## Why Code Trio

Most teams stitch these three jobs together from separate extensions and CLIs that each carry their own config, model, and quirks. Code Trio uses **one document/AST model** and **one diagnostics model** across all three tools, so a spell issue, a diff summary, and a format preview all read like parts of the same product. The engines are pure functions with no I/O, which keeps them fast, testable, and reusable (they could back a Language Server later).

## Features

Compare / Diff - two-way and three-way diff at line, word, or character granularity, with ignore-whitespace and ignore-case options. Compare two files, a file against the clipboard, or a file against any git ref. A minimal Myers algorithm keeps large-file diffs quick.

Spell Check - tokenizes source into identifiers, comments, and strings, and splits `camelCase`, `snake_case`, `kebab-case`, and `SCREAMING_CASE` before checking. Only comments and strings are checked by default (identifiers are opt-in), so the noise stays low. Ships a base English + technical dictionary, honors a checked-in project dictionary, and offers quick-fix suggestions plus "add to dictionary".

Beautify / Format - a formatter orchestrator that wraps Prettier behind an adapter (with a safe whitespace-normalizer fallback for other languages). Deterministic output, a dry-run diff preview before anything is written, format-on-command, and opt-in format-on-save. Formatter versions are pinned and recorded for reproducibility.

## Screenshots

> The images below are representative renders produced by `npm run assets`. See [docs/media.md](docs/media.md) for the exact checklist to capture live screenshots from the running extension.

| Unified results panel | Two-way compare |
| --- | --- |
| ![Results panel](assets/screenshots/panel.png) | ![Compare](assets/screenshots/compare.png) |

| Spell quick fixes | Beautify dry-run preview |
| --- | --- |
| ![Spell quick fixes](assets/screenshots/diagnostics.png) | ![Beautify preview](assets/screenshots/format-preview.png) |

![Demo](assets/demo.gif)

## Quick start

### VS Code extension

Install the packaged VSIX (see [Releases](https://github.com/aniketsoni1/code-trio-compare-beautify-spellcheck/releases) or build it yourself):

```bash
npm ci
npm run package:vsix
code --install-extension artifacts/code-trio-compare-beautify-spellcheck-0.1.0.vsix
```

Open a folder, then use the **Code Trio** panel in the Activity Bar, or the `Code Trio:` commands in the Command Palette.

### CLI

```bash
npm ci
npm run build:cli
node apps/cli/dist/cli/index.cjs --help
# or run from source during development:
npm run cli -- diff a.ts b.ts --words
```

## CLI usage

```bash
# Compare two files, refined at word level
code-trio diff src/a.ts src/b.ts --words

# Compare a file against a git ref
code-trio diff src/a.ts --ref HEAD --format unified

# Spell check a glob (comments and strings by default); fail CI on any issue
code-trio spell "src/**/*.ts" --fail-on information

# Check formatting (like prettier --check), then apply
code-trio format "src/**/*.ts" --check
code-trio format "src/**/*.ts" --write

# Scaffold config + project dictionary, and inspect the environment
code-trio init
code-trio doctor
code-trio configure
```

Full reference: [docs/cli.md](docs/cli.md).

## Extension usage

Commands (Command Palette, all prefixed `Code Trio:`): Compare Active File With File / Clipboard / Git Ref, Spell Check Current File / Workspace, Fix All Spelling In File, Beautify Document, Preview Beautify Changes, Beautify Changed Files Only, and Show Results Panel.

Default keybindings: `Ctrl/Cmd+Alt+B` previews beautify, `Ctrl/Cmd+Alt+S` spell-checks the current file.

## Configuration

Settings are namespaced per feature (`codeTrio.diff.*`, `codeTrio.spell.*`, `codeTrio.format.*`) and can also live in a `codetrio.json` file the CLI discovers by walking up from the working directory. Highlights:

| Setting | Default | Purpose |
| --- | --- | --- |
| `codeTrio.diff.granularity` | `word` | line / word / char refinement |
| `codeTrio.spell.checkIdentifiers` | `false` | also spell-check identifiers |
| `codeTrio.spell.severity` | `information` | diagnostic severity |
| `codeTrio.spell.projectDictionaryPath` | `.codetrio/dictionary.txt` | shared project words |
| `codeTrio.format.formatOnSave` | `false` | beautify on save (opt-in) |
| `codeTrio.format.previewBeforeApply` | `true` | show a dry-run before applying |

Full reference: [docs/configuration.md](docs/configuration.md).

## Privacy and security

Code Trio never opens a network connection and collects no telemetry. Formatting and diffing are pure computations. The only operations that touch your files are explicit writes - applying a format and editing the project dictionary - and both are modeled as auditable write tools. In VS Code they are disabled in untrusted workspaces (the extension declares `limited` Workspace Trust support) and every webview uses a strict Content Security Policy. See [SECURITY.md](SECURITY.md).

## Architecture

![Architecture](assets/architecture.png)

One shared model (`@ctr/core`) defines `Document`, `Token`, `Diagnostic`, `DiffHunk`, `FormatResult`, the Zod schemas, the `LanguageId` registry, and a `ToolDescriptor` permission model. Each engine (`diff-engine`, `spell-engine`, `format-engine`) is a **pure** function over that model with no VS Code imports and no file I/O. `@ctr/agent` is the only seam that wires the engines to the outside world (files, git, dictionaries) and is shared by both apps. More detail in [docs/architecture.md](docs/architecture.md).

```
apps/       cli/  vscode-extension/
packages/   core  diff-engine  spell-engine  format-engine  reporting
            configuration  agent  dictionaries  formatters  testing
samples/ docs/ .github/ scripts/ assets/
```

## Project dictionary

Teams share custom words through a checked-in `.codetrio/dictionary.txt` (one word per line; `#` comments; prefix `!` to force-allow a word). The built-in base and technical word lists are original, curated for Code Trio, and dedicated to the public domain under CC0-1.0 - see [docs/dictionaries.md](docs/dictionaries.md) for provenance.

## Limitations

The bundled dictionary is a common-word baseline (about 1,200 words) rather than a full English lexicon; extend it per project. The spell tokenizer is a pragmatic scanner, not a full language parser, so exotic string/comment syntaxes may be approximated. The Prettier adapter covers JS/TS/JSON/CSS/Markdown/YAML/HTML; other languages fall back to a safe whitespace normalizer. Git-ref compare requires a local git binary.

## Roadmap

Richer three-way merge UX, more formatter adapters (Ruff, gofmt, rustfmt), an optional Language Server so other editors can reuse the engines, per-folder dictionary overrides, and a large-file benchmark suite. Tracked in the issues.

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) and our [Code of Conduct](CODE_OF_CONDUCT.md). In short: `npm ci`, then `npm run verify` (typecheck + lint + tests) before opening a PR.

## Release and install

Maintainers follow [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md). Each tagged release attaches a verified VSIX plus a SHA-256 checksum. Install locally with `code --install-extension <vsix>`.

## License

Apache-2.0 (c) aniketsoni1. See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
