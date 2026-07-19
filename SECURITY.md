# Security Policy

## Supported versions

The latest released `0.x` version receives security fixes. Code Trio is
pre-1.0, so please stay current.

## Reporting a vulnerability

Please report suspected vulnerabilities privately rather than opening a public
issue. Use GitHub's
[private security advisories](https://github.com/aniketsoni1/code-trio-compare-beautify-spellcheck/security/advisories/new)
or email aniket271993@gmail.com. Include a description, reproduction steps, and
the affected version. You can expect an initial acknowledgement within a few
days.

## Security posture

Code Trio is designed to minimize its attack surface:

- No network access. The engines and CLI make no outbound connections, and the
  bundled Prettier runs as a standalone with no plugin auto-download.
- No telemetry. Nothing about your code or usage leaves your machine.
- Explicit writes only. The only operations that modify files are applying a
  format and editing the project dictionary. Both are modeled as auditable
  `write` tools (`@ctr/core` `ToolDescriptor`).
- Workspace Trust. In VS Code, write operations are disabled in untrusted
  workspaces; the extension declares `limited` trust support.
- Strict webview CSP. Any webview content uses a restrictive Content Security
  Policy and does not load remote resources.

## Dependencies

Runtime dependencies are kept minimal and pinned where they affect output
(Prettier is version-pinned and its version is recorded in results). Dependabot
and a CI `security` workflow (CodeQL, `npm audit`, and secret scanning) watch
for issues.
