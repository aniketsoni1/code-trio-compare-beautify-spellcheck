// Builds both distributable bundles: the CLI and the VS Code extension.
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const production = process.argv.includes("--production") ? ["--production"] : [];

function run(script) {
  execFileSync(process.execPath, [resolve(root, script), ...production], { stdio: "inherit" });
}

run("scripts/build-cli.mjs");
run("apps/vscode-extension/scripts/build.mjs");
console.log("all bundles built");
