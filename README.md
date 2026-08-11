# Jampanion2

A browser-based jazz chart viewer and accompaniment partner for practicing, rehearsing, and playing along with piano, bass, and drums.

Public page: [https://over-keys.github.io/Jampanion2/](https://over-keys.github.io/Jampanion2/)

## Getting started

1. Open [Jampanion2](https://over-keys.github.io/Jampanion2/).
2. Open the chart viewer's settings menu and choose **Import iReal data**.
3. Paste an `irealb://...` link copied from iReal Pro and press **Import**.
4. Search by song title or composer and select a song.
5. Press **Start session** in the left panel to begin accompaniment. Press **Stop** when you are finished.

For more details, open the help page with the **?** button in the chart viewer.

## Importing iReal charts

Copy a shared song link from iReal Pro and paste it into **Import iReal data**. The link should begin with `irealb://` or `irealbook://`.

You can also import saved `.txt`, `.html`, or `.htm` files.

## Playing accompaniment

Use **Accompaniment** to choose the tempo and style.

- **Tempo**: The stepper buttons change the tempo by 5 BPM. You can also enter a value directly.
- **Style**: Choose **Swing**, **Ballad**, **Bossa Nova**, or **Latin**.
- **Start session**: Starts the accompaniment after the count-in.
- **Stop**: Stops the accompaniment immediately and sends note-off messages.
- **Back to head / Head Out**: During playback, press **Back to head** to queue a head out. The accompaniment returns to the theme, plays it through, and then ends naturally. The button changes to **Head out queued** while it is queued.
- **Save**: Saves chart edits, rehearsal marks, transposed key, tempo, and style changes together.

During playback, a style change takes effect at the next four-bar boundary. A tempo change takes effect at the next bar boundary so the sound continues smoothly. Changing the style does not reset the tempo.

## Editing a chart

Stop playback before editing the chart.

- **Double-click a chord** to edit it. Confirm an empty value to remove it.
- **Double-click an empty position in a bar** to add a chord at that position.
- **Double-click the left side of a row without a mark** to add a rehearsal mark. **Double-click an existing mark** to rename it. Confirm an empty value to remove it.
- **Right-click a rehearsal mark or its bar** to assign a section style only.
- **Double-click the title** to rename the song.

Assigned section styles are shown above rehearsal marks as **Swing**, **Latin**, **Bossa**, or **Ballad**. The label is hidden when the song's default style is used.

Edits are temporary until saved. Press **Save** in **Accompaniment** to keep them.

## Mix and MIDI

Use **Mix** to adjust the volume or mute Piano, Bass, and Drums. Volume and mute settings are remembered in the same browser.

Open **Settings** to choose:

- MIDI input
- MIDI output
- MIDI Thru

If no external MIDI device is available, choose **Built-in Trio** to play with the browser's built-in sounds.

## Chart display

- **− / +**: Transpose the key by semitones.
- **Auto / ♭ / ♯**: Choose the chord accidental spelling.
- **Original**: Show the chart as written.
- **Expanded**: Expand repeats and navigation into playing order.
- **Fit**: Scale the chart to fit the available space.

On smartphones, the Session controls remain available at the top while the chart scrolls vertically. The Mix controls are below the chart.

## Saving and browser data

Songs and settings are saved in the current browser. If you clear browser data or open Jampanion2 on another device, import your songs again.
