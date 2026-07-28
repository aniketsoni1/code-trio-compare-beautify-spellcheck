import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { CodeTrioConfig } from "@ctr/configuration";
import type { DictionaryScope } from "@ctr/dictionaries";
import { SCOPE_LABELS, SCOPE_PRECEDENCE } from "@ctr/dictionaries";
import { dictionaryPathForScope, loadDictionaryStack } from "@ctr/agent";
import pc from "picocolors";
import { ExitCode, type ExitCodeValue } from "../exit-codes";

export interface DictionaryCommandOptions {
  scope?: string;
  format?: string;
  color?: boolean;
}

const WRITABLE: readonly DictionaryScope[] = ["folder", "workspace", "user"];

const HEADER =
  "# Code Trio dictionary. One word per line; '#' starts a comment.\n" +
  "# Prefix a line with '!' to reject a word that a broader dictionary accepts.\n";

function resolveScope(value: string | undefined): DictionaryScope | undefined {
  if (!value) return "workspace";
  return (SCOPE_PRECEDENCE as readonly string[]).includes(value)
    ? (value as DictionaryScope)
    : undefined;
}

/**
 * Inspect and edit the dictionary stack from the terminal.
 *
 * The CLI needs this for the same reason the extension does: with six scopes,
 * "why is this word flagged?" and "where did that word come from?" stop being
 * answerable by inspecting a single file.
 */
export function runDictionaryCommand(
  action: string,
  word: string | undefined,
  opts: DictionaryCommandOptions,
  cfg: CodeTrioConfig,
  root: string,
): ExitCodeValue {
  const locations = { workspace: root, folder: root };
  const color = opts.color ?? true;
  const dim = (s: string): string => (color ? pc.dim(s) : s);
  const bold = (s: string): string => (color ? pc.bold(s) : s);

  switch (action) {
    case "list": {
      const { stack, sources } = loadDictionaryStack(cfg, locations);
      if (opts.format === "json") {
        process.stdout.write(
          `${JSON.stringify({ sources, wordCount: stack.size }, null, 2)}\n`,
        );
        return ExitCode.Success;
      }
      process.stdout.write(`${bold("Dictionary sources")} ${dim("(most specific first)")}\n\n`);
      for (const scope of SCOPE_PRECEDENCE) {
        const source = sources.find((s) => s.scope === scope);
        if (!source) {
          const builtin = stack.describe().find((l) => l.scope === scope);
          if (builtin) {
            process.stdout.write(
              `  ${scope.padEnd(10)} ${dim(`${builtin.words.length} word(s), built in`)}\n`,
            );
          }
          continue;
        }
        const status = source.error
          ? (color ? pc.red("unreadable") : "unreadable")
          : source.exists
            ? `${source.wordCount} word(s)`
            : "not created";
        process.stdout.write(`  ${scope.padEnd(10)} ${status}\n`);
        process.stdout.write(`  ${" ".repeat(10)} ${dim(source.path)}\n`);
        if (source.error) process.stdout.write(`  ${" ".repeat(10)} ${dim(source.error)}\n`);
      }
      process.stdout.write(`\n${dim(`${stack.size} word(s) accepted in total.`)}\n`);
      return ExitCode.Success;
    }

    case "check": {
      if (!word) {
        process.stderr.write("error: dictionary check needs a word\n");
        return ExitCode.InvalidArguments;
      }
      const { stack } = loadDictionaryStack(cfg, locations);
      const found = stack.lookup(word);
      if (opts.format === "json") {
        process.stdout.write(`${JSON.stringify({ word, ...found }, null, 2)}\n`);
        return found.known ? ExitCode.Success : ExitCode.Findings;
      }
      if (found.known) {
        process.stdout.write(
          `"${word}" is accepted by the ${bold(found.scope ?? "built-in")} dictionary` +
            `${found.origin ? dim(` (${found.origin})`) : ""}\n`,
        );
        return ExitCode.Success;
      }
      if (found.blocked) {
        process.stdout.write(
          `"${word}" is explicitly rejected by the ${bold(found.scope ?? "?")} dictionary` +
            `${found.origin ? dim(` (${found.origin})`) : ""}\n`,
        );
      } else {
        process.stdout.write(`"${word}" is not in any dictionary.\n`);
      }
      return ExitCode.Findings;
    }

    case "add":
    case "block": {
      if (!word) {
        process.stderr.write(`error: dictionary ${action} needs a word\n`);
        return ExitCode.InvalidArguments;
      }
      const scope = resolveScope(opts.scope);
      if (!scope || !WRITABLE.includes(scope)) {
        process.stderr.write(
          `error: --scope must be one of ${WRITABLE.join(", ")}; got "${opts.scope ?? ""}".\n` +
            `       Built-in dictionaries are never edited at runtime.\n`,
        );
        return ExitCode.InvalidArguments;
      }
      const path = dictionaryPathForScope(scope, cfg, locations);
      if (!path) {
        process.stderr.write(`error: no dictionary file for scope "${scope}"\n`);
        return ExitCode.ConfigError;
      }
      const normalized = word.trim().toLowerCase();
      // A '!' prefix is how a scope rejects a word a broader scope accepted.
      const entry = action === "block" ? `!${normalized}` : normalized;
      try {
        if (!existsSync(path)) {
          mkdirSync(dirname(path), { recursive: true });
          writeFileSync(path, HEADER);
        }
        const current = readFileSync(path, "utf8");
        const already = current
          .split(/\r?\n/)
          .map((l) => l.trim().toLowerCase())
          .includes(entry);
        if (already) {
          process.stdout.write(`"${entry}" is already in ${path}\n`);
          return ExitCode.Success;
        }
        const needsNewline = current.length > 0 && !current.endsWith("\n");
        appendFileSync(path, `${needsNewline ? "\n" : ""}${entry}\n`);
        process.stdout.write(`Added ${bold(entry)} to ${path}\n`);
        return ExitCode.Success;
      } catch (err) {
        process.stderr.write(
          `error: could not write "${path}": ${err instanceof Error ? err.message : String(err)}\n`,
        );
        return ExitCode.FileError;
      }
    }

    case "path": {
      const scope = resolveScope(opts.scope);
      if (!scope) {
        process.stderr.write(`error: unknown scope "${opts.scope ?? ""}"\n`);
        return ExitCode.InvalidArguments;
      }
      const path = dictionaryPathForScope(scope, cfg, locations);
      if (!path) {
        process.stderr.write(
          `error: the ${SCOPE_LABELS[scope]} has no file (built-ins are never edited).\n`,
        );
        return ExitCode.InvalidArguments;
      }
      process.stdout.write(`${path}\n`);
      return ExitCode.Success;
    }

    default:
      process.stderr.write(
        `error: unknown action "${action}". Use list, check, add, block or path.\n`,
      );
      return ExitCode.InvalidArguments;
  }
}
