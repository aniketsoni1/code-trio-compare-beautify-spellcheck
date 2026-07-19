import type { FormatterAdapter } from "@ctr/core";

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

  /** First adapter that supports the language and is available right now. */
  async resolve(languageId: string): Promise<FormatterAdapter | undefined> {
    for (const adapter of this.adapters) {
      if (adapter.supports(languageId) && (await adapter.isAvailable())) return adapter;
    }
    return undefined;
  }
}
