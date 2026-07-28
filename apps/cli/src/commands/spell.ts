import type { CodeTrioConfig } from "@ctr/configuration";
import type { Diagnostic, Severity } from "@ctr/core";
import { loadFileDocument, loadProjectDictionary, runSpell } from "@ctr/agent";
import { renderDiagnosticsTerminal } from "@ctr/reporting";
import { expandGlobsDetailed } from "../glob";
import { ExitCode, type ExitCodeValue } from "../exit-codes";

export interface SpellCommandOptions {
  lang?: string;
  identifiers?: boolean;
  comments?: boolean;
  strings?: boolean;
  severity?: Severity;
  format?: string;
  color?: boolean;
  failOn?: string;
}

const SEVERITY_RANK: Record<Severity, number> = { error: 3, warning: 2, information: 1, hint: 0 };

function applyOverrides(cfg: CodeTrioConfig, opts: SpellCommandOptions): CodeTrioConfig {
  return {
    ...cfg,
    spell: {
      ...cfg.spell,
      checkIdentifiers: opts.identifiers ?? cfg.spell.checkIdentifiers,
      checkComments: opts.comments ?? cfg.spell.checkComments,
      checkStrings: opts.strings ?? cfg.spell.checkStrings,
      severity: opts.severity ?? cfg.spell.severity,
    },
  };
}

export function runSpellCommand(
  globs: readonly string[],
  opts: SpellCommandOptions,
  cfg: CodeTrioConfig,
  root: string,
  cwd: string = process.cwd(),
): ExitCodeValue {
  const expansion = expandGlobsDetailed(globs.length > 0 ? globs : ["**/*"], cwd, {
    // The extension honours ignoreGlobs; the CLI must agree or the same config
    // produces different results in the two surfaces.
    exclude: cfg.spell.ignoreGlobs,
  });
  const files = expansion.files;
  if (files.length === 0) {
    // Distinct from an argument error: the command was well-formed, it simply
    // matched nothing.
    process.stderr.write("error: no files matched\n");
    return ExitCode.NoInput;
  }
  if (expansion.truncated) {
    process.stderr.write(
      `warning: file list was capped at ${files.length}; some files were not checked\n`,
    );
  }
  const config = applyOverrides(cfg, opts);
  const project = loadProjectDictionary(root, config.spell.projectDictionaryPath);

  const json = opts.format === "json";
  const perFile: Array<{ file: string; diagnostics: Diagnostic[] }> = [];
  let worst = -1;

  for (const file of files) {
    const doc = loadFileDocument(file, opts.lang);
    const diagnostics = runSpell(doc, config, project);
    perFile.push({ file, diagnostics });
    for (const d of diagnostics) worst = Math.max(worst, SEVERITY_RANK[d.severity]);
    if (!json && diagnostics.length > 0) {
      process.stdout.write(
        `${renderDiagnosticsTerminal(diagnostics, { file, color: opts.color ?? true, showSuggestions: true })}\n`,
      );
    }
  }

  const total = perFile.reduce((n, f) => n + f.diagnostics.length, 0);
  if (json) {
    process.stdout.write(`${JSON.stringify({ files: perFile, total }, null, 2)}\n`);
  } else if (total === 0) {
    process.stdout.write("No spelling issues found.\n");
  } else {
    process.stdout.write(`\n${total} issue${total === 1 ? "" : "s"} across ${files.length} file(s).\n`);
  }

  if (opts.failOn && opts.failOn !== "none") {
    const threshold = SEVERITY_RANK[opts.failOn as Severity] ?? SEVERITY_RANK.information;
    // `worst` starts at -1, so a clean run never reaches the threshold even for
    // --fail-on hint, whose rank is 0.
    if (worst >= threshold) return ExitCode.Findings;
  }
  return expansion.truncated ? ExitCode.PartialSuccess : ExitCode.Success;
}
