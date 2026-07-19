# Release Checklist

Keep the manifest version, `CHANGELOG.md`, the git tag, and the VSIX filename in
sync. Publishing is guarded: if a marketplace token secret is absent, the
workflow still produces a verified GitHub release and simply skips publishing.

## 1. Prepare

- [ ] Update the version in `apps/vscode-extension/package.json`, `apps/cli/package.json`, and the root `package.json` to `X.Y.Z`.
- [ ] Add an `[X.Y.Z]` section to `CHANGELOG.md` and `apps/vscode-extension/CHANGELOG.md` with the date.
- [ ] `npm run assets` if any branding changed.

## 2. Verify locally

- [ ] `npm ci`
- [ ] `npm run verify` (typecheck + lint + tests) is green.
- [ ] `npm run build` produces the CLI and extension bundles.
- [ ] `npm run package:vsix` creates `artifacts/code-trio-compare-beautify-spellcheck-X.Y.Z.vsix`.
- [ ] `npm run verify:vsix` passes (content audit, size, secrets, smoke test).

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
