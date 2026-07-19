# Architecture

![Architecture](../assets/architecture.png)

Code Trio is a path-alias monorepo. Imports use `@ctr/<name>` and resolve to
`packages/<name>/src` through `tsconfig` `paths`, which tsx, Vitest, and esbuild
all honor - there is no per-package build step during development.

## Layers

The dependency direction is strict and one-way:

1. `@ctr/core` - the shared model and contracts (`Document`, `Token`,
   `TokenKind`, `Diagnostic`, `QuickFix`, `DiffHunk`, `FormatResult`,
   `MergeResult`), Zod schemas, the `Engine`/`FormatterAdapter` interfaces, the
   `LanguageId` registry, and the `ToolDescriptor` permission model. It depends
   on nothing but `zod`.
2. Engines - `diff-engine`, `spell-engine`, `format-engine`. Each is a **pure**
   function over the core model. No VS Code imports, no file I/O, no network.
   `spell-engine` takes an injected dictionary; `format-engine` takes an
   injected adapter registry. Purity is what makes them fast to test and
   reusable (they could back a Language Server).
3. Support packages - `dictionaries` (in-memory word lists + parsing),
   `formatters` (the Prettier and whitespace adapters - the only code allowed to
   import a third-party formatter), `configuration` (namespaced config schema),
   `reporting` (terminal/json/unified rendering).
4. `@ctr/agent` - the single orchestration seam. It is the only layer that does
   I/O (files, git, project dictionaries) and wires the engines together. Both
   apps use it, so no feature logic is duplicated.
5. Apps - `apps/cli` (commander) and `apps/vscode-extension`. Thin UIs that call
   `@ctr/agent` and render with `@ctr/reporting` or the VS Code API.

## Why pure engines

Keeping engines pure means every feature is deterministic and unit-testable
without mocks, the same code runs in the CLI and the extension, and the boundary
where side effects happen (the agent) is small and auditable. Write operations
(`format.apply`, `spell.addWord`) are described by `ToolDescriptor`s so a host
can gate them behind Workspace Trust or a prompt.

## Data flow example (spell check)

`agent.runSpell(document, config, projectDictionary)` builds a `Dictionary` from
the configured built-in lists plus the discovered project words, then calls the
pure `spell-engine`. The engine tokenizes the document, splits identifiers,
looks each sub-word up, ranks suggestions by bounded edit distance, and returns
`Diagnostic[]` with quick-fix data. The CLI renders those with `@ctr/reporting`;
the extension converts them to `vscode.Diagnostic`s and exposes the quick fixes
through a `CodeActionProvider`.

## Packaging

The CLI bundles to a single `dist/cli/index.cjs` with esbuild. The extension
bundles to `out/extension.cjs` with `vscode` as the only external, so the VSIX
ships without `node_modules`. Prettier is bundled via `prettier/standalone` with
explicit plugins so it survives bundling and never loads plugins from disk or
the network.
