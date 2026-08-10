# Validation results — integrated v12

Pinned baselines:

- Jazz Chart Viewer: `1457dde2a133987237a7f3c50800a32dcea00033`
- Jampanion: `d216b4c9658e93347ea42b9fd082900be8bf6d98`

## Source-level regression suite

`./scripts/validate-static.sh` validates JavaScript syntax and integration invariants,
including:

- non-reentrant startup and v12 `postMessage` bridge packaging;
- original Jazz Chart Viewer Song Search remains the only song search;
- Song Search is disabled and selected-song identity is locked during playback;
- Space works from chart/background but does not steal input/search/button actions;
- Start preparation locks the selected chart before compilation and can be cancelled by Stop/page-hide;
- Start-session failure after audio launch rolls audio and chart state back;
- PPQ 480 timing: 4/4 beat 1, beat 3, 3&, beat 4, 4&, plus 3/4 cases;
- known Jazz 1460 oracle geometries: 9.20 Special and A Ballad 3/3&/4/4&;
- off-beat correction ends at the next *written* chord change and truncates prior
  piano/bass harmony before inserting the exact off-beat chord;
- standalone-Coda Solo/HeadOut routing contract;
- modern iReal BPM metadata (180, 118, and 0/unspecified);
- recognized iReal player-style metadata and fallback to chart style;
- tempo precedence and manual-state ownership across bridge refreshes;
- Swing 120 / Ballad 70 / Bossa 140 / Waltz 150 / Latin 180 automatic defaults;
- live style changes use the next four-bar boundary and `replaceContinuation`;
- XyQ three-chord 4/4 bars normalize compact source cells `[1, 2, 4]` to written beats `[1, 3, 4]` through the pinned Viewer;
- HeadOut appends Jampanion's one-bar `Ending / final tonic` plan, including the held
  song-root bass and final piano/drum resolution;
- blank chord edit removes the chord without pulling a later first-bar chord early;
- chart editing remains attached after the viewer replaces `#chartPage` during a
  native-song render;
- empty native-bar placeholder slots open the chord-add editor;
- 3/4 section style menus expose Jazz Waltz only;
- native iReal edits can revert to the retained original iReal source;
- chart edits, rehearsal-mark, tempo, and style changes remain staged until the single Accompaniment Save button;
- mixer mute/volume preferences persist locally and restore on reload;
- MIDI input/output preferences persist; saved input can be restored for MIDI Thru;
- Built-in Trio remains the fallback when Web MIDI is unavailable;
- the upstream Jampanion audio build cannot silently delete the integration bridge:
  the bridge is restored after `npm run build` and before `dotnet publish`.
- GitHub Pages base-path rewriting creates the repository-scoped `<base>` and `404.html`.

The build script also runs `test-viewer-contract.mjs` against the actual pinned
`viewer/index.html` after bridge injection, checking that JCV still exposes
`expandChartBars`, `parseIRealCollection`, the rendered grid timing datasets, and the
four-bars-per-row contract expected by the playback compiler.

## Known-song oracle coverage

The integration tests preserve the manually reviewed JCV timing oracles used for the
problematic patterns that motivated the playback bridge:

- **9.20 Special**: G7 / Ab7 / G7 at beat 1 / beat 3 / beat 4.
- **A Ballad**: exact 3 / 3& / 4 / 4& tick positions.
- Standalone Coda contract used by the session HeadOut compiler.

The integration deliberately delegates D.C./D.S./endings/Coda expansion to the pinned
Jazz Chart Viewer rather than duplicating that parser in Jampanion.

## Local revalidation

On 2026-08-09, the repaired source was rebuilt locally with .NET SDK `10.0.302` and
Node.js `22.23.2` (the CI workflow uses Node.js 24). The fixed JCV and Jampanion
revisions were fetched, the audio bundle was generated, and `.NET publish` completed.

Browser smoke coverage included initial rendering with no console warnings/errors,
style-to-tempo propagation, native-song creation, empty-bar chord entry, playback of
the edited native chart, playback search locking, Back to head with the appended
one-bar final tonic ending, Stop, and reload.
Hardware MIDI routing, subjective audio listening, and a live GitHub Pages deployment
remain environment-dependent and were not independently verified.
