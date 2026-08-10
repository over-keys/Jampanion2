# Jazz Chart Viewer + Jampanion

Integrated web application with **Jazz Chart Viewer as the chart/UI base** and the
**Jampanion accompaniment engine** attached as a compact left sidebar.

This is a standalone integration project. It does not patch a user's Jampanion
checkout. `scripts/build-integrated.sh` checks out the two pinned upstream baselines
into a disposable build directory, applies the complete integration files, and writes
the deployable site to `dist/`.

## Source of truth

- iReal parsing, visible chart layout, normalized chord positions, Original/Expanded,
  repeats/endings, D.C./D.S./Coda/Fine, key transposition and notation: **Jazz Chart Viewer**.
- Piano, bass, drums, Opening/Groove/Developing/Peak/HeadOut, the one-bar final tonic
  hold, browser audio, external MIDI output and mixer: **Jampanion**.
- Playback uses Jazz Chart Viewer's normalized grid positions and converts them to
  Jampanion PPQ ticks. Jampanion does not independently re-parse the iReal chart.
- Parent and chart iframe communicate through a non-visual `postMessage` bridge
  injected at build time. The visible Jazz Chart Viewer search/toolbar stays intact.

## Playback and editing

While stopped, the chart can be edited directly:

- Double-click an existing chord to edit it; confirm an empty value to remove it.
- Double-click empty measure space to add a chord at that exact position.
- Double-click a rehearsal mark to rename it.
- Right-click a measure/rehearsal mark to add/remove a mark and set section style.
- Double-click the title to rename the song.

The first edit promotes an imported iReal chart to native IndexedDB data while retaining
its original iReal source. `Settings` can later **Revert to original iReal chart**.
New native songs begin with genuinely empty bars; accompaniment treats those as N.C.
until harmony is entered.

During playback, score editing and Song Search are locked so the displayed chart cannot
be changed out from under the sounding session. Space starts the session or queues
`Back to head` when focus is on the chart/background; Space keeps its normal behavior
inside inputs, search results, buttons and other interactive controls.

## Tempo and style

Tempo priority is:

1. tempo explicitly entered by the user in Jampanion;
2. valid BPM contained in modern iReal player metadata;
3. style-aware automatic default.

Automatic defaults are:

- Swing: **120 BPM**
- Ballad: **70 BPM**
- Bossa Nova: **140 BPM**
- Jazz Waltz: **150 BPM**
- Latin / Mambo: **180 BPM**

The Tempo control's spinner advances by 5 BPM, while direct entry still accepts exact
1-BPM values. A newly selected song initially follows
its saved/source tempo or the selected accompaniment style; changing the value makes
it a manual tempo. Chart edits, rehearsal-mark changes, tempo, and style changes are
all staged until the single Accompaniment Save button is pressed. Existing saved
tempos, including 140 BPM, are never reinterpreted by a migration heuristic.

Modern `irealb://` player metadata is read as `music = player style = BPM = repeats`.
For accompaniment style, precedence is:

1. Jampanion saved style;
2. recognized iReal **player** style;
3. chart style label;
4. Swing fallback (or Jazz Waltz for 3/4).

A style change during playback is queued at the next four-bar boundary rather than
changing the sounding block immediately. It never changes the current tempo implicitly.

When `Back to head` queues the final HeadOut, the integration appends Jampanion's
native one-bar ending: the song-root bass is held for the full bar, with the final
piano voicing and ending drum hit around it.

## Exact harmony timing

JCV timing is converted at PPQ 480. Off-beat harmony such as 3& and 4& is restored at
its exact tick after Jampanion's beat-oriented arranging heuristics run. The correction
is bounded by the **next written chord change, whether on-beat or off-beat**, and any
piano/bass note crossing the written change is truncated first. This prevents a 3&
chord from overlapping the following beat-4 harmony.

## Audio & MIDI

`Settings` → **Audio & MIDI** provides:

- MIDI input: `No MIDI input` or an available Web MIDI input;
- Output: **Built-in Trio** or an available external MIDI output.

Device choices are saved locally and restored when available. Built-in Trio remains
usable when Web MIDI is unsupported or permission is unavailable. MIDI input is used
only for MIDI Thru in this integration. MIDI performance-energy analysis and automatic
theme-return detection are intentionally disabled; `Back to head` is manual.

## Build locally

Requirements: Git, .NET SDK 10, Node.js 24, npm.

```bash
./scripts/build-integrated.sh
```

The finished site is written to `dist/`. Serve it over HTTP/HTTPS, for example:

```bash
python3 -m http.server 8000 -d dist
```

## Validation

Run the source-level regression suite with:

```bash
./scripts/validate-static.sh
```

The build additionally checks the bundled Jazz Chart Viewer contract after bridge
injection. See `VALIDATION_RESULTS.md` for the covered cases and environment limits.

## GitHub Pages

Push this project as-is. `.github/workflows/deploy-pages.yml` builds and deploys the
integrated site on pushes to `main`. The workflow does not push changes to either
upstream repository.

See `BASELINES.md` for the exact pinned revisions.
