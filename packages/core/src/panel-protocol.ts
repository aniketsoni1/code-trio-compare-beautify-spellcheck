import { z } from "zod";

/**
 * The typed message contract between the extension host and the results
 * webview.
 *
 * Kept in `@ctr/core` so both sides import the same definitions and the same
 * validators. A webview is a separate JavaScript realm that can be reached by
 * any script that manages to run inside it, so messages arriving at the host
 * are untrusted input and are validated at runtime — not merely typed.
 *
 * The rule the schemas enforce: the webview may ask the host to do things it
 * could already do through a command, and nothing else. There is no "run this
 * path", no "write this file", and no free-form command dispatch. A forged
 * message can at worst navigate to a result the panel is already displaying.
 */

/** Which tool produced a result. */
export const ResultKindSchema = z.enum(["compare", "spell", "beautify", "merge"]);
export type ResultKind = z.infer<typeof ResultKindSchema>;

export const ResultSeveritySchema = z.enum(["error", "warning", "information", "hint"]);
export type ResultSeverity = z.infer<typeof ResultSeveritySchema>;

/**
 * One row in the panel.
 *
 * Deliberately flat and self-describing: the webview does no business logic, so
 * every field it needs to render and sort must already be present rather than
 * derived.
 */
export const PanelResultSchema = z.object({
  /** Stable id, used as a React-style key and as the navigation target. */
  id: z.string().min(1),
  kind: ResultKindSchema,
  severity: ResultSeveritySchema,
  /** Primary text, e.g. the diagnostic message or the diff summary. */
  message: z.string(),
  /** Display name of the file, already shortened for the UI. */
  file: z.string().optional(),
  /** Full URI, used only to ask the host to open it. */
  uri: z.string().optional(),
  /** Zero-based line, for display and navigation. */
  line: z.number().int().nonnegative().optional(),
  character: z.number().int().nonnegative().optional(),
  endLine: z.number().int().nonnegative().optional(),
  endCharacter: z.number().int().nonnegative().optional(),
  /** Sub-grouping within a tool, e.g. "unknown-word" or "formatter-error". */
  category: z.string().optional(),
  /** Extra detail shown on a second line. */
  detail: z.string().optional(),
});
export type PanelResult = z.infer<typeof PanelResultSchema>;

/** Counts by severity, precomputed by the host. */
export const ResultCountsSchema = z.object({
  error: z.number().int().nonnegative(),
  warning: z.number().int().nonnegative(),
  information: z.number().int().nonnegative(),
  hint: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});
export type ResultCounts = z.infer<typeof ResultCountsSchema>;

/** Lifecycle of one tool's most recent operation. */
export const ToolStateSchema = z.object({
  status: z.enum(["idle", "running", "success", "partial", "failed", "cancelled"]),
  /** One-line summary, e.g. "+12 -3 (40 unchanged)". */
  summary: z.string().optional(),
  /** Shown when status is partial or failed. */
  problem: z.string().optional(),
  counts: ResultCountsSchema,
});
export type ToolState = z.infer<typeof ToolStateSchema>;

/** The complete panel state. The host is the single source of truth. */
export const PanelStateSchema = z.object({
  version: z.literal(1),
  tools: z.record(ResultKindSchema, ToolStateSchema),
  results: z.array(PanelResultSchema),
  /** True when results were capped; the panel discloses this. */
  truncated: z.boolean().default(false),
  /** Name of the operation that can be re-run, if any. */
  rerunLabel: z.string().optional(),
  /** Free-text note, e.g. which dictionaries were consulted. */
  note: z.string().optional(),
});
export type PanelState = z.infer<typeof PanelStateSchema>;

/**
 * Messages the host sends to the webview.
 *
 * `setState` replaces the whole state rather than patching it. Patch protocols
 * drift: the webview ends up with a state the host never produced, and the bug
 * is unreproducible. A full replace is a few hundred bytes and is always right.
 */
export const HostToWebviewSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("setState"), state: PanelStateSchema }),
  z.object({ type: z.literal("setTheme"), highContrast: z.boolean() }),
]);
export type HostToWebview = z.infer<typeof HostToWebviewSchema>;

/**
 * Messages the webview sends to the host.
 *
 * Every one is a request to do something the user could already do from the
 * Command Palette. Note what is absent: no arbitrary command id, no file path
 * to write, no shell string. `reveal` carries a result id, and the host looks
 * up the location in state it already holds rather than trusting coordinates
 * supplied by the webview.
 */
export const WebviewToHostSchema = z.discriminatedUnion("type", [
  /** The webview finished loading and wants the current state. */
  z.object({ type: z.literal("ready") }),
  /** Open the file for a result and reveal its range. */
  z.object({ type: z.literal("reveal"), resultId: z.string().min(1) }),
  /** Copy one result to the clipboard. */
  z.object({ type: z.literal("copyResult"), resultId: z.string().min(1) }),
  /** Copy the whole report. */
  z.object({ type: z.literal("copyReport"), format: z.enum(["markdown", "json"]) }),
  /** Export the report to a file the user chooses. */
  z.object({ type: z.literal("export"), format: z.enum(["markdown", "json"]) }),
  /** Clear one tool's results, or all of them. */
  z.object({ type: z.literal("clear"), kind: ResultKindSchema.optional() }),
  /** Re-run the last operation. */
  z.object({ type: z.literal("rerun") }),
  /** Persist UI preferences so they survive the panel being hidden. */
  z.object({
    type: z.literal("persistView"),
    tab: ResultKindSchema.or(z.literal("all")),
    sort: z.enum(["file", "line", "severity", "category", "kind"]),
    filter: z.string().max(200),
  }),
]);
export type WebviewToHost = z.infer<typeof WebviewToHostSchema>;

/**
 * Validate a message arriving from the webview.
 *
 * Returns a discriminated result rather than throwing, because a malformed
 * message is something to log and drop, not something that should take down the
 * message handler and with it the whole panel.
 */
export function parseWebviewMessage(
  value: unknown,
): { ok: true; message: WebviewToHost } | { ok: false; error: string } {
  const parsed = WebviewToHostSchema.safeParse(value);
  if (parsed.success) return { ok: true, message: parsed.data };
  return {
    ok: false,
    error: parsed.error.issues
      .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
      .join("; "),
  };
}

/** Validate a message arriving from the host, used by the webview. */
export function parseHostMessage(
  value: unknown,
): { ok: true; message: HostToWebview } | { ok: false; error: string } {
  const parsed = HostToWebviewSchema.safeParse(value);
  if (parsed.success) return { ok: true, message: parsed.data };
  return { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
}

/** Zeroed counts, for a tool that has not run. */
export function emptyCounts(): ResultCounts {
  return { error: 0, warning: 0, information: 0, hint: 0, total: 0 };
}

/** Tally severities across a set of results. */
export function countResults(results: readonly PanelResult[]): ResultCounts {
  const counts = emptyCounts();
  for (const r of results) {
    counts[r.severity]++;
    counts.total++;
  }
  return counts;
}
