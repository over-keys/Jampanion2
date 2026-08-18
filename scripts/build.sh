#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB="$ROOT/src/Jampanion.Web"
BUILD="$ROOT/.build"
PUBLISH="$BUILD/publish"

command -v dotnet >/dev/null || { echo '.NET SDK 10 is required' >&2; exit 1; }
command -v node >/dev/null || { echo 'Node.js 24 is required' >&2; exit 1; }
command -v npm >/dev/null || { echo 'npm is required' >&2; exit 1; }

test -f "$ROOT/src/Jampanion.Core/Jampanion.Core.csproj"
test -f "$WEB/Jampanion.Web.csproj"
test -f "$WEB/wwwroot/viewer/index.html"
test -f "$WEB/web-src/jazz-chart-host.js"

rm -rf "$BUILD" "$ROOT/dist" \
  "$ROOT/src/Jampanion.Core/bin" "$ROOT/src/Jampanion.Core/obj" \
  "$WEB/bin" "$WEB/obj"
mkdir -p "$BUILD"

(
  cd "$WEB"
  npm ci --no-audit --no-fund
  npm run build
)

dotnet publish "$WEB/Jampanion.Web.csproj" \
  -c Release \
  -o "$PUBLISH"

cp -R "$PUBLISH/wwwroot" "$ROOT/dist"
touch "$ROOT/dist/.nojekyll"

test -s "$ROOT/dist/index.html"
test -s "$ROOT/dist/viewer/index.html"
test -s "$ROOT/dist/js/jazz-chart-host.js"
test -s "$ROOT/dist/js/jampanion-audio.js"
test -s "$ROOT/dist/soundfonts/FluidR3_Jampanion.sf3"

echo "Jampanion2 site: $ROOT/dist"
