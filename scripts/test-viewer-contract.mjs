import fs from "node:fs";
const file = process.argv[2];
if (!file) throw new Error("usage: test-viewer-contract.mjs viewer/index.html");
const source = fs.readFileSync(file, "utf8");
const requirements = [
  ["Chart Viewer bridge API", /window\.__chartViewer\s*=\s*\{[^}]*expandChartBars/s],
  ["Jampanion2 Viewer page title", /<title>Jampanion2 Viewer<\/title>/],
  ["iReal parser API", /parseIRealCollection/],
  ["rendered grid start", /data-grid-start/],
  ["rendered grid total", /data-grid-total/],
  ["source slot index", /data-slot-index/],
  ["library startup exposes readiness", /const libraryReady = initialiseLibrary\(\)/],
  ["library startup waits for saved song", /libraryLoading[\s\S]*Loading saved song/],
  ["search unlocks after library load", /state\.libraryLoading[\s\S]*el\.search\.disabled = false[\s\S]*el\.search\.removeAttribute\('aria-busy'\)/],
  ["search normalizes punctuation", /function normaliseSearchText\(value\)[\s\S]*?function renderSearchOptions\(\)[\s\S]*?normaliseSearchText\(searchListTitle\(song\)\)/],
  ["search ignores all non-alphanumeric separators", /\.replace\(\/\[\^\\p\{L\}\\p\{N\}\]\+\/gu, ''\)/],
  ["search ranks title prefixes before interior matches", /title\.startsWith\(query\)[\s\S]*title\.includes\(query\)[\s\S]*composer\.includes\(query\)[\s\S]*sort\(\(left, right\) => left\.rank - right\.rank/],
  ["favorites persist in search results", /STORAGE_FAVORITES[\s\S]*readFavoriteSongKeys[\s\S]*toggleFavorite[\s\S]*data-favorite-song-id/],
  ["search ranking outranks favorite ranking", /sort\(\(left, right\) => left\.rank - right\.rank[\s\S]*Number\(right\.favorite\) - Number\(left\.favorite\)/],
  ["favorite toggle preserves current result order", /function updateFavoriteToggle[\s\S]*function toggleFavorite\(songId, toggle\)[\s\S]*saveFavoriteSongKeys\(\);[\s\S]*updateFavoriteToggle\(toggle, song, favorite\);/],
  ["favorite control is a sibling button", /class="search-option-row[\s\S]*<button class="search-option-song"[\s\S]*<button class="favorite-toggle/],
  ["demo is a true fallback", /using demo fallback[\s\S]*state\.songs = \[DEMO_SONG\]/],
  ["integrated last-song reference fallback", /jampanion-jazz-last-song-v1[\s\S]*findRememberedSong/],
  ["customized-song revert control", /id="deleteCustomized"[\s\S]*Revert all customized songs[\s\S]*Delete all imported songs/],
  ["song-library action order", /id="openImport"[\s\S]*id="deleteAll"[\s\S]*id="deleteCustomized"[\s\S]*data-jampanion-customized-songs-layout="v2"/],
  ["customized-song restoration runtime", /restoreSongsByIds[\s\S]*originalSourceRecord[\s\S]*saveSongLibrary/],
  ["song selection preserves host-managed transpose", /function selectSong\(songId\) \{[\s\S]*state\.selectedId = songId;[\s\S]*state\.searchOpen = false;[\s\S]*JAMPANION_SELECTION_TRANSPOSE_V1/],
  ["XyQ three-chord 4/4 normalization", /meterTop === 4 && meterBottom === 4 && chordSlots\.length === 3[\s\S]*rawCells\[2\] === 3[\s\S]*starts = \[0, Math\.floor\(totalCells \/ 2\), Math\.floor\(totalCells \* 3 \/ 4\)\]/],
  ["four-column responsive layout", /function\s+responsiveColumns\s*\([^)]*\)\s*\{\s*return\s+4\s*;/s],
  ["embedded v12 bridge", /data-jampanion-embedded-bridge="v12"/],
  ["embedded startup guard", /data-jampanion-startup-guard="v1"[\s\S]*jampanion-startup-pending/]
];
for (const [name, pattern] of requirements) {
  if (!pattern.test(source)) throw new Error(`Pinned Jazz Chart Viewer contract missing: ${name}`);
}
console.log(`Pinned Jazz Chart Viewer integration contract passed (${requirements.length} checks).`);
