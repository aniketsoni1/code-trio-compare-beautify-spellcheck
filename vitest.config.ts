import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));
const pkg = (name: string): string => resolve(root, `packages/${name}/src/index.ts`);

export default defineConfig({
  resolve: {
    alias: {
      "@ctr/core": pkg("core"),
      "@ctr/diff-engine": pkg("diff-engine"),
      "@ctr/spell-engine": pkg("spell-engine"),
      "@ctr/format-engine": pkg("format-engine"),
      "@ctr/reporting": pkg("reporting"),
      "@ctr/configuration": pkg("configuration"),
      "@ctr/agent": pkg("agent"),
      "@ctr/dictionaries": pkg("dictionaries"),
      "@ctr/formatters": pkg("formatters"),
      "@ctr/testing": pkg("testing"),
    },
  },
  test: {
    globals: false,
    environment: "node",
    include: ["packages/**/test/**/*.test.ts", "apps/**/test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["packages/*/src/**/*.ts", "apps/*/src/**/*.ts"],
      exclude: ["**/index.ts", "**/*.d.ts", "packages/testing/**"],
    },
  },
});
