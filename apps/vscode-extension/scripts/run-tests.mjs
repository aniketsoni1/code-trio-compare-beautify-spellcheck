// Launches the VS Code integration tests in a downloaded, isolated VS Code.
// Requires network access to download VS Code the first time. This is the
// electron-hosted smoke test; the offline logic smoke test lives in
// test/smoke.test.ts and runs as part of `npm run verify`.
import { runTests } from "@vscode/test-electron";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const extensionDevelopmentPath = resolve(here, "..");
const repoRoot = resolve(here, "../../..");

async function main() {
  const extensionTestsPath = resolve(here, "../test/integration/index.cjs");
  const workspace = resolve(repoRoot, "samples/demo-workspace");
  await runTests({
    extensionDevelopmentPath,
    extensionTestsPath,
    launchArgs: [workspace, "--disable-extensions"],
  });
}

main().catch((err) => {
  console.error("Integration tests failed:", err);
  process.exit(1);
});
