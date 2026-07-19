# CLI reference

The `code-trio` CLI is a single self-contained bundle. During development run it
from source with `npm run cli -- <args>`; once built (`npm run build:cli`) run
`node apps/cli/dist/cli/index.cjs <args>` or install it globally so `code-trio`
is on your PATH.

The CLI discovers a `codetrio.json` (or `.codetrio.json`) by walking up from the
working directory, and a project dictionary at `.codetrio/dictionary.txt`.

## `diff <a> [b]`

Compare two files, or one file against a git ref.

| Option | Description |
| --- | --- |
| `-w, --words` | refine changes at word granularity |
| `--chars` | refine changes at character granularity |
| `--ignore-whitespace` | ignore whitespace-only differences |
| `--ignore-case` | ignore case differences |
| `--ref <ref>` | compare `<a>` at a git ref against the working copy |
| `--format <mode>` | `terminal` (default), `json`, or `unified` |
| `--context <n>` | unchanged context lines per hunk |
| `--no-color` | disable ANSI colors |
| `--exit-code` | exit 1 when the files differ |

```bash
code-trio diff old.ts new.ts --words
code-trio diff config.ts --ref HEAD --format unified
```

## `spell [globs...]`

Spell check files. Comments and strings are checked by default.

| Option | Description |
| --- | --- |
| `--lang <id>` | force a language id for all files |
| `--identifiers` | also check identifiers |
| `--no-comments` / `--no-strings` | skip comments or strings |
| `--severity <level>` | `error` / `warning` / `information` / `hint` |
| `--format <mode>` | `terminal` (default) or `json` |
| `--fail-on <level>` | exit 1 when an issue at or above this severity exists |
| `--no-color` | disable ANSI colors |

```bash
code-trio spell "src/**/*.ts" --fail-on warning
code-trio spell README.md --format json
```

## `format [globs...]`

Beautify files through the formatter orchestrator.

| Option | Description |
| --- | --- |
| `--check` | report files that need formatting; exit 1 if any (CI mode) |
| `--write` | write changes back to disk |
| `--lang <id>` | force a language id for all files |
| `--no-color` | disable ANSI colors |

```bash
code-trio format "src/**/*.{ts,css,md}" --check
code-trio format "src/**/*.ts" --write
```

With neither `--check` nor `--write`, the command reports what would change.

## `init`, `doctor`, `configure`

`init` scaffolds a `codetrio.json` and an empty project dictionary. `doctor`
prints an environment report (Node version, git availability, Prettier adapter,
dictionary sizes). `configure` prints the resolved effective configuration and
its source file.

## Exit codes

`0` success, `1` a gating condition was met (`--exit-code`, `--check` with
changes, `--fail-on` threshold reached), `2` a usage or I/O error.
