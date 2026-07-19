# Code Trio demo workspace

A tiny, self-contained workspace used by the docs, screenshots, and the VSIX
smoke test. Everything here runs offline.

## Try each tool

Compare (two-way):

```bash
code-trio diff src/compare-a.ts src/compare-b.ts --words
```

Spell check (finds the deliberate "recieve" typo in `src/greeting.ts`):

```bash
code-trio spell "src/**/*.ts"
```

Beautify (dry run, then write):

```bash
code-trio format "src/messy.ts" --check
code-trio format "src/messy.ts" --write
```

In VS Code, open this folder, then use the **Code Trio** activity-bar panel or
the `Code Trio:` commands in the Command Palette.
