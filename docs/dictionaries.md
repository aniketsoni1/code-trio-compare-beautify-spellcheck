# Dictionaries and licensing

Code Trio ships two built-in word lists and supports a per-project dictionary.

## Provenance and license

The built-in `base` and `technical` lists in
`packages/dictionaries/src/data/` are **original works** hand-curated for Code
Trio. They are **not derived from any third-party word list** (no SCOWL, no
GPL-licensed corpora, nothing scraped). They are dedicated to the public domain
under [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/), so there are
no third-party licensing obligations.

This choice is deliberate: bundling a permissively licensed, self-authored list
keeps the VSIX small and the license story clean. The trade-off is coverage -
the base list is a common-word baseline (about 1,200 words) rather than a full
English lexicon. Extend coverage per project with the project dictionary.

## How the lists are built

`scripts/generate-dictionaries.mjs` is the single source of truth. It holds
curated word arrays and emits four files:

- `data/base.txt`, `data/technical.txt` - human-readable, for review and diffing.
- `data/base.ts`, `data/technical.ts` - bundled runtime modules (a newline
  string), so the engine stays pure and the lists bundle cleanly into the CLI
  and VSIX with no filesystem reads.

Regenerate after editing the arrays:

```bash
node scripts/generate-dictionaries.mjs
```

## Project dictionary

Teams share custom words through a checked-in file (default
`.codetrio/dictionary.txt`):

```text
# One word per line. '#' starts a comment.
mycompany
kubernetes
# Prefix a line with '!' to force-allow a word without offering it as a suggestion.
!wontfix
```

In the extension, "Add to project dictionary" appends to this file (a write
operation, disabled in untrusted workspaces). The CLI reads it automatically
when checking files under that project root.

## How checking works

The spell engine only inspects comments and strings by default. Each candidate
word is split (`camelCase`, `snake_case`, `kebab-case`, `SCREAMING_CASE`) into
sub-words, and each sub-word is looked up case-insensitively against the merged
dictionary (built-in lists + project words + configured ignore words). Unknown
words get up to five suggestions ranked by bounded Damerau-Levenshtein distance.
Add `codetrio-ignore` to a line to skip it, or `codetrio-ignore-file` anywhere
in a file to skip the whole file.
