// Removes build output and packaging artifacts.
import { rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const targets = [
  "apps/cli/dist",
  "apps/vscode-extension/out",
  "apps/vscode-extension/.vscode-test",
  "coverage",
];

for (const t of targets) {
  rmSync(resolve(root, t), { recursive: true, force: true });
  console.log(`removed ${t}`);
}
// Keep the artifacts/ directory but clear generated files.
for (const f of ["artifacts"]) {
  rmSync(resolve(root, f), { recursive: true, force: true });
  console.log(`removed ${f}`);
}
console.log("clean complete");
