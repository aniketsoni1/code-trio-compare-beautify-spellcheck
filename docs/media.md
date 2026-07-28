# Media and branding

All committed images are PNG or GIF (publish-safe for the Marketplace and
GitHub). Editable SVG sources live in `assets/src/`. Marketplace-facing files
(`apps/vscode-extension/README.md`, `CHANGELOG.md`) reference raster images only.

## How the assets are produced

`npm run assets` (which runs `scripts/generate-assets.mjs`) renders every image
from SVG defined in that script using `@resvg/resvg-js`, and assembles the demo
GIF with ImageMagick. It is fully reproducible: edit the SVG builders and re-run.

Generated files:

| File | Size | Use |
| --- | --- | --- |
| `apps/vscode-extension/media/icon.png` | 256x256 | packaged extension icon |
| `assets/icon-512.png` / `256` / `128` | square | Marketplace / README icons |
| `assets/logo.png` | 520x140 | README wordmark |
| `assets/hero.png` | 1280x640 | GitHub social preview |
| `assets/banner.png` | 1200x300 | README header |
| `assets/architecture.png` | 1200x720 | architecture diagram |
| `assets/workflow.png` | 1200x360 | workflow diagram |
| `assets/screenshots/*.png` | 1180x760 | representative UI renders |
| `assets/demo.gif` | 820 wide | short happy-path slideshow |

The four screenshots are labeled "representative render" because they are drawn
from SVG rather than captured from a running editor. The section below is the
checklist to replace them with genuine captures.

## Setting the GitHub social preview

Repository Settings -> General -> Social preview -> upload `assets/hero.png`.

## Live capture checklist (reproducible)

Capture these from the actual extension so the Marketplace listing shows the real
UI. Use the committed `samples/demo-workspace` for a consistent, offline setup.

1. Build and install the extension into a clean profile:

   ```bash
   npm ci && npm run package:vsix
   code --profile "code-trio-shots" --install-extension \
     artifacts/code-trio-compare-beautify-spellcheck-0.2.0.vsix
   code --profile "code-trio-shots" samples/demo-workspace
   ```

2. Use the dark theme (Default Dark Modern), editor font size 15, and a window
   sized to about 1280x800 for consistent dimensions. Hide the minimap.

3. Activity Bar + results panel: open the Code Trio panel, run "Spell Check
   Current File" on `src/greeting.ts`, and capture the sidebar plus editor.
   Save as `assets/screenshots/panel.png`.

4. Two-way compare: open `src/compare-a.ts`, run "Compare Active File With
   File..." and pick `src/compare-b.ts`. Capture the diff editor as
   `assets/screenshots/compare.png`.

5. Spell quick fixes: on the `recieve` typo in `src/greeting.ts`, open the quick
   fix menu (`Ctrl/Cmd+.`) and capture the suggestions and "Add to project
   dictionary". Save as `assets/screenshots/diagnostics.png`.

6. Beautify dry-run: open `src/messy.ts`, run "Preview Beautify Changes", and
   capture the dry-run diff before applying. Save as
   `assets/screenshots/format-preview.png`.

7. Demo GIF: record steps 4 to 6 as a short clip and export a lightweight GIF to
   `assets/demo.gif` (for example with the built-in screen recorder plus
   `gifski`, keeping it under ~2 MB).

Keep every capture at the same window dimensions and theme, include descriptive
alt text in the README, and verify readability on the dark Marketplace
background. Do not commit placeholder or mocked-up UI as if it were a real
capture.
