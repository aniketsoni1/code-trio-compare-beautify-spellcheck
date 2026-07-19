// greeting.ts - used by the Code Trio demo and smoke test.
// NOTE: the word "recieve" below is a deliberate misspelling so the
// spell checker has something to flag (correct spelling: "receive").

export function receiveName(name: string): string {
  // recieve a name and greet the caller
  return `hello ${name}`;
}
