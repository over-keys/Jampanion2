import fs from "node:fs";
import path from "node:path";

const target = process.argv[2];
if (!target) {
  console.error("Usage: customize-help-en.mjs viewer/help.en.html");
  process.exit(2);
}

const resolved = path.resolve(target);
if (!fs.existsSync(resolved)) throw new Error(`English help page not found: ${resolved}`);

let html = fs.readFileSync(resolved, "utf8");
const marker = 'id="jampanion"';
if (html.includes(marker)) process.exit(0);

html = html
  .replace("<title>Help · Jazz Chart Viewer</title>", "<title>Help · Jampanion2</title>")
  .replace("<meta name=\"description\" content=\"User guide for Jazz Chart Viewer.\">", "<meta name=\"description\" content=\"User guide for Jampanion2's chart display, editing, and accompaniment.\">")
  .replace("<span>Jazz Chart Viewer Help</span>", "<span>Jampanion2 Help</span>")
  .replace("<a class=\"header-link primary\" href=\"./index.html\">Open viewer</a>", "<a class=\"header-link primary\" href=\"./index.html\">Open Jampanion2</a>")
  .replace("<h1>Jazz Chart Viewer</h1>", "<h1>Jampanion2</h1>")
  .replace(
    "Display, transpose, and read iReal-format jazz chord charts directly in your browser. This guide covers the complete workflow from importing Jazz 1460 to expanding repeats and adjusting notation.",
    "Jampanion2 displays iReal-format jazz chord charts and lets you practice or play along with piano, bass, and drums. This guide covers accompaniment, chart editing, importing songs, transposition, and repeat expansion."
  )
  .replace('href="./help.css"', 'href="./help.css?v=31"')
  .replaceAll('href="./help.html"', 'href="./help.html?v=31"')
  .replace(
    '      <a href="#quick-start">Quick start</a>',
    '      <a href="#jampanion">Accompaniment and editing</a>\n      <a href="#quick-start">Quick start</a>'
  )
  .replace("In the viewer, open", "In Jampanion2, open");

const integratedSection = String.raw`      <section id="jampanion" class="help-section">
        <h2>Accompaniment and chart editing</h2>
        <p>Jampanion2 is more than a chart viewer: it plays piano, bass, and drums along with your chord progression. Select a song, then use <strong>Accompaniment</strong> and <strong>Session</strong>.</p>

        <h3>Starting a session</h3>
        <ol>
          <li>Select a song and check the key, <strong>Original / Expanded</strong> view, tempo, and style.</li>
          <li>Enter the <strong>Tempo</strong> and choose <strong>Swing / Ballad / Bossa Nova / Latin</strong> in <strong>Style</strong>. Only styles supported by the meter are shown.</li>
          <li>Press <strong>Start session</strong> to begin after the count-in. The chart scrolls to the current position during playback.</li>
          <li>Press <strong>Stop</strong> to stop immediately. It also sends note-off messages for playing notes.</li>
          <li>To finish naturally, press <strong>Back to head</strong> while playing. <strong>Head Out</strong> is queued; the accompaniment returns to the theme at the next suitable boundary, plays the theme through, and then ends. The button changes to <strong>Head out queued</strong> while queued.</li>
        </ol>

        <div class="note"><strong>Stop vs Head Out</strong>Stop stops the accompaniment where it is. Head Out keeps playback running, queues the return to the theme, and ends after the theme is played.</div>

        <h3>Tempo, style, and saving</h3>
        <table class="control-table">
          <tbody>
            <tr><th>Tempo</th><td>The stepper buttons change the tempo by 5 BPM. You can enter any whole-number BPM directly.</td></tr>
            <tr><th>Style</th><td>Choose Swing, Ballad, Bossa Nova, or Latin. You can assign a different style to each rehearsal mark.</td></tr>
            <tr><th>Save / Revert</th><td>Save stores chart edits, rehearsal marks, the transposed key, tempo, and style changes together. Changes remain temporary until you press Save. Revert resets saved key, tempo, and style settings; for an edited song that keeps its imported source, it also restores the original iReal chart.</td></tr>
          </tbody>
        </table>
        <div class="note"><strong>Key</strong>The transposition made with − / + is also saved per song when you press Save and restored next time.</div>
        <div class="note"><strong>Changes during playback</strong>Style changes take effect at the next four-bar boundary. Tempo changes take effect at the next bar boundary.</div>

        <h3>Editing chords and rehearsal marks</h3>
        <ul>
          <li><strong>Double-click a chord</strong> to edit it. Confirm an empty value to remove it.</li>
          <li><strong>Double-click an empty position in a bar</strong> to add a chord at that beat.</li>
          <li><strong>Double-click the left side of a row without a mark</strong> to add a rehearsal mark. <strong>Double-click an existing mark</strong> to rename it. Confirm an empty value to remove it.</li>
          <li><strong>Right-click a rehearsal mark or its bar</strong> to assign a section style only.</li>
          <li>Assigned styles appear above rehearsal marks as <strong>Swing / Latin / Bossa / Ballad</strong>. The label is hidden when the song default is used.</li>
          <li><strong>Double-click the title</strong> to rename the song.</li>
        </ul>
        <div class="warning"><strong>Saving edits</strong>Press <strong>Save</strong> in <strong>Accompaniment</strong> to keep edited chords and marks. Save before closing or changing songs.</div>

        <h3>Mix and MIDI</h3>
        <ul>
          <li>Use <strong>Mix</strong> to adjust Piano, Bass, and Drums volume or mute state. These settings are remembered in the same browser.</li>
          <li>Open <strong>Settings → Audio &amp; MIDI</strong> to choose MIDI input and MIDI output. Choose <strong>Built-in Trio</strong> to use the browser instruments when no external MIDI output is available.</li>
          <li>Enable <strong>MIDI thru</strong> to relay notes from the selected MIDI input to the output.</li>
        </ul>
        <div class="note"><strong>On smartphones</strong>Session controls stay at the top while the chart scrolls vertically. Mix is below the chart.</div>
      </section>

`;

const insertionPoint = '      <section id="quick-start" class="help-section">';
if (!html.includes(insertionPoint)) throw new Error("Quick-start section not found in English help page.");
html = html.replace(insertionPoint, `${integratedSection}${insertionPoint}`);
fs.writeFileSync(resolved, html);
