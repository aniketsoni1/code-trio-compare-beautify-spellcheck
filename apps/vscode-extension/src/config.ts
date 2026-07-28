import * as vscode from "vscode";
import { type CodeTrioConfig, DEFAULT_CONFIG, resolveConfig } from "@ctr/configuration";

/**
 * Read the effective Code Trio configuration for a resource from VS Code
 * settings, validating and defaulting through @ctr/configuration so the
 * extension and CLI share one config model.
 *
 * Every key is read from the settings store. An earlier revision hardcoded nine
 * of them to their compiled-in defaults, so a user editing e.g.
 * `codeTrio.format.printWidth` in settings.json saw no effect whatsoever. The
 * corresponding settings are now contributed in package.json as well, because a
 * setting that is read but not contributed is invisible in the settings UI.
 *
 * Passing `resource` makes VS Code apply the folder-scoped settings of the
 * workspace folder that owns the resource, which is what gives multi-root
 * workspaces per-folder behaviour.
 */
export function getConfig(resource?: vscode.Uri): CodeTrioConfig {
  const c = vscode.workspace.getConfiguration("codeTrio", resource ?? null);
  const d = DEFAULT_CONFIG;
  return resolveConfig({
    diff: {
      granularity: c.get("diff.granularity", d.diff.granularity),
      ignoreWhitespace: c.get("diff.ignoreWhitespace", d.diff.ignoreWhitespace),
      ignoreCase: c.get("diff.ignoreCase", d.diff.ignoreCase),
      contextLines: c.get("diff.contextLines", d.diff.contextLines),
    },
    spell: {
      enabled: c.get("spell.enabled", d.spell.enabled),
      checkComments: c.get("spell.checkComments", d.spell.checkComments),
      checkStrings: c.get("spell.checkStrings", d.spell.checkStrings),
      checkIdentifiers: c.get("spell.checkIdentifiers", d.spell.checkIdentifiers),
      severity: c.get("spell.severity", d.spell.severity),
      dictionaries: c.get("spell.dictionaries", d.spell.dictionaries),
      projectDictionaryPath: c.get("spell.projectDictionaryPath", d.spell.projectDictionaryPath),
      ignoreGlobs: c.get("spell.ignoreGlobs", d.spell.ignoreGlobs),
      ignoreWords: c.get("spell.ignoreWords", d.spell.ignoreWords),
      minWordLength: c.get("spell.minWordLength", d.spell.minWordLength),
      maxSuggestions: c.get("spell.maxSuggestions", d.spell.maxSuggestions),
    },
    format: {
      formatOnSave: c.get("format.formatOnSave", d.format.formatOnSave),
      previewBeforeApply: c.get("format.previewBeforeApply", d.format.previewBeforeApply),
      pinnedVersions: c.get("format.pinnedVersions", d.format.pinnedVersions),
      tabWidth: c.get("format.tabWidth", d.format.tabWidth),
      useTabs: c.get("format.useTabs", d.format.useTabs),
      printWidth: c.get("format.printWidth", d.format.printWidth),
    },
  });
}
