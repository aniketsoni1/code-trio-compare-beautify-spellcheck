import type { CodeTrioConfig } from "@ctr/configuration";
import { registryFor } from "@ctr/agent";
import pc from "picocolors";
import { ExitCode, type ExitCodeValue } from "../exit-codes";

export interface FormattersCommandOptions {
  format?: string;
  color?: boolean;
  /** Only report adapters that claim this language. */
  lang?: string;
}

/**
 * Report which formatters Code Trio can actually use on this machine.
 *
 * The point is to make "nothing happened when I ran format" diagnosable. An
 * external formatter that is not installed should say so, name the executable
 * it looked for, and say how to point Code Trio at one — rather than silently
 * falling through to the whitespace normalizer.
 */
export async function runFormattersCommand(
  opts: FormattersCommandOptions,
  cfg: CodeTrioConfig,
): Promise<ExitCodeValue> {
  const registry = registryFor(cfg);
  const all = await registry.describeAll();
  const reports = opts.lang
    ? all.filter((r) => r.languages.includes(opts.lang as string))
    : all;

  if (opts.format === "json") {
    process.stdout.write(`${JSON.stringify({ formatters: reports }, null, 2)}\n`);
    return ExitCode.Success;
  }

  const color = opts.color ?? true;
  const green = (s: string): string => (color ? pc.green(s) : s);
  const yellow = (s: string): string => (color ? pc.yellow(s) : s);
  const dim = (s: string): string => (color ? pc.dim(s) : s);
  const bold = (s: string): string => (color ? pc.bold(s) : s);

  if (reports.length === 0) {
    process.stdout.write(
      opts.lang
        ? `No formatter adapter claims "${opts.lang}".\n`
        : "No formatter adapters are registered.\n",
    );
    return ExitCode.Success;
  }

  process.stdout.write(`${bold("Code Trio formatters")}\n\n`);
  let availableCount = 0;

  for (const r of reports) {
    const a = r.availability;
    if (a.available) availableCount++;
    const status = a.available ? green("available") : yellow("unavailable");
    const version = a.version ? dim(` ${a.version}`) : "";
    const origin = r.bundled ? dim(" (bundled)") : a.source ? dim(` (${a.source})`) : "";

    process.stdout.write(`${status}  ${bold(r.displayName)}${version}${origin}\n`);
    if (r.languages.length > 0) {
      process.stdout.write(`${dim(`          languages: ${r.languages.join(", ")}`)}\n`);
    }
    if (a.executable) {
      process.stdout.write(`${dim(`          executable: ${a.executable}`)}\n`);
    }
    if (r.capabilities) {
      const caps: string[] = [];
      if (r.capabilities.rangeFormatting) caps.push("range formatting");
      if (r.capabilities.configDiscovery) caps.push("reads its own config");
      if (r.capabilities.needsFilePath) caps.push("uses the file path");
      if (caps.length > 0) {
        process.stdout.write(`${dim(`          supports: ${caps.join(", ")}`)}\n`);
      }
    }
    if (!a.available && a.reason) {
      process.stdout.write(`${dim(`          ${a.reason}`)}\n`);
    }
    process.stdout.write("\n");
  }

  process.stdout.write(
    dim(
      `${availableCount} of ${reports.length} adapter(s) available. ` +
        `Code Trio never downloads a formatter; it only uses what is already installed.\n`,
    ),
  );

  if (!cfg.format.externalFormatters) {
    process.stdout.write(
      yellow(
        "External formatter discovery is disabled (format.externalFormatters is false).\n",
      ),
    );
  }
  return ExitCode.Success;
}
