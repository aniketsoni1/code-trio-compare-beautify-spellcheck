import type { FormatterAdapter, FormatterAvailability, FormatterCapabilities } from "@ctr/core";

/** An adapter plus the result of probing it. */
export interface AdapterReport {
  readonly id: string;
  readonly displayName: string;
  readonly languages: readonly string[];
  readonly bundled: boolean;
  readonly availability: FormatterAvailability;
  readonly capabilities?: FormatterCapabilities;
}

/**
 * An ordered registry of formatter adapters. `resolve` returns the first
 * adapter that both claims the language and is available in this environment.
 */
export class AdapterRegistry {
  private readonly adapters: FormatterAdapter[] = [];

  constructor(adapters: readonly FormatterAdapter[] = []) {
    this.adapters.push(...adapters);
  }

  register(adapter: FormatterAdapter): this {
    this.adapters.push(adapter);
    return this;
  }

  list(): readonly FormatterAdapter[] {
    return this.adapters;
  }

  /** First adapter that supports the language, regardless of availability. */
  claim(languageId: string): FormatterAdapter | undefined {
    return this.adapters.find((a) => a.supports(languageId));
  }

  /** Every adapter that claims the language, in priority order. */
  claimAll(languageId: string): readonly FormatterAdapter[] {
    return this.adapters.filter((a) => a.supports(languageId));
  }

  /** Look up an adapter by its capability id. */
  byId(id: string): FormatterAdapter | undefined {
    return this.adapters.find((a) => (a.capabilities?.id ?? a.name) === id);
  }

  /** First adapter that supports the language and is available right now. */
  async resolve(languageId: string): Promise<FormatterAdapter | undefined> {
    for (const adapter of this.adapters) {
      if (adapter.supports(languageId) && (await adapter.isAvailable())) return adapter;
    }
    return undefined;
  }

  /**
   * Explain what would happen for a language: which adapter would run, and why
   * each higher-priority candidate was passed over.
   *
   * This is what turns "nothing happened when I pressed format" into an
   * actionable message. Without it, the only feedback for a missing formatter
   * is silence, or a fallback that quietly does something else.
   */
  async explain(languageId: string): Promise<{
    selected?: AdapterReport;
    rejected: readonly AdapterReport[];
  }> {
    const rejected: AdapterReport[] = [];
    for (const adapter of this.claimAll(languageId)) {
      const report = await describe(adapter);
      if (report.availability.available) return { selected: report, rejected };
      rejected.push(report);
    }
    return { rejected };
  }

  /**
   * Probe every adapter.
   *
   * Probes run concurrently: each spawns a process to ask for a version, and
   * doing five of those in series makes `code-trio formatters` feel broken.
   */
  describeAll(): Promise<readonly AdapterReport[]> {
    return Promise.all(this.adapters.map(describe));
  }

  /** Invalidate any cached availability, e.g. after configuration changed. */
  invalidate(): void {
    for (const adapter of this.adapters) {
      const maybe = adapter as { invalidate?: () => void };
      maybe.invalidate?.();
    }
  }
}

async function describe(adapter: FormatterAdapter): Promise<AdapterReport> {
  const capabilities = adapter.capabilities;
  let availability: FormatterAvailability;
  try {
    availability = adapter.probe
      ? await adapter.probe()
      : { available: await adapter.isAvailable(), version: adapter.version, source: "bundled" };
  } catch (err) {
    // A probe that throws is a broken adapter, not a broken registry. Report it
    // and keep going, so one bad adapter cannot hide the other four.
    availability = {
      available: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
  return {
    id: capabilities?.id ?? adapter.name,
    displayName: capabilities?.displayName ?? adapter.name,
    languages: capabilities?.languages ?? [],
    bundled: capabilities?.bundled ?? true,
    availability,
    ...(capabilities ? { capabilities } : {}),
  };
}
