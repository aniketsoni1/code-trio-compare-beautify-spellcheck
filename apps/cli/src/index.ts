import { Command } from "commander";
import type { Severity } from "@ctr/core";
import { loadCliConfig } from "./config-io";
import { runDiffCommand } from "./commands/diff";
import { runMergeCommand } from "./commands/merge";
import { runSpellCommand } from "./commands/spell";
import { runFormatCommand } from "./commands/format";
import { runFormattersCommand } from "./commands/formatters";
import { runReportCommand } from "./commands/report";
import { runDictionaryCommand } from "./commands/dictionary";
import { runConfigureCommand, runDoctorCommand, runInitCommand } from "./commands/misc";
import { ExitCode, formatExitCodeTable } from "./exit-codes";
import pkg from "../package.json";

export function buildProgram(): Command {
  const program = new Command();
  program
    .name("code-trio")
    .description(
      "Code Trio - offline, deterministic compare/diff, code-aware spell check, and beautify/format.",
    )
    .version(pkg.version, "-v, --version");

  program
    .command("diff")
    .description("Compare two files, or one file against a git ref")
    .argument("<a>", "first file (or the file to compare against a ref)")
    .argument("[b]", "second file")
    .option("-w, --words", "refine changes at word granularity")
    .option("--chars", "refine changes at character granularity")
    .option("--ignore-whitespace", "ignore whitespace differences")
    .option("--ignore-case", "ignore case differences")
    .option("--ref <ref>", "compare <a> at a git ref against the working copy")
    .option("--ignore-eol", "treat CRLF, LF and CR as equivalent")
    .option(
      "--format <mode>",
      "output format: terminal | json | unified | markdown | side-by-side",
      "terminal",
    )
    .option("--context <n>", "unchanged context lines per hunk")
    .option("--no-color", "disable ANSI colors")
    .option("--exit-code", "exit 1 when files differ")
    .action((a: string, b: string | undefined, opts) => {
      const { config } = loadCliConfig();
      process.exitCode = runDiffCommand(a, b, opts, config);
    });

  program
    .command("merge")
    .description("Three-way merge with conflict reporting and resolution")
    .argument("[file]", "conflicted working-tree file, used with --git")
    .option("--base <file>", "common ancestor")
    .option("--ours <file>", "our version")
    .option("--theirs <file>", "their version")
    .option("--git", "read base/ours/theirs from git's conflict stages for <file>")
    .option(
      "--accept <side>",
      "resolve every conflict: ours | theirs | both-ours-first | both-theirs-first | base",
    )
    .option("-o, --output <file>", "write the merged result (only when fully resolved)")
    .option("--overwrite", "allow --output to replace an existing file")
    .option("--no-diff3", "omit the base section from conflict markers")
    .option("--show-clean", "also list regions that merged without conflict")
    .option("--format <mode>", "output format: terminal | json | markdown | merged", "terminal")
    .option("--no-color", "disable ANSI colors")
    .option("--exit-code", "exit 1 when conflicts remain unresolved")
    .action((file: string | undefined, opts) => {
      const { config } = loadCliConfig();
      process.exitCode = runMergeCommand(file, opts, config);
    });

  program
    .command("spell")
    .description("Spell check files (comments and strings by default)")
    .argument("[globs...]", "files or globs to check")
    .option("--lang <id>", "force a language id for all files")
    .option("--identifiers", "also check identifiers")
    .option("--no-comments", "do not check comments")
    .option("--no-strings", "do not check strings")
    .option("--severity <level>", "error | warning | information | hint")
    .option("--format <mode>", "output format: terminal | json", "terminal")
    .option("--no-color", "disable ANSI colors")
    .option("--fail-on <level>", "exit 1 when an issue at/above this severity exists", "none")
    .action((globs: string[], opts) => {
      const { config, root } = loadCliConfig();
      const severity = opts.severity as Severity | undefined;
      process.exitCode = runSpellCommand(globs, { ...opts, severity }, config, root);
    });

  program
    .command("format")
    .description("Beautify files with the formatter orchestrator")
    .argument("[globs...]", "files or globs to format")
    .option("--check", "report files that need formatting; exit 1 if any (CI mode)")
    .option("--write", "write changes back to disk")
    .option("--lang <id>", "force a language id for all files")
    .option("--no-color", "disable ANSI colors")
    .action(async (globs: string[], opts) => {
      const { config } = loadCliConfig();
      process.exitCode = await runFormatCommand(globs, opts, config);
    });

  program
    .command("report")
    .description("Combined spell + beautify report across files")
    .argument("[globs...]", "files or globs to include")
    .option("--no-spell", "omit spell results")
    .option("--no-format-check", "omit formatting results")
    .option("--lang <id>", "force a language id for all files")
    .option("-o, --output <file>", "write the report to a file instead of stdout")
    .option("--format <mode>", "output format: markdown | json | text", "markdown")
    .option("--fail-on <level>", "exit 1 when any result is present", "none")
    .action(async (globs: string[], opts) => {
      const { config, root } = loadCliConfig();
      process.exitCode = await runReportCommand(globs, opts, config, root);
    });

  program
    .command("dictionary")
    .description("Inspect and edit the dictionary scopes")
    .argument("<action>", "list | check | add | block | path")
    .argument("[word]", "the word, for check, add and block")
    .option("--scope <scope>", "folder | workspace | user", "workspace")
    .option("--format <mode>", "output format: terminal | json", "terminal")
    .option("--no-color", "disable ANSI colors")
    .action((action: string, word: string | undefined, opts) => {
      const { config, root } = loadCliConfig();
      process.exitCode = runDictionaryCommand(action, word, opts, config, root);
    });

  program
    .command("formatters")
    .description("Report which formatters are available on this machine")
    .option("--lang <id>", "only show adapters that claim this language")
    .option("--format <mode>", "output format: terminal | json", "terminal")
    .option("--no-color", "disable ANSI colors")
    .action(async (opts) => {
      const { config } = loadCliConfig();
      process.exitCode = await runFormattersCommand(opts, config);
    });

  program
    .command("init")
    .description("Create codetrio.json and a project dictionary")
    .action(() => {
      process.exitCode = runInitCommand();
    });

  program
    .command("doctor")
    .description("Check the environment (Node, git, Prettier, dictionaries)")
    .action(async () => {
      process.exitCode = await runDoctorCommand();
    });

  program
    .command("configure")
    .description("Print the resolved effective configuration")
    .action(() => {
      const { config, path } = loadCliConfig();
      process.exitCode = runConfigureCommand(config, path);
    });

  program
    .command("exit-codes")
    .description("Print the stable exit-code table")
    .action(() => {
      process.stdout.write(`code-trio exit codes:\n${formatExitCodeTable()}\n`);
      process.exitCode = ExitCode.Success;
    });

  program.addHelpText(
    "after",
    `\nExit codes:\n${formatExitCodeTable()}\n\nCode Trio makes no network requests and collects no telemetry.\n`,
  );

  return program;
}

export async function main(argv: string[] = process.argv): Promise<void> {
  await buildProgram().parseAsync(argv);
}
