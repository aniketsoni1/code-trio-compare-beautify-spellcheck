// Generates Code Trio's visual identity from SVG sources into committed PNGs.
// Reproducible: edit the SVG builders below and re-run `npm run assets`.
//
// Rasterizer: @resvg/resvg-js (self-contained, no system deps beyond fonts).
// Outputs go to assets/ (marketing + editable SVG source) and the extension's
// media/ folder (packaged icon). Screenshots are clearly labeled representative
// renders, not live captures - see docs/media.md for the live-capture checklist.

import { Resvg } from "@resvg/resvg-js";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const assets = resolve(root, "assets");
const shots = resolve(assets, "screenshots");
const media = resolve(root, "apps/vscode-extension/media");
for (const dir of [assets, shots, media, resolve(assets, "src")]) mkdirSync(dir, { recursive: true });

// --- Brand palette ---
const C = {
  bg: "#0B1020",
  bg2: "#0F1626",
  panel: "#121A2E",
  line: "#233049",
  ink: "#E7ECF5",
  muted: "#8A93A6",
  blue: "#4C8DFF", // compare
  green: "#37D39B", // spell
  violet: "#B57BFF", // beautify
  red: "#FF6B6B",
  amber: "#F5C451",
};
const SANS = "Poppins, Lato, DejaVu Sans, sans-serif";
const MONO = "DejaVu Sans Mono, monospace";

function render(svg, outFile, scale = 1) {
  const r = new Resvg(svg, {
    background: "rgba(0,0,0,0)",
    font: { loadSystemFonts: true, defaultFontFamily: "Poppins" },
    fitTo: scale === 1 ? { mode: "original" } : { mode: "zoom", value: scale },
  });
  writeFileSync(outFile, r.render().asPng());
}

const doc = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;

// --- Shared: the Code Trio mark (three bars) ---
function markBars(x, y, unit, gap) {
  const w = unit;
  const bars = [
    { h: unit * 1.6, c: C.blue },
    { h: unit * 2.6, c: C.green },
    { h: unit * 3.6, c: C.violet },
  ];
  return bars
    .map((b, i) => {
      const bx = x + i * (w + gap);
      const by = y - b.h;
      return `<rect x="${bx}" y="${by}" width="${w}" height="${b.h}" rx="${w * 0.35}" fill="${b.c}"/>`;
    })
    .join("");
}

// --- Icon ---
function iconSvg(size) {
  const r = size * 0.22;
  const unit = size * 0.13;
  const gap = size * 0.07;
  const groupW = unit * 3 + gap * 2;
  const x = (size - groupW) / 2;
  const baseline = size * 0.74;
  return doc(
    size,
    size,
    `
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#111A31"/>
        <stop offset="1" stop-color="#0A0E1C"/>
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="${size}" height="${size}" rx="${r}" fill="url(#bg)"/>
    <rect x="1.5" y="1.5" width="${size - 3}" height="${size - 3}" rx="${r - 1.5}" fill="none" stroke="${C.line}" stroke-width="2"/>
    ${markBars(x, baseline, unit, gap)}
    <circle cx="${x + unit * 0.5}" cy="${baseline + unit * 0.9}" r="${unit * 0.16}" fill="${C.blue}"/>
    <circle cx="${x + unit * 1.5 + gap}" cy="${baseline + unit * 0.9}" r="${unit * 0.16}" fill="${C.green}"/>
    <circle cx="${x + unit * 2.5 + gap * 2}" cy="${baseline + unit * 0.9}" r="${unit * 0.16}" fill="${C.violet}"/>
  `,
  );
}

// --- Wordmark logo (transparent) ---
function logoSvg() {
  const w = 520;
  const h = 140;
  const unit = 15;
  const gap = 8;
  return doc(
    w,
    h,
    `
    ${markBars(28, 104, unit, gap)}
    <text x="130" y="72" font-family="${SANS}" font-weight="700" font-size="46" fill="${C.ink}">Code Trio</text>
    <text x="132" y="106" font-family="${SANS}" font-weight="400" font-size="18" fill="${C.muted}">Compare · Spell Check · Beautify</text>
  `,
  );
}

// --- Hero / social preview (1280x640) ---
function heroSvg() {
  const w = 1280;
  const h = 640;
  const chip = (x, color, label) =>
    `<g transform="translate(${x},420)">
       <rect x="0" y="0" width="300" height="120" rx="16" fill="${C.panel}" stroke="${C.line}"/>
       <rect x="0" y="0" width="6" height="120" rx="3" fill="${color}"/>
       <text x="26" y="48" font-family="${SANS}" font-weight="600" font-size="24" fill="${C.ink}">${label.title}</text>
       <text x="26" y="82" font-family="${SANS}" font-size="16" fill="${C.muted}">${label.sub}</text>
     </g>`;
  return doc(
    w,
    h,
    `
    <defs>
      <linearGradient id="hbg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#0C1327"/>
        <stop offset="1" stop-color="#080B16"/>
      </linearGradient>
      <radialGradient id="glow" cx="0.2" cy="0.2" r="0.9">
        <stop offset="0" stop-color="#16224a" stop-opacity="0.8"/>
        <stop offset="1" stop-color="#0B1020" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#hbg)"/>
    <rect width="${w}" height="${h}" fill="url(#glow)"/>
    ${markBars(90, 250, 34, 20)}
    <text x="90" y="330" font-family="${SANS}" font-weight="700" font-size="76" fill="${C.ink}">Code Trio</text>
    <text x="94" y="378" font-family="${SANS}" font-weight="400" font-size="27" fill="${C.muted}">Three offline dev tools in one - deterministic and private.</text>
    ${chip(90, C.blue, { title: "Compare / Diff", sub: "2-way &amp; 3-way, word-level" })}
    ${chip(410, C.green, { title: "Spell Check", sub: "code-aware, quick fixes" })}
    ${chip(730, C.violet, { title: "Beautify", sub: "Prettier, dry-run preview" })}
    <text x="1190" y="600" text-anchor="end" font-family="${MONO}" font-size="15" fill="${C.muted}">no network · no telemetry · Apache-2.0</text>
  `,
  );
}

// --- README banner (1200x300) ---
function bannerSvg() {
  const w = 1200;
  const h = 300;
  return doc(
    w,
    h,
    `
    <defs>
      <linearGradient id="bbg" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#0E1730"/>
        <stop offset="1" stop-color="#0A0E1C"/>
      </linearGradient>
    </defs>
    <rect width="${w}" height="${h}" rx="18" fill="url(#bbg)"/>
    ${markBars(70, 210, 26, 16)}
    <text x="190" y="150" font-family="${SANS}" font-weight="700" font-size="58" fill="${C.ink}">Code Trio</text>
    <text x="193" y="196" font-family="${SANS}" font-size="22" fill="${C.muted}">Compare · Spell Check · Beautify - one offline VS Code extension + CLI</text>
    <g transform="translate(70,232)">
      <rect x="0" y="0" width="120" height="34" rx="17" fill="none" stroke="${C.blue}"/>
      <text x="60" y="23" text-anchor="middle" font-family="${MONO}" font-size="15" fill="${C.blue}">compare</text>
      <rect x="132" y="0" width="120" height="34" rx="17" fill="none" stroke="${C.green}"/>
      <text x="192" y="23" text-anchor="middle" font-family="${MONO}" font-size="15" fill="${C.green}">spell</text>
      <rect x="264" y="0" width="120" height="34" rx="17" fill="none" stroke="${C.violet}"/>
      <text x="324" y="23" text-anchor="middle" font-family="${MONO}" font-size="15" fill="${C.violet}">beautify</text>
    </g>
  `,
  );
}

// --- VS Code chrome helpers for screenshots ---
function windowChrome(w, h, title, body) {
  return `
    <rect width="${w}" height="${h}" rx="10" fill="${C.bg2}"/>
    <rect width="${w}" height="34" rx="10" fill="#0B0F1C"/>
    <rect y="24" width="${w}" height="10" fill="#0B0F1C"/>
    <circle cx="20" cy="17" r="6" fill="#FF5F57"/>
    <circle cx="40" cy="17" r="6" fill="#FEBC2E"/>
    <circle cx="60" cy="17" r="6" fill="#28C840"/>
    <text x="${w / 2}" y="22" text-anchor="middle" font-family="${SANS}" font-size="13" fill="${C.muted}">${title}</text>
    <!-- activity bar -->
    <rect x="0" y="34" width="52" height="${h - 34}" fill="#0B0F1C"/>
    <rect x="0" y="70" width="3" height="34" fill="${C.blue}"/>
    ${markBars(14, 96, 7, 4)}
    ${body}
    <text x="${w - 16}" y="${h - 12}" text-anchor="end" font-family="${MONO}" font-size="12" fill="#54607a">representative render</text>
  `;
}

function codeLine(x, y, tokens) {
  let cx = x;
  return tokens
    .map((t) => {
      const seg = `<text x="${cx}" y="${y}" font-family="${MONO}" font-size="14" fill="${t.c}">${t.t.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</text>`;
      cx += t.t.length * 8.4;
      return seg;
    })
    .join("");
}

// Results panel screenshot
function shotPanel() {
  const w = 1180;
  const h = 760;
  const body = `
    <rect x="52" y="34" width="320" height="${h - 34}" fill="${C.panel}"/>
    <text x="72" y="66" font-family="${SANS}" font-weight="600" font-size="13" fill="${C.muted}">CODE TRIO</text>
    <text x="340" y="66" font-family="${MONO}" font-size="14" fill="${C.muted}">⟳  ⌫</text>
    ${["Spell Check|3 issues - greeting.ts|book|" + C.green, "Compare|+1 -5 (3 unchanged)|git-compare|" + C.blue, "Beautify|would reformat with prettier|symbol-color|" + C.violet]
      .map((row, i) => {
        const [name, desc, , color] = row.split("|");
        const y = 104 + i * 58;
        return `<g transform="translate(72,${y})">
          <circle cx="8" cy="6" r="6" fill="${color}"/>
          <text x="26" y="11" font-family="${SANS}" font-weight="600" font-size="15" fill="${C.ink}">${name}</text>
          <text x="26" y="34" font-family="${SANS}" font-size="13" fill="${C.muted}">${desc}</text>
        </g>`;
      })
      .join("")}
    <line x1="72" y1="300" x2="352" y2="300" stroke="${C.line}"/>
    <text x="72" y="330" font-family="${SANS}" font-size="12" fill="${C.muted}">All processing is local. No network calls.</text>
    <!-- editor -->
    <rect x="372" y="34" width="${w - 372}" height="30" fill="#0B0F1C"/>
    <text x="392" y="54" font-family="${SANS}" font-size="13" fill="${C.ink}">greeting.ts</text>
    ${[
      [{ t: "export function ", c: C.violet }, { t: "receiveName", c: C.blue }, { t: "(name: string) {", c: C.ink }],
      [{ t: "  // ", c: C.muted }, { t: "recieve", c: C.red }, { t: " a name and greet the caller", c: C.muted }],
      [{ t: "  return ", c: C.violet }, { t: "`hello ${name}`", c: C.green }, { t: ";", c: C.ink }],
      [{ t: "}", c: C.ink }],
    ]
      .map((toks, i) => codeLine(400, 100 + i * 26, toks))
      .join("")}
    <path d="M 424 116 q 6 5 12 0 q 6 -5 12 0 q 6 5 12 0" stroke="${C.red}" fill="none" stroke-width="1.6"/>
  `;
  render(doc(w, h, windowChrome(w, h, "Code Trio - Results panel", body)), resolve(shots, "panel.png"));
}

// Compare screenshot
function shotCompare() {
  const w = 1180;
  const h = 760;
  const col = (x, title, lines) => `
    <rect x="${x}" y="64" width="384" height="${h - 64}" fill="${C.bg}"/>
    <rect x="${x}" y="64" width="384" height="26" fill="#0B0F1C"/>
    <text x="${x + 14}" y="82" font-family="${SANS}" font-size="12" fill="${C.muted}">${title}</text>
    ${lines
      .map((ln, i) => {
        const y = 112 + i * 24;
        const bg = ln.bg
          ? `<rect x="${x}" y="${y - 15}" width="384" height="22" fill="${ln.bg}" opacity="0.18"/>`
          : "";
        const gutter = ln.mark
          ? `<text x="${x + 8}" y="${y}" font-family="${MONO}" font-size="13" fill="${ln.mark === "+" ? C.green : C.red}">${ln.mark}</text>`
          : "";
        return `${bg}${gutter}<text x="${x + 26}" y="${y}" font-family="${MONO}" font-size="13" fill="${C.ink}">${ln.t.replace(/</g, "&lt;")}</text>`;
      })
      .join("")}`;
  const left = [
    { t: "function total(items) {" },
    { t: "  let sum = 0;", mark: "-", bg: C.red },
    { t: "  for (const i of items) {", mark: "-", bg: C.red },
    { t: "    sum += i;", mark: "-", bg: C.red },
    { t: "  }", mark: "-", bg: C.red },
    { t: "  return sum;", mark: "-", bg: C.red },
    { t: "}" },
  ];
  const right = [
    { t: "function total(items) {" },
    { t: "  return items.reduce(", mark: "+", bg: C.green },
    { t: "    (s, i) => s + i, 0);", mark: "+", bg: C.green },
    { t: "}" },
  ];
  const body = `
    <rect x="52" y="34" width="${w - 52}" height="30" fill="#0B0F1C"/>
    <text x="72" y="54" font-family="${SANS}" font-size="13" fill="${C.ink}">compare-a.ts  ↔  compare-b.ts</text>
    ${col(60, "compare-a.ts (working)", left)}
    ${col(720, "compare-b.ts", right)}
    <line x1="600" y1="64" x2="600" y2="${h}" stroke="${C.line}"/>
  `;
  render(doc(w, h, windowChrome(w, h, "Code Trio - Two-way compare", body)), resolve(shots, "compare.png"));
}

// Diagnostics + quick fix screenshot
function shotDiagnostics() {
  const w = 1180;
  const h = 760;
  const body = `
    <rect x="52" y="34" width="${w - 52}" height="30" fill="#0B0F1C"/>
    <text x="72" y="54" font-family="${SANS}" font-size="13" fill="${C.ink}">greeting.ts</text>
    ${[
      [{ t: "// ", c: C.muted }, { t: "recieve", c: C.red }, { t: " the payload and return it", c: C.muted }],
      [{ t: "export function ", c: C.violet }, { t: "receivePayload", c: C.blue }, { t: "(payload) {", c: C.ink }],
      [{ t: "  return payload;", c: C.ink }],
      [{ t: "}", c: C.ink }],
    ]
      .map((toks, i) => codeLine(80, 110 + i * 26, toks))
      .join("")}
    <path d="M 96 118 q 6 5 12 0 q 6 -5 12 0 q 6 5 12 0 q 6 -5 12 0" stroke="${C.red}" fill="none" stroke-width="1.6"/>
    <!-- quick fix popover -->
    <g transform="translate(150,150)">
      <rect x="0" y="0" width="360" height="180" rx="8" fill="${C.panel}" stroke="${C.line}"/>
      <rect x="0" y="0" width="360" height="30" fill="#0B0F1C"/>
      <text x="14" y="20" font-family="${SANS}" font-size="12" fill="${C.muted}">Quick Fix   Unknown word: "recieve"</text>
      ${["Replace with \"receive\"", "Replace with \"believe\"", "Add \"recieve\" to project dictionary", "Fix all spelling in file"]
        .map((t, i) => {
          const y = 54 + i * 32;
          const hl = i === 0 ? `<rect x="6" y="${y - 18}" width="348" height="26" rx="5" fill="${C.blue}" opacity="0.18"/>` : "";
          return `${hl}<text x="16" y="${y}" font-family="${SANS}" font-size="14" fill="${i === 0 ? C.ink : C.muted}">${t}</text>`;
        })
        .join("")}
    </g>
  `;
  render(doc(w, h, windowChrome(w, h, "Code Trio - Spell quick fixes", body)), resolve(shots, "diagnostics.png"));
}

// Format preview screenshot
function shotFormat() {
  const w = 1180;
  const h = 760;
  const side = (x, title, lines, color) => `
    <rect x="${x}" y="64" width="520" height="${h - 64}" fill="${C.bg}"/>
    <rect x="${x}" y="64" width="520" height="26" fill="#0B0F1C"/>
    <text x="${x + 14}" y="82" font-family="${SANS}" font-size="12" fill="${color}">${title}</text>
    ${lines.map((t, i) => `<text x="${x + 20}" y="${112 + i * 24}" font-family="${MONO}" font-size="13" fill="${C.ink}">${t.replace(/</g, "&lt;")}</text>`).join("")}`;
  const before = ['const   greeting="hello";let  count=3;', "function  add(a,b){return a+b}"];
  const after = ['const greeting = "hello";', "let count = 3;", "function add(a, b) {", "  return a + b;", "}"];
  const body = `
    <rect x="52" y="34" width="${w - 52}" height="30" fill="#0B0F1C"/>
    <text x="72" y="54" font-family="${SANS}" font-size="13" fill="${C.ink}">messy.ts (dry-run beautify)   prettier@3.9.5</text>
    ${side(60, "before", before, C.red)}
    ${side(600, "after (preview - not yet applied)", after, C.green)}
    <line x1="585" y1="64" x2="585" y2="${h}" stroke="${C.line}"/>
    <g transform="translate(940,${h - 60})">
      <rect x="0" y="0" width="90" height="34" rx="8" fill="${C.violet}"/>
      <text x="45" y="22" text-anchor="middle" font-family="${SANS}" font-weight="600" font-size="14" fill="#0B0F1C">Apply</text>
    </g>
  `;
  render(doc(w, h, windowChrome(w, h, "Code Trio - Beautify dry-run", body)), resolve(shots, "format-preview.png"));
}

// --- Architecture diagram ---
function architectureSvg() {
  const w = 1200;
  const h = 720;
  const box = (x, y, bw, bh, title, sub, color) => `
    <g transform="translate(${x},${y})">
      <rect width="${bw}" height="${bh}" rx="10" fill="${C.panel}" stroke="${color}" stroke-width="1.5"/>
      <text x="${bw / 2}" y="26" text-anchor="middle" font-family="${SANS}" font-weight="600" font-size="15" fill="${C.ink}">${title}</text>
      ${sub ? `<text x="${bw / 2}" y="48" text-anchor="middle" font-family="${MONO}" font-size="11" fill="${C.muted}">${sub}</text>` : ""}
    </g>`;
  const arrow = (x1, y1, x2, y2) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${C.line}" stroke-width="1.5" marker-end="url(#arr)"/>`;
  return doc(
    w,
    h,
    `
    <defs>
      <marker id="arr" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto">
        <path d="M0,0 L9,4.5 L0,9 z" fill="${C.line}"/>
      </marker>
    </defs>
    <rect width="${w}" height="${h}" fill="${C.bg}"/>
    <text x="40" y="50" font-family="${SANS}" font-weight="700" font-size="26" fill="${C.ink}">Code Trio architecture</text>
    <text x="40" y="78" font-family="${SANS}" font-size="15" fill="${C.muted}">Pure engines over one shared model; @ctr/agent is the only I/O seam; two thin apps.</text>

    ${box(120, 120, 200, 70, "CLI (code-trio)", "commander", C.blue)}
    ${box(880, 120, 200, 70, "VS Code extension", "lazy activation", C.violet)}
    ${box(430, 130, 340, 60, "@ctr/agent", "orchestration + I/O (fs, git, dict)", C.green)}

    ${arrow(320, 155, 430, 158)}
    ${arrow(880, 155, 770, 158)}

    ${box(120, 300, 260, 70, "@ctr/diff-engine", "Myers + 3-way merge", C.blue)}
    ${box(470, 300, 260, 70, "@ctr/spell-engine", "tokenize + split + suggest", C.green)}
    ${box(820, 300, 260, 70, "@ctr/format-engine", "adapter registry", C.violet)}

    ${arrow(470, 200, 250, 300)}
    ${arrow(600, 200, 600, 300)}
    ${arrow(720, 200, 950, 300)}

    ${box(820, 430, 260, 60, "@ctr/formatters", "Prettier standalone adapter", C.violet)}
    ${arrow(950, 370, 950, 430)}
    ${box(470, 430, 260, 60, "@ctr/dictionaries", "CC0 base + technical lists", C.green)}
    ${arrow(600, 370, 600, 430)}

    ${box(360, 560, 480, 80, "@ctr/core", "Document · Token · Diagnostic · DiffHunk · FormatResult · Zod · LanguageId · ToolDescriptor", C.ink)}
    ${arrow(250, 370, 470, 560)}
    ${arrow(600, 490, 600, 560)}
    ${arrow(950, 490, 720, 560)}
    <text x="40" y="${h - 24}" font-family="${MONO}" font-size="12" fill="${C.muted}">engines are pure: no vscode imports, no file I/O, no network</text>
  `,
  );
}

// --- Workflow diagram ---
function workflowSvg() {
  const w = 1200;
  const h = 360;
  const step = (x, color, title, sub) => `
    <g transform="translate(${x},120)">
      <rect width="220" height="110" rx="12" fill="${C.panel}" stroke="${color}" stroke-width="1.5"/>
      <circle cx="26" cy="30" r="10" fill="${color}"/>
      <text x="48" y="35" font-family="${SANS}" font-weight="600" font-size="16" fill="${C.ink}">${title}</text>
      <text x="20" y="66" font-family="${SANS}" font-size="13" fill="${C.muted}">${sub[0]}</text>
      <text x="20" y="86" font-family="${SANS}" font-size="13" fill="${C.muted}">${sub[1]}</text>
    </g>`;
  const arrow = (x) =>
    `<line x1="${x}" y1="175" x2="${x + 40}" y2="175" stroke="${C.line}" stroke-width="2" marker-end="url(#a2)"/>`;
  return doc(
    w,
    h,
    `
    <defs><marker id="a2" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 z" fill="${C.line}"/></marker></defs>
    <rect width="${w}" height="${h}" fill="${C.bg}"/>
    <text x="40" y="60" font-family="${SANS}" font-weight="700" font-size="24" fill="${C.ink}">Everyday workflow</text>
    ${step(40, C.blue, "Compare", ["Diff files, clipboard,", "or a git ref"])}
    ${arrow(262)}
    ${step(330, C.green, "Spell", ["Fix typos in comments", "&amp; strings inline"])}
    ${arrow(552)}
    ${step(620, C.violet, "Beautify", ["Preview, then apply", "Prettier formatting"])}
    ${arrow(842)}
    ${step(910, C.amber, "Commit", ["Clean, consistent,", "reviewed changes"])}
  `,
  );
}

// --- Render everything ---
writeFileSync(resolve(assets, "src/icon.svg"), iconSvg(512));
writeFileSync(resolve(assets, "src/architecture.svg"), architectureSvg());
writeFileSync(resolve(assets, "src/workflow.svg"), workflowSvg());

render(iconSvg(512), resolve(assets, "icon-512.png"));
render(iconSvg(256), resolve(assets, "icon-256.png"));
render(iconSvg(128), resolve(assets, "icon-128.png"));
render(iconSvg(256), resolve(media, "icon.png"));
render(logoSvg(), resolve(assets, "logo.png"));
render(heroSvg(), resolve(assets, "hero.png"));
render(bannerSvg(), resolve(assets, "banner.png"));
render(architectureSvg(), resolve(assets, "architecture.png"));
render(workflowSvg(), resolve(assets, "workflow.png"));
shotPanel();
shotCompare();
shotDiagnostics();
shotFormat();

// --- Animated demo GIF (slideshow of the representative renders) ---
// Uses ImageMagick if available; otherwise skipped with a note.
try {
  const frames = ["compare.png", "diagnostics.png", "format-preview.png", "panel.png"].map((f) =>
    resolve(shots, f),
  );
  execFileSync(
    "convert",
    ["-loop", "0", "-delay", "200", "-resize", "820x", ...frames, resolve(assets, "demo.gif")],
    { stdio: "ignore" },
  );
  console.log("demo.gif generated");
} catch {
  console.warn("ImageMagick `convert` not found - skipping demo.gif (optional).");
}

console.log("assets generated in assets/ and apps/vscode-extension/media/");
