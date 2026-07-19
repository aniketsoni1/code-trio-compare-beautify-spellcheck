// Bundles the Code Trio CLI into a single self-contained CommonJS file.
import { build } from "esbuild";
import { chmodSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outfile = resolve(root, "apps/cli/dist/cli/index.cjs");
const production = process.argv.includes("--production");

await build({
  entryPoints: [resolve(root, "apps/cli/src/main.ts")],
  outfile,
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  banner: { js: "#!/usr/bin/env node" },
  sourcemap: !production,
  minify: production,
  tsconfig: resolve(root, "tsconfig.base.json"),
  logLevel: "info",
  legalComments: "none",
});

chmodSync(outfile, 0o755);
console.log(`CLI bundled -> ${outfile}`);
