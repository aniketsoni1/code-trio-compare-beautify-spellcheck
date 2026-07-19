# Troubleshooting

Start with `code-trio doctor`, which checks the Node version, git availability,
the Prettier adapter, and the dictionary sizes.

## Spell check flags too many words

The bundled dictionary is a common-word baseline, so domain terms may be flagged.
Add them to your project dictionary (`.codetrio/dictionary.txt`) via the "Add to
project dictionary" quick fix or by editing the file. To silence a single line,
add `codetrio-ignore` to it; to skip a whole file, add `codetrio-ignore-file`.
You can also raise `codeTrio.spell.minWordLength` or turn off
`codeTrio.spell.checkIdentifiers` (off by default).

## Spell check misses a misspelling in an identifier

Identifiers are not checked by default to keep noise low. Enable
`codeTrio.spell.checkIdentifiers` (or pass `--identifiers` to the CLI).

## Formatting did nothing / used the whitespace normalizer

Prettier only handles JS, TS, JSON, CSS/SCSS/LESS, Markdown, YAML, and HTML.
Other languages fall back to a safe whitespace normalizer (trim trailing spaces,
single final newline). If `doctor` shows the Prettier adapter as unavailable in
a custom build, make sure the extension/CLI was bundled with `prettier/standalone`
(the default build does this).

## Git ref compare says it cannot read the file

`diff --ref <ref>` and "Compare With Git Ref" run the local `git` binary. Make
sure you are inside a git work tree and that the file existed at that ref. Newly
added, uncommitted files have no content at `HEAD`.

## Format-on-save is not running

It is opt-in. Enable `codeTrio.format.formatOnSave`. It is also disabled in
untrusted workspaces - trust the folder first.

## A write action is blocked

Applying a format and adding to the project dictionary are write operations and
are disabled in untrusted workspaces. Trust the workspace (Command Palette:
"Workspaces: Manage Workspace Trust").

## The VSIX will not install

Ensure you built it with a current toolchain (`npm run package:vsix` on Node 20+)
and are installing with a matching VS Code (`engines.vscode` is `^1.90.0`). Run
`npm run verify:vsix` to confirm the package is well-formed before installing.
