import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { type CodeTrioConfig, resolveConfig } from "@ctr/configuration";

const CONFIG_NAMES = ["codetrio.json", ".codetrio.json"];

export interface LoadedConfig {
  readonly config: CodeTrioConfig;
  readonly path: string | null;
  readonly root: string;
}

/** Walk up from `cwd` to find a Code Trio config file; default if none. */
export function loadCliConfig(cwd: string = process.cwd()): LoadedConfig {
  let dir = resolve(cwd);
  for (;;) {
    for (const name of CONFIG_NAMES) {
      const candidate = resolve(dir, name);
      if (existsSync(candidate)) {
        const raw = JSON.parse(readFileSync(candidate, "utf8")) as unknown;
        return { config: resolveConfig(raw), path: candidate, root: dir };
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return { config: resolveConfig({}), path: null, root: resolve(cwd) };
}
