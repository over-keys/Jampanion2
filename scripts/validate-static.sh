#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB="$ROOT/src/Jampanion.Web"
CORE="$ROOT/src/Jampanion.Core"
HOST="$WEB/web-src/jazz-chart-host.js"
AUDIO="$WEB/web-src/jampanion-audio.js"
VIEWER="$WEB/wwwroot/viewer/index.html"
HELP="$WEB/wwwroot/viewer/help.html"
HELP_EN="$WEB/wwwroot/viewer/help.en.html"
INDEX="$WEB/wwwroot/index.html"

test -s "$CORE/Jampanion.Core.csproj"
test -s "$WEB/Jampanion.Web.csproj"
grep -q '<PublishTrimmed>true</PublishTrimmed>' "$WEB/Jampanion.Web.csproj"
grep -q '<TrimMode>partial</TrimMode>' "$WEB/Jampanion.Web.csproj"
grep -q '<SuppressTrimAnalysisWarnings>false</SuppressTrimAnalysisWarnings>' "$WEB/Jampanion.Web.csproj"
if grep -q '<RunAOTCompilation>true</RunAOTCompilation>' "$WEB/Jampanion.Web.csproj"; then
  echo "AOT must remain disabled for this size-focused experiment." >&2
  exit 1
fi
grep -q 'dotnet workload install wasm-tools' "$ROOT/.github/workflows/deploy-pages.yml"
test -s "$HOST"
test -s "$AUDIO"
test -s "$VIEWER"

node --check "$HOST"
node --check "$AUDIO"

retired_web_paths=(
  "src/Jampanion.Web/Pages/Home.razor.cs"
  "src/Jampanion.Web/Audio/WebSessionPlanner.cs"
  "src/Jampanion.Web/Models/WebSongDocument.cs"
  "src/Jampanion.Web/Models/WebUiModels.cs"
  "src/Jampanion.Web/Services/ChordSymbolTransposer.cs"
  "src/Jampanion.Web/Services/LazyBuiltInSongCatalog.cs"
  "src/Jampanion.Web/web-src/jampanion-browser.js"
  "src/Jampanion.Web/wwwroot/icons/jampanion-512.png"
  "src/Jampanion.Web/wwwroot/icons/jampanion-maskable-192.png"
  "src/Jampanion.Web/wwwroot/icons/jampanion-maskable-512.png"
)
for retired in "${retired_web_paths[@]}"; do
  if [[ -e "$ROOT/$retired" ]]; then
    echo "Retired Web runtime file is still present: $retired" >&2
    exit 1
  fi
done

viewer_icon_bytes="$(wc -c < "$WEB/wwwroot/icons/jampanion-viewer.png" | tr -d '[:space:]')"
if (( viewer_icon_bytes >= 100000 )); then
  echo "Viewer Mode icon is unexpectedly large: ${viewer_icon_bytes} bytes" >&2
  exit 1
fi

node "$ROOT/scripts/test-jazz-timing.mjs" "$HOST"
python3 "$ROOT/scripts/test-app-invariants.py"
"$ROOT/scripts/test-tempo-state.sh"
"$ROOT/scripts/test-chart-bridge.sh"

node "$ROOT/scripts/test-viewer-contract.mjs" "$VIEWER"
node "$ROOT/scripts/build-local-viewer.mjs"
node "$ROOT/scripts/test-local-viewer.mjs" "$ROOT/local-viewer/index.html"
node "$ROOT/scripts/test-viewer-navigation.mjs" "$VIEWER"
node "$ROOT/scripts/test-help-contract.mjs" "$HELP"
node "$ROOT/scripts/test-help-en-contract.mjs" "$HELP_EN"
node "$ROOT/scripts/test-shell-contract.mjs" \
  "$INDEX" "$WEB/App.razor"

legacy_hits="$(grep -R -n \
  --exclude-dir=node_modules --exclude-dir=bin --exclude-dir=obj --exclude-dir=js \
  -E 'JAMP_REPO|JCV_REPO|build-integrated|integration/overlay|customize-(shell|viewer|help|background-playback)|git clone .*Jampanion|git clone .*Jazz-Chart-Viewer' \
  "$ROOT/src" "$ROOT/scripts" "$ROOT/.github/workflows" \
  | grep -v '/validate-static.sh:' || true)"
if [[ -n "$legacy_hits" ]]; then
  printf '%s\n' "$legacy_hits" >&2
  echo 'Retired integration dependency found in build-relevant source.' >&2
  exit 1
fi

grep -q 'const APP_VERSION = "45"' "$INDEX"
test -s "$WEB/wwwroot/app-version.json"
grep -q '"version": "45"' "$WEB/wwwroot/app-version.json"
grep -q 'The app could not start after automatic cache recovery. Press Reload to try again.' "$INDEX"
grep -q 'web-src/jazz-chart-host.js' "$WEB/scripts/build-audio.mjs"
grep -q 'url("assets/MuseJazzText.otf")' "$WEB/wwwroot/viewer/index.html"
! grep -q 'cdn.jsdelivr.net.*MuseJazzText.otf' "$WEB/wwwroot/viewer/index.html"
test -s "$WEB/wwwroot/viewer/assets/MuseJazzText.otf"
test -s "$WEB/wwwroot/viewer/licenses/MuseJazzText-OFL-1.1.txt"

# Preserve startup and Pages regression guards from the pre-refactor validation.
! grep -q 'await notifyBootstrap(bootstrap)' "$HOST"
grep -q 'return getBootstrap();' "$HOST"
grep -q 'await loadNativeSongs();' "$HOST"
! grep -q 'void loadNativeSongs().then' "$HOST"
grep -q 'initialized = true' "$HOST"
stale_v11="$(grep -R -n --exclude-dir=node_modules --exclude-dir=bin --exclude-dir=obj --exclude-dir=js -E 'jampanion-jcv-v11|integrated=11|jazz-chart-host.js\?v=11|embedded-bridge="v11"' "$ROOT/src" "$ROOT/scripts" | grep -v '/validate-static.sh:' || true)"
if [[ -n "$stale_v11" ]]; then
  printf '%s\n' "$stale_v11" >&2
  echo 'Stale v11 integration identifier found.' >&2
  exit 1
fi
pages_tmp="$(mktemp -d)"
trap 'rm -rf "$pages_tmp"' EXIT
printf '%s\n' '<base href="/" />' > "$pages_tmp/index.html"
"$ROOT/scripts/prepare-pages.sh" "$pages_tmp" test-repository
grep -q '<base href="/test-repository/" />' "$pages_tmp/index.html"
test -s "$pages_tmp/404.html"

echo 'Self-contained Jampanion2 validation passed.'
