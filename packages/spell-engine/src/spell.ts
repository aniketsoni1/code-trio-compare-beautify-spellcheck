import type {
  CancellationToken,
  Diagnostic,
  Document,
  QuickFix,
  Severity,
  TextEdit,
  TokenKind,
} from "@ctr/core";
import {
  PositionMapper,
  analyzeMinified,
  isProbablyBinary,
  isProbablyGenerated,
  throwIfCancelled,
} from "@ctr/core";
import type { Dictionary, DictionaryScope } from "@ctr/dictionaries";
import { DictionaryStack } from "@ctr/dictionaries";
import { tokenize } from "./tokenizer";
import { maskNoise, isNoiseWord, compileIgnorePatterns } from "./noise";
import { normalizeForLookup, splitIdentifierForChecking, wordRuns } from "./split";
import { applyCase, suggest } from "./suggest";

export interface SpellOptions {
  readonly dictionary: Dictionary;
  readonly checkComments?: boolean;
  readonly checkStrings?: boolean;
  readonly checkIdentifiers?: boolean;
  readonly severity?: Severity;
  readonly minWordLength?: number;
  readonly maxSuggestions?: number;
  readonly ignoreWords?: readonly string[];
  /** User-supplied regular expressions whose matches are never reported. */
  readonly ignorePatterns?: readonly string[];
  /** Disable built-in noise suppression (URLs, hashes, paths, ...). */
  readonly ignoreNoiseTokens?: boolean;
  /** Also check ALL-CAPS acronym fragments of identifiers. Off by default. */
  readonly checkAcronyms?: boolean;
  /** Skip documents larger than this many KB. */
  readonly maxFileSizeKb?: number;
  /** Cap on diagnostics produced for one document. */
  readonly maxDiagnostics?: number;
  /** Words ranked above equally-distant alternatives in suggestions. */
  readonly preferredWords?: ReadonlySet<string>;
  readonly token?: CancellationToken;
}

const SOURCE = "code-trio.spell";
const IGNORE_FILE = "codetrio-ignore-file";
const IGNORE_LINE = "codetrio-ignore";
const DEFAULT_MAX_DIAGNOSTICS = 1_000;

function checkedKinds(opts: SpellOptions): Set<TokenKind> {
  const kinds = new Set<TokenKind>();
  if (opts.checkComments ?? true) kinds.add("comment");
  if (opts.checkStrings ?? true) kinds.add("string");
  if (opts.checkIdentifiers ?? false) kinds.add("identifier");
  return kinds;
}

/** Why a document was skipped entirely. */
export type SpellSkipReason = "binary" | "generated" | "minified" | "too-large" | "ignore-file";

export interface SpellRunResult {
  readonly diagnostics: Diagnostic[];
  readonly skipped?: SpellSkipReason;
  /** True when `maxDiagnostics` was reached and the list is incomplete. */
  readonly truncated: boolean;
  /** Ignore patterns from configuration that failed to compile. */
  readonly invalidPatterns: readonly string[];
}

/**
 * Decide whether a document is worth checking at all.
 *
 * Skipping a whole file is far better than filtering thousands of diagnostics
 * out of it one by one: minified bundles and generated clients are the two
 * largest sources of spell noise in a real repository, and neither contains
 * prose a human wrote or will fix.
 */
function skipReason(doc: Document, opts: SpellOptions): SpellSkipReason | undefined {
  if (doc.text.includes(IGNORE_FILE)) return "ignore-file";
  const maxBytes = (opts.maxFileSizeKb ?? 2_048) * 1024;
  if (doc.text.length > maxBytes) return "too-large";
  if (isProbablyBinary(doc.text)) return "binary";
  if (isProbablyGenerated(doc.text)) return "generated";
  if (analyzeMinified(doc.text).minified) return "minified";
  return undefined;
}

/**
 * Produce spelling diagnostics for a document, with full run metadata.
 *
 * Pure: the dictionary is injected and no file or network access occurs.
 * Comments and strings are checked by default; identifiers are opt-in. Words
 * are split (camel/snake/kebab/screaming) before lookup, and
 * `codetrio-ignore` lines / `codetrio-ignore-file` suppress noise.
 */
export function spellCheckDetailed(doc: Document, options: SpellOptions): SpellRunResult {
  throwIfCancelled(options.token, "spell check");

  const skipped = skipReason(doc, options);
  if (skipped) {
    return { diagnostics: [], skipped, truncated: false, invalidPatterns: [] };
  }

  const opts = options;
  const kinds = checkedKinds(opts);
  const minLen = opts.minWordLength ?? 3;
  const maxSug = opts.maxSuggestions ?? 5;
  const maxDiagnostics = opts.maxDiagnostics ?? DEFAULT_MAX_DIAGNOSTICS;
  const severity: Severity = opts.severity ?? "information";
  const dict = opts.dictionary;
  const allow = new Set((opts.ignoreWords ?? []).map((w) => w.toLowerCase()));

  const { patterns: extraPatterns, invalid: invalidPatterns } = compileIgnorePatterns(
    opts.ignorePatterns ?? [],
  );
  const noiseOptions = {
    extraPatterns,
    ...(opts.ignoreNoiseTokens === false ? { disabled: true } : {}),
  };

  const mapper = new PositionMapper(doc.text);
  const skipLines = new Set<number>();
  for (const [lineNo, line] of doc.text.split(/\r\n|\r|\n/).entries()) {
    if (line.includes(IGNORE_LINE)) skipLines.add(lineNo);
  }

  // The suggestion pool is materialised once per document rather than once per
  // unknown word. On a file with 200 unknown words against a 1,200-word
  // dictionary that is the difference between 1,200 and 240,000 iterations.
  const pool = dict.list();
  const stack = dict instanceof DictionaryStack ? dict : undefined;

  const tokens = tokenize(doc.text, doc.languageId);
  const diagnostics: Diagnostic[] = [];
  // Deduplicate by exact range: an identifier appearing inside an interpolated
  // string could otherwise be reported twice at the same position.
  const seenRanges = new Set<string>();
  let truncated = false;

  outer: for (const token of tokens) {
    if (!kinds.has(token.kind)) continue;
    throwIfCancelled(opts.token, "spell check");

    // Mask non-language spans first, preserving length so every offset below
    // still maps to the right place in the original document.
    const masked =
      token.kind === "identifier" ? token.text : maskNoise(token.text, noiseOptions);

    for (const run of wordRuns(masked)) {
      const fragments =
        token.kind === "identifier"
          ? splitIdentifierForChecking(run.text, {
              minLength: minLen,
              ...(opts.checkAcronyms === true ? { checkAcronyms: true } : {}),
            })
          : splitIdentifierForChecking(run.text, {
              minLength: minLen,
              checkAcronyms: opts.checkAcronyms ?? false,
            });

      for (const sub of fragments) {
        const surface = sub.text;
        if (surface.length < minLen) continue;
        if (isNoiseWord(surface)) continue;

        const lower = normalizeForLookup(surface);
        if (lower.length < minLen) continue;
        if (allow.has(lower) || dict.has(lower)) continue;

        const absOffset = token.offset + run.offset + sub.offset;
        const line = mapper.positionAt(absOffset).line;
        if (skipLines.has(line)) continue;

        const range = mapper.rangeOf(absOffset, absOffset + surface.length);
        const key = `${range.start.line}:${range.start.character}:${range.end.character}`;
        if (seenRanges.has(key)) continue;
        seenRanges.add(key);

        if (diagnostics.length >= maxDiagnostics) {
          truncated = true;
          break outer;
        }

        const suggestions = suggest(lower, pool, {
          limit: maxSug,
          ...(opts.preferredWords ? { preferred: opts.preferredWords } : {}),
        });
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
        quickFixes.push({
          title: `Ignore "${lower}" for this session`,
          kind: "ignore",
          edits: [],
          word: lower,
        });

        // Recording which scope was consulted lets the UI offer "remove from
        // the workspace dictionary" against the correct file rather than
        // guessing which of six sources a word came from.
        const blockedBy: DictionaryScope | undefined = stack?.lookup(lower).blocked
          ? stack.lookup(lower).scope
          : undefined;

        diagnostics.push({
          source: SOURCE,
          code: blockedBy ? "blocked-word" : "unknown-word",
          message: blockedBy
            ? `"${surface}" is explicitly disallowed by the ${blockedBy} dictionary.`
            : suggestions.length > 0
              ? `Unknown word: "${surface}". Did you mean ${suggestions
                  .slice(0, 3)
                  .map((s) => `"${s}"`)
                  .join(", ")}?`
              : `Unknown word: "${surface}".`,
          severity,
          range,
          quickFixes,
          data: {
            word: lower,
            surface,
            token: token.kind,
            ...(blockedBy ? { blockedBy } : {}),
          },
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
  return { diagnostics, truncated, invalidPatterns };
}

/**
 * Produce spelling diagnostics for a document.
 *
 * The original entry point, preserved unchanged for existing callers.
 * `spellCheckDetailed` additionally reports why a document was skipped, whether
 * the diagnostic cap was hit, and which configured patterns failed to compile.
 */
export function spellCheck(doc: Document, options: SpellOptions): Diagnostic[] {
  return spellCheckDetailed(doc, options).diagnostics;
}
