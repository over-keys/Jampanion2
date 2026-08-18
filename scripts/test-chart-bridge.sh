#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VIEWER="$ROOT/src/Jampanion.Web/wwwroot/viewer/index.html"
HOST="$ROOT/src/Jampanion.Web/web-src/jazz-chart-host.js"

grep -q 'data-jampanion-embedded-bridge="v12"' "$VIEWER"
grep -q 'initializeEmbeddedViewer' "$VIEWER"
grep -q 'placeholder="irealb://..."' "$VIEWER"
grep -q 'BRIDGE_CHANNEL = "jampanion-jcv-v12"' "$HOST"
grep -q 'case "compilePlayback"' "$HOST"
grep -q 'requestEmbedded("compilePlayback"' "$HOST"
grep -q 'case "saveCurrentChart"' "$HOST"

echo 'Internal chart bridge test passed.'
