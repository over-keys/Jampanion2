#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cat > "$TMP/index.html" <<'HTML'
<!doctype html><html><body><div id="chartPage"></div><textarea id="importText" placeholder="irealbook://..."></textarea></body></html>
HTML
node "$ROOT/scripts/customize-viewer.mjs" "$TMP/index.html"
grep -q 'data-jampanion-embedded-bridge="v12"' "$TMP/index.html"
grep -q 'initializeEmbeddedViewer' "$TMP/index.html"
grep -q 'placeholder="irealb://..."' "$TMP/index.html"
grep -q 'BRIDGE_CHANNEL = "jampanion-jcv-v12"' "$ROOT/integration/overlay/src/Jampanion.Web/wwwroot/js/jazz-chart-host.js"
grep -q 'case "compilePlayback"' "$ROOT/integration/overlay/src/Jampanion.Web/wwwroot/js/jazz-chart-host.js"
grep -q 'requestEmbedded("compilePlayback"' "$ROOT/integration/overlay/src/Jampanion.Web/wwwroot/js/jazz-chart-host.js"
grep -q 'case "saveCurrentChart"' "$ROOT/integration/overlay/src/Jampanion.Web/wwwroot/js/jazz-chart-host.js"
echo 'Chart bridge packaging test passed.'
