# Third-Party Notices

Code Trio is licensed under Apache-2.0. It bundles or depends on the following
third-party components. Each remains under its own license.

## Bundled at runtime

| Component | License | Used by | Notes |
| --- | --- | --- | --- |
| [Prettier](https://github.com/prettier/prettier) | MIT | format engine | Bundled as `prettier/standalone` with explicit plugins; version pinned and recorded in results. |
| [commander](https://github.com/tj/commander.js) | MIT | CLI | Argument parsing. |
| [picocolors](https://github.com/alexeyraspopov/picocolors) | ISC | reporting/CLI | Terminal colors. |
| [zod](https://github.com/colinhacks/zod) | MIT | core/configuration | Schema validation. |

## Development only (not shipped)

TypeScript (Apache-2.0), Vitest (MIT), ESLint and typescript-eslint (MIT),
esbuild (MIT), tsx (MIT), @vscode/vsce and @vscode/test-electron (MIT),
@resvg/resvg-js (MPL-2.0, used only to generate images), mocha (MIT).

## Dictionaries

The built-in base and technical word lists in `packages/dictionaries` are
original works created for Code Trio and dedicated to the public domain under
[CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/). They are not
derived from any third-party word list. See
[docs/dictionaries.md](docs/dictionaries.md).

## Fonts

Branding assets are rendered with fonts available on the build machine (Poppins,
Lato, DejaVu). Only the resulting PNG/GIF raster images are committed; no font
files are redistributed in this repository or the VSIX.

Run `npx license-checker --production` (or your tool of choice) for a complete,
current dependency license report.
