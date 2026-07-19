import type { Diagnostic, Document, QuickFix, Severity, TextEdit, TokenKind } from "@ctr/core";
import { PositionMapper } from "@ctr/core";
import type { Dictionary } from "@ctr/dictionaries";
import { tokenize } from "./tokenizer";
import { splitIdentifier, wordRuns } from "./split";
import { suggest } from "./suggest";

export interface SpellOptions {
  readonly dictionary: Dictionary;
  readonly checkComments?: boolean;
  readonly checkStrings?: boolean;
  readonly checkIdentifiers?: boolean;
  readonly severity?: Severity;
  readonly minWordLength?: number;
  readonly maxSuggestions?: number;
  readonly ignoreWords?: readonly string[];
}

const SOURCE = "code-trio.spell";
const IGNORE_FILE = "codetrio-ignore-file";
const IGNORE_LINE = "codetrio-ignore";

function checkedKinds(opts: SpellOptions): Set<TokenKind> {
  const kinds = new Set<TokenKind>();
  if (opts.checkComments ?? true) kinds.add("comment");
  if (opts.checkStrings ?? true) kinds.add("string");
  if (opts.checkIdentifiers ?? false) kinds.add("identifier");
  return kinds;
}

function applyCase(original: string, suggestion: string): string {
  if (original.length > 1 && original === original.toUpperCase()) {
    return suggestion.toUpperCase();
  }
  const first = original[0];
  if (first && first === first.toUpperCase() && first !== first.toLowerCase()) {
    return suggestion.charAt(0).toUpperCase() + suggestion.slice(1);
  }
  return suggestion;
}

/**
 * Produce spelling diagnostics for a document. Pure: the dictionary is injected
 * and no file or network access occurs. Comments and strings are checked by
 * default; identifiers are opt-in. Words are split (camel/snake/kebab/screaming)
 * before lookup, and `codetrio-ignore` lines / `codetrio-ignore-file` suppress
 * noise.
 */
export function spellCheck(doc: Document, options: SpellOptions): Diagnostic[] {
  if (doc.text.includes(IGNORE_FILE)) return [];

  const opts = options;
  const kinds = checkedKinds(opts);
  const minLen = opts.minWordLength ?? 3;
  const maxSug = opts.maxSuggestions ?? 5;
  const severity: Severity = opts.severity ?? "information";
  const dict = opts.dictionary;
  const pool = dict.list();
  const allow = new Set((opts.ignoreWords ?? []).map((w) => w.toLowerCase()));

  const mapper = new PositionMapper(doc.text);
  const skipLines = new Set<number>();
  for (const [lineNo, line] of doc.text.split(/\r\n|\r|\n/).entries()) {
    if (line.includes(IGNORE_LINE)) skipLines.add(lineNo);
  }

  const tokens = tokenize(doc.text, doc.languageId);
  const diagnostics: Diagnostic[] = [];

  for (const token of tokens) {
    if (!kinds.has(token.kind)) continue;
    for (const run of wordRuns(token.text)) {
      for (const sub of splitIdentifier(run.text)) {
        const surface = sub.text;
        const lower = surface.toLowerCase();
        if (surface.length < minLen) continue;
        if (allow.has(lower) || dict.has(lower)) continue;

        const absOffset = token.offset + run.offset + sub.offset;
        const line = mapper.positionAt(absOffset).line;
        if (skipLines.has(line)) continue;

        const range = mapper.rangeOf(absOffset, absOffset + surface.length);
        const suggestions = suggest(lower, pool, maxSug);
        const quickFixes: QuickFix[] = [];
        for (const s of suggestions) {
          const replacement = applyCase(surface, s);
          const edit: TextEdit = { range, newText: replacement };
          quickFixes.push({
            title: `Replace with "${replacement}"`,
            kind: "replace",
            edits: [edit],
            isPreferred: quickFixes.length === 0,
          });
        }
        quickFixes.push({
          title: `Add "${lower}" to project dictionary`,
          kind: "addToDictionary",
          edits: [],
          word: lower,
        });

        diagnostics.push({
          source: SOURCE,
          code: "unknown-word",
          message:
            suggestions.length > 0
              ? `Unknown word: "${surface}". Did you mean ${suggestions
                  .slice(0, 3)
                  .map((s) => `"${s}"`)
                  .join(", ")}?`
              : `Unknown word: "${surface}".`,
          severity,
          range,
          quickFixes,
          data: { word: lower, token: token.kind },
        });
      }
    }
  }

  diagnostics.sort((a, b) => {
    if (a.range.start.line !== b.range.start.line) {
      return a.range.start.line - b.range.start.line;
    }
    return a.range.start.character - b.range.start.character;
  });
  return diagnostics;
}
