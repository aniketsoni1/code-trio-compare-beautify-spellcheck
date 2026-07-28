import { writeFileSync } from "node:fs";
import type { CodeTrioConfig } from "@ctr/configuration";
import type { PanelResult, PanelState, ResultKind, ToolState } from "@ctr/core";
import { countResults, languageFromPath } from "@ctr/core";
import { loadFileDocument, registryFor, runFormat, runSpellScoped } from "@ctr/agent";
import { renderPanelJson, renderPanelMarkdown, renderPanelText } from "@ctr/reporting";
import { expandGlobsDetailed } from "../glob";
import { ExitCode, type ExitCodeValue } from "../exit-codes";

export interface ReportCommandOptions {
  format?: string;
  output?: string;
  spell?: boolean;
  format_?: boolean;
  formatCheck?: boolean;
  lang?: string;
  failOn?: string;
}

/**
 * A combined report across the tools, in the same shape the results panel
 * exports.
 *
 * The value of sharing `@ctr/reporting` here is that `code-trio report
 * --format markdown` and the panel's "Export as Markdown" produce byte-
 * identical output. A CI job and a developer looking at the panel are then
 * looking at the same artefact, rather than two renderings that drift.
 */
export async function runReportCommand(
  globs: readonly string[],
  opts: ReportCommandOptions,
  cfg: CodeTrioConfig,
  root: string,
  cwd: string = process.cwd(),
): Promise<ExitCodeValue> {
  const expansion = expandGlobsDetailed(globs.length > 0 ? globs : ["**/*"], cwd, {
    exclude: cfg.spell.ignoreGlobs,
  });
  if (expansion.files.length === 0) {
    process.stderr.write("error: no files matched\n");
    return ExitCode.NoInput;
  }

  const results: PanelResult[] = [];
  const tools: Partial<Record<ResultKind, ToolState>> = {};
  const failures: string[] = [];

  const wantSpell = opts.spell !== false;
  const wantFormat = opts.formatCheck !== false;

  if (wantSpell) {
    let checked = 0;
    for (const file of expansion.files) {
      try {
        const doc = loadFileDocument(file, opts.lang);
        const run = runSpellScoped(doc, cfg, { workspace: root });
        checked++;
        for (const [index, d] of run.diagnostics.entries()) {
          results.push({
            id: `spell-${file}-${index}`,
            kind: "spell",
            severity: d.severity,
            message: d.message,
            file,
            uri: doc.uri,
            line: d.range.start.line,
            character: d.range.start.character,
            endLine: d.range.end.line,
            endCharacter: d.range.end.character,
            ...(d.code ? { category: d.code } : {}),
          });
        }
      } catch (err) {
        failures.push(`${file}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    const spellResults = results.filter((r) => r.kind === "spell");
    tools.spell = {
      status: failures.length > 0 ? "partial" : "success",
      summary: `${spellResults.length} issue(s) across ${checked} file(s)`,
      counts: countResults(spellResults),
      ...(failures.length > 0 ? { problem: `${failures.length} file(s) could not be read` } : {}),
    };
  }

  if (wantFormat) {
    const registry = registryFor(cfg);
    let needsFormat = 0;
    let checked = 0;
    for (const file of expansion.files) {
      try {
        const doc = loadFileDocument(file, opts.lang ?? languageFromPath(file).id);
        const result = await runFormat(doc, cfg, registry);
        checked++;
        if (result.error) {
          results.push({
            id: `beautify-${file}`,
            kind: "beautify",
            severity: "warning",
            message: result.error,
            file,
            uri: doc.uri,
            category: "formatter-error",
          });
        } else if (result.changed) {
          needsFormat++;
          results.push({
            id: `beautify-${file}`,
            kind: "beautify",
            severity: "information",
            message: `Needs formatting (${result.formatter.name}@${result.formatter.version})`,
            file,
            uri: doc.uri,
            category: "needs-format",
            ...(result.previewDiff
              ? {
                  detail: `+${result.previewDiff.stats.insertions} -${result.previewDiff.stats.deletions}`,
                }
              : {}),
          });
        }
      } catch (err) {
        failures.push(`${file}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    const beautifyResults = results.filter((r) => r.kind === "beautify");
    tools.beautify = {
      status: "success",
      summary: `${needsFormat} of ${checked} file(s) need formatting`,
      counts: countResults(beautifyResults),
    };
  }

  const state: PanelState = {
    version: 1,
    tools: tools as PanelState["tools"],
    results,
    truncated: expansion.truncated,
    ...(expansion.truncated
      ? { note: "File list was capped; this report does not cover every file." }
      : {}),
  };

  const format = opts.format ?? "markdown";
  const content =
    format === "json"
      ? renderPanelJson(state)
      : format === "text"
        ? renderPanelText(state)
        : renderPanelMarkdown(state);

  if (opts.output) {
    try {
      writeFileSync(opts.output, content);
      process.stdout.write(`Report written to ${opts.output}\n`);
    } catch (err) {
      process.stderr.write(
        `error: could not write "${opts.output}": ${err instanceof Error ? err.message : String(err)}\n`,
      );
      return ExitCode.FileError;
    }
  } else {
    process.stdout.write(content);
  }

  // Partial success is reported distinctly from clean success, so a CI job can
  // tell "some files were unreadable" from "everything was checked".
  if (failures.length > 0) return ExitCode.PartialSuccess;
  if (opts.failOn && opts.failOn !== "none" && results.length > 0) return ExitCode.Findings;
  return ExitCode.Success;
}
