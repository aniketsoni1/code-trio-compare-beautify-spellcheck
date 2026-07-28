/**
 * The results webview's HTML, CSS and script, as one self-contained string.
 *
 * Security properties, all of which the release checklist verifies:
 *
 *   - A strict Content Security Policy with `default-src 'none'`. Nothing loads
 *     unless explicitly allowed.
 *   - Script and style are allowed only via a per-load nonce, so an injected
 *     `<script>` tag cannot execute even if one were somehow introduced.
 *   - No remote origins at all: no CDN, no web font, no external image. The
 *     panel works with the machine offline, which is the whole product claim.
 *   - Every piece of dynamic content is inserted with `textContent`, never
 *     `innerHTML`, so a diagnostic message containing markup is displayed as
 *     text rather than parsed as HTML.
 *
 * Accessibility properties:
 *
 *   - The result list is a real `listbox` with `option` children, roving
 *     tabindex, and full arrow/Home/End/Enter keyboard support.
 *   - Severity is conveyed by an icon glyph and an `aria-label`, not by colour
 *     alone.
 *   - `aria-live` announces count changes to a screen reader.
 *   - All colours come from VS Code theme variables, so high-contrast themes
 *     work without special-casing.
 *   - `prefers-reduced-motion` disables the only transition.
 */

/** Build the panel HTML for one load, with the supplied nonce. */
export function panelHtml(nonce: string, cspSource: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; img-src ${cspSource} data:; font-src ${cspSource};" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Code Trio Results</title>
<style nonce="${nonce}">
  :root {
    --row-gap: 2px;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 0;
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background: var(--vscode-sideBar-background, transparent);
  }
  .toolbar {
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 6px;
    background: var(--vscode-sideBar-background, var(--vscode-editor-background));
    border-bottom: 1px solid var(--vscode-panel-border, transparent);
  }
  .tabs { display: flex; gap: 2px; width: 100%; }
  button {
    font-family: inherit;
    font-size: inherit;
    color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
    background: var(--vscode-button-secondaryBackground, transparent);
    border: 1px solid transparent;
    border-radius: 3px;
    padding: 3px 8px;
    cursor: pointer;
  }
  button:hover { background: var(--vscode-toolbar-hoverBackground, transparent); }
  button:focus-visible,
  input:focus-visible,
  select:focus-visible,
  [role="option"]:focus-visible {
    outline: 1px solid var(--vscode-focusBorder);
    outline-offset: -1px;
  }
  button[aria-pressed="true"], button[aria-selected="true"] {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
  }
  .count {
    margin-left: 4px;
    opacity: 0.85;
    font-variant-numeric: tabular-nums;
  }
  input[type="search"], select {
    font-family: inherit;
    font-size: inherit;
    color: var(--vscode-input-foreground);
    background: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 3px;
    padding: 3px 6px;
  }
  input[type="search"] { flex: 1 1 120px; min-width: 80px; }
  .summary {
    padding: 6px 8px;
    border-bottom: 1px solid var(--vscode-panel-border, transparent);
  }
  .summary dl { display: grid; grid-template-columns: auto 1fr; gap: 2px 8px; margin: 0; }
  .summary dt { opacity: 0.8; }
  .summary dd { margin: 0; }
  .banner {
    padding: 6px 8px;
    background: var(--vscode-inputValidation-warningBackground, transparent);
    border: 1px solid var(--vscode-inputValidation-warningBorder, transparent);
    color: var(--vscode-inputValidation-warningForeground, var(--vscode-foreground));
  }
  [role="listbox"] { list-style: none; margin: 0; padding: 4px; }
  [role="option"] {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 6px;
    padding: 4px 6px;
    border-radius: 3px;
    cursor: pointer;
    transition: background 80ms linear;
  }
  [role="option"]:hover { background: var(--vscode-list-hoverBackground); }
  [role="option"][aria-selected="true"] {
    background: var(--vscode-list-activeSelectionBackground);
    color: var(--vscode-list-activeSelectionForeground);
  }
  .sev { font-weight: 600; }
  .sev-error { color: var(--vscode-editorError-foreground, var(--vscode-errorForeground)); }
  .sev-warning { color: var(--vscode-editorWarning-foreground); }
  .sev-information { color: var(--vscode-editorInfo-foreground); }
  .sev-hint { opacity: 0.75; }
  .msg { overflow-wrap: anywhere; }
  .loc { display: block; opacity: 0.75; font-size: 0.92em; }
  .empty { padding: 16px 8px; text-align: center; opacity: 0.85; }
  .empty p { margin: 0 0 8px; }
  .visually-hidden {
    position: absolute; width: 1px; height: 1px;
    margin: -1px; padding: 0; overflow: hidden;
    clip: rect(0 0 0 0); white-space: nowrap; border: 0;
  }
  @media (prefers-reduced-motion: reduce) {
    [role="option"] { transition: none; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <div class="tabs" role="tablist" aria-label="Result categories" id="tabs"></div>
    <label class="visually-hidden" for="filter">Filter results</label>
    <input type="search" id="filter" placeholder="Filter…" aria-controls="results" />
    <label class="visually-hidden" for="sort">Sort results by</label>
    <select id="sort" aria-label="Sort results by">
      <option value="severity">Severity</option>
      <option value="file">File</option>
      <option value="line">Line</option>
      <option value="category">Category</option>
      <option value="kind">Tool</option>
    </select>
    <button id="rerun" type="button" title="Re-run the last operation">Re-run</button>
    <button id="copy" type="button" title="Copy the complete report">Copy</button>
    <button id="export" type="button" title="Export the report to a file">Export</button>
    <button id="clear" type="button" title="Clear results">Clear</button>
  </div>

  <div class="summary" id="summary" aria-live="polite"></div>
  <div id="banner" hidden class="banner"></div>
  <ul id="results" role="listbox" aria-label="Results" tabindex="0"></ul>
  <div id="empty" class="empty"></div>

<script nonce="${nonce}">
(function () {
  "use strict";
  const vscode = acquireVsCodeApi();

  const SEVERITY_ORDER = { error: 0, warning: 1, information: 2, hint: 3 };
  const SEVERITY_GLYPH = { error: "\\u2716", warning: "\\u26A0", information: "\\u2139", hint: "\\u25CB" };
  const KIND_LABEL = { compare: "Compare", spell: "Spell", beautify: "Beautify", merge: "Merge" };

  // Restored by VS Code when the panel is re-shown after being hidden, which is
  // what makes tab/filter/sort survive without the host storing UI state.
  const persisted = vscode.getState() || { tab: "all", sort: "severity", filter: "" };

  let state = { version: 1, tools: {}, results: [], truncated: false };
  let view = {
    tab: persisted.tab || "all",
    sort: persisted.sort || "severity",
    filter: persisted.filter || "",
  };
  let activeIndex = -1;
  let visible = [];

  const el = {
    tabs: document.getElementById("tabs"),
    filter: document.getElementById("filter"),
    sort: document.getElementById("sort"),
    summary: document.getElementById("summary"),
    banner: document.getElementById("banner"),
    list: document.getElementById("results"),
    empty: document.getElementById("empty"),
  };

  el.filter.value = view.filter;
  el.sort.value = view.sort;

  function persist() {
    vscode.setState(view);
    vscode.postMessage({ type: "persistView", tab: view.tab, sort: view.sort, filter: view.filter });
  }

  function matches(result) {
    if (view.tab !== "all" && result.kind !== view.tab) return false;
    if (!view.filter) return true;
    const needle = view.filter.toLowerCase();
    return (
      result.message.toLowerCase().includes(needle) ||
      (result.file || "").toLowerCase().includes(needle) ||
      (result.category || "").toLowerCase().includes(needle)
    );
  }

  function compare(a, b) {
    switch (view.sort) {
      case "file":
        return (a.file || "").localeCompare(b.file || "", "en") || (a.line || 0) - (b.line || 0);
      case "line":
        return (a.line || 0) - (b.line || 0);
      case "category":
        return (a.category || "").localeCompare(b.category || "", "en");
      case "kind":
        return a.kind.localeCompare(b.kind, "en");
      default:
        return (
          SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
          (a.file || "").localeCompare(b.file || "", "en") ||
          (a.line || 0) - (b.line || 0)
        );
    }
  }

  function renderTabs() {
    el.tabs.textContent = "";
    const kinds = ["all"].concat(Object.keys(state.tools));
    for (const kind of kinds) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", String(view.tab === kind));
      const label = kind === "all" ? "All" : KIND_LABEL[kind] || kind;
      btn.textContent = label;

      const total =
        kind === "all"
          ? state.results.length
          : (state.tools[kind] && state.tools[kind].counts.total) || 0;
      const count = document.createElement("span");
      count.className = "count";
      count.textContent = "(" + total + ")";
      btn.appendChild(count);
      // Screen readers get the count as words rather than as a bare number.
      btn.setAttribute("aria-label", label + ", " + total + " result" + (total === 1 ? "" : "s"));

      btn.addEventListener("click", function () {
        view.tab = kind;
        activeIndex = -1;
        persist();
        render();
      });
      el.tabs.appendChild(btn);
    }
  }

  function renderSummary() {
    el.summary.textContent = "";
    const dl = document.createElement("dl");
    const kinds = Object.keys(state.tools);
    if (kinds.length === 0) {
      el.summary.textContent = "No operations have run yet.";
      return;
    }
    for (const kind of kinds) {
      const tool = state.tools[kind];
      const dt = document.createElement("dt");
      dt.textContent = KIND_LABEL[kind] || kind;
      const dd = document.createElement("dd");
      const bits = [];
      if (tool.summary) bits.push(tool.summary);
      if (tool.counts.error) bits.push(tool.counts.error + " error(s)");
      if (tool.counts.warning) bits.push(tool.counts.warning + " warning(s)");
      if (tool.status !== "success" && tool.status !== "idle") bits.push(tool.status);
      dd.textContent = bits.join(" \\u2014 ") || tool.status;
      dl.appendChild(dt);
      dl.appendChild(dd);
    }
    el.summary.appendChild(dl);
  }

  function renderBanner() {
    const notes = [];
    if (state.truncated) notes.push("Results were capped; this list is incomplete.");
    if (state.note) notes.push(state.note);
    for (const kind of Object.keys(state.tools)) {
      const tool = state.tools[kind];
      if (tool.problem) notes.push((KIND_LABEL[kind] || kind) + ": " + tool.problem);
    }
    if (notes.length === 0) {
      el.banner.hidden = true;
      el.banner.textContent = "";
      return;
    }
    el.banner.hidden = false;
    el.banner.textContent = notes.join(" ");
  }

  function renderEmpty() {
    el.empty.textContent = "";
    if (visible.length > 0) {
      el.empty.hidden = true;
      return;
    }
    el.empty.hidden = false;
    const p = document.createElement("p");
    if (state.results.length > 0) {
      p.textContent = "No results match the current filter.";
      el.empty.appendChild(p);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = "Clear filter";
      btn.addEventListener("click", function () {
        view.filter = "";
        el.filter.value = "";
        persist();
        render();
      });
      el.empty.appendChild(btn);
      return;
    }
    p.textContent = "Nothing to show yet. Run Compare, Spell Check, or Beautify.";
    el.empty.appendChild(p);
  }

  function renderList() {
    el.list.textContent = "";
    visible = state.results.filter(matches).sort(compare);

    visible.forEach(function (result, index) {
      const li = document.createElement("li");
      li.setAttribute("role", "option");
      li.id = "result-" + index;
      li.setAttribute("aria-selected", String(index === activeIndex));
      // Roving tabindex: exactly one row is in the tab order at a time.
      li.tabIndex = index === activeIndex ? 0 : -1;
      li.dataset.resultId = result.id;

      const sev = document.createElement("span");
      sev.className = "sev sev-" + result.severity;
      // The glyph plus the label mean severity is never conveyed by colour
      // alone, which is both an accessibility requirement and necessary for
      // high-contrast themes.
      sev.textContent = SEVERITY_GLYPH[result.severity] || "\\u2022";
      sev.setAttribute("aria-label", result.severity);
      li.appendChild(sev);

      const body = document.createElement("span");
      const msg = document.createElement("span");
      msg.className = "msg";
      msg.textContent = result.message;
      body.appendChild(msg);

      const locationText = locationOf(result);
      if (locationText) {
        const loc = document.createElement("span");
        loc.className = "loc";
        loc.textContent = locationText + (result.detail ? " \\u2014 " + result.detail : "");
        body.appendChild(loc);
      }
      li.appendChild(body);

      li.addEventListener("click", function () {
        activeIndex = index;
        reveal(result.id);
        render();
      });
      el.list.appendChild(li);
    });

    el.list.setAttribute(
      "aria-activedescendant",
      activeIndex >= 0 ? "result-" + activeIndex : ""
    );
  }

  function locationOf(result) {
    if (!result.file) return "";
    if (result.line === undefined || result.line === null) return result.file;
    return result.file + ":" + (result.line + 1);
  }

  function render() {
    renderTabs();
    renderSummary();
    renderBanner();
    renderList();
    renderEmpty();
  }

  function reveal(resultId) {
    vscode.postMessage({ type: "reveal", resultId: resultId });
  }

  function move(delta) {
    if (visible.length === 0) return;
    activeIndex = Math.max(0, Math.min(visible.length - 1, activeIndex + delta));
    render();
    const node = document.getElementById("result-" + activeIndex);
    if (node) {
      node.focus();
      node.scrollIntoView({ block: "nearest" });
    }
  }

  el.list.addEventListener("keydown", function (event) {
    switch (event.key) {
      case "ArrowDown": event.preventDefault(); move(activeIndex < 0 ? 0 : 1); break;
      case "ArrowUp": event.preventDefault(); move(-1); break;
      case "Home": event.preventDefault(); activeIndex = 0; move(0); break;
      case "End": event.preventDefault(); activeIndex = visible.length - 1; move(0); break;
      case "Enter":
      case " ":
        if (activeIndex >= 0 && visible[activeIndex]) {
          event.preventDefault();
          reveal(visible[activeIndex].id);
        }
        break;
      case "c":
        if ((event.ctrlKey || event.metaKey) && activeIndex >= 0 && visible[activeIndex]) {
          vscode.postMessage({ type: "copyResult", resultId: visible[activeIndex].id });
        }
        break;
      default: break;
    }
  });

  let filterTimer = null;
  el.filter.addEventListener("input", function () {
    // Debounced so typing in a large list does not re-render per keystroke.
    if (filterTimer) clearTimeout(filterTimer);
    filterTimer = setTimeout(function () {
      view.filter = el.filter.value;
      activeIndex = -1;
      persist();
      render();
    }, 120);
  });

  el.sort.addEventListener("change", function () {
    view.sort = el.sort.value;
    persist();
    render();
  });

  document.getElementById("rerun").addEventListener("click", function () {
    vscode.postMessage({ type: "rerun" });
  });
  document.getElementById("copy").addEventListener("click", function () {
    vscode.postMessage({ type: "copyReport", format: "markdown" });
  });
  document.getElementById("export").addEventListener("click", function () {
    vscode.postMessage({ type: "export", format: "markdown" });
  });
  document.getElementById("clear").addEventListener("click", function () {
    vscode.postMessage({ type: "clear", kind: view.tab === "all" ? undefined : view.tab });
  });

  window.addEventListener("message", function (event) {
    const message = event.data;
    if (!message || typeof message.type !== "string") return;
    if (message.type === "setState") {
      state = message.state;
      activeIndex = -1;
      render();
    }
  });

  vscode.postMessage({ type: "ready" });
  render();
})();
</script>
</body>
</html>`;
}
