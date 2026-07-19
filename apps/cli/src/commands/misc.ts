import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DEFAULT_CONFIG, type CodeTrioConfig } from "@ctr/configuration";
import { BUILTIN_WORD_COUNTS } from "@ctr/dictionaries";
import { gitAvailable } from "@ctr/agent";
import { PrettierAdapter } from "@ctr/formatters";
import pc from "picocolors";

/** Scaffold a config file and an empty project dictionary. */
export function runInitCommand(cwd: string = process.cwd()): number {
  const configPath = resolve(cwd, "codetrio.json");
  const dictPath = resolve(cwd, DEFAULT_CONFIG.spell.projectDictionaryPath);
  let created = 0;

  if (!existsSync(configPath)) {
    writeFileSync(configPath, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`);
    process.stdout.write(`${pc.green("created")} ${configPath}\n`);
    created++;
  } else {
    process.stdout.write(`${pc.dim("exists")}  ${configPath}\n`);
  }

  if (!existsSync(dictPath)) {
    mkdirSync(dirname(dictPath), { recursive: true });
    writeFileSync(
      dictPath,
      "# Code Trio project dictionary. One word per line; '#' starts a comment.\n",
    );
    process.stdout.write(`${pc.green("created")} ${dictPath}\n`);
    created++;
  } else {
    process.stdout.write(`${pc.dim("exists")}  ${dictPath}\n`);
  }

  process.stdout.write(created > 0 ? "Initialized Code Trio.\n" : "Already initialized.\n");
  return 0;
}

/** Print an environment/health report. */
export async function runDoctorCommand(cwd: string = process.cwd()): Promise<number> {
  const nodeOk = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10) >= 20;
  const prettierOk = await new PrettierAdapter().isAvailable();
  const git = gitAvailable(cwd);

  const line = (ok: boolean, label: string, detail: string): string =>
    `${ok ? pc.green("ok  ") : pc.yellow("warn")}  ${label.padEnd(22)} ${pc.dim(detail)}`;

  process.stdout.write(`${pc.bold("Code Trio doctor")}\n`);
  process.stdout.write(`${line(nodeOk, "Node.js >= 20", process.version)}\n`);
  process.stdout.write(`${line(prettierOk, "Prettier adapter", prettierOk ? "available" : "not found (whitespace fallback only)")}\n`);
  process.stdout.write(`${line(git, "git", git ? "in a work tree" : "not a git work tree (ref compare disabled)")}\n`);
  process.stdout.write(
    `${line(true, "dictionaries", `base=${BUILTIN_WORD_COUNTS.base}, technical=${BUILTIN_WORD_COUNTS.technical}`)}\n`,
  );
  return nodeOk ? 0 : 1;
}

/** Print the resolved effective configuration. */
export function runConfigureCommand(
  config: CodeTrioConfig,
  configPath: string | null,
): number {
  process.stdout.write(`${pc.dim(`# config source: ${configPath ?? "defaults"}`)}\n`);
  process.stdout.write(`${JSON.stringify(config, null, 2)}\n`);
  return 0;
}
