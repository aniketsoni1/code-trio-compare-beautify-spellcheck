import type { CodeTrioConfig } from "@ctr/configuration";
import { languageFromPath } from "@ctr/core";
import { applyFormatToFile, defaultRegistry, loadFileDocument, runFormat } from "@ctr/agent";
import { summarizeFormat } from "@ctr/reporting";
import pc from "picocolors";
import { expandGlobs } from "../glob";

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
): Promise<number> {
  const files = expandGlobs(globs.length > 0 ? globs : ["**/*"], cwd);
  if (files.length === 0) {
    process.stderr.write("error: no files matched\n");
    return 2;
  }
  const color = opts.color ?? true;
  const registry = defaultRegistry();
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
    return 0;
  }
  if (opts.check) {
    process.stdout.write(`\n${needsFormat} of ${files.length} file(s) need formatting.\n`);
    return needsFormat > 0 ? 1 : 0;
  }
  process.stdout.write(`\n${needsFormat} of ${files.length} file(s) would change. Use --write to apply.\n`);
  return 0;
}
