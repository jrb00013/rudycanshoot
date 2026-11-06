# Publishing rudycanshoot

How to cut a release: bump the version, update the changelog, push, publish to npm, and tag a
GitHub release. There's an automated path (`scripts/publish.sh`) and a manual path.

## Why publishing matters

The default MCP config runs the server via npm:

```json
{ "mcpServers": { "rudycanshoot": { "command": "npx", "args": ["-y", "rudycanshoot", "serve"] } } }
```

`npx -y rudycanshoot` pulls the **published npm version**. So **new tools/features only reach MCP
users after `npm publish`** — a commit on `main` is not enough. After publishing, users must
**restart their AI tool** (MCP servers load at startup).

> Running from a local clone (`node bin/rudycanshoot.js serve`) always uses your working tree, so
> local development doesn't need a publish.

## Prerequisites (one-time)

```bash
npm login          # or: npm adduser   — authenticates this machine to npm (required to publish)
npm whoami         # confirm you're logged in
gh auth status     # GitHub CLI, for the release step
```

Publish rights: your npm account must be a maintainer of the `rudycanshoot` package.

## Automated release (recommended)

`scripts/publish.sh` does version bump → changelog → commit/push → `npm publish` → GitHub release.

```bash
# semver bump keywords or an explicit version:
scripts/publish.sh minor -m "Add record_terminal MCP tool" -m "Docs update"
scripts/publish.sh patch -m "fix black VLC recordings (yuv420p)"
scripts/publish.sh 1.4.0 -m "Big release"

# preview without changing anything:
scripts/publish.sh minor -n            # --dry-run
scripts/publish.sh minor --no-tests    # skip npm test
```

Pick the bump by [semver](https://semver.org/): **patch** = fixes, **minor** = new
backward-compatible tools/features (e.g. adding `record_terminal`), **major** = breaking changes.

## Manual release (if you're not using the script)

```bash
# 1. bump version in package.json (and src/server.js McpServer version, keep them in sync)
#    e.g. 1.2.1 -> 1.3.0
# 2. move the CHANGELOG "[Unreleased]" notes under a new dated version heading
# 3. commit + push
git add -A && git commit -m "release: v1.3.0" && git push origin main

# 4. publish to npm  (respects package.json "files"; runs prepublish hooks if any)
npm publish                    # add --dry-run first to inspect the tarball contents

# 5. tag + GitHub release
git tag v1.3.0 && git push origin v1.3.0
gh release create v1.3.0 --title "v1.3.0" --notes "See CHANGELOG.md"
```

## Verify the release

```bash
npm view rudycanshoot version           # should show the new version
npx -y rudycanshoot@latest --version    # end-to-end: what MCP users will get
```

Then restart your AI tool and confirm the new tool appears (e.g. ask it to `record_terminal`).

## Checklist

- [ ] `npm whoami` succeeds (logged in, maintainer of the package)
- [ ] Version bumped in **both** `package.json` and `src/server.js`
- [ ] `CHANGELOG.md` has a dated entry for the new version
- [ ] `npm publish --dry-run` tarball looks right (no stray files; `files` in package.json is correct)
- [ ] Published, tagged, GitHub release created
- [ ] `npx -y rudycanshoot@latest --version` shows the new version
