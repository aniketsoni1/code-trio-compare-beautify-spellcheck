import * as vscode from "vscode";
import { type CodeTrioConfig, DEFAULT_CONFIG, resolveConfig } from "@ctr/configuration";

/**
 * Read the effective Code Trio configuration for a resource from VS Code
 * settings, validating and defaulting through @ctr/configuration so the
 * extension and CLI share one config model.
 */
export function getConfig(resource?: vscode.Uri): CodeTrioConfig {
  const c = vscode.workspace.getConfiguration("codeTrio", resource ?? null);
  const d = DEFAULT_CONFIG;
  return resolveConfig({
    diff: {
      granularity: c.get("diff.granularity", d.diff.granularity),
      ignoreWhitespace: c.get("diff.ignoreWhitespace", d.diff.ignoreWhitespace),
      ignoreCase: c.get("diff.ignoreCase", d.diff.ignoreCase),
      contextLines: d.diff.contextLines,
    },
    spell: {
      enabled: c.get("spell.enabled", d.spell.enabled),
      checkComments: d.spell.checkComments,
      checkStrings: d.spell.checkStrings,
      checkIdentifiers: c.get("spell.checkIdentifiers", d.spell.checkIdentifiers),
      severity: c.get("spell.severity", d.spell.severity),
      dictionaries: c.get("spell.dictionaries", d.spell.dictionaries),
      projectDictionaryPath: c.get("spell.projectDictionaryPath", d.spell.projectDictionaryPath),
      ignoreGlobs: c.get("spell.ignoreGlobs", d.spell.ignoreGlobs),
      ignoreWords: d.spell.ignoreWords,
      minWordLength: d.spell.minWordLength,
      maxSuggestions: d.spell.maxSuggestions,
    },
    format: {
      formatOnSave: c.get("format.formatOnSave", d.format.formatOnSave),
      previewBeforeApply: c.get("format.previewBeforeApply", d.format.previewBeforeApply),
      pinnedVersions: c.get("format.pinnedVersions", d.format.pinnedVersions),
      tabWidth: d.format.tabWidth,
      useTabs: d.format.useTabs,
      printWidth: d.format.printWidth,
    },
  });
}
