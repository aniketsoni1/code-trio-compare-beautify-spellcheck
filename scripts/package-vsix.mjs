// Packages the VS Code extension into artifacts/<name>-<version>.vsix.
// Uses @vscode/vsce with --no-dependencies (the extension is fully bundled).
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const extDir = resolve(root, "apps/vscode-extension");
const pkg = JSON.parse(readFileSync(resolve(extDir, "package.json"), "utf8"));
const outDir = resolve(root, "artifacts");
mkdirSync(outDir, { recursive: true });

const outFile = resolve(outDir, `${pkg.name}-${pkg.version}.vsix`);
const vsce = resolve(root, "node_modules/.bin/vsce");

console.log(`Packaging ${pkg.name}@${pkg.version} ...`);
execFileSync(vsce, ["package", "--no-dependencies", "--out", outFile], {
  cwd: extDir,
  stdio: "inherit",
});
console.log(`\nVSIX written -> ${outFile}`);
