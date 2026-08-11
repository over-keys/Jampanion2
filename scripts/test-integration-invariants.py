#!/usr/bin/env python3
from pathlib import Path
root = Path(__file__).resolve().parents[1]
host = (root / "integration/overlay/src/Jampanion.Web/wwwroot/js/jazz-chart-host.js").read_text()
logic = (root / "integration/overlay/src/Jampanion.Web/Pages/IntegratedHomeLogic.cs").read_text()
planner = (root / "integration/overlay/src/Jampanion.Web/Audio/IntegratedSessionPlanner.cs").read_text()
home = (root / "integration/overlay/src/Jampanion.Web/Pages/Home.razor").read_text()
style_change_method = logic[logic.find('protected async Task ChangeStyleAsync'):logic.find('private static int DefaultTempoForStyle')]
tempo_change_method = logic[logic.find('private async Task RebuildLiveTempoAsync'):logic.find('private async Task QueueStyleChangeAsync')]

checks = {
    "playback disables original search": 'search.disabled = playing' in host,
    "playback locks selected song": 'playbackLockedSongId' in host,
    "embedded Space forwards to parent": 'name: "spaceShortcut"' in host,
    "Space shortcut ignores interactive controls": 'shortcutBelongsToInteractiveControl' in host and 'tag === "button"' in host and '.search-options' in host,
    "native iReal can restore original": 'viewer.parseIRealCollection' in host and 'originalSourceRecord' in host,
    "3/4 style menu is constrained": 'resolvedMeterAt(song.bars || [], sourceIndex) === "3/4"' in host,
    "empty edit removes a chord": 'bar.chordSlots.splice(slotIndex, 1)' in host,
    "later first-bar chord is not pulled to beat one": 'const prior = output.at(-1)?.chords?.at(-1)?.symbol || "N.C."' in host,
    "iReal player style precedes chart inference": 'stored.accompanimentStyle || sourcePlayerStyle || inferredStyle(song)' in host,
    "subbeat duration sees all chord changes": '.Where(candidate => candidate.StartTick > change.StartTick)' in planner,
    "old harmony is truncated at offbeat change": 'TruncateHarmonyAtTick(notes, exactTick)' in planner,
    "waltz count-in includes beat two": 'beatsPerBar == 4 && bar == 0 && beat % 2 != 0' in planner,
    "playback uses Viewer-rendered normalized grid": 'captureSourceTiming' in host and 'dataset.gridStart' in host and 'gridCellToTick(start, total, activeMeter)' in host,
    "start locks chart before compilation": logic.find('InvokeVoidAsync("setPlaybackState", true, -1)') < logic.find('InvokeAsync<JazzPlaybackFormDto>("compilePlayback")'),
    "start failure stops audio": 'await startedAudio.InvokeVoidAsync("stopSession")' in logic,
    "start preparation is cancelable": 'generationVersion != _generationVersion' in logic and 'await Task.Yield();' in logic and '@(!IsPlaying && !IsLoading)' in home,
    "style changes use four-bar boundary": 'SequenceIndex % SessionConstants.BarsPerSegment == 0' in logic,
    "style continuation is replaced, not rebased immediately": '"replaceContinuation"' in logic,
    "style changes preserve the current tempo": 'TempoBpm = DefaultTempoForStyle(SelectedStyle)' not in style_change_method,
    "tempo changes wait for a bar boundary": 'NextBarBoundary' in tempo_change_method and 'next bar boundary' in tempo_change_method,
    "tempo continuation is replaced without rebasing": '"replaceContinuation"' in tempo_change_method and '"replaceSession"' not in tempo_change_method,
    "Ending appends the native final tonic hold": 'EndingPlanBuilder.Build' in planner and 'headOutRendered = true' in planner and 'Ending / final tonic' in planner,
    "Ending retains the root-hold plan inputs": 'headOutExactTune.TonicChord' in planner and 'endingPlan.LengthTicks' in planner,
    "all edits share one explicit save": 'SaveAccompanimentSettingsAsync' in logic and 'HasUnsavedChanges' in home and 'saveCurrentChart' in logic and 'SaveSongSettingsAsync' in logic,
    "mobile controls are separated from the mix": 'jamp-mobile-controls' in home and 'position:fixed; top:0; left:0; right:0; z-index:30; order:1;' in (root / "integration/overlay/src/Jampanion.Web/wwwroot/css/jazz-integration.css").read_text() and '.mix-panel { order:3;' in (root / "integration/overlay/src/Jampanion.Web/wwwroot/css/jazz-integration.css").read_text(),
    "mobile controls stay compact": 'height:56px' in (root / "integration/overlay/src/Jampanion.Web/wwwroot/css/jazz-integration.css").read_text() and 'height:50px' in (root / "integration/overlay/src/Jampanion.Web/wwwroot/css/jazz-integration.css").read_text(),
    "mobile brand text is hidden": 'jamp-brand-row strong { display:none; }' in (root / "integration/overlay/src/Jampanion.Web/wwwroot/css/jazz-integration.css").read_text(),
    "Jampanion2 brand is shown": '<strong>Jampanion2</strong>' in home and '<PageTitle>Jampanion2</PageTitle>' in home,
    "startup brand is customized": 'customize-shell.mjs' in (root / "scripts/build-integrated.sh").read_text() and 'Jampanion2' in (root / "scripts/customize-shell.mjs").read_text(),
    "cache-busted page versions": 'APP_VERSION = "29"' in (root / "scripts/customize-shell.mjs").read_text() and 'help.html?v=29' in (root / "scripts/customize-viewer.mjs").read_text() and 'help.en.html?v=29' in (root / "scripts/customize-viewer.mjs").read_text() and 'jazz-chart-host.js?v=21' in (root / "scripts/customize-viewer.mjs").read_text() and 'help.css?v=29' in (root / "scripts/customize-help.mjs").read_text() and 'jazz-chart-host.js?v=33' in logic and 'viewer/index.html?integrated=13' in home,
    "English Jampanion help is built": 'customize-help-en.mjs' in (root / "scripts/build-integrated.sh").read_text() and 'test-help-en-contract.mjs' in (root / "scripts/build-integrated.sh").read_text(),
    "transpose is saved with accompaniment settings": 'CurrentSemitoneShift' in logic and 'SemitoneShift' in (root / "integration/overlay/src/Jampanion.Web/Models/JazzChartModels.cs").read_text() and 'semitoneShift' in host and 'saveSongSettings' in logic,
    "standalone viewer has Save": 'installStandaloneSaveButton' in host and 'jampanionStandaloneSave' in host and 'window.parent !== window' in host,
    "standalone viewer hides Revert until needed": 'jampanionStandaloneRevert' in host and 'revertButton.hidden = true' in host and 'originalSourceRecord?.body' in host,
    "rehearsal marks use double-click editing": 'const lead = event.target.closest?.(".system-lead")' in host and 'editRehearsal(sourceIndex, lead)' in host,
    "rehearsal context menu only sets styles": 'bar.section = label || null' in host and 'Add rehearsal mark' not in host and 'Edit rehearsal mark' not in host and 'Remove rehearsal mark' not in host and 'Section style:' in host,
    "head out leaves queued state when active": 'HeadOutActive' in logic and 'HeadOutQueued = false;' in logic and 'stage.Name, "HeadOut"' in logic,
    "revert is next to accompaniment save": 'RevertCurrentSongAsync' in logic and 'CurrentSongIsNative && CurrentNativeHasOriginalSource' in home and 'heading-actions' in home,
    "mobile control order and conditional fade": 'session-panel { order:1' in (root / "integration/overlay/src/Jampanion.Web/wwwroot/css/jazz-integration.css").read_text() and 'label + label { order:3' in (root / "integration/overlay/src/Jampanion.Web/wwwroot/css/jazz-integration.css").read_text() and 'can-scroll-left' in host and 'can-scroll-right' in host,
    "mobile session frame and field captions are removed": 'border:0; border-radius:0; background:transparent; padding:0;' in (root / "integration/overlay/src/Jampanion.Web/wwwroot/css/jazz-integration.css").read_text() and '.compact-fields span { display:none; }' in (root / "integration/overlay/src/Jampanion.Web/wwwroot/css/jazz-integration.css").read_text() and 'aria-label="Tempo"' in home and 'aria-label="Style"' in home,
    "mobile Mix fits inside the viewport": 'height:58px; max-height:58px; min-height:0; overflow:hidden;' in (root / "integration/overlay/src/Jampanion.Web/wwwroot/css/jazz-integration.css").read_text(),
    "mobile browser chrome can collapse": 'html, body { height:auto; min-height:100%; overflow-x:hidden; overflow-y:auto; }' in (root / "integration/overlay/src/Jampanion.Web/wwwroot/css/jazz-integration.css").read_text() and '#app { height:auto; min-height:calc(100dvh + 1px); overflow:visible; }' in (root / "integration/overlay/src/Jampanion.Web/wwwroot/css/jazz-integration.css").read_text(),
    "mobile controls align and match chart row": 'padding:3px 6px' in (root / "integration/overlay/src/Jampanion.Web/wwwroot/css/jazz-integration.css").read_text() and 'height:30px; min-height:30px' in (root / "integration/overlay/src/Jampanion.Web/wwwroot/css/jazz-integration.css").read_text() and '.jamp-mobile-controls .tiny { border-radius:5px; }' in (root / "integration/overlay/src/Jampanion.Web/wwwroot/css/jazz-integration.css").read_text() and 'session-controls button { height:30px!important; min-height:30px!important; max-height:30px;' in (root / "integration/overlay/src/Jampanion.Web/wwwroot/css/jazz-integration.css").read_text() and '.session-panel { width:166px; height:50px; }' in (root / "integration/overlay/src/Jampanion.Web/wwwroot/css/jazz-integration.css").read_text() and '.jamp-brand-row { flex-basis:46px; height:50px; }' in (root / "integration/overlay/src/Jampanion.Web/wwwroot/css/jazz-integration.css").read_text() and '.compact-fields select { height:30px; padding:2px 4px; font-size:14px; }' in (root / "integration/overlay/src/Jampanion.Web/wwwroot/css/jazz-integration.css").read_text() and 'initializeMobileControlsScrollHint' in logic,
    "mobile playback keeps controls available": '.jamp-shell.is-playing .jamp-brand-row { display:none; }' not in (root / "integration/overlay/src/Jampanion.Web/wwwroot/css/jazz-integration.css").read_text() and '.jamp-shell.is-playing .accompaniment-panel { display:none; }' not in (root / "integration/overlay/src/Jampanion.Web/wwwroot/css/jazz-integration.css").read_text() and '.jamp-shell.is-playing .jamp-mobile-controls { overflow:hidden; }' not in (root / "integration/overlay/src/Jampanion.Web/wwwroot/css/jazz-integration.css").read_text(),
    "mobile playback scrolls the active bar": 'scrollPlaybackTarget(target)' in host and 'const embeddedMobile = mobile && window.parent !== window;' in host and 'if (!embeddedMobile)' in host and 'window.parent.scrollBy' in host and 'usableHeight' in host and '0.075' in host and 'Math.abs(delta) > 12' in host,
    "last selected song is remembered and restored": 'LAST_SONG_KEY' in host and 'rememberSelectedSong' in host and 'restoreLastSelectedSong' in host and 'songIdentity(song)' in host and 'fallback until the saved song appears' in host,
    "section style is shown above rehearsal marks": 'jamp-section-style' in host and 'sectionStyleAbbreviation' in host and 'case "Swing": return "Swing"' in host and 'case "JazzBallad": return "Ballad"' in host and 'case "BossaNova": return "Bossa"' in host and 'case "AfroCubanLatin": return "Latin"' in host and 'case "JazzWaltz": return "Waltz"' in host and 'current?.remove()' in host and 'badge.textContent !== styleLabel' in host and 'commonSectionStyleBadgeFontSize' in host and 'fitSectionStyleBadge(badge, lead, commonFontSize)' in host and 'lead.querySelector(".rehearsal-mark")' in host and 'badge.offsetWidth' in host and 'badge.style.maxWidth' in host and 'overflow:visible' in host and 'position:absolute; z-index:8; left:0; top:-18px;' in host and 'font:700 16px/16px Arial' in host,
    "embedded chart viewport stays within its frame": 'body.jampanion-embedded .chart-viewport' in host and 'min-width:0 !important;' in host and 'height:auto !important;' in host,
    "mobile chart expands into the parent scroll": 'name: "layoutChanged"' in host and 'installEmbeddedLayoutObserver' in host and 'embeddedLayoutMutationObserver' in host and 'toolbarHeight + chartHeight' in host and 'body.jampanion-embedded .chart-viewport' in host and 'height:auto; min-height:0; overflow:visible;' in (root / "integration/overlay/src/Jampanion.Web/wwwroot/css/jazz-integration.css").read_text(),
    "Stop is the only session stop control": 'StopSessionAsync' in home and 'Panic' not in home and 'InvokeVoidAsync("stopSession")' in logic,
    "session status is omitted": 'session-status' not in home and 'Stopped' not in home and '0:00' not in home,
    "visible footer status is omitted": 'jamp-footer-status' not in home and 'jamp-footer-status' not in (root / "integration/overlay/src/Jampanion.Web/wwwroot/css/jazz-integration.css").read_text(),
    "tempo Auto control is removed": 'ResetTempoAutoAsync' not in logic and '>Auto<' not in home,
    "tempo spinner advances by five": 'step="5"' in home,
    "MIDI preferences persist": 'saveDevicePreferences' in host and 'getDevicePreferences' in logic,
    "MIDI Thru restores saved input": 'RestorePreferredInputForMidiThruAsync' in logic,
    "Built-in Trio remains usable without Web MIDI": 'Built-in Trio available · Web MIDI unavailable' in logic,
    "tempo rollback preserves Auto/manual state": 'previousTempoExplicit' in logic and 'previousTempoUserSet' in logic,
    "bootstrap ignores cross-song changes during playback": 'Stop the session before changing songs' in logic,
    "chart editing survives viewer re-render": 'doc.addEventListener("dblclick", handleDoubleClick, true)' in host and 'observer.observe(doc, { childList: true, subtree: true })' in host,
    "empty native slot adds a chord": 'const sourceSlot = currentSong()?.bars?.[sourceIndex]?.chordSlots?.[slotIndex]' in host and 'addChordAtPoint(sourceIndex, bar, event.clientX)' in host,
    "chart edits require an explicit save": 'HasUnsavedChartChanges' in logic and 'saveCurrentChart' in host and 'stageNative(song)' in host,
    "mixer preferences persist": 'saveMixerPreferences' in logic and 'getMixerPreferences' in logic and 'MIXER_SETTINGS_KEY' in host,
}
failed = [name for name, ok in checks.items() if not ok]
if failed:
    raise SystemExit("Integration invariant failures:\n- " + "\n- ".join(failed))
print(f"Integration invariant checks passed ({len(checks)} checks).")
