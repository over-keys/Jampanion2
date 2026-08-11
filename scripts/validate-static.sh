#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOST="$ROOT/integration/overlay/src/Jampanion.Web/wwwroot/js/jazz-chart-host.js"
HOME="$ROOT/integration/overlay/src/Jampanion.Web/Pages/Home.razor"
LOGIC="$ROOT/integration/overlay/src/Jampanion.Web/Pages/IntegratedHomeLogic.cs"

node --check "$HOST"
node "$ROOT/scripts/test-jazz-timing.mjs" "$HOST"
python3 "$ROOT/scripts/test-integration-invariants.py"
"$ROOT/scripts/test-tempo-state.sh"
"$ROOT/scripts/test-chart-bridge.sh"

# Initial JS -> .NET state transfer must return directly. A callback made before
# initialize() returns can deadlock/re-enter WebAssembly startup.
! grep -q 'await notifyBootstrap(bootstrap)' "$HOST"
grep -q 'return getBootstrap();' "$HOST"

# Song search remains the upstream Jazz Chart Viewer control. The Jampanion
# sidebar must not contain a second search box or hide .toolbar-main.
! grep -q 'placeholder="Search title or composer"' "$HOME"
grep -q 'src="viewer/index.html?integrated=13"' "$HOME"
grep -q '>Accompaniment<' "$HOME"
grep -q 'TryConnectChartAsync' "$LOGIC"
! grep -q 'disabled="@(!ChartReady || IsLoading)"' "$HOME"
grep -q 'disabled="@IsLoading"' "$HOME"
grep -q 'if (!await TryConnectChartAsync(reportFailure: true)' "$LOGIC"
grep -q 'BRIDGE_CHANNEL = "jampanion-jcv-v12"' "$HOST"
grep -q 'requestEmbedded("getState"' "$HOST"
grep -q 'initializeEmbeddedViewer' "$HOST"
grep -q 'postMessage' "$HOST"
grep -q 'data-jampanion-embedded-bridge="v12"' "$ROOT/scripts/customize-viewer.mjs"
grep -q 'node "$ROOT/scripts/customize-viewer.mjs" "$VIEWER/index.html"' "$ROOT/scripts/build-integrated.sh"
grep -q 'initializeEmbeddedViewer' "$ROOT/scripts/customize-viewer.mjs"
! grep -q 'toolbar-main.*display:none' "$HOST"
grep -q 'customize-viewer.mjs.*VIEWER/index.html' "$ROOT/scripts/build-integrated.sh"
grep -q 'customize-help.mjs.*VIEWER/help.html' "$ROOT/scripts/build-integrated.sh"
grep -q 'customize-help-en.mjs.*VIEWER/help.en.html' "$ROOT/scripts/build-integrated.sh"
grep -q 'id="jampanion"' "$ROOT/scripts/customize-help.mjs"
grep -q 'test-help-contract.mjs.*VIEWER/help.html' "$ROOT/scripts/build-integrated.sh"
grep -q 'test-help-en-contract.mjs.*VIEWER/help.en.html' "$ROOT/scripts/build-integrated.sh"
grep -q 'customize-shell.mjs' "$ROOT/scripts/build-integrated.sh"
grep -q 'test-shell-contract.mjs' "$ROOT/scripts/build-integrated.sh"
grep -q 'APP_VERSION = "29"' "$ROOT/scripts/customize-shell.mjs"
grep -q 'help.html?v=29' "$ROOT/scripts/customize-viewer.mjs"
grep -q 'help.en.html?v=29' "$ROOT/scripts/customize-viewer.mjs"
grep -q 'help.css?v=29' "$ROOT/scripts/customize-help.mjs"
grep -q 'jazz-chart-host.js?v=24' "$ROOT/scripts/customize-viewer.mjs"
grep -q 'jazz-chart-host.js?v=36' "$ROOT/integration/overlay/src/Jampanion.Web/Pages/IntegratedHomeLogic.cs"

# Native IndexedDB loading is asynchronous and must not block ChartReady.
grep -q 'void loadNativeSongs().then' "$HOST"
! grep -q 'await loadNativeSongs();' "$HOST"
grep -q 'initialized = true' "$HOST"

grep -q 'StartTick' "$ROOT/integration/overlay/src/Jampanion.Core/Music/ChordChange.cs"
grep -q 'GetChordAtTick' "$ROOT/integration/overlay/src/Jampanion.Core/Music/TuneBar.cs"
! grep -q 'jazz-chart-loader.html' "$HOME"
echo 'Static integration checks passed.'

# The upstream Jampanion audio build deletes wwwroot/js. The integration bridge
# must therefore be restored after `npm run build` and before dotnet publish.
python3 - "$ROOT/scripts/build-integrated.sh" <<'PY2'
from pathlib import Path
import sys
s = Path(sys.argv[1]).read_text()
npm = s.find('npm run build')
restore = s.find('cp "$ROOT/integration/overlay/src/Jampanion.Web/wwwroot/js/jazz-chart-host.js"')
publish = s.find('dotnet publish')
assert npm >= 0 and restore > npm and publish > restore, 'bridge JS must be restored after npm build and before publish'
PY2

! grep -q 'AutomaticThemeReturnEnabled' "$LOGIC"
! grep -q 'TryQueueAutomaticHeadOutAsync' "$LOGIC"
! grep -q 'ReceiveMidiMessage' "$LOGIC"
! grep -q 'ReferenceEnergyPercent' "$LOGIC"
! grep -q 'CurrentEnergyPercent' "$LOGIC"
! grep -q 'Theme Return' "$HOME"
grep -q 'selectMidiInput", SelectedMidiInputId, (object?)null' "$LOGIC"

# Audio/MIDI settings remain available even though performance-energy analysis is disabled.
grep -q '>Audio &amp; MIDI<' "$HOME"
grep -q '<span>MIDI input</span>' "$HOME"
grep -q '<option value="">Built-in Trio</option>' "$HOME"
grep -q 'ToggleSettingsAsync' "$HOME"
grep -q 'await RefreshMidiAsync();' "$LOGIC"
grep -q 'Built-in Trio selected' "$LOGIC"

# v12 review fixes
grep -q 'search.disabled = playing' "$HOST"
grep -q 'bar.chordSlots.splice(slotIndex, 1)' "$HOST"
grep -q 'extractIRealPlayerStyleFromRecord' "$HOST"
grep -q 'viewer.parseIRealCollection' "$HOST"
grep -q 'name: "spaceShortcut"' "$HOST"
grep -q 'step="5"' "$HOME"
! grep -q 'ResetTempoAutoAsync' "$LOGIC"
grep -q 'SaveAccompanimentSettingsAsync' "$LOGIC"
grep -q 'HasUnsavedChanges' "$HOME"
! grep -q 'Save chart' "$HOME"
! grep -q 'Panic' "$HOME"
grep -q 'jamp-mobile-controls' "$HOME"
grep -q 'session-controls' "$HOME"
grep -q 'saveCurrentChart' "$HOST"
grep -q 'stageNative(song)' "$HOST"
grep -q 'saveMixerPreferences' "$LOGIC"
grep -q 'getMixerPreferences' "$LOGIC"
grep -q 'replaceContinuation' "$LOGIC"
grep -q 'TruncateHarmonyAtTick' "$ROOT/integration/overlay/src/Jampanion.Web/Audio/IntegratedSessionPlanner.cs"

# Interactive Space controls and exact first-bar deletion semantics.
grep -q 'shortcutBelongsToInteractiveControl' "$HOST"
grep -q 'tag === "button"' "$HOST"
grep -q 'const prior = output.at(-1)?.chords?.at(-1)?.symbol || "N.C."' "$HOST"

# Tempo rollback must preserve the prior Auto/manual ownership state.
grep -q 'previousTempoExplicit' "$LOGIC"
grep -q 'previousTempoUserSet' "$LOGIC"

# No stale integration-version identifiers are allowed in source or packaging scripts.
stale_v11="$(grep -R -n -E 'jampanion-jcv-v11|integrated=11|jazz-chart-host.js\?v=11|embedded-bridge="v11"' \
  "$ROOT/integration" "$ROOT/scripts" | grep -v '/validate-static.sh:' || true)"
if [[ -n "$stale_v11" ]]; then
  printf '%s\n' "$stale_v11" >&2
  echo 'Stale v11 integration identifier found.' >&2
  exit 1
fi

# Verify GitHub Pages base-path rewriting on the local macOS toolchain and the
# Ubuntu runner used by the workflow. prepare-pages.sh must not rely on one
# sed -i dialect.
pages_tmp="$(mktemp -d)"
trap 'rm -rf "$pages_tmp"' EXIT
printf '%s\n' '<base href="/" />' > "$pages_tmp/index.html"
./scripts/prepare-pages.sh "$pages_tmp" "test-repository"
grep -q '<base href="/test-repository/" />' "$pages_tmp/index.html"
test -s "$pages_tmp/404.html"
echo 'GitHub Pages base-path test passed.'
