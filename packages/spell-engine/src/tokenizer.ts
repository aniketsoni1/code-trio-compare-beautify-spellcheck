import type { Token, TokenKind } from "@ctr/core";
import { PositionMapper, resolveLanguage } from "@ctr/core";

/**
 * A pragmatic, language-aware scanner. It is deliberately not a full parser:
 * it recognizes line/block comments, string literals, identifiers, and
 * keywords well enough to scope spell checking to prose (comments/strings) by
 * default. Markdown and plaintext are treated as prose.
 */
export function tokenize(text: string, languageId: string): Token[] {
  const lang = resolveLanguage(languageId);
  const mapper = new PositionMapper(text);
  if (lang.id === "markdown") return tokenizeMarkdown(text, mapper);
  if (lang.id === "yaml" || lang.id === "json") {
    return tokenizeCode(text, lang, mapper);
  }
  if (lang.id === "plaintext" || lang.stringDelimiters.length === 0) {
    if (lang.lineComments.length === 0 && lang.blockComments.length === 0) {
      return proseTokens(text, mapper);
    }
  }
  return tokenizeCode(text, lang, mapper);
}

function mk(kind: TokenKind, text: string, offset: number, mapper: PositionMapper): Token {
  return { kind, text, offset, range: mapper.rangeOf(offset, offset + text.length) };
}

/** One prose token per non-empty line (used for plaintext). */
function proseTokens(text: string, mapper: PositionMapper): Token[] {
  const tokens: Token[] = [];
  let offset = 0;
  for (const line of text.split(/(?<=\n)/)) {
    const trimmedLen = line.replace(/\r?\n$/, "").length;
    if (trimmedLen > 0) tokens.push(mk("comment", line.slice(0, trimmedLen), offset, mapper));
    offset += line.length;
  }
  return tokens;
}

/**
 * Markdown: prose only.
 *
 * Skipped, because none of it is natural language a spell checker should judge:
 * fenced code blocks, indented code blocks, inline code spans, YAML/TOML front
 * matter, link and image destinations, HTML tags, and reference definitions.
 *
 * Front matter is the notable addition. A Jekyll or Astro page begins with a
 * YAML block of keys such as `permalink` and `og:image`, every one of which was
 * previously reported as a misspelling on every single content file.
 */
function tokenizeMarkdown(text: string, mapper: PositionMapper): Token[] {
  const tokens: Token[] = [];
  const lines = text.split(/(?<=\n)/);
  let offset = 0;
  let inFence = false;
  let fenceMarker = "";
  let inFrontMatter = false;
  let lineNumber = 0;

  for (const line of lines) {
    const body = line.replace(/\r?\n$/, "");
    const trimmed = body.trim();

    // Front matter: only when it opens on the very first line.
    if (lineNumber === 0 && /^(---|\+\+\+)\s*$/.test(trimmed)) {
      inFrontMatter = true;
      fenceMarker = trimmed;
      offset += line.length;
      lineNumber++;
      continue;
    }
    if (inFrontMatter) {
      if (trimmed === fenceMarker) inFrontMatter = false;
      offset += line.length;
      lineNumber++;
      continue;
    }

    // Fenced code, honouring the opening marker so a ``` inside a ~~~ block
    // does not close it.
    const fence = /^\s*(```+|~~~+)/.exec(body);
    if (fence) {
      const marker = fence[1] as string;
      if (!inFence) {
        inFence = true;
        fenceMarker = marker[0] as string;
      } else if (marker.startsWith(fenceMarker)) {
        inFence = false;
      }
      offset += line.length;
      lineNumber++;
      continue;
    }
    if (inFence) {
      offset += line.length;
      lineNumber++;
      continue;
    }

    // Indented code blocks (four spaces or a tab) and reference definitions.
    if (/^(?: {4}|\t)/.test(body) || /^\s*\[[^\]]+\]:\s*\S+/.test(body)) {
      offset += line.length;
      lineNumber++;
      continue;
    }

    if (trimmed.length > 0) {
      for (const [start, seg] of prosePieces(body)) {
        if (seg.trim().length > 0) tokens.push(mk("comment", seg, offset + start, mapper));
      }
    }
    offset += line.length;
    lineNumber++;
  }
  return tokens;
}

/**
 * Break a Markdown line into the pieces that are actually prose, preserving
 * each piece's offset within the line.
 *
 * Removes inline code spans, HTML tags, and link/image destinations while
 * keeping the visible link text, which is prose and should be checked.
 */
function prosePieces(body: string): Array<[number, string]> {
  const skip: Array<[number, number]> = [];
  const record = (re: RegExp): void => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body)) !== null) {
      skip.push([m.index, m.index + m[0].length]);
      if (m[0].length === 0) re.lastIndex++;
    }
  };
  record(/`+[^`]*`+/g); // inline code
  record(/<\/?[a-z][^>]*>/gi); // html tags
  record(/\]\([^)]*\)/g); // link destination, keeps the [text]
  record(/^\s*#{1,6}\s+/g); // heading markers
  record(/^\s*[*+-]\s+/g); // list markers
  record(/^\s*>\s?/g); // block quote markers

  skip.sort((a, b) => a[0] - b[0]);
  const pieces: Array<[number, string]> = [];
  let cursor = 0;
  for (const [start, end] of skip) {
    if (start > cursor) pieces.push([cursor, body.slice(cursor, start)]);
    cursor = Math.max(cursor, end);
  }
  if (cursor < body.length) pieces.push([cursor, body.slice(cursor)]);
  return pieces.length > 0 ? pieces : [[0, body]];
}

function startsWithAt(text: string, i: number, needle: string): boolean {
  return text.startsWith(needle, i);
}

function tokenizeCode(
  text: string,
  lang: ReturnType<typeof resolveLanguage>,
  mapper: PositionMapper,
): Token[] {
  const tokens: Token[] = [];
  const keywords = new Set(lang.keywords);
  const n = text.length;
  let i = 0;
  let otherStart = -1;

  const flushOther = (end: number): void => {
    if (otherStart >= 0 && end > otherStart) {
      tokens.push(mk("other", text.slice(otherStart, end), otherStart, mapper));
    }
    otherStart = -1;
  };

  while (i < n) {
    // line comment
    const lc = lang.lineComments.find((c) => startsWithAt(text, i, c));
    if (lc) {
      flushOther(i);
      let end = text.indexOf("\n", i);
      if (end < 0) end = n;
      tokens.push(mk("comment", text.slice(i, end), i, mapper));
      i = end;
      continue;
    }
    // block comment
    const bc = lang.blockComments.find((c) => startsWithAt(text, i, c[0]));
    if (bc) {
      flushOther(i);
      const closeIdx = text.indexOf(bc[1], i + bc[0].length);
      const end = closeIdx < 0 ? n : closeIdx + bc[1].length;
      tokens.push(mk("comment", text.slice(i, end), i, mapper));
      i = end;
      continue;
    }
    // string literal
    const ch = text[i] as string;
    if (lang.stringDelimiters.includes(ch)) {
      flushOther(i);
      const isTemplate = ch === "`";
      let j = i + 1;
      let depth = 0;
      while (j < n) {
        const c = text[j];
        if (c === "\\") {
          j += 2;
          continue;
        }
        // Interpolations inside a template literal are code, not prose. They
        // are skipped so `${user.emailAddress}` does not contribute its
        // property names as candidate words.
        if (isTemplate && c === "$" && text[j + 1] === "{") {
          depth = 1;
          j += 2;
          while (j < n && depth > 0) {
            if (text[j] === "{") depth++;
            else if (text[j] === "}") depth--;
            j++;
          }
          continue;
        }
        if (c === ch) {
          j++;
          break;
        }
        // Unterminated single/double quoted strings stop at a newline, so an
        // apostrophe in a comment cannot swallow the rest of the file.
        if ((ch === '"' || ch === "'") && c === "\n") break;
        j++;
      }
      tokens.push(mk("string", text.slice(i, j), i, mapper));
      i = j;
      continue;
    }
    // identifier / keyword
    if (/[A-Za-z_$]/.test(ch)) {
      flushOther(i);
      let j = i + 1;
      while (j < n && /[A-Za-z0-9_$]/.test(text[j] as string)) j++;
      const word = text.slice(i, j);
      tokens.push(mk(keywords.has(word) ? "keyword" : "identifier", word, i, mapper));
      i = j;
      continue;
    }
    // accumulate other
    if (otherStart < 0) otherStart = i;
    i++;
  }
  flushOther(n);
  return tokens;
}
