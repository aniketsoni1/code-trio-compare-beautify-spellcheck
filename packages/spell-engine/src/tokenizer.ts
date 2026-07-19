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

/** Markdown: prose tokens, skipping fenced and inline code. */
function tokenizeMarkdown(text: string, mapper: PositionMapper): Token[] {
  const tokens: Token[] = [];
  const lines = text.split(/(?<=\n)/);
  let offset = 0;
  let inFence = false;
  for (const line of lines) {
    const body = line.replace(/\r?\n$/, "");
    if (/^\s*```/.test(body)) {
      inFence = !inFence;
      offset += line.length;
      continue;
    }
    if (!inFence && body.trim().length > 0) {
      // split out inline `code` spans, keeping accurate offsets for prose
      const re = /`[^`]*`/g;
      let m: RegExpExecArray | null;
      let last = 0;
      const segments: Array<[number, string]> = [];
      while ((m = re.exec(body)) !== null) {
        if (m.index > last) segments.push([last, body.slice(last, m.index)]);
        last = m.index + m[0].length;
      }
      if (last < body.length) segments.push([last, body.slice(last)]);
      if (segments.length === 0) segments.push([0, body]);
      for (const [start, seg] of segments) {
        if (seg.trim().length > 0) tokens.push(mk("comment", seg, offset + start, mapper));
      }
    }
    offset += line.length;
  }
  return tokens;
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
      let j = i + 1;
      while (j < n) {
        const c = text[j];
        if (c === "\\") {
          j += 2;
          continue;
        }
        if (c === ch) {
          j++;
          break;
        }
        // unterminated single/double quoted strings stop at newline
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
