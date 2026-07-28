# Security review — Code Trio v0.2.0

A threat review of the areas the v0.2.0 brief calls out. Each finding records
what the risk is, what the code does about it, and where that behaviour is
tested. Items with no mitigation are listed honestly as accepted risk rather
than omitted.

## Threat model in one paragraph

Code Trio runs inside the user's editor and CLI, with the user's privileges, on
content the user may not control — a cloned repository, a pasted clipboard, a
colleague's branch. The adversary is therefore a **hostile workspace**: crafted
file contents, crafted paths, a crafted `codetrio.json`, a crafted dictionary, a
crafted git ref. Code Trio has no network surface at all, so remote attack is
out of scope by construction rather than by defence.

## Findings

### 1. Command injection via git

**Risk.** A ref or path reaching a shell as syntax rather than data.

**Mitigation.** Every git invocation uses `execFileSync` with an argument array;
no shell is involved. Beyond that, refs are validated against an **allowlist**
(`^[A-Za-z0-9_][A-Za-z0-9_./\-^~@{}]*$` plus rejected sequences), not a
denylist — a denylist fails open on anything not yet imagined.

The exclusion that matters most is that a ref may not begin with `-`. Git parses
a leading dash as an option, and a "ref" of `--upload-pack=/bin/sh` handed to a
fetch-capable subcommand is a remote-code-execution primitive. Rejecting the
shape once, centrally, is more reliable than depending on every call site to
pass `--` correctly — and in fact `git show` cannot take `--` at all, since it
treats everything after it as a pathspec. That trap is documented at the call
site.

**Tested.** `packages/agent/test/git.test.ts` asserts rejection of
`--upload-pack=`, `--exec=`, `-o`, `HEAD; rm -rf /`, `HEAD && whoami`,
backtick and `$()` substitution, newlines, quotes, and glob characters, while
accepting `HEAD~1`, `HEAD^2`, `main@{upstream}` and `v1.2.3^{commit}`.

### 2. Environment-variable steering of child processes

**Risk.** Inheriting the full environment lets a hostile workspace influence a
child process through variables it never passes explicitly. `GIT_EXTERNAL_DIFF`
and `GIT_SSH_COMMAND` execute programs; `NODE_OPTIONS`, `PYTHONSTARTUP` and
`RUSTC_WRAPPER` do the equivalent for interpreters.

**Mitigation.** Both the git layer and the formatter process layer construct a
minimal, explicit environment. `PATH` and `HOME` are passed because interpreters
need them to find their own runtime; nothing else is, apart from the handful of
Windows system variables required for the OS loader to work.

**Tested.** `packages/formatters/test/process.test.ts` sets a variable in the
parent and asserts the child cannot see it, and separately asserts `PATH` does
reach the child.

### 3. Command injection via formatter arguments

**Risk.** A file path containing shell metacharacters reaching a formatter
through a shell.

**Mitigation.** `execFile` with an argument array and `shell: false` stated
explicitly — the explicit flag matters, because Node otherwise routes `.cmd` and
`.bat` through `cmd.exe` on Windows.

**Tested.** Hostile arguments (`; rm -rf`, `$(whoami)`, `` `id` ``, `&& echo`,
`|| echo`) are passed through a mock formatter and asserted to arrive as literal
data with nothing expanded or executed.

### 4. Untrusted executable paths

**Risk.** A workspace-relative setting pointing at a checked-in binary is a
supply-chain attack: clone the repo, open it, the "formatter" runs.

**Mitigation.** A configured formatter path must be **absolute** and must
already be an executable file. Relative paths are refused outright.

**Accepted risk.** Code Trio does not verify *what* the executable is. A user who
configures an absolute path to a malicious binary, or who has one earlier on
`PATH` than the real `ruff`, gets what they configured. Discovery finds only what
is already installed, and nothing is ever downloaded, but Code Trio is not an
allowlist of approved binaries.

### 5. Hung or runaway child processes

**Risk.** A formatter that blocks on stdin, or emits unbounded output, wedging
the extension host.

**Mitigation.** Every invocation has a timeout, plus a `SIGKILL` watchdog two
seconds later — `execFile`'s own timeout only sends `SIGTERM`, which a process
blocked on a read, or one with a `SIGTERM` handler, survives. Output is bounded
per stream. `EPIPE` from a formatter that exits before reading stdin is
swallowed, because the exit code already tells the real story.

**Tested.** A script that sleeps 30 s is killed within the timeout; a script that
floods stdout does not return megabytes.

### 6. Silent file destruction by a misbehaving formatter

**Risk.** A formatter that exits 0 having written nothing. Returning its output
would replace the user's file with an empty one.

**Mitigation.** The external adapter base class refuses empty output for a
non-empty document and reports an error instead. `rustfmt` is additionally
invoked with `--emit stdout` because its default is to edit files in place,
which would bypass the explicit-write guarantee entirely.

**Tested.** Both behaviours have dedicated tests.

### 7. Path traversal

**Risk.** Reading or writing outside the workspace.

**Mitigation.** `gitShow` computes the path relative to the work-tree root and
refuses anything that climbs out of it. `conflictStages` does the same.
Dictionary paths resolve against a known base (home directory, workspace folder)
rather than against the process working directory.

**Tested.** `gitShow("HEAD", "/etc/passwd", repo)` returns null.

### 8. Symlink handling

**Risk.** A symlink escaping the workspace, or a cycle causing infinite
traversal.

**Mitigation.** The CLI's file walker neither follows nor collects symlinks.

**Accepted risk.** A file passed explicitly by path is read even if it is a
symlink. That is the behaviour a user asking for a specific file expects.

### 9. Webview message forgery

**Risk.** A webview is a separate JavaScript realm. Anything arriving from it is
untrusted input.

**Mitigation.** Every inbound message is validated at runtime against a zod
schema, not merely typed. The vocabulary is deliberately tiny: the webview can
only ask for things the user could already do from the Command Palette. There is
no free-form command dispatch, no path to write, no shell string. `reveal`
carries a **result id**, and the host looks the location up in state it already
holds — trusting coordinates sent by the webview would let a forged message open
an arbitrary file at an arbitrary position. Unknown properties are stripped by
the schema, so a handler can never read a smuggled field. A malformed message is
logged and dropped, never thrown, so it cannot take down the message handler and
with it the panel.

**Tested.** `packages/core/test/panel-protocol.test.ts` asserts that
`executeCommand`, `writeFile` and `eval`-shaped messages are rejected, that
required fields are enforced, and that extra properties are stripped.

### 10. Content Security Policy regression

**Risk.** A future edit adding a CDN link, an inline handler, or an
`innerHTML` assignment.

**Mitigation.** `default-src 'none'`; `script-src` and `style-src` are exactly a
per-load nonce with no `unsafe-inline` and no `unsafe-eval`. A fresh nonce is
generated per load, so a value captured from an earlier render cannot authorise
a later injected script. All dynamic content is inserted with `textContent`.

**Tested.** `apps/vscode-extension/test/webview-csp.test.ts` asserts each
directive, the absence of any `http(s)://` reference, the absence of `fetch`,
`XMLHttpRequest`, `WebSocket`, `EventSource` and `sendBeacon`, and the absence of
`innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval` and
`new Function`.

### 11. Malicious dictionary content

**Risk.** A crafted dictionary file causing a crash or unbounded work.

**Mitigation.** Dictionaries are newline word lists; there is no expression
language to exploit. An unreadable or malformed file produces an empty layer
flagged `unavailable` rather than throwing — the failure mode this avoids is a
permissions problem presenting to the user as a sudden flood of spelling errors
with no explanation.

**Tested.** `packages/agent/test/dictionary-scopes.test.ts` covers an
unreadable file and a comments-only file.

### 12. Malicious workspace configuration

**Risk.** A crafted `codetrio.json` causing a crash or unsafe behaviour.

**Mitigation.** Every configuration value passes through a zod schema with
explicit bounds, so an out-of-range number is rejected rather than silently
clamped somewhere downstream. User-supplied regular expressions are compiled
defensively, and one that fails is reported to the user as invalid rather than
silently dropped.

**Accepted risk.** A catastrophically backtracking user-supplied
`ignorePatterns` entry can make a document scan slow. It is bounded in practice
by the scan being debounced and cancellable, but Code Trio does not analyse
regex complexity.

### 13. Untrusted-workspace writes

**Risk.** Writing to files in a workspace the user has not trusted.

**Mitigation.** The manifest declares `untrustedWorkspaces: limited`. Every write
path — applying formatting, adding to a dictionary, saving a merge — checks
`isWriteAllowed()` first and shows a consistent explanation when blocked.
Read-only operations (compare, spell diagnostics) continue to work.

### 14. Secrets in reports

**Risk.** An exported report containing a secret from the file being analysed.

**Partial mitigation.** Reports contain diagnostic messages and, for diffs, the
changed lines — because that is what a diff report is. Code Trio does not scan
for secrets.

**Accepted risk, documented.** A user exporting a diff report of a file
containing a credential exports the credential. This is inherent to the feature.
Exports are always to a location the user chooses through a save dialog; nothing
is written or transmitted automatically.

### 15. Zip-slip in packaging

**Risk.** A crafted path in an archive escaping the extraction directory.

**Mitigation.** Code Trio never extracts archives at runtime. The VSIX is
produced by `@vscode/vsce`, and `scripts/verify-vsix.mjs` audits the resulting
archive's entries.

### 16. Network and telemetry

**Verified absent.** No `fetch`, `http`, `https`, `axios`, `node-fetch`,
WebSocket or telemetry SDK appears anywhere in `apps/` or `packages/`. Prettier
is imported from `prettier/standalone` with statically imported plugins, so
there is no dynamic plugin resolution either — and standalone additionally
cannot read a `.prettierrc`, which means it cannot be steered by a config file in
an untrusted workspace. The webview loads nothing remote. A manifest test
asserts no telemetry contribution point exists.

## Verification commands

```bash
npm run verify                       # typecheck + lint + unit tests
npm audit --omit=dev                 # runtime dependency audit
npm run verify:vsix                  # package contents audit
grep -rnE "fetch\(|XMLHttpRequest|require\(['\"]https?['\"]\)" apps packages --include=*.ts
```

## Residual risk summary

| Item | Status |
| --- | --- |
| Configured executable is not identity-verified | Accepted, documented |
| Explicitly named symlinked file is read | Accepted, documented |
| User-supplied regex can be slow | Accepted, bounded by debounce and cancellation |
| Reports may contain secrets present in analysed files | Accepted, inherent, user-chosen destination |
| Extension activation in untrusted workspaces | Mitigated — reads allowed, writes blocked |
