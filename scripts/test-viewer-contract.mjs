import fs from "node:fs";
const file = process.argv[2];
if (!file) throw new Error("usage: test-viewer-contract.mjs viewer/index.html");
const source = fs.readFileSync(file, "utf8");
const requirements = [
  ["Chart Viewer bridge API", /window\.__chartViewer\s*=\s*\{[^}]*expandChartBars/s],
  ["iReal parser API", /parseIRealCollection/],
  ["rendered grid start", /data-grid-start/],
  ["rendered grid total", /data-grid-total/],
  ["source slot index", /data-slot-index/],
  ["library startup exposes readiness", /const libraryReady = initialiseLibrary\(\)/],
  ["library startup waits for saved song", /libraryLoading[\s\S]*Loading saved song/],
  ["search unlocks after library load", /state\.libraryLoading[\s\S]*el\.search\.disabled = false[\s\S]*el\.search\.removeAttribute\('aria-busy'\)/],
  ["demo is a true fallback", /using demo fallback[\s\S]*state\.songs = \[DEMO_SONG\]/],
  ["integrated last-song reference fallback", /jampanion-jazz-last-song-v1[\s\S]*findRememberedSong/],
  ["customized-song removal control", /id="deleteCustomized"[\s\S]*Delete customized songs[\s\S]*Delete all imported songs/],
  ["song-library action order", /id="openImport"[\s\S]*id="deleteAll"[\s\S]*id="deleteCustomized"[\s\S]*data-jampanion-customized-songs-layout="v2"/],
  ["customized-song removal runtime", /removeSongsByIds[\s\S]*saveSongLibrary[\s\S]*jampanion-library-cleared/],
  ["song selection preserves host-managed transpose", /function selectSong\(songId\) \{[\s\S]*state\.selectedId = songId;[\s\S]*state\.searchOpen = false;[\s\S]*JAMPANION_SELECTION_TRANSPOSE_V1/],
  ["XyQ three-chord 4/4 normalization", /meterTop === 4 && meterBottom === 4 && chordSlots\.length === 3[\s\S]*rawCells\[2\] === 3[\s\S]*starts = \[0, Math\.floor\(totalCells \/ 2\), Math\.floor\(totalCells \* 3 \/ 4\)\]/],
  ["four-column responsive layout", /function\s+responsiveColumns\s*\([^)]*\)\s*\{\s*return\s+4\s*;/s],
  ["embedded v12 bridge", /data-jampanion-embedded-bridge="v12"/]
];
for (const [name, pattern] of requirements) {
  if (!pattern.test(source)) throw new Error(`Pinned Jazz Chart Viewer contract missing: ${name}`);
}
console.log(`Pinned Jazz Chart Viewer integration contract passed (${requirements.length} checks).`);
