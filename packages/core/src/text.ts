import type { Position, Range } from "./model";

/**
 * Splits text into lines, preserving information needed to map offsets back to
 * (line, character) positions. Recognizes `\n` and `\r\n`. The returned array
 * never loses a trailing empty line: "a\n" -> ["a", ""].
 */
export function splitLines(text: string): string[] {
  return text.split(/\r\n|\r|\n/);
}

/** Returns the newline sequence used by the text, defaulting to "\n". */
export function detectEol(text: string): "\n" | "\r\n" {
  const i = text.indexOf("\n");
  if (i > 0 && text[i - 1] === "\r") return "\r\n";
  return "\n";
}

/** True when the text ends with a newline. */
export function hasFinalNewline(text: string): boolean {
  return /\r\n$|\n$|\r$/.test(text);
}

/**
 * Builds a fast offset->Position mapper for a document. Pre-computes the start
 * offset of every line so lookups are a binary search.
 */
export class PositionMapper {
  private readonly lineStarts: number[];

  constructor(private readonly text: string) {
    const starts = [0];
    for (let i = 0; i < text.length; i++) {
      const ch = text.charCodeAt(i);
      if (ch === 10 /* \n */) {
        starts.push(i + 1);
      } else if (ch === 13 /* \r */) {
        if (text.charCodeAt(i + 1) === 10) i++;
        starts.push(i + 1);
      }
    }
    this.lineStarts = starts;
  }

  get lineCount(): number {
    return this.lineStarts.length;
  }

  positionAt(offset: number): Position {
    const clamped = Math.max(0, Math.min(offset, this.text.length));
    let lo = 0;
    let hi = this.lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      const start = this.lineStarts[mid] ?? 0;
      if (start <= clamped) lo = mid;
      else hi = mid - 1;
    }
    const lineStart = this.lineStarts[lo] ?? 0;
    return { line: lo, character: clamped - lineStart };
  }

  offsetAt(position: Position): number {
    const line = Math.max(0, Math.min(position.line, this.lineStarts.length - 1));
    const lineStart = this.lineStarts[line] ?? 0;
    return lineStart + Math.max(0, position.character);
  }

  rangeOf(startOffset: number, endOffset: number): Range {
    return { start: this.positionAt(startOffset), end: this.positionAt(endOffset) };
  }
}

/** Convenience: build a single-line range at (line, char) spanning `length`. */
export function spanRange(line: number, character: number, length: number): Range {
  return {
    start: { line, character },
    end: { line, character: character + length },
  };
}
