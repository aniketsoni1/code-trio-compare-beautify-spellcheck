import { describe, expect, it } from "vitest";
import { panelHtml } from "../src/webview-html";

/**
 * Regression guards for the webview's security posture.
 *
 * The README claims a strict CSP and offline operation. These assertions are
 * what make that claim checkable rather than aspirational — a future edit that
 * adds a CDN link or an `innerHTML` assignment fails here.
 */
const NONCE = "TESTNONCE123456";
const CSP_SOURCE = "vscode-resource://test";
const html = panelHtml(NONCE, CSP_SOURCE);

function cspDirectives(): Map<string, string> {
  const match = /content="([^"]*)"/.exec(
    /<meta http-equiv="Content-Security-Policy"[^>]*>/.exec(html)?.[0] ?? "",
  );
  const map = new Map<string, string>();
  for (const part of (match?.[1] ?? "").split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const [name, ...values] = trimmed.split(/\s+/);
    map.set(name as string, values.join(" "));
  }
  return map;
}

describe("content security policy", () => {
  it("declares a CSP meta tag", () => {
    expect(html).toContain('http-equiv="Content-Security-Policy"');
  });

  it("denies everything by default", () => {
    expect(cspDirectives().get("default-src")).toBe("'none'");
  });

  it("allows scripts only via the nonce", () => {
    const scriptSrc = cspDirectives().get("script-src") ?? "";
    expect(scriptSrc).toBe(`'nonce-${NONCE}'`);
    // The two directives that would defeat the nonce entirely.
    expect(scriptSrc).not.toContain("unsafe-inline");
    expect(scriptSrc).not.toContain("unsafe-eval");
  });

  it("allows styles only via the nonce", () => {
    const styleSrc = cspDirectives().get("style-src") ?? "";
    expect(styleSrc).toBe(`'nonce-${NONCE}'`);
    expect(styleSrc).not.toContain("unsafe-inline");
  });

  it("restricts images and fonts to the extension's own resource origin", () => {
    const directives = cspDirectives();
    expect(directives.get("img-src")).toContain(CSP_SOURCE);
    expect(directives.get("font-src")).toContain(CSP_SOURCE);
  });

  it("puts the nonce on every script and style tag", () => {
    const scriptTags = html.match(/<script[^>]*>/g) ?? [];
    const styleTags = html.match(/<style[^>]*>/g) ?? [];
    expect(scriptTags.length).toBeGreaterThan(0);
    expect(styleTags.length).toBeGreaterThan(0);
    for (const tag of [...scriptTags, ...styleTags]) {
      expect(tag, tag).toContain(`nonce="${NONCE}"`);
    }
  });

  it("uses whatever nonce it is given", () => {
    const other = panelHtml("DIFFERENT", CSP_SOURCE);
    expect(other).toContain("nonce-DIFFERENT");
    expect(other).not.toContain(NONCE);
  });
});

describe("offline guarantee", () => {
  it("references no remote origin", () => {
    // Any of these would mean the panel silently requires a network.
    for (const pattern of [
      /https?:\/\//,
      /\/\/cdn\./,
      /fonts\.googleapis/,
      /unpkg\.com/,
      /jsdelivr/,
      /cdnjs/,
    ]) {
      expect(pattern.test(html), `matched ${String(pattern)}`).toBe(false);
    }
  });

  it("loads no external script or stylesheet", () => {
    expect(html).not.toMatch(/<script[^>]+src=/);
    expect(html).not.toMatch(/<link[^>]+rel=["']stylesheet/);
  });

  it("issues no network call from the script", () => {
    for (const api of ["fetch(", "XMLHttpRequest", "WebSocket", "EventSource", "navigator.sendBeacon"]) {
      expect(html.includes(api), api).toBe(false);
    }
  });
});

describe("injection safety", () => {
  it("never assigns innerHTML or outerHTML", () => {
    // Every piece of dynamic content is inserted with textContent, so a
    // diagnostic message containing markup is displayed rather than parsed.
    expect(html).not.toContain("innerHTML");
    expect(html).not.toContain("outerHTML");
    expect(html).not.toContain("insertAdjacentHTML");
    expect(html).not.toContain("document.write");
  });

  it("does not use eval or the Function constructor", () => {
    expect(html).not.toMatch(/\beval\s*\(/);
    expect(html).not.toMatch(/new\s+Function\s*\(/);
  });

  it("uses textContent for dynamic content", () => {
    expect(html).toContain("textContent");
  });
});

describe("accessibility", () => {
  it("marks the result list as a listbox with options", () => {
    expect(html).toContain('role="listbox"');
    expect(html).toContain('role="option"');
    expect(html).toContain("aria-activedescendant");
  });

  it("labels controls for screen readers", () => {
    expect(html).toContain("aria-label");
    expect(html).toContain('aria-live="polite"');
    expect(html).toMatch(/<label[^>]*for="filter"/);
    expect(html).toMatch(/<label[^>]*for="sort"/);
  });

  it("supports keyboard navigation", () => {
    for (const key of ["ArrowDown", "ArrowUp", "Home", "End", "Enter"]) {
      expect(html.includes(key), key).toBe(true);
    }
    expect(html).toContain("tabIndex");
  });

  it("conveys severity by glyph and label, not by colour alone", () => {
    expect(html).toContain("SEVERITY_GLYPH");
    expect(html).toContain('sev.setAttribute("aria-label", result.severity)');
  });

  it("provides a visible focus indicator", () => {
    expect(html).toContain(":focus-visible");
    expect(html).toContain("--vscode-focusBorder");
  });

  it("honours reduced-motion preferences", () => {
    expect(html).toContain("prefers-reduced-motion");
  });

  it("uses theme variables rather than hardcoded colours", () => {
    expect(html).toContain("--vscode-foreground");
    // A hex colour would not adapt to a high-contrast theme.
    const styleBlock = /<style[^>]*>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? "";
    expect(styleBlock).not.toMatch(/#[0-9a-fA-F]{6}\b/);
  });

  it("declares a document language", () => {
    expect(html).toContain('<html lang="en">');
  });
});

describe("state restoration", () => {
  it("persists and restores view preferences", () => {
    // getState/setState is what makes tab, filter and sort survive the panel
    // being hidden and re-shown.
    expect(html).toContain("vscode.getState()");
    expect(html).toContain("vscode.setState(");
  });

  it("announces readiness so the host can push initial state", () => {
    expect(html).toContain('postMessage({ type: "ready" })');
  });
});
