# Configuration

Code Trio reads the same configuration model in the CLI and the extension. In VS
Code, settings live under `codeTrio.*`. For the CLI, put a `codetrio.json` at
your project root (the CLI walks up from the working directory to find it). All
values are validated and defaulted through `@ctr/configuration`.

Generate a starter file with `code-trio init`.

## Sections

### `codeTrio.diff`

| Key | Type | Default | Meaning |
| --- | --- | --- | --- |
| `granularity` | `line \| word \| char` | `word` | refinement level |
| `ignoreWhitespace` | boolean | `false` | ignore whitespace-only changes |
| `ignoreCase` | boolean | `false` | ignore case differences |
| `contextLines` | integer | `3` | context lines per hunk |

### `codeTrio.spell`

| Key | Type | Default | Meaning |
| --- | --- | --- | --- |
| `enabled` | boolean | `true` | enable spell diagnostics |
| `checkComments` | boolean | `true` | check comment text |
| `checkStrings` | boolean | `true` | check string literals |
| `checkIdentifiers` | boolean | `false` | also check identifiers |
| `severity` | `error \| warning \| information \| hint` | `information` | diagnostic severity |
| `dictionaries` | array | `["base","technical"]` | built-in lists to load |
| `projectDictionaryPath` | string | `.codetrio/dictionary.txt` | shared word list |
| `ignoreGlobs` | array | node_modules/dist/out | paths to skip |
| `minWordLength` | integer | `3` | skip words shorter than this |
| `maxSuggestions` | integer | `5` | quick-fix suggestions per word |

### `codeTrio.format`

| Key | Type | Default | Meaning |
| --- | --- | --- | --- |
| `formatOnSave` | boolean | `false` | beautify supported files on save |
| `previewBeforeApply` | boolean | `true` | show a dry-run before applying |
| `pinnedVersions` | boolean | `true` | record formatter name/version |
| `tabWidth` | integer | `2` | indent width |
| `useTabs` | boolean | `false` | indent with tabs |
| `printWidth` | integer | `80` | wrap width |

## Example `codetrio.json`

```json
{
  "diff": { "granularity": "word", "ignoreWhitespace": false },
  "spell": {
    "checkIdentifiers": false,
    "severity": "warning",
    "projectDictionaryPath": ".codetrio/dictionary.txt"
  },
  "format": { "formatOnSave": false, "previewBeforeApply": true }
}
```

Unknown keys and invalid values are rejected with a readable error, so a typo in
your config fails fast instead of being silently ignored.
