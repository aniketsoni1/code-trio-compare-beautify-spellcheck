import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseWordList } from "@ctr/dictionaries";

export interface ProjectWords {
  readonly words: string[];
  readonly ignore: string[];
  readonly path: string;
  readonly exists: boolean;
}

/** Load a checked-in project dictionary (words + ignore entries). */
export function loadProjectDictionary(root: string, relPath: string): ProjectWords {
  const path = resolve(root, relPath);
  if (!existsSync(path)) return { words: [], ignore: [], path, exists: false };
  const parsed = parseWordList(readFileSync(path, "utf8"));
  return { words: parsed.words, ignore: parsed.ignore, path, exists: true };
}

/**
 * Append a word to the project dictionary, creating the file (and its folder)
 * if needed. This is a WRITE operation (see the `spell.addWord` tool
 * descriptor) and hosts should gate it behind Workspace Trust. Idempotent: a
 * word already present is not added again.
 */
export function appendProjectDictionaryWord(
  root: string,
  relPath: string,
  word: string,
): { added: boolean; path: string } {
  const normalized = word.trim().toLowerCase();
  const path = resolve(root, relPath);
  const current = loadProjectDictionary(root, relPath);
  if (current.words.includes(normalized)) return { added: false, path };

  if (!existsSync(path)) {
    mkdirSync(dirname(path), { recursive: true });
    const header =
      "# Code Trio project dictionary. One word per line; '#' starts a comment.\n" +
      "# Prefix a line with '!' to force-allow a word without suggesting it.\n";
    writeFileSync(path, header);
  }
  appendFileSync(path, `${normalized}\n`);
  return { added: true, path };
}
