import { basename } from "node:path";
import type {
  AdapterFormatOutput,
  Document,
  FormatOptions,
  FormatterAdapter,
  FormatterAvailability,
  FormatterCapabilities,
} from "@ctr/core";
import {
  DEFAULT_TIMEOUT_MS,
  findExecutable,
  runProcess,
  summarizeStderr,
  validateConfiguredPath,
} from "./process";

/**
 * Base class for adapters that shell out to a locally installed formatter.
 *
 * Everything shared by ruff, gofmt, rustfmt, clang-format and black lives here:
 * discovery, version probing, caching, stdin/stdout formatting, and turning a
 * failed run into a message that tells the user what to do.
 *
 * Two rules apply to every subclass and are enforced by this base:
 *
 *   1. Nothing is ever downloaded. Discovery finds what is already installed.
 *   2. A formatter that is absent or broken produces a reported failure, never
 *      a silent substitution. Quietly falling back to a different formatter
 *      could change the meaning of the code.
 */

export interface ExternalAdapterConfig {
  /** Absolute path configured by the user, taking priority over PATH. */
  readonly executablePath?: string;
  /** Disable discovery entirely, so nothing external is ever run. */
  readonly disabled?: boolean;
  readonly timeoutMs?: number;
}

/** Result of an availability probe, cached with a timestamp. */
interface CachedProbe {
  readonly at: number;
  readonly value: FormatterAvailability;
}

/**
 * How long a successful probe is trusted.
 *
 * Probing means spawning a process to ask for `--version`, which is far too
 * expensive to repeat on every keystroke-triggered format-on-save. Sixty
 * seconds is short enough that installing a formatter is noticed promptly and
 * long enough that a burst of formats costs one probe.
 */
const PROBE_TTL_MS = 60_000;

export abstract class ExternalFormatterAdapter implements FormatterAdapter {
  private probeCache: CachedProbe | undefined;

  constructor(protected readonly config: ExternalAdapterConfig = {}) {}

  abstract readonly capabilities: FormatterCapabilities;

  /** Executable name to look for on PATH. */
  protected abstract readonly executableName: string;

  /** Arguments that make the formatter print its version. */
  protected abstract readonly versionArgs: readonly string[];

  /** Arguments for formatting text supplied on stdin. */
  protected abstract formatArgs(doc: Document, options?: FormatOptions): readonly string[];

  /** Extract a version from `--version` output. */
  protected parseVersion(output: string): string {
    // Nearly every tool prints "<name> <semver>" somewhere in the first line.
    const match = /\d+\.\d+(?:\.\d+)?(?:[-+][\w.]+)?/.exec(output);
    return match?.[0] ?? "unknown";
  }

  get name(): string {
    return this.capabilities.id;
  }

  /**
   * Version is only known after a probe. Reporting "unknown" until then is
   * honest; the format result carries the real version once a run has happened.
   */
  get version(): string {
    return this.probeCache?.value.version ?? "unknown";
  }

  supports(languageId: string): boolean {
    return this.capabilities.languages.includes(languageId);
  }

  /** Locate the executable without running it. */
  protected resolveExecutable():
    | { path: string; source: "configured" | "path" }
    | { error: string } {
    if (this.config.executablePath) {
      const validated = validateConfiguredPath(this.config.executablePath);
      return validated.ok
        ? { path: validated.path, source: "configured" }
        : { error: validated.reason };
    }
    const found = findExecutable(this.executableName);
    if (found) return { path: found, source: "path" };
    return {
      error:
        `${this.executableName} was not found on PATH. Install it, or set an absolute path in ` +
        `codeTrio.externalFormatters.paths.`,
    };
  }

  async probe(): Promise<FormatterAvailability> {
    if (this.config.disabled) {
      return {
        available: false,
        reason: "External formatter discovery is disabled (codeTrio.externalFormatters.enabled).",
      };
    }
    const cached = this.probeCache;
    if (cached && Date.now() - cached.at < PROBE_TTL_MS) return cached.value;

    const resolved = this.resolveExecutable();
    if ("error" in resolved) {
      const value: FormatterAvailability = { available: false, reason: resolved.error };
      this.probeCache = { at: Date.now(), value };
      return value;
    }

    const run = await runProcess(resolved.path, this.versionArgs, {
      timeoutMs: Math.min(this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS, 5_000),
    });
    const value: FormatterAvailability = run.ok
      ? {
          available: true,
          version: this.parseVersion(`${run.stdout}\n${run.stderr}`),
          executable: resolved.path,
          source: resolved.source,
        }
      : {
          available: false,
          executable: resolved.path,
          source: resolved.source,
          reason: run.timedOut
            ? `${basename(resolved.path)} did not respond to ${this.versionArgs.join(" ")} within the timeout.`
            : `${basename(resolved.path)} ${this.versionArgs.join(" ")} failed: ${
                summarizeStderr(run.stderr) || run.spawnError || `exit ${String(run.code)}`
              }`,
        };
    this.probeCache = { at: Date.now(), value };
    return value;
  }

  async isAvailable(): Promise<boolean> {
    return (await this.probe()).available;
  }

  /** Discard the cached probe, e.g. after the configured path changes. */
  invalidate(): void {
    this.probeCache = undefined;
  }

  /**
   * Format by piping the document through the formatter's stdin.
   *
   * stdin/stdout is used in preference to writing a temporary file because it
   * avoids creating a file the user did not ask for, avoids a temp-directory
   * race, and means a crash cannot leave debris behind. Formatters that cannot
   * read stdin are not adapted.
   */
  async format(doc: Document, options?: FormatOptions): Promise<AdapterFormatOutput> {
    const availability = await this.probe();
    if (!availability.available || !availability.executable) {
      throw new Error(availability.reason ?? `${this.capabilities.displayName} is unavailable.`);
    }

    const run = await runProcess(availability.executable, this.formatArgs(doc, options), {
      input: doc.text,
      timeoutMs: this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      ...(options?.filepath ? { cwd: dirOf(options.filepath) } : {}),
    });

    if (run.timedOut) {
      throw new Error(
        `${this.capabilities.displayName} timed out after ${run.durationMs}ms. ` +
          `Raise codeTrio.externalFormatters.timeoutMs if this file is unusually large.`,
      );
    }
    if (!run.ok) {
      const detail = summarizeStderr(run.stderr) || run.spawnError || `exit code ${String(run.code)}`;
      throw new Error(`${this.capabilities.displayName} failed: ${detail}`);
    }
    // A formatter that exits 0 with empty output on non-empty input has
    // misbehaved. Returning that would silently delete the file's contents,
    // which is the worst possible failure mode for a formatter.
    if (run.stdout.length === 0 && doc.text.trim().length > 0) {
      throw new Error(
        `${this.capabilities.displayName} produced no output for a non-empty document. ` +
          `Refusing to replace the file with an empty result.`,
      );
    }

    return {
      formatted: run.stdout,
      formatter: {
        name: this.capabilities.id,
        version: availability.version ?? "unknown",
      },
    };
  }
}

function dirOf(filepath: string): string {
  const idx = Math.max(filepath.lastIndexOf("/"), filepath.lastIndexOf("\\"));
  return idx > 0 ? filepath.slice(0, idx) : filepath;
}
