/**
 * @ctr/formatters - formatter adapters. Adapters are the only place allowed to
 * import or shell out to a third-party formatter. They degrade gracefully and
 * never reach the network.
 */
import type { FormatterAdapter } from "@ctr/core";
import { PrettierAdapter } from "./prettier";
import { WhitespaceAdapter } from "./whitespace";
import { externalAdapters } from "./adapters";
import type { ExternalAdapterConfig } from "./external";

export { PrettierAdapter, PRETTIER_PINNED_VERSION } from "./prettier";
export { WhitespaceAdapter } from "./whitespace";
export { ExternalFormatterAdapter, type ExternalAdapterConfig } from "./external";
export {
  RuffAdapter,
  BlackAdapter,
  GofmtAdapter,
  GofmtAdapterFixed,
  RustfmtAdapter,
  ClangFormatAdapter,
  externalAdapters,
} from "./adapters";
export {
  runProcess,
  findExecutable,
  validateConfiguredPath,
  summarizeStderr,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_MAX_BUFFER,
  type RunOptions,
  type RunResult,
} from "./process";

export interface AdapterChainOptions {
  /** Configuration for every external adapter. */
  readonly external?: ExternalAdapterConfig;
  /**
   * Adapter ids to try first, in order. Lets a user prefer Black over Ruff for
   * Python without disabling either.
   */
  readonly preferred?: readonly string[];
}

/**
 * The default adapter chain, in priority order.
 *
 * Prettier first for the languages it owns, then locally installed external
 * formatters, then the safe whitespace normalizer as a universal fallback.
 *
 * The ordering matters for correctness, not just preference: the whitespace
 * normalizer must come last because it claims every language. If it were
 * earlier it would silently win for Python and Go and the user would get
 * trailing-whitespace trimming while believing Ruff had run.
 */
export function defaultAdapters(options: AdapterChainOptions = {}): FormatterAdapter[] {
  const external = options.external?.disabled ? [] : externalAdapters(options.external ?? {});
  const preferred = options.preferred ?? [];

  // Stable sort by preference index; unlisted adapters keep their relative
  // order after the listed ones.
  const rank = (adapter: FormatterAdapter): number => {
    const index = preferred.indexOf(adapter.capabilities?.id ?? adapter.name);
    return index === -1 ? preferred.length : index;
  };
  const ordered = [...external].sort((a, b) => rank(a) - rank(b));

  return [new PrettierAdapter(), ...ordered, new WhitespaceAdapter()];
}
