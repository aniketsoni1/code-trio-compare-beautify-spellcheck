# Dictionaries and licensing

Code Trio resolves spelling against a **stack of six scopes**. The first scope
with an opinion about a word decides; lower scopes are not consulted.

## Precedence

| # | Scope | Where it lives | Writable |
| --: | --- | --- | :-: |
| 1 | Session | In memory, this window only | — |
| 2 | Workspace folder | `<folder>/.codetrio/dictionary.txt` | yes |
| 3 | Workspace | `<workspace root>/.codetrio/dictionary.txt` | yes |
| 4 | User | `~/.codetrio/user-dictionary.txt` | yes |
| 5 | Technical | Bundled | no |
| 6 | Base | Bundled | no |

More specific and more recently expressed scopes win. The built-in lists are
never edited at runtime.

### "Has an opinion" means accept *or reject*

A dictionary line prefixed with `!` **rejects** a word. A rejection stops the
walk, so a lower scope cannot re-accept it.

This is what makes the ordering mean anything. Without rejection, precedence
would be purely additive — every scope could only add words, and the order would
be decorative. With it, one package in a monorepo can refuse a word the shared
workspace dictionary accepts:

```text
# apps/marketing-site/.codetrio/dictionary.txt
!colour        # this package writes US English, whatever the repo root says
newsletter
```

## Why per-folder dictionaries exist

A monorepo is not one vocabulary. Terms that are correct in `services/billing`
are noise in `apps/marketing-site`. Forcing both into one shared file means the
file accumulates every word from every folder until it stops rejecting anything —
at which point spell checking is decorative.

The folder scope is only consulted when the folder differs from the workspace
root. In a single-root workspace the two resolve to the same file and are
collapsed into one layer, so nothing is loaded twice and the UI does not offer a
choice between two identical destinations.

## File format

One word per line. Case-insensitive.

```text
# Code Trio dictionary. One word per line; '#' starts a comment.
# Prefix a line with '!' to reject a word that a broader dictionary accepts.

kubernetes
webhook
idempotency

!recieve        # reject a common misspelling even if something else allows it
```

Blank lines and `#` comments are ignored. The parser never throws: a malformed
or unreadable file yields an empty layer flagged unavailable, and the panel
reports it. That matters — the failure mode it prevents is a permissions problem
presenting as a sudden flood of spelling errors with no explanation.

## Settings

| Setting | Default |
| --- | --- |
| `codeTrio.spell.projectDictionaryPath` | `.codetrio/dictionary.txt` |
| `codeTrio.spell.folderDictionaryPath` | `.codetrio/dictionary.txt` |
| `codeTrio.spell.userDictionaryPath` | `.codetrio/user-dictionary.txt` |
| `codeTrio.spell.ignoreWords` | `[]` |
| `codeTrio.spell.dictionaries` | `["base", "technical"]` |

`projectDictionaryPath` keeps its v0.1.0 name and default, so an existing
project dictionary keeps working with no migration step. Setting
`userDictionaryPath` to an empty string disables the user scope entirely.

## Working with dictionaries

### In VS Code

Adding a word asks which scope it belongs in — a personal preference should not
require a commit to a shared file, and a term specific to one package should not
be accepted repository-wide.

| Command | What it does |
| --- | --- |
| Add Word To Dictionary | Quick fix; prompts for the scope |
| Ignore Word For This Session | Accepts it for this window; **writes nothing** |
| Clear Session Ignore List | Forgets every session ignore |
| Open Workspace Dictionary | Opens the file, offering to create it |
| Open Workspace Folder Dictionary | The owning folder's file |
| Open User Dictionary | Your personal file |
| Show Dictionary Sources | Lists what was consulted, with word counts and any read error |

"Show Dictionary Sources" is the fastest way to answer *why is this word still
flagged?*

Dictionary files are watched, so an edit takes effect on the next check without a
window reload — including creating a file that did not previously exist. Watchers
are keyed by resolved path, so a five-folder workspace sharing one workspace
dictionary registers one watcher, not five.

### From the CLI

```bash
code-trio dictionary list                      # every source, in precedence order
code-trio dictionary check kubernetes          # which scope decided, and where
code-trio dictionary add webhook --scope workspace
code-trio dictionary block colour --scope folder
code-trio dictionary path --scope user         # print the file path
```

`check` exits 0 when the word is accepted and 1 when it is not, so it composes in
scripts.

## Bundled word lists and licensing

The base (≈1,200 words) and technical (≈360 words) lists are original, curated
for Code Trio, and dedicated to the public domain under **CC0-1.0**. They contain
no content derived from a copyrighted or copyleft word list, which is why Code
Trio can ship them inside an Apache-2.0 package with no additional notice
obligations. See `THIRD_PARTY_NOTICES.md`.

They are registered as two separate layers rather than pre-merged. That is what
lets a workspace reject an ordinary English word without also losing technical
vocabulary, and lets the UI say whether a word was accepted as normal English or
as a known technical term.

### The base list is a baseline, not a lexicon

~1,200 words is a common-word floor, not full English. Ordinary words such as
"details" or "introduced" may be flagged. This is the honest cost of a
bundled-and-offline dictionary: shipping a full English lexicon would add
megabytes to the VSIX and a licensing question, and downloading one would break
the offline guarantee that is the point of the product.

The intended workflow is that a project's real vocabulary accumulates in its
project dictionary over the first few sessions.

## Reducing false positives

Before adding words, check that noise suppression is doing its job. It removes
URLs, file paths, hashes, UUIDs, hex values, versions, timestamps, base64 blobs
and template placeholders *before* any word is extracted — measured at 28
diagnostics down to 9 on a fixture of realistic comments, at no measurable time
cost (see `docs/performance.md`).

| Setting | Use it for |
| --- | --- |
| `codeTrio.spell.ignoreNoiseTokens` | Turning suppression off (not recommended) |
| `codeTrio.spell.ignorePatterns` | Project-specific patterns |
| `codeTrio.spell.minWordLength` | Raising the floor above 3 |
| `codeTrio.spell.checkAcronyms` | Opting *into* checking ALL-CAPS fragments |
| `codeTrio.spell.ignoreGlobs` | Excluding whole paths |

In-file escapes:

```ts
// codetrio-ignore          — skip this line
// codetrio-ignore-file     — skip this whole file
```

Whole documents are skipped automatically when they are binary, minified,
oversized, or carry a `@generated` / "DO NOT EDIT" banner in their first 20
lines.
