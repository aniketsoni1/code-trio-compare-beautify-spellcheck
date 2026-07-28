import type { CodeTrioConfig } from "@ctr/configuration";
import { languageFromPath } from "@ctr/core";
import { applyFormatToFile, loadFileDocument, registryFor, runFormat } from "@ctr/agent";
import { summarizeFormat } from "@ctr/reporting";
import pc from "picocolors";
import { expandGlobsDetailed } from "../glob";
import { ExitCode, type ExitCodeValue } from "../exit-codes";

export interface FormatCommandOptions {
  check?: boolean;
  write?: boolean;
  lang?: string;
  color?: boolean;
}

export async function runFormatCommand(
  globs: readonly string[],
  opts: FormatCommandOptions,
  cfg: CodeTrioConfig,
  cwd: string = process.cwd(),
): Promise<ExitCodeValue> {
  const expansion = expandGlobsDetailed(globs.length > 0 ? globs : ["**/*"], cwd, {
    exclude: cfg.spell.ignoreGlobs,
  });
  const files = expansion.files;
  if (files.length === 0) {
    // Distinct from an argument error: the command was well-formed, it simply
    // matched nothing. A CI script needs to tell a typo from an empty glob.
    process.stderr.write("error: no files matched\n");
    return ExitCode.NoInput;
  }
  if (expansion.truncated) {
    process.stderr.write(
      `warning: file list was capped at ${files.length}; some files were not processed\n`,
    );
  }
  const color = opts.color ?? true;
  const registry = registryFor(cfg);
  let needsFormat = 0;
  let wrote = 0;

  for (const file of files) {
    const lang = opts.lang ?? languageFromPath(file).id;
    if (opts.write) {
      const { result, applied } = await applyFormatToFile(file, lang, cfg, registry);
      if (applied) wrote++;
      const tag = applied ? pc.green("formatted") : pc.dim("unchanged");
      process.stdout.write(`${color ? tag : (applied ? "formatted" : "unchanged")}  ${file}  ${summarizeFormat(result, color)}\n`);
    } else {
      const doc = loadFileDocument(file, opts.lang);
      const result = await runFormat(doc, cfg, registry);
      if (result.changed) needsFormat++;
      const tag = result.changed ? pc.yellow("needs format") : pc.green("ok");
      process.stdout.write(`${color ? tag : (result.changed ? "needs format" : "ok")}  ${file}  ${summarizeFormat(result, color)}\n`);
    }
  }

  if (opts.write) {
    process.stdout.write(`\nFormatted ${wrote} of ${files.length} file(s).\n`);
    return expansion.truncated ? ExitCode.PartialSuccess : ExitCode.Success;
  }
  if (opts.check) {
    process.stdout.write(`\n${needsFormat} of ${files.length} file(s) need formatting.\n`);
    return needsFormat > 0 ? ExitCode.Findings : ExitCode.Success;
  }
  process.stdout.write(
    `\n${needsFormat} of ${files.length} file(s) would change. Use --write to apply.\n`,
  );
  return ExitCode.Success;
}
