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

/** Why a diff stopped short of a complete result. */
export type DiffTruncationReason =
  | "max-lines"
  | "max-length"
  | "binary"
  | "minified"
  | "cancelled";

/** Disclosure that a result is incomplete, and why. */
export interface DiffTruncation {
  readonly reason: DiffTruncationReason;
  /** Human-readable explanation suitable for direct display. */
  readonly message: string;
  /** The limit that was exceeded, when the reason is a limit. */
  readonly limit?: number;
  /** The observed value that exceeded the limit. */
  readonly actual?: number;
}

/**
 * Line-ending metadata for the two sides of a comparison. Recorded so a diff
 * that is textually identical but differs only in line endings can say so
 * rather than silently reporting "identical".
 */
export interface DiffEolInfo {
  readonly a: "lf" | "crlf" | "cr";
  readonly b: "lf" | "crlf" | "cr";
  /** True when either side mixes conventions within itself. */
  readonly mixed: boolean;
  /** True when the two sides use different conventions. */
  readonly differs: boolean;
}

/** The full result of a two-way comparison. */
export interface DiffResult {
  readonly granularity: DiffGranularity;
  readonly identical: boolean;
  readonly hunks: readonly DiffHunk[];
  readonly stats: DiffStats;
  /**
   * Present when the result is incomplete. Consumers must disclose this rather
   * than presenting a truncated diff as a complete one.
   */
  readonly truncation?: DiffTruncation;
  /** Line-ending analysis of both sides, when computed. */
  readonly eol?: DiffEolInfo;
  /**
   * True when the two sides differ only in line endings and/or trailing
   * newline, and the comparison was configured to ignore those.
   */
  readonly eolOnlyDifference?: boolean;
}

/** Which side a three-way merge region originated from. */
export type MergeSide = "base" | "ours" | "theirs";

/**
 * How a clean (non-conflicting) region was produced.
 *
 * Recorded so a merge report can explain *why* a region needed no decision,
 * which is the difference between a reviewable merge and an opaque one.
 */
export type CleanOrigin =
  | "unchanged" // neither side touched it
  | "ours" // only we changed it
  | "theirs" // only they changed it
  | "both-identical"; // both changed it the same way

/** A half-open line span `[start, end)` within one side of a merge. */
export interface LineSpan {
  readonly start: number;
  readonly end: number;
}

/** A region in a three-way merge: either a clean copy or a conflict. */
export interface MergeRegion {
  /**
   * Stable identifier, assigned in document order (`region-0`, `region-1`, …).
   * UIs use it as a key for resolution state so that re-running a merge on
   * unchanged inputs preserves the user's choices.
   */
  readonly id: string;
  readonly conflict: boolean;
  readonly baseLines: readonly string[];
  readonly ourLines: readonly string[];
  readonly theirLines: readonly string[];
  /** For clean regions, the resolved lines. */
  readonly resolved?: readonly string[];
  /** Why a clean region was clean. Undefined for conflicts. */
  readonly origin?: CleanOrigin;
  /** Where this region sits in each input, for editor navigation. */
  readonly spans?: {
    readonly base: LineSpan;
    readonly ours: LineSpan;
    readonly theirs: LineSpan;
  };
}

/** A user's decision about one conflicting region. */
export type MergeChoice = "ours" | "theirs" | "both-ours-first" | "both-theirs-first" | "base";

/** A resolution for a specific region, by id. */
export interface MergeResolution {
  readonly regionId: string;
  readonly choice: MergeChoice;
  /**
   * Replacement lines supplied by the user, overriding `choice`. Present when
   * the conflict was resolved by hand rather than by picking a side.
   */
  readonly manualLines?: readonly string[];
}

/** The result of a three-way merge. */
export interface MergeResult {
  readonly clean: boolean;
  readonly regions: readonly MergeRegion[];
  readonly conflictCount: number;
  /** Ids of the conflicting regions, in document order. */
  readonly conflictIds: readonly string[];
  /** Line-ending analysis across the three inputs, when computed. */
  readonly eol?: {
    readonly base: "lf" | "crlf" | "cr";
    readonly ours: "lf" | "crlf" | "cr";
    readonly theirs: "lf" | "crlf" | "cr";
    readonly differs: boolean;
  };
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
