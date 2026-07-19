import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import type { Document } from "@ctr/core";
import { languageFromPath } from "@ctr/core";

/** Build a normalized Document from raw parts. */
export function makeDocument(
  uri: string,
  languageId: string,
  text: string,
  version?: number,
): Document {
  return version === undefined ? { uri, languageId, text } : { uri, languageId, text, version };
}

/** Read a file from disk into a Document, inferring the language from its path. */
export function loadFileDocument(path: string, languageId?: string): Document {
  const text = readFileSync(path, "utf8");
  const lang = languageId ?? languageFromPath(path).id;
  return makeDocument(pathToFileURL(path).href, lang, text);
}

/** Wrap clipboard/inline text as a Document with a synthetic uri. */
export function textDocument(
  text: string,
  languageId: string,
  uri = "inline:text",
): Document {
  return makeDocument(uri, languageId, text);
}
