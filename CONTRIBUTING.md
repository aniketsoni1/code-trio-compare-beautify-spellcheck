# Contributing to Code Trio

Thanks for your interest in improving Code Trio. This project aims to stay small,
typed, deterministic, and offline. The guidelines below keep it that way.

## Getting started

```bash
git clone https://github.com/aniketsoni1/code-trio-compare-beautify-spellcheck.git
cd code-trio-compare-beautify-spellcheck
npm ci
npm run verify   # typecheck + lint + unit/integration tests
```

Use Node 20 or newer (the repo pins Node 22 in `.nvmrc`).

## Repository layout

This is a path-alias monorepo (`@ctr/* -> packages/*/src`, resolved by tsx,
Vitest, and esbuild with no per-package build step in dev). See
[docs/architecture.md](docs/architecture.md).

- `packages/core` - the shared model and contracts.
- `packages/*-engine` - pure engines. No VS Code imports, no file I/O, no
  network. This rule is not negotiable; it keeps the engines testable and
  reusable.
- `packages/agent` - the only place that performs I/O; shared by both apps.
- `apps/cli`, `apps/vscode-extension` - thin UIs over `@ctr/agent`.

## Development workflow

- `npm run test:watch` runs Vitest in watch mode.
- `npm run cli -- <args>` runs the CLI from source via tsx.
- `npm run build:ext && npm run test:ext` runs the VS Code integration tests
  (requires network the first time to download VS Code).
- `npm run assets` regenerates branding and diagrams from SVG sources.

## Standards

- TypeScript strict, `noUncheckedIndexedAccess`, ESM everywhere.
- Prefer small, pure functions. Add or update tests for every change; we gate on
  `npm run verify`.
- ESLint 9 flat config (`eslint.config.js`) only. Run `npm run lint:fix`.
- Keep runtime dependencies minimal. New ones need discussion in an issue first.
- Never add telemetry or a network call to an engine or the agent.

## Commit and PR

Write focused commits with clear messages. Open a PR against `main` using the
template, and make sure `npm run verify` is green. A maintainer will review.

## Reporting security issues

Please do not open public issues for vulnerabilities. See [SECURITY.md](SECURITY.md).
