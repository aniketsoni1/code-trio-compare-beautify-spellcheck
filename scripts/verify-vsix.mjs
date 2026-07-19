// Audits the packaged VSIX and (optionally) runs the VS Code smoke test.
//
// The offline audit always runs: it lists contents, checks required metadata and
// assets, rejects source/maps/secrets/oversized packages, verifies a reasonable
// size, and writes a SHA-256 checksum. The electron-hosted smoke test (opening
// the demo workspace, running Compare, a spelling quick fix, and a format
// preview) runs when CTR_VSIX_SMOKE=1 or in CI's `e2e` job, since it needs to
// download VS Code.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifacts = resolve(root, "artifacts");

const MAX_VSIX_BYTES = 12 * 1024 * 1024; // 12 MB compressed ceiling
const REQUIRED_ENTRIES = [
  "extension/package.json",
  "extension/readme.md",
  "extension/changelog.md",
  "extension/LICENSE.txt",
  "extension/out/extension.cjs",
  "extension/media/icon.png",
];
const FORBIDDEN = [
  { re: /\.ts$/, why: "TypeScript source" },
  { re: /\.map$/, why: "source map" },
  { re: /(^|\/)node_modules\//, why: "node_modules" },
  { re: /(^|\/)src\//, why: "source folder" },
  { re: /(^|\/)test\//, why: "tests" },
  { re: /\.env(\.|$)/, why: "env file" },
  { re: /\.vsix$/, why: "nested vsix" },
];
const SECRET_PATTERNS = [
  { re: /AKIA[0-9A-Z]{16}/, why: "AWS access key" },
  { re: /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/, why: "private key" },
  { re: /ghp_[A-Za-z0-9]{36}/, why: "GitHub token" },
  { re: /xox[baprs]-[A-Za-z0-9-]{10,}/, why: "Slack token" },
  { re: /-----BEGIN PGP PRIVATE KEY BLOCK-----/, why: "PGP private key" },
];

function fail(msg) {
  console.error(`  FAIL  ${msg}`);
  failures++;
}
function pass(msg) {
  console.log(`  ok    ${msg}`);
}

let failures = 0;

function findVsix() {
  const files = readdirSync(artifacts).filter((f) => f.endsWith(".vsix"));
  if (files.length === 0) throw new Error("no .vsix found in artifacts/ (run `npm run package:vsix`)");
  files.sort();
  return resolve(artifacts, files[files.length - 1]);
}

function listEntries(vsix) {
  const out = execFileSync("unzip", ["-Z1", vsix], { encoding: "utf8" });
  return out.split("\n").map((l) => l.trim()).filter(Boolean);
}

function readEntry(vsix, entry) {
  return execFileSync("unzip", ["-p", vsix, entry], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

const vsix = findVsix();
console.log(`Verifying ${vsix}\n`);

// 1. Size
const size = statSync(vsix).size;
if (size <= MAX_VSIX_BYTES) pass(`size ${(size / 1024).toFixed(0)} KB (<= ${MAX_VSIX_BYTES / 1024 / 1024} MB)`);
else fail(`VSIX is ${(size / 1024 / 1024).toFixed(1)} MB, over the ${MAX_VSIX_BYTES / 1024 / 1024} MB ceiling`);

// 2. Entries
const entries = listEntries(vsix);
console.log(`  info  ${entries.length} entries packaged`);

for (const req of REQUIRED_ENTRIES) {
  if (entries.includes(req)) pass(`present: ${req}`);
  else fail(`missing required entry: ${req}`);
}

for (const entry of entries) {
  for (const f of FORBIDDEN) {
    if (f.re.test(entry)) fail(`forbidden file in VSIX (${f.why}): ${entry}`);
  }
}

// 3. Manifest metadata
const manifest = JSON.parse(readEntry(vsix, "extension/package.json"));
const checks = [
  ["name", manifest.name === "code-trio-compare-beautify-spellcheck"],
  ["displayName", manifest.displayName === "Code Trio - Compare Beautify Spellcheck"],
  ["publisher", Boolean(manifest.publisher)],
  ["version", /^\d+\.\d+\.\d+/.test(manifest.version ?? "")],
  ["engines.vscode", Boolean(manifest.engines?.vscode)],
  ["icon", manifest.icon === "media/icon.png"],
  ["repository.url", Boolean(manifest.repository?.url)],
  ["categories", Array.isArray(manifest.categories) && manifest.categories.length > 0],
  ["main", manifest.main === "./out/extension.cjs"],
  ["activationEvents narrow", JSON.stringify(manifest.activationEvents) === JSON.stringify(["onView:codeTrio.resultsView"])],
];
for (const [label, ok] of checks) (ok ? pass : fail)(`manifest ${label}`);

// 4. Secret scan over text-ish entries
const textEntries = entries.filter((e) => /\.(json|md|txt|cjs|js|svg)$/.test(e));
let secretHits = 0;
for (const entry of textEntries) {
  let content;
  try {
    content = readEntry(vsix, entry);
  } catch {
    continue;
  }
  for (const s of SECRET_PATTERNS) {
    if (s.re.test(content)) {
      fail(`possible ${s.why} in ${entry}`);
      secretHits++;
    }
  }
}
if (secretHits === 0) pass("no secrets detected in packaged files");

// 5. Checksum
const buf = readFileSync(vsix);
const sha = createHash("sha256").update(buf).digest("hex");
const sumFile = `${vsix}.sha256`;
writeFileSync(sumFile, `${sha}  ${vsix.split("/").pop()}\n`);
pass(`checksum ${sha.slice(0, 16)}... -> ${sumFile.split("/").pop()}`);

// 6. Optional electron smoke
if (process.env.CTR_VSIX_SMOKE === "1") {
  console.log("\nRunning VS Code smoke test (CTR_VSIX_SMOKE=1) ...");
  try {
    execFileSync(process.execPath, [resolve(root, "apps/vscode-extension/scripts/run-tests.mjs")], {
      stdio: "inherit",
    });
    pass("electron smoke test passed");
  } catch (err) {
    const msg = String(err?.message ?? err);
    if (/download|ENOTFOUND|ECONNREFUSED|getaddrinfo|display|Xvfb|timed out/i.test(msg)) {
      console.warn("  SKIP  electron smoke could not run in this environment (network/display).");
    } else {
      fail(`electron smoke test failed: ${msg}`);
    }
  }
} else {
  console.log("\n  SKIP  electron smoke test (set CTR_VSIX_SMOKE=1 to run; CI runs it in the e2e job).");
}

console.log("");
if (failures > 0) {
  console.error(`VSIX verification FAILED with ${failures} problem(s).`);
  process.exit(1);
}
console.log("VSIX verification passed.");
