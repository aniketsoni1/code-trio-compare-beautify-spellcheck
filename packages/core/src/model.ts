/**
 * The normalized document/diagnostics model shared by every Code Trio engine.
 *
 * Positions are zero-based (line, character) to match the Language Server
 * Protocol so the engines can later back an LSP server without translation.
 */

/** Zero-based line/character position. */
export interface Position {
  readonly line: number;
  readonly character: number;
}

/** Half-open range [start, end). */
export interface Range {
  readonly start: Position;
  readonly end: Position;
}

/** A single text replacement over a range. */
export interface TextEdit {
  readonly range: Range;
  readonly newText: string;
}

/**
 * The kinds of lexical tokens the engines reason about. Kept intentionally
 * small: the spell checker only inspects comments/strings by default and the
 * identifier splitter runs over `identifier` tokens when opted in.
 */
export type TokenKind = "identifier" | "comment" | "string" | "keyword" | "other";

/** A lexical token produced by the code-aware tokenizer. */
export interface Token {
  readonly kind: TokenKind;
  readonly text: string;
  /** Absolute UTF-16 offset of the first character in the document. */
  readonly offset: number;
  readonly range: Range;
}

/** A normalized source document. The single input every engine accepts. */
export interface Document {
  /** File URI or a synthetic identifier such as `clipboard:` or `git:HEAD`. */
  readonly uri: string;
  readonly languageId: string;
  readonly text: string;
  readonly version?: number;
}

/** Diagnostic severity, ordered from most to least severe. */
export type Severity = "error" | "warning" | "information" | "hint";

/** A quick fix attached to a diagnostic. */
export interface QuickFix {
  readonly title: string;
  readonly kind: "replace" | "addToDictionary" | "ignore";
  readonly edits: readonly TextEdit[];
  /** For dictionary actions, the raw word being added. */
  readonly word?: string;
  readonly isPreferred?: boolean;
}

/** A single problem surfaced through the unified diagnostics model. */
export interface Diagnostic {
  /** Producer id, e.g. `code-trio.spell`. */
  readonly source: string;
  /** Machine-readable rule id, e.g. `unknown-word`. */
  readonly code?: string;
  readonly message: string;
  readonly severity: Severity;
  readonly range: Range;
  readonly quickFixes?: readonly QuickFix[];
  readonly data?: Readonly<Record<string, unknown>>;
}

/** The operation a diff line/segment represents. */
export type DiffOp = "equal" | "insert" | "delete" | "replace";

/** Diff refinement granularity. */
export type DiffGranularity = "line" | "word" | "char";

/** A refined segment inside a replaced line (word/char granularity). */
export interface DiffSegment {
  readonly op: DiffOp;
  readonly text: string;
}

/** One aligned line in a diff. */
export interface DiffLine {
  readonly op: DiffOp;
  /** Zero-based line index in document A (undefined for pure inserts). */
  readonly aLine?: number;
  /** Zero-based line index in document B (undefined for pure deletes). */
  readonly bLine?: number;
  readonly aText?: string;
  readonly bText?: string;
  /** Word/char refinement for `replace` lines. */
  readonly segments?: readonly DiffSegment[];
}

/** A contiguous block of change plus the surrounding context. */
export interface DiffHunk {
  readonly aStart: number;
  readonly aLines: number;
  readonly bStart: number;
  readonly bLines: number;
  readonly lines: readonly DiffLine[];
}

/** Summary counters for a diff. */
export interface DiffStats {
  readonly insertions: number;
  readonly deletions: number;
  readonly unchanged: number;
}

/** The full result of a two-way comparison. */
export interface DiffResult {
  readonly granularity: DiffGranularity;
  readonly identical: boolean;
  readonly hunks: readonly DiffHunk[];
  readonly stats: DiffStats;
}

/** Which side a three-way merge region originated from. */
export type MergeSide = "base" | "ours" | "theirs";

/** A region in a three-way merge: either a clean copy or a conflict. */
export interface MergeRegion {
  readonly conflict: boolean;
  readonly baseLines: readonly string[];
  readonly ourLines: readonly string[];
  readonly theirLines: readonly string[];
  /** For clean regions, the resolved lines. */
  readonly resolved?: readonly string[];
}

/** The result of a three-way merge. */
export interface MergeResult {
  readonly clean: boolean;
  readonly regions: readonly MergeRegion[];
  readonly conflictCount: number;
}

/** Identifies the formatter that produced a result (for reproducibility). */
export interface FormatterInfo {
  readonly name: string;
  readonly version: string;
}

/** The result of formatting a document. */
export interface FormatResult {
  readonly changed: boolean;
  readonly formatted: string;
  readonly edits: readonly TextEdit[];
  readonly formatter: FormatterInfo;
  readonly languageId: string;
  /** True when no adapter claims the language. */
  readonly unsupported: boolean;
  /** Populated when an adapter degraded gracefully instead of crashing. */
  readonly error?: string;
  /** Optional dry-run preview computed by the format engine. */
  readonly previewDiff?: DiffResult;
}

/** The severity ordering used when sorting/merging diagnostics. */
export const SEVERITY_ORDER: Readonly<Record<Severity, number>> = {
  error: 0,
  warning: 1,
  information: 2,
  hint: 3,
};
