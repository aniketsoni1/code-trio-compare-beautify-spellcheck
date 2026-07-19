# Changelog

All notable changes to Code Trio are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). The manifest
version, git tag, and VSIX filename are kept in sync.

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
