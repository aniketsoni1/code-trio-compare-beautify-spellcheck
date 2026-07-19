// ESLint 9 flat config (see https://eslint.org/docs/latest/use/configure/configuration-files)
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/out/**",
      "**/node_modules/**",
      "artifacts/**",
      "assets/**",
      "samples/**",
      "packages/dictionaries/src/data/**",
      "**/*.d.ts",
      "**/*.cjs",
      "coverage/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "no-console": "off",
      eqeqeq: ["error", "always"],
    },
  },
  {
    // The VS Code extension imports the ambient "vscode" module.
    files: ["apps/vscode-extension/**/*.ts"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    files: ["scripts/**/*.mjs", "apps/*/scripts/**/*.mjs"],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
);
