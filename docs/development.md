# Development

## Prerequisites

Node 20 or newer (the repo targets Node 22). Run `npm ci` after cloning.

## Common commands

| Command | What it does |
| --- | --- |
| `npm run verify` | typecheck + lint + unit/integration tests (the gate) |
| `npm run typecheck` | `tsc --noEmit` across the repo |
| `npm run lint` / `lint:fix` | ESLint 9 flat config |
| `npm test` / `test:watch` | Vitest |
| `npm run cli -- <args>` | run the CLI from source via tsx |
| `npm run build` | bundle the CLI and the extension |
| `npm run build:ext -- --watch` | rebuild the extension on change |
| `npm run test:ext` | VS Code integration tests (downloads VS Code once) |
| `npm run package:vsix` | build `artifacts/*.vsix` |
| `npm run verify:vsix` | audit + smoke-test the VSIX |
| `npm run assets` | regenerate branding/diagrams from SVG sources |
| `node scripts/generate-dictionaries.mjs` | rebuild the word lists |

## Testing philosophy

Every engine is pure, so tests are plain input/output assertions with no mocks.
Unit and logic tests run under Vitest and are the default gate. The VS Code
integration tests (`apps/vscode-extension/test/integration`) launch a real,
isolated VS Code via `@vscode/test-electron`; they need network access the first
time to download the editor and therefore run in CI rather than the offline
`verify` gate. An offline smoke test
(`apps/vscode-extension/test/smoke.test.ts`) exercises the same three feature
flows against the demo workspace and does run in `verify`.

## Debugging the extension

Open the repo in VS Code and use the "Run Extension" launch flow (or run
`npm run build:ext` and press F5). The `samples/demo-workspace` folder is a good
target: it contains a deliberate spelling typo, files to compare, and an
unformatted file.

## Adding a formatter adapter

Implement `FormatterAdapter` from `@ctr/core` in `packages/formatters`, add it to
`defaultAdapters()`, and register a language mapping. Adapters must degrade
gracefully (throw a readable error rather than crash) and must never reach the
network. See `packages/formatters/src/prettier.ts` for the reference.

## Adding a language

Extend the `DEFS` array in `packages/core/src/language.ts` with comment and
string syntax and the whitespace-sensitivity flag. The tokenizer and diff
options pick it up automatically.
