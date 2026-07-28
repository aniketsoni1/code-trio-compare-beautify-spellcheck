/**
 * @ctr/agent - the single orchestration seam. It is the only layer that wires
 * the pure engines to I/O (files, git, dictionaries) and is shared by both the
 * CLI and the VS Code extension so no feature logic is duplicated.
 */
export { makeDocument, loadFileDocument, textDocument } from "./documents";
export {
  gitShow,
  gitAvailable,
  gitRoot,
  resolveRef,
  changedFiles,
  conflictStages,
  isSafeGitRef,
  UnsafeGitRefError,
} from "./git";
export {
  loadProjectDictionary,
  appendProjectDictionaryWord,
  type ProjectWords,
} from "./dictionary-io";
export {
  loadDictionaryStack,
  dictionaryWatchPaths,
  dictionaryWatchDirectories,
  dictionaryPathForScope,
  type DictionaryLocations,
  type LoadedDictionaries,
  type DictionarySource,
} from "./dictionary-scopes";
export {
  runCompare,
  runThreeWayMerge,
  runMergeAndResolve,
  writeMergedFile,
  runSpell,
  runSpellScoped,
  runSpellInWorkspace,
  buildSpellDictionary,
  runFormat,
  applyFormatToFile,
  defaultRegistry,
} from "./services";

// Re-export the tool descriptors so hosts can present the permission model.
export { TOOL_DESCRIPTORS, getToolDescriptor, isWriteTool } from "@ctr/core";
