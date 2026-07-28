import type {
  AdapterFormatOutput,
  Document,
  FormatOptions,
  FormatterAdapter,
  FormatterAvailability,
  FormatterCapabilities,
} from "@ctr/core";
import prettier from "prettier/standalone";
import type { Plugin } from "prettier";
import * as pluginEstree from "prettier/plugins/estree";
import * as pluginBabel from "prettier/plugins/babel";
import * as pluginTypescript from "prettier/plugins/typescript";
import * as pluginPostcss from "prettier/plugins/postcss";
import * as pluginMarkdown from "prettier/plugins/markdown";
import * as pluginYaml from "prettier/plugins/yaml";
import * as pluginHtml from "prettier/plugins/html";
import prettierPkg from "prettier/package.json";

/**
 * Prettier standalone plugins are imported explicitly so the whole formatter
 * bundles cleanly into the CLI and the VS Code extension (no dynamic plugin
 * loading, no network). The pinned version is read from Prettier's own
 * package.json and recorded in results for reproducibility.
 *
 * `prettier/standalone` is used rather than the full `prettier` entry point
 * specifically because standalone does not touch the filesystem: it cannot
 * discover a `.prettierrc`, and therefore cannot be steered by a config file in
 * an untrusted workspace. Configuration comes from Code Trio's own settings,
 * which is a deliberate trade of convenience for predictability.
 */
const PLUGINS: Plugin[] = [
  pluginEstree as unknown as Plugin,
  pluginBabel as unknown as Plugin,
  pluginTypescript as unknown as Plugin,
  pluginPostcss as unknown as Plugin,
  pluginMarkdown as unknown as Plugin,
  pluginYaml as unknown as Plugin,
  pluginHtml as unknown as Plugin,
];

export const PRETTIER_PINNED_VERSION: string = prettierPkg.version;

/** languageId -> Prettier parser. Only languages Prettier supports are listed. */
const PARSERS: Readonly<Record<string, string>> = {
  typescript: "typescript",
  typescriptreact: "typescript",
  javascript: "babel",
  javascriptreact: "babel",
  json: "json",
  jsonc: "json",
  css: "css",
  scss: "scss",
  less: "less",
  markdown: "markdown",
  yaml: "yaml",
  html: "html",
};

/**
 * The Prettier adapter. Adapters are the only place allowed to import a
 * third-party formatter. It degrades gracefully (throwing a readable error the
 * engine converts into a reported failure) and never reaches the network.
 */
export class PrettierAdapter implements FormatterAdapter {
  readonly name = "prettier";
  readonly version = PRETTIER_PINNED_VERSION;

  readonly capabilities: FormatterCapabilities = {
    id: "prettier",
    displayName: "Prettier",
    languages: Object.keys(PARSERS),
    bundled: true,
    rangeFormatting: false,
    // The standalone build selects its parser from the language id rather than
    // from the path, so a file path adds nothing.
    needsFilePath: false,
    // Standalone cannot read .prettierrc; see the note above.
    configDiscovery: false,
    cancellable: false,
  };

  supports(languageId: string): boolean {
    return languageId in PARSERS;
  }

  isAvailable(): Promise<boolean> {
    return Promise.resolve(true);
  }

  /**
   * Bundled Prettier is always available, and its version is fixed at build
   * time, so the probe needs no process and no I/O.
   */
  probe(): Promise<FormatterAvailability> {
    return Promise.resolve({
      available: true,
      version: PRETTIER_PINNED_VERSION,
      source: "bundled",
    });
  }

  async format(doc: Document, options?: FormatOptions): Promise<AdapterFormatOutput> {
    const parser = PARSERS[doc.languageId];
    if (parser === undefined) {
      throw new Error(
        `Prettier does not support language "${doc.languageId}". ` +
          `Supported: ${Object.keys(PARSERS).join(", ")}.`,
      );
    }
    try {
      const formatted = await prettier.format(doc.text, {
        parser,
        plugins: PLUGINS,
        tabWidth: options?.tabWidth ?? 2,
        useTabs: options?.useTabs ?? false,
        printWidth: options?.printWidth ?? 80,
        endOfLine: "lf",
      });
      return {
        formatted,
        formatter: { name: this.name, version: this.version },
      };
    } catch (err) {
      // Prettier's syntax errors carry a location that is genuinely useful, but
      // its raw message includes a code frame that is noise in a notification.
      const message = err instanceof Error ? err.message.split("\n")[0] : String(err);
      throw new Error(`Prettier could not parse this ${doc.languageId} document: ${message}`);
    }
  }
}
