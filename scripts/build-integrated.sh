#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="${ROOT}/.build"
JCV_SHA='d7b3c523aeaac411d0048288e3af48749286a9d3'
JAMP_SHA='d216b4c9658e93347ea42b9fd082900be8bf6d98'
JCV_REPO='https://github.com/over-keys/Jazz-Chart-Viewer.git'
JAMP_REPO='https://github.com/over-keys/Jampanion.git'

command -v git >/dev/null || { echo 'git is required' >&2; exit 1; }
command -v dotnet >/dev/null || { echo '.NET SDK 10 is required' >&2; exit 1; }
command -v node >/dev/null || { echo 'Node.js 24 is required' >&2; exit 1; }
command -v npm >/dev/null || { echo 'npm is required' >&2; exit 1; }

rm -rf "$WORK" "$ROOT/dist"
mkdir -p "$WORK"

git clone --quiet --filter=blob:none "$JCV_REPO" "$WORK/Jazz-Chart-Viewer"
git -C "$WORK/Jazz-Chart-Viewer" checkout --quiet "$JCV_SHA"

git clone --quiet --filter=blob:none "$JAMP_REPO" "$WORK/Jampanion"
git -C "$WORK/Jampanion" checkout --quiet "$JAMP_SHA"

# Complete integration files replace/add files inside the disposable build checkout.
cp -R "$ROOT/integration/overlay/." "$WORK/Jampanion/"

# Jazz Chart Viewer itself is bundled unchanged under viewer/. This is the chart source
# of truth at runtime; Jampanion does not convert it to ChordPro.
VIEWER="$WORK/Jampanion/src/Jampanion.Web/wwwroot/viewer"
rm -rf "$VIEWER"
mkdir -p "$VIEWER"
(
  cd "$WORK/Jazz-Chart-Viewer"
  tar --exclude='.git' --exclude='.github' -cf - .
) | (cd "$VIEWER" && tar -xf -)

# Keep the bundled Jazz Chart Viewer UI/search unchanged, but add a non-visual
# postMessage bridge so accompaniment never depends on direct iframe DOM access.
node "$ROOT/scripts/customize-viewer.mjs" "$VIEWER/index.html"
node "$ROOT/scripts/test-viewer-contract.mjs" "$VIEWER/index.html"

# Build the exact Jampanion browser audio backend from the pinned source.
(
  cd "$WORK/Jampanion/src/Jampanion.Web"
  npm install --no-audit --no-fund
  npm run build
)

# Jampanion's audio build intentionally removes wwwroot/js before regenerating
# its audio assets. Restore the integration bridge after that cleanup so it is
# present in the published site.
mkdir -p "$WORK/Jampanion/src/Jampanion.Web/wwwroot/js"
cp "$ROOT/integration/overlay/src/Jampanion.Web/wwwroot/js/jazz-chart-host.js" \
  "$WORK/Jampanion/src/Jampanion.Web/wwwroot/js/jazz-chart-host.js"

dotnet publish "$WORK/Jampanion/src/Jampanion.Web/Jampanion.Web.csproj" \
  -c Release \
  -o "$WORK/publish"

cp -R "$WORK/publish/wwwroot" "$ROOT/dist"
touch "$ROOT/dist/.nojekyll"

# Development/local build uses root base path. GitHub Pages workflow rewrites this.
test -f "$ROOT/dist/index.html"
test -f "$ROOT/dist/viewer/index.html"
test -f "$ROOT/dist/js/jazz-chart-host.js"
test -f "$ROOT/dist/js/jampanion-audio.js"

echo "Integrated site: $ROOT/dist"
