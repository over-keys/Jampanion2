#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOGIC="$ROOT/integration/overlay/src/Jampanion.Web/Pages/IntegratedHomeLogic.cs"
MODELS="$ROOT/integration/overlay/src/Jampanion.Web/Models/JazzChartModels.cs"
HOST="$ROOT/integration/overlay/src/Jampanion.Web/wwwroot/js/jazz-chart-host.js"
HOME_RAZOR="$ROOT/integration/overlay/src/Jampanion.Web/Pages/Home.razor"

grep -q 'var identityChanged = forceAccompanimentSettings || !_hasBootstrap' "$LOGIC"
grep -q 'TempoIsExplicit = bootstrap.TempoExplicit;' "$LOGIC"
grep -q ': DefaultTempoForStyle(SelectedStyle);' "$LOGIC"
grep -q 'TempoIsExplicit = true;' "$LOGIC"
grep -q 'if (!TempoIsExplicit)' "$LOGIC"
grep -q 'AccompanimentStyle.JazzBallad => 70' "$LOGIC"
grep -q 'AccompanimentStyle.BossaNova => 140' "$LOGIC"
grep -q '_ => 120' "$LOGIC"
grep -q 'AccompanimentStyle.JazzWaltz => 150' "$LOGIC"
grep -q 'AccompanimentStyle.AfroCubanLatin => 180' "$LOGIC"
grep -q 'bool TempoExplicit' "$MODELS"
grep -q 'function defaultTempoForStyle(style)' "$HOST"
grep -q 'case "JazzBallad": return 70;' "$HOST"
grep -q 'case "BossaNova": return 140;' "$HOST"
grep -q 'case "JazzWaltz": return 150;' "$HOST"
grep -q 'case "AfroCubanLatin": return 180;' "$HOST"
grep -q 'tempoExplicit: tempoExplicit === true' "$HOST"
grep -q 'stored.tempoExplicit == null && storedTempo != null' "$HOST"
if grep -q 'storedTempo !== 140' "$HOST"; then
  echo 'Legacy 140 migration heuristic must not be present.' >&2
  exit 1
fi
grep -q './js/jazz-chart-host.js?v=33' "$LOGIC"
grep -q 'viewer/index.html?integrated=13' "$HOME_RAZOR"
echo 'Style-aware tempo regression checks passed.'

! grep -q 'AutomaticThemeReturnEnabled' "$LOGIC"
! grep -q 'TryQueueAutomaticHeadOutAsync' "$LOGIC"
! grep -q 'Theme Return' "$HOME_RAZOR"
grep -q 'extractIRealTempoFromRecord' "$HOST"
grep -q 'fields\[musicIndex + 2\]' "$HOST"
grep -q 'validTempo(song?.tempoBpm) ?? iRealTempoForSong(song)' "$HOST"

grep -q 'TempoIsUserSet = bootstrap.TempoUserExplicit;' "$LOGIC"
! grep -q 'ResetTempoAutoAsync' "$LOGIC"
grep -q 'SaveAccompanimentSettingsAsync' "$LOGIC"
grep -q 'HasUnsavedChanges' "$HOME_RAZOR"
grep -q 'extractIRealPlayerStyleFromRecord' "$HOST"
grep -q 'stored.accompanimentStyle || sourcePlayerStyle || inferredStyle(song)' "$HOST"
grep -q 'step="5"' "$HOME_RAZOR"
