// Bundles the VS Code extension into a single CommonJS file with esbuild.
// Everything (engines, Prettier standalone, dictionaries) is bundled so the
// VSIX needs no node_modules. `vscode` is the only external.
import { build, context } from "esbuild";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const extRoot = resolve(here, "..");
const repoRoot = resolve(extRoot, "../..");
const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: [resolve(extRoot, "src/extension.ts")],
  outfile: resolve(extRoot, "out/extension.cjs"),
  bundle: true,
  platform: "node",
  target: "node18",
  format: "cjs",
  external: ["vscode"],
  sourcemap: !production,
  minify: production,
  tsconfig: resolve(repoRoot, "tsconfig.base.json"),
  logLevel: "info",
  legalComments: "none",
};

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log("watching extension...");
} else {
  await build(options);
  console.log(`extension bundled -> ${options.outfile}`);
}
