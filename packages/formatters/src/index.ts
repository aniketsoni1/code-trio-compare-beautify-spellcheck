/**
 * @ctr/formatters - formatter adapters. Adapters are the only place allowed to
 * import or shell out to a third-party formatter. They degrade gracefully and
 * never reach the network.
 */
import type { FormatterAdapter } from "@ctr/core";
import { PrettierAdapter } from "./prettier";
import { WhitespaceAdapter } from "./whitespace";

export { PrettierAdapter, PRETTIER_PINNED_VERSION } from "./prettier";
export { WhitespaceAdapter } from "./whitespace";

/**
 * The default adapter chain: Prettier for the languages it supports, then a
 * safe whitespace normalizer for everything else. Order is priority order.
 */
export function defaultAdapters(): FormatterAdapter[] {
  return [new PrettierAdapter(), new WhitespaceAdapter()];
}
