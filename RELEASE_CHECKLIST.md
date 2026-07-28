# Release Checklist

Keep the manifest version, `CHANGELOG.md`, the git tag, and the VSIX filename in
sync. Publishing is guarded: if a marketplace token secret is absent, the
workflow still produces a verified GitHub release and simply skips publishing.

## 1. Prepare

- [ ] Update the version in the root `package.json`, `apps/cli/package.json`, `apps/vscode-extension/package.json`, and every `packages/*/package.json`. They are versioned in lockstep: one release, one number.
- [ ] `npm install --package-lock-only` so the lockfile's workspace metadata matches.
- [ ] Add an `[X.Y.Z]` section to `CHANGELOG.md` and `apps/vscode-extension/CHANGELOG.md` with the date.
- [ ] Write `docs/releases/vX.Y.Z.md`.
- [ ] Update documentation that names the packaged VSIX (`README.md`, `docs/media.md`) and the issue-template placeholder. Leave historical changelog entries and prose about previous behaviour alone.
- [ ] `npm run assets` if any branding changed.

## 2. Verify locally

- [ ] `npm ci`
- [ ] `npm run verify` (typecheck + lint + tests) is green.
- [ ] `node scripts/cli-smoke.mjs` passes. This runs the built CLI as a child process and catches what the unit suite cannot: an unregistered command, a broken argument definition, a wrong exit code.
- [ ] `npm run bench` — record the numbers if they moved materially.
- [ ] `npm audit --omit=dev` — assess runtime relevance rather than hiding the output.
- [ ] `npm run build` produces the CLI and extension bundles.
- [ ] `npm run package:vsix` creates `artifacts/code-trio-compare-beautify-spellcheck-X.Y.Z.vsix`.
- [ ] `npm run verify:vsix` passes (content audit, size, secrets, smoke test).
- [ ] Confirm the version **inside** the archive, not just the filename: `extension.vsixmanifest` `Identity/@Version` and `extension/package.json` must both read `X.Y.Z`.
- [ ] Verify the checksum independently: `sha256sum -c artifacts/*-X.Y.Z.vsix.sha256`.
- [ ] Confirm the release is not a version-number-only relabel — the package contents must actually differ from the previous release.

## 2b. Install test (do not skip, do not fake)

- [ ] Install into an **isolated** profile so your normal setup is untouched:
      `code --user-data-dir /tmp/ctr-profile --extensions-dir /tmp/ctr-extensions --install-extension artifacts/...vsix --force`
- [ ] Confirm the installed version with `--list-extensions --show-versions`.
- [ ] Walk the functional checklist in the release's `artifacts/vX.Y.Z-verification.md`.
- [ ] Confirm writes are blocked in an **untrusted** workspace while compare and spell diagnostics still work.
- [ ] Disconnect the network and confirm every core workflow still works.
- [ ] Clean up the temporary profile and extensions directory.

If the environment cannot run VS Code, mark this section **Blocked** in the
verification record and say so in the release notes. Do not describe the package
as install-tested.

## 3. Tag

- [ ] Commit the version bump.
- [ ] `git tag vX.Y.Z && git push origin vX.Y.Z` (tag must match the manifest version).

## 4. Automated release

The `release.yml` and `extension.yml` workflows run on the tag and will:

- [ ] Re-run all quality gates.
- [ ] Build the CLI and package + smoke-test the VSIX.
- [ ] Attach the VSIX and its `.sha256` checksum to the GitHub Release.
- [ ] Publish to the VS Code Marketplace and Open VSX only if `VSCE_PAT` /
      `OVSX_PAT` secrets are configured; otherwise publishing is skipped.

## 5. Post-release

- [ ] Confirm the release artifacts and checksum are attached.
- [ ] Confirm the Marketplace/Open VSX listing (if publishing was enabled).
- [ ] Open a `vNext` heading in the changelog for the next cycle.

## Marketplace authentication

Prefer Microsoft's current secure/federated publishing. A legacy Personal Access
Token (`VSCE_PAT`) is supported as a temporary fallback and must be stored only
as an encrypted repository secret. Never print tokens in logs.
