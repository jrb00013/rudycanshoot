#!/usr/bin/env bash
# Publish rudycanshoot: bump version → changelog → commit/push → npm → GitHub release
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

usage() {
  cat <<'EOF'
Usage: scripts/publish.sh [patch|minor|major|<x.y.z>] [options]

Automates version bump, git push, npm publish, and GitHub release.

Options:
  -m, --message <text>   Changelog bullet (repeatable). Default: "Release <version>"
  -n, --dry-run          Show what would happen; do not commit/publish
  --no-tests             Skip npm test
  -h, --help             Show this help

Examples:
  scripts/publish.sh patch -m "fix black VLC recordings (yuv420p)"
  scripts/publish.sh minor -m "Add new MCP tool" -m "Docs update"
  scripts/publish.sh 1.2.0 -m "Big release"
EOF
}

die() { echo "error: $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "missing required command: $1"; }

BUMP="patch"
DRY_RUN=0
RUN_TESTS=1
MESSAGES=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    patch|minor|major) BUMP="$1"; shift ;;
    [0-9]*.[0-9]*.[0-9]*) BUMP="$1"; shift ;;
    -m|--message) [[ $# -ge 2 ]] || die "--message needs a value"; MESSAGES+=("$2"); shift 2 ;;
    -n|--dry-run) DRY_RUN=1; shift ;;
    --no-tests) RUN_TESTS=0; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown arg: $1 (try --help)" ;;
  esac
done

need node
need npm
need git
need gh
need curl
need python3

[[ -f package.json ]] || die "run from repo root (package.json missing)"
git rev-parse --is-inside-work-tree >/dev/null || die "not a git repo"

# Prefer a real Node install over Cursor Agent's npm (wrong global prefix / broken publishes).
if [[ -x "$HOME/.nvm/versions/node/$(ls "$HOME/.nvm/versions/node" 2>/dev/null | tail -1)/bin/npm" ]]; then
  NVM_NODE="$(ls -1 "$HOME/.nvm/versions/node" | tail -1)"
  export PATH="$HOME/.nvm/versions/node/$NVM_NODE/bin:$PATH"
fi
hash -r
export NPM_CONFIG_PREFIX="$(npm config get prefix 2>/dev/null | grep -v cursor-agent || true)"
if [[ -z "${NPM_CONFIG_PREFIX:-}" ]] || [[ "${NPM_CONFIG_PREFIX}" == *cursor-agent* ]]; then
  if [[ -d "$HOME/.nvm/versions/node" ]]; then
    NVM_NODE="$(ls -1 "$HOME/.nvm/versions/node" | tail -1)"
    export NPM_CONFIG_PREFIX="$HOME/.nvm/versions/node/$NVM_NODE"
    export PATH="$NPM_CONFIG_PREFIX/bin:$PATH"
  fi
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
[[ "$BRANCH" == "main" || "$BRANCH" == "master" ]] || die "publish from main/master (on $BRANCH)"

OLD_VERSION="$(node -p "require('./package.json').version")"
echo "current version: $OLD_VERSION"
echo "npm: $(command -v npm)  prefix=${NPM_CONFIG_PREFIX:-"(default)"}"

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "[dry-run] would bump: npm version $BUMP --no-git-tag-version"
  echo "[dry-run] would commit, push, npm publish, gh release create"
  exit 0
fi

if [[ -n "$(git status --porcelain)" ]]; then
  die "working tree is dirty — commit or stash first"
fi

# Auth checks
npm whoami >/dev/null 2>&1 || die "not logged into npm (npm login / token in ~/.npmrc)"
gh auth status >/dev/null 2>&1 || die "gh not authenticated (gh auth login)"

if [[ "$RUN_TESTS" -eq 1 ]]; then
  echo "→ tests"
  npm test
fi

echo "→ bump version ($BUMP)"
npm version "$BUMP" --no-git-tag-version >/dev/null
VERSION="$(node -p "require('./package.json').version")"
TAG="v$VERSION"
DATE="$(date +%Y-%m-%d)"

if [[ ${#MESSAGES[@]} -eq 0 ]]; then
  MESSAGES=("Release $VERSION")
fi

echo "→ changelog $VERSION"
python3 - "$VERSION" "$DATE" "${MESSAGES[@]}" <<'PY'
import sys
from pathlib import Path

version, date, *bullets = sys.argv[1:]
path = Path("CHANGELOG.md")
text = path.read_text()
header = "# Changelog\n\n## [Unreleased]\n"
block_lines = [f"## [{version}] - {date}", "", "### Changed"]
for b in bullets:
    block_lines.append(f"- {b}")
block = "\n".join(block_lines) + "\n"

if f"## [{version}]" in text:
    print(f"changelog already has {version}; leaving as-is", file=sys.stderr)
    raise SystemExit(0)

if "## [Unreleased]" in text:
    # Keep an empty Unreleased section and insert the new release after it.
    parts = text.split("## [Unreleased]", 1)
    rest = parts[1]
    # Drop a leading blank line after Unreleased
    rest = rest.lstrip("\n")
    text = f"{parts[0]}## [Unreleased]\n\n{block}\n{rest}"
else:
    text = header + "\n" + block + "\n" + text
path.write_text(text)
print(f"wrote CHANGELOG entry for {version}")
PY

echo "→ commit & push"
git add package.json package-lock.json CHANGELOG.md
git commit -m "chore(release): publish v${VERSION}"
git push

echo "→ npm publish"
npm publish --access public

echo "→ wait for registry tarball"
TARBALL_URL="https://registry.npmjs.org/rudycanshoot/-/rudycanshoot-${VERSION}.tgz"
for i in $(seq 1 30); do
  code="$(curl -sS -o /dev/null -w '%{http_code}' "$TARBALL_URL" || true)"
  if [[ "$code" == "200" ]]; then
    echo "tarball ready ($code)"
    break
  fi
  echo "  attempt $i: HTTP $code — retrying…"
  sleep 2
  if [[ "$i" -eq 30 ]]; then
    die "npm tarball not available after publish: $TARBALL_URL"
  fi
done

TMP_TGZ="$(mktemp /tmp/rudycanshoot-${VERSION}-XXXX.tgz)"
curl -fsSL -o "$TMP_TGZ" "$TARBALL_URL"

NOTES="$(python3 - "$VERSION" "${MESSAGES[@]}" <<'PY'
import sys
version, *bullets = sys.argv[1:]
lines = [
    f"## rudycanshoot {version}",
    "",
    f"Same package as npm: [`rudycanshoot@{version}`](https://www.npmjs.com/package/rudycanshoot/v/{version})",
    "",
    "### Install",
    "",
    "```bash",
    f"npm install -g rudycanshoot@{version}",
    "```",
    "",
    "### Notes",
    "",
]
for b in bullets:
    lines.append(f"- {b}")
print("\n".join(lines))
PY
)"

echo "→ GitHub release $TAG"
if gh release view "$TAG" >/dev/null 2>&1; then
  echo "release $TAG exists — uploading tarball"
  gh release upload "$TAG" "$TMP_TGZ" --clobber
else
  gh release create "$TAG" "$TMP_TGZ" \
    --title "rudycanshoot $TAG" \
    --target "$(git rev-parse HEAD)" \
    --notes "$NOTES"
fi
rm -f "$TMP_TGZ"

echo
echo "published rudycanshoot@${VERSION}"
echo "  npm:     https://www.npmjs.com/package/rudycanshoot"
echo "  release: https://github.com/jrb00013/rudycanshoot/releases/tag/${TAG}"
