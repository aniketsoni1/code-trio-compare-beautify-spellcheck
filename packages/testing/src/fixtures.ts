/** Shared fixtures used across engine and app tests. */

export const DIFF_FIXTURE = {
  a: ["function greet(name) {", '  return "hi " + name;', "}"].join("\n"),
  b: ["function greet(name) {", '  return "hello " + name;', "}"].join("\n"),
};

export const SPELL_FIXTURE = {
  /** A TypeScript file with one misspelling in a comment ("recieve"). */
  typescript: [
    "// recieve the payload and return it",
    "export function receivePayload(payload: string): string {",
    "  return payload;",
    "}",
    "",
  ].join("\n"),
  misspelledWord: "recieve",
};

export const FORMAT_FIXTURE = {
  /** Deliberately messy but valid TypeScript. */
  messy: "const   answer=42;let   items=[1,2,3]",
  formatted: "const answer = 42;\nlet items = [1, 2, 3];\n",
};

export const MERGE_FIXTURE = {
  base: ["alpha", "beta", "gamma"].join("\n"),
  ours: ["alpha", "BETA", "gamma"].join("\n"),
  theirs: ["alpha", "beta", "GAMMA"].join("\n"),
};
