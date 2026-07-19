/** @ctr/testing - shared fixtures and helpers for Code Trio tests. */
export {
  DIFF_FIXTURE,
  SPELL_FIXTURE,
  FORMAT_FIXTURE,
  MERGE_FIXTURE,
} from "./fixtures";

/** Absolute path to the committed sample demo workspace. */
export function sampleWorkspaceRelativePath(): string {
  return "samples/demo-workspace";
}
