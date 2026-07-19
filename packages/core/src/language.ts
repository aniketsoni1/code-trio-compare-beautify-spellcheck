/**
 * The language registry. Engines use it to look up comment/string syntax for
 * tokenization and to decide whether a language is whitespace-sensitive.
 * Language ids match VS Code language identifiers where possible.
 */

export interface LanguageDefinition {
  readonly id: string;
  readonly aliases: readonly string[];
  readonly extensions: readonly string[];
  readonly lineComments: readonly string[];
  readonly blockComments: readonly (readonly [string, string])[];
  readonly stringDelimiters: readonly string[];
  readonly whitespaceSensitive: boolean;
  readonly keywords: readonly string[];
}

const JS_KEYWORDS = [
  "const",
  "let",
  "var",
  "function",
  "return",
  "if",
  "else",
  "for",
  "while",
  "class",
  "extends",
  "import",
  "export",
  "from",
  "default",
  "new",
  "async",
  "await",
  "yield",
  "typeof",
  "instanceof",
  "interface",
  "type",
  "enum",
  "implements",
  "public",
  "private",
  "protected",
  "readonly",
  "static",
  "void",
  "null",
  "undefined",
  "true",
  "false",
] as const;

const DEFS: LanguageDefinition[] = [
  {
    id: "typescript",
    aliases: ["ts"],
    extensions: [".ts", ".mts", ".cts"],
    lineComments: ["//"],
    blockComments: [["/*", "*/"]],
    stringDelimiters: ['"', "'", "`"],
    whitespaceSensitive: false,
    keywords: JS_KEYWORDS,
  },
  {
    id: "typescriptreact",
    aliases: ["tsx"],
    extensions: [".tsx"],
    lineComments: ["//"],
    blockComments: [["/*", "*/"]],
    stringDelimiters: ['"', "'", "`"],
    whitespaceSensitive: false,
    keywords: JS_KEYWORDS,
  },
  {
    id: "javascript",
    aliases: ["js", "node"],
    extensions: [".js", ".mjs", ".cjs"],
    lineComments: ["//"],
    blockComments: [["/*", "*/"]],
    stringDelimiters: ['"', "'", "`"],
    whitespaceSensitive: false,
    keywords: JS_KEYWORDS,
  },
  {
    id: "javascriptreact",
    aliases: ["jsx"],
    extensions: [".jsx"],
    lineComments: ["//"],
    blockComments: [["/*", "*/"]],
    stringDelimiters: ['"', "'", "`"],
    whitespaceSensitive: false,
    keywords: JS_KEYWORDS,
  },
  {
    id: "json",
    aliases: ["jsonc"],
    extensions: [".json", ".jsonc"],
    lineComments: ["//"],
    blockComments: [["/*", "*/"]],
    stringDelimiters: ['"'],
    whitespaceSensitive: false,
    keywords: ["true", "false", "null"],
  },
  {
    id: "css",
    aliases: [],
    extensions: [".css"],
    lineComments: [],
    blockComments: [["/*", "*/"]],
    stringDelimiters: ['"', "'"],
    whitespaceSensitive: false,
    keywords: [],
  },
  {
    id: "markdown",
    aliases: ["md"],
    extensions: [".md", ".markdown"],
    lineComments: [],
    blockComments: [["<!--", "-->"]],
    stringDelimiters: [],
    whitespaceSensitive: true,
    keywords: [],
  },
  {
    id: "python",
    aliases: ["py"],
    extensions: [".py", ".pyi"],
    lineComments: ["#"],
    blockComments: [],
    stringDelimiters: ['"', "'"],
    whitespaceSensitive: true,
    keywords: [
      "def",
      "class",
      "return",
      "if",
      "elif",
      "else",
      "for",
      "while",
      "import",
      "from",
      "as",
      "with",
      "try",
      "except",
      "finally",
      "lambda",
      "None",
      "True",
      "False",
      "and",
      "or",
      "not",
      "in",
      "is",
      "pass",
      "yield",
      "async",
      "await",
    ],
  },
  {
    id: "yaml",
    aliases: ["yml"],
    extensions: [".yaml", ".yml"],
    lineComments: ["#"],
    blockComments: [],
    stringDelimiters: ['"', "'"],
    whitespaceSensitive: true,
    keywords: ["true", "false", "null", "yes", "no"],
  },
  {
    id: "shellscript",
    aliases: ["sh", "bash"],
    extensions: [".sh", ".bash"],
    lineComments: ["#"],
    blockComments: [],
    stringDelimiters: ['"', "'"],
    whitespaceSensitive: false,
    keywords: ["if", "then", "else", "fi", "for", "do", "done", "while", "case", "esac", "function"],
  },
  {
    id: "plaintext",
    aliases: ["text", "txt"],
    extensions: [".txt"],
    lineComments: [],
    blockComments: [],
    stringDelimiters: [],
    whitespaceSensitive: true,
    keywords: [],
  },
];

const byId = new Map<string, LanguageDefinition>();
const byAlias = new Map<string, LanguageDefinition>();
const byExt = new Map<string, LanguageDefinition>();

for (const def of DEFS) {
  byId.set(def.id, def);
  for (const a of def.aliases) byAlias.set(a.toLowerCase(), def);
  for (const e of def.extensions) byExt.set(e.toLowerCase(), def);
}

export const PLAINTEXT: LanguageDefinition = byId.get("plaintext") as LanguageDefinition;

/** Look up a language by id or alias. Returns undefined if unknown. */
export function getLanguage(idOrAlias: string): LanguageDefinition | undefined {
  const key = idOrAlias.toLowerCase();
  return byId.get(key) ?? byAlias.get(key);
}

/** Resolve a language by id/alias, falling back to plaintext. */
export function resolveLanguage(idOrAlias: string | undefined): LanguageDefinition {
  if (!idOrAlias) return PLAINTEXT;
  return getLanguage(idOrAlias) ?? PLAINTEXT;
}

/** Infer a language from a file path/extension. */
export function languageFromPath(path: string): LanguageDefinition {
  const lower = path.toLowerCase();
  const dot = lower.lastIndexOf(".");
  if (dot < 0) return PLAINTEXT;
  const ext = lower.slice(dot);
  return byExt.get(ext) ?? PLAINTEXT;
}

/** All registered language ids. */
export function languageIds(): string[] {
  return [...byId.keys()];
}

/** True when a language's semantics depend on whitespace (Python, YAML, ...). */
export function isWhitespaceSensitive(idOrAlias: string): boolean {
  return resolveLanguage(idOrAlias).whitespaceSensitive;
}
