/**
 * Stable exit codes for the `code-trio` CLI.
 *
 * These are part of the CLI's public contract: scripts and CI pipelines branch
 * on them, so a value may be added but must never be repurposed. The layout
 * follows the convention that 0 means success, 1 means "the tool worked and
 * found something", and 2 and above mean "the tool could not do its job".
 *
 * That distinction is the important one. `code-trio format --check` exiting 1
 * means files need formatting, which a CI job should treat as a normal failing
 * assertion. It exiting 4 means the configuration is broken, which is a
 * different problem and deserves a different response.
 */
export const ExitCode = {
  /** Completed with nothing to report. */
  Success: 0,

  /**
   * Completed successfully and found what it was looking for: files differ,
   * spelling issues exist, files need formatting. Only returned when the
   * caller asked for it (`--exit-code`, `--check`, `--fail-on`).
   */
  Findings: 1,

  /** Bad arguments: unknown flag, missing operand, mutually exclusive options. */
  InvalidArguments: 2,

  /** No input matched. Distinct from Success so an empty glob is not silent. */
  NoInput: 3,

  /** Configuration file missing, unparseable, or failing schema validation. */
  ConfigError: 4,

  /** A file could not be read, or is binary/too large to process. */
  FileError: 5,

  /** A requested formatter is not installed or not usable in this environment. */
  FormatterUnavailable: 6,

  /** A tool ran but failed: formatter crashed, git returned an error. */
  ToolFailure: 7,

  /** Cancelled by SIGINT/SIGTERM or by exceeding a time budget. */
  Cancelled: 8,

  /** Completed for some inputs and failed for others. */
  PartialSuccess: 9,

  /** An unexpected internal error. A bug in Code Trio. */
  InternalError: 70,
} as const;

export type ExitCodeValue = (typeof ExitCode)[keyof typeof ExitCode];

/** Human-readable meaning of each code, for `--help` and documentation. */
export const EXIT_CODE_DESCRIPTIONS: Readonly<Record<number, string>> = {
  [ExitCode.Success]: "Success, nothing to report",
  [ExitCode.Findings]: "Success, findings reported (differences, issues, unformatted files)",
  [ExitCode.InvalidArguments]: "Invalid arguments",
  [ExitCode.NoInput]: "No files matched",
  [ExitCode.ConfigError]: "Configuration error",
  [ExitCode.FileError]: "File could not be read or is unsupported",
  [ExitCode.FormatterUnavailable]: "Requested formatter unavailable",
  [ExitCode.ToolFailure]: "Tool execution failed",
  [ExitCode.Cancelled]: "Cancelled",
  [ExitCode.PartialSuccess]: "Partial success, some inputs failed",
  [ExitCode.InternalError]: "Internal error",
};

/** Render the exit-code table for `code-trio exit-codes` and `--help` output. */
export function formatExitCodeTable(): string {
  const rows = Object.entries(EXIT_CODE_DESCRIPTIONS).sort(
    (a, b) => Number(a[0]) - Number(b[0]),
  );
  const width = Math.max(...rows.map(([code]) => code.length));
  return rows.map(([code, text]) => `  ${code.padStart(width)}  ${text}`).join("\n");
}
