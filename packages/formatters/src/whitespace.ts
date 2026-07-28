import type {
  AdapterFormatOutput,
  Document,
  FormatterAdapter,
  FormatterAvailability,
  FormatterCapabilities,
} from "@ctr/core";
import { detectEol } from "@ctr/core";

/**
 * A deterministic, dependency-free fallback formatter. It only performs edits
 * that are safe for every language, including whitespace-sensitive ones
 * (Python, YAML): trim trailing horizontal whitespace, collapse trailing blank
 * lines, and guarantee a single final newline. Never reaches the network.
 */
export class WhitespaceAdapter implements FormatterAdapter {
  readonly name = "whitespace-normalizer";
  readonly version = "1.0.0";

  readonly capabilities: FormatterCapabilities = {
    id: "whitespace-normalizer",
    displayName: "Whitespace normalizer",
    // Claims every language deliberately: it is the universal last resort, and
    // the registry relies on it being last in the chain.
    languages: [],
    bundled: true,
    rangeFormatting: false,
    needsFilePath: false,
    configDiscovery: false,
    cancellable: false,
  };

  probe(): Promise<FormatterAvailability> {
    return Promise.resolve({ available: true, version: this.version, source: "bundled" });
  }

  supports(_languageId: string): boolean {
    return true;
  }

  isAvailable(): Promise<boolean> {
    return Promise.resolve(true);
  }

  format(doc: Document): Promise<AdapterFormatOutput> {
    const eol = detectEol(doc.text);
    const lines = doc.text.split(/\r\n|\r|\n/).map((l) => l.replace(/[ \t]+$/, ""));
    while (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
    const formatted = lines.join(eol) + eol;
    return Promise.resolve({
      formatted,
      formatter: { name: this.name, version: this.version },
    });
  }
}
