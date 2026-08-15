import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!target) {
  console.error('Usage: node scripts/customize-viewer.mjs <viewer/index.html>');
  process.exit(2);
}
const resolved = path.resolve(target);
if (!fs.existsSync(resolved)) throw new Error(`Viewer index not found: ${resolved}`);
let html = fs.readFileSync(resolved, 'utf8');
let changed = false;
html = html.replaceAll('<title>Jazz Chart Viewer</title>', '<title>Jampanion2 Viewer</title>');
html = html.replace('placeholder="irealbook://..."', 'placeholder="irealb://..."');
html = html.replaceAll('href="./help.html"', 'href="./help.html?v=31"');
html = html.replaceAll('href="./help.en.html"', 'href="./help.en.html?v=31"');
html = html.replaceAll('jampanion-viewer.svg?v=1', 'jampanion-viewer.png?v=2');
html = html.replaceAll('jampanion-viewer.svg', 'jampanion-viewer.png');
if (!html.includes('jampanion-viewer.png')) {
  const favicon = '  <link rel="icon" type="image/png" href="../icons/jampanion-viewer.png?v=2" />\n';
  if (html.includes('</head>')) html = html.replace('</head>', `${favicon}</head>`);
  else if (html.includes('</body>')) html = html.replace('</body>', `${favicon}</body>`);
  else throw new Error('Viewer HTML has no closing head or body tag.');
  changed = true;
}

const startupGuardMarker = 'data-jampanion-startup-guard="v1"';
if (!html.includes(startupGuardMarker)) {
  const startupGuard = `  <style ${startupGuardMarker}>html.jampanion-startup-pending .app-shell { visibility:hidden; }</style>
  <script ${startupGuardMarker}>
    document.documentElement.classList.add('jampanion-startup-pending');
  </script>
`;
  if (html.includes('</head>')) html = html.replace('</head>', `${startupGuard}</head>`);
  else if (html.includes('<body>')) html = html.replace('<body>', `${startupGuard}<body>`);
  else throw new Error('Viewer HTML has no closing head or body tag for the startup guard.');
  changed = true;
}

const customizedSongsControlMarker = 'id="deleteCustomized"';
if (!html.includes(customizedSongsControlMarker)) {
  const oldLibraryActions = `        <div class="action-row">
          <button id="openImport" type="button" class="primary">Import iReal data</button>
          <button id="deleteAll" type="button" class="danger">Delete all songs</button>
        </div>`;
  const newLibraryActions = `        <div class="action-row">
          <button id="openImport" type="button" class="primary">Import iReal data</button>
          <button id="deleteAll" type="button" class="danger">Delete all imported songs</button>
        </div>
        <div class="action-row">
          <button id="deleteCustomized" type="button" class="danger">Revert all customized songs</button>
        </div>
        <p class="settings-hint" data-jampanion-customized-songs-layout="v2">Revert all customized songs restores their original imported state. Delete all imported songs removes the entire imported library.</p>`;
  if (html.includes(oldLibraryActions)) {
    html = html.replace(oldLibraryActions, newLibraryActions);
    changed = true;
  }
}

// Reorder controls when this script is run against an already customized
// generated Viewer instead of a freshly cloned upstream page.
const customizedSongsLayoutMarker = 'data-jampanion-customized-songs-layout="v2"';
if (!html.includes(customizedSongsLayoutMarker)) {
  const oldCustomizedLayout = `        <div class="action-row">
          <button id="openImport" type="button" class="primary">Import iReal data</button>
        </div>
        <div class="action-row">
          <button id="deleteCustomized" type="button" class="danger">Revert all customized songs</button>
          <button id="deleteAll" type="button" class="danger">Delete all imported songs</button>
        </div>
        <p class="settings-hint">Revert all customized songs restores their original imported state. Delete all imported songs removes the entire imported library.</p>`;
  const newCustomizedLayout = `        <div class="action-row">
          <button id="openImport" type="button" class="primary">Import iReal data</button>
          <button id="deleteAll" type="button" class="danger">Delete all imported songs</button>
        </div>
        <div class="action-row">
          <button id="deleteCustomized" type="button" class="danger">Revert all customized songs</button>
        </div>
        <p class="settings-hint" data-jampanion-customized-songs-layout="v2">Revert all customized songs restores their original imported state. Delete all imported songs removes the entire imported library.</p>`;
  if (html.includes(oldCustomizedLayout)) {
    html = html.replace(oldCustomizedLayout, newCustomizedLayout);
    changed = true;
  }
}

const customizedSongsStyleMarker = 'data-jampanion-customized-songs-style="v1"';
const customizedSongsStyleRules = `    .action-row + .action-row { margin-top: 8px; }
    .settings-hint { margin: 10px 0 0; color: #69767b; font-size: 12px; line-height: 1.4; }`;
if (!html.includes(customizedSongsStyleMarker)) {
  const customizedSongsStyle = `  <style ${customizedSongsStyleMarker}>
${customizedSongsStyleRules}
  </style>\n`;
  if (html.includes('</head>')) {
    html = html.replace('</head>', `${customizedSongsStyle}</head>`);
    changed = true;
  } else if (html.includes('</body>')) {
    html = html.replace('</body>', `${customizedSongsStyle}</body>`);
    changed = true;
  }
}
const oldCustomizedSongsStyleRules = '    .settings-hint { margin: -8px 0 0; color: #69767b; font-size: 12px; line-height: 1.4; }';
if (html.includes(oldCustomizedSongsStyleRules)) {
  html = html.replaceAll(oldCustomizedSongsStyleRules, customizedSongsStyleRules);
  changed = true;
}

const libraryStartupMarker = 'JAMPANION_LIBRARY_STARTUP_V1';
const librarySearchUnlockMarker = 'JAMPANION_LIBRARY_SEARCH_UNLOCK_V1';
if (!html.includes(libraryStartupMarker) && html.includes('function render() {')) {
  const oldRenderStart = 'function render() {\n';
  const newRenderStart = `function renderLoadingState() {
  document.body.classList.add('jampanion-library-loading');
  el.search.value = 'Loading saved song…';
  el.search.disabled = true;
  el.search.setAttribute('aria-busy', 'true');
  el.searchOptions.hidden = true;
  el.chartPage.innerHTML = '<div class="library-loading" role="status">Loading saved song…</div>';
}

function render() {
  if (state.libraryLoading) {
    renderLoadingState();
    return;
  }
  if (!document.body.classList.contains('jampanion-playback')) {
    document.body.classList.remove('jampanion-library-loading');
    el.search.disabled = false;
    el.search.removeAttribute('aria-busy');
  }
`;
  if (!html.includes(oldRenderStart)) throw new Error('Viewer render function was not found for the library startup patch.');
  html = html.replace(oldRenderStart, newRenderStart);

  const oldInitialisePattern = /async function initialiseLibrary\(\) \{[\s\S]*?\n\}\n\nfunction loadJson/;
  const newInitialise = `function findRememberedSong(songs) {
  const rememberedKey = readLastSongKey();
  const directMatch = songs.find((song) => songSelectionKey(song) === rememberedKey);
  if (directMatch) return directMatch;

  // Integrated mode keeps a title-based reference as a second restore path.
  try {
    const stored = JSON.parse(localStorage.getItem('jampanion-jazz-last-song-v1') || 'null');
    const identity = typeof stored?.identity === 'string' ? stored.identity : '';
    if (!identity) return null;
    const lineBreak = String.fromCharCode(10);
    return songs.find((song) => {
      const record = song.sourceRecord;
      if (record?.body) {
        const fields = String(record.body).split('=');
        const sourceIdentity = [fields[0] || song.title || '', fields[1] || song.composer || ''].join(lineBreak).trim();
        if (sourceIdentity === identity) return true;
      }
      return [song.title || '', song.composer || ''].join(lineBreak).trim() === identity;
    }) || null;
  } catch {
    return null;
  }
}

async function initialiseLibrary() {
  state.libraryLoading = true;
  render();
  try {
    const loaded = await loadSongLibrary();
    state.preservedLibraryEntries = loaded.failedEntries || [];
    state.libraryWarnings = loaded.warnings || [];
    const rememberedSong = findRememberedSong(loaded.songs || []);
    if (rememberedSong) {
      state.songs = loaded.songs;
      state.selectedId = rememberedSong.id;
    } else {
      // Keep the demo as a true fallback, never as a transient first screen.
      state.songs = [DEMO_SONG, ...(loaded.songs || []).filter((song) => song.source !== 'demo')];
      state.selectedId = DEMO_SONG.id;
    }
  } catch (error) {
    console.error('Could not load song library; using demo fallback:', error);
    state.songs = [DEMO_SONG];
    state.selectedId = DEMO_SONG.id;
  } finally {
    state.libraryLoading = false;
    render();
  }
}

function loadJson`;
  if (!oldInitialisePattern.test(html)) throw new Error('Viewer library initializer was not found for the startup patch.');
  html = html.replace(oldInitialisePattern, newInitialise);

  const oldState = '  libraryWarnings: []\n};';
  const newState = '  libraryWarnings: [],\n  libraryLoading: true\n};';
  if (!html.includes(oldState)) throw new Error('Viewer state block was not found for the startup patch.');
  html = html.replace(oldState, newState);

const oldDeleteAll = `el.deleteAll.addEventListener('click', async () => {
  if (!confirm('Delete all imported songs?')) return;
  try {
    await clearSongLibrary();
  } catch (error) {
    alert(error instanceof Error ? error.message : String(error));
    return;
  }
  state.songs = [DEMO_SONG];
  state.preservedLibraryEntries = [];
  state.libraryWarnings = [];
  state.selectedId = DEMO_SONG.id;
  state.semitones = 0;
  saveLastSong(DEMO_SONG);
  el.settingsDialog.close();
  render();
});`;
const newDeleteAll = `async function restoreSongsByIds(songIds) {
  const ids = new Set((Array.isArray(songIds) ? songIds : []).map((id) => String(id)));
  if (!ids.size) return { restored: 0 };
  const targets = state.songs.filter((song) => ids.has(String(song.id)) && song.source !== 'demo');
  if (!targets.length) return { restored: 0 };
  const restoredById = new Map();
  for (const song of targets) {
    const original = song.originalSourceRecord;
    if (song.originalSourceSong) {
      restoredById.set(String(song.id), JSON.parse(JSON.stringify(song.originalSourceSong)));
      continue;
    }
    if (!original?.body || typeof parseIRealCollection !== 'function') {
      restoredById.set(String(song.id), song);
      continue;
    }
    try {
      const protocol = /^(?:irealb|irealbook):\\/\\/$/i.test(original.protocol || '') ? original.protocol : 'irealb://';
      restoredById.set(String(song.id), parseIRealCollection(\`\${protocol}\${encodeURIComponent(original.body)}\`).songs?.[0] || song);
    } catch {
      restoredById.set(String(song.id), song);
    }
  }
  const restoredSongs = state.songs.map((song) => restoredById.get(String(song.id)) || song);
  await saveSongLibrary(restoredSongs.filter((song) => song.source !== 'demo'), state.preservedLibraryEntries);
  state.songs = restoredSongs;
  const selectedReplacement = restoredById.get(String(state.selectedId));
  if (selectedReplacement) state.selectedId = selectedReplacement.id;
  state.semitones = 0;
  saveLastSong(currentSong());
  render();
  return { restored: targets.length };
}

${oldDeleteAll}`
    .replace("  if (!confirm('Delete all imported songs?')) return;", `  const importedSongs = state.songs.filter((song) => song.source !== 'demo');
  if (!importedSongs.length) {
    alert('No imported songs to delete.');
    return;
  }
  if (!confirm('Delete all imported songs?')) return;
  const removedSongs = state.songs.filter((song) => song.source !== 'demo').map((song) => ({
    id: song.id,
    nativeIdentity: song.nativeIdentity || '',
    title: song.title || '',
    composer: song.composer || '',
    source: song.source || '',
    sourceRecord: song.sourceRecord || null,
    originalSourceRecord: song.originalSourceRecord || null,
    originalSourceSong: song.originalSourceSong || null
  }));`)
    .replace("  saveLastSong(DEMO_SONG);\n  el.settingsDialog.close();", "  saveLastSong(DEMO_SONG);\n  window.dispatchEvent(new CustomEvent('jampanion-library-cleared', { detail: { songs: removedSongs } }));\n  el.settingsDialog.close();");
  if (!html.includes(oldDeleteAll)) throw new Error('Viewer delete-all handler was not found for the customization controls.');
  html = html.replace(oldDeleteAll, newDeleteAll);

  const oldExport = 'window.__chartViewer = { state, parseIRealCollection, buildRows, expandChartBars, deriveEndingNumbers, displayComposer, normaliseStaffText };\ninitialiseLibrary();';
  const newExport = 'const libraryReady = initialiseLibrary();\nwindow.__chartViewer = { state, parseIRealCollection, buildRows, expandChartBars, deriveEndingNumbers, displayComposer, normaliseStaffText, libraryReady, restoreSongsByIds };\n// JAMPANION_CUSTOMIZED_SONGS_V1';
  if (!html.includes(oldExport)) throw new Error('Viewer export block was not found for the startup patch.');
  html = html.replace(oldExport, newExport);

  const loadingCss = `  <style data-jampanion-library-loading="v1">
    body.jampanion-library-loading .toolbar-main { pointer-events: none; opacity: .72; }
    .library-loading { display: grid; place-items: center; min-height: 220px; color: #53636a; font: 16px/1.4 system-ui, sans-serif; }
    @media (max-width: 620px) { .library-loading { min-height: 180px; font-size: 14px; } }
  </style>\n`;
  if (html.includes('</head>')) html = html.replace('</head>', `${loadingCss}</head>`);
  else throw new Error('Viewer HTML has no closing head for the library loading style.');
  html = html.replace('const libraryReady = initialiseLibrary();', `const libraryReady = initialiseLibrary();\n// ${libraryStartupMarker}\n// ${librarySearchUnlockMarker}`);
  changed = true;
}

// A reused generated Viewer may already contain the startup patch above, but
// still miss the post-load search unlock from a previous build.
if (!html.includes(librarySearchUnlockMarker) && html.includes('function renderLoadingState() {')) {
  const oldLoadingGuard = `  if (state.libraryLoading) {
    renderLoadingState();
    return;
  }
`;
  const newLoadingGuard = `${oldLoadingGuard}  if (!document.body.classList.contains('jampanion-playback')) {
    document.body.classList.remove('jampanion-library-loading');
    el.search.disabled = false;
    el.search.removeAttribute('aria-busy');
  }
`;
  if (!html.includes(oldLoadingGuard)) throw new Error('Viewer render loading guard was not found for the search unlock patch.');
  html = html.replace(oldLoadingGuard, newLoadingGuard);
  const oldMarker = `// ${libraryStartupMarker}`;
  if (html.includes(oldMarker)) html = html.replace(oldMarker, `${oldMarker}\n// ${librarySearchUnlockMarker}`);
  else html += `\n// ${librarySearchUnlockMarker}\n`;
  changed = true;
}

// Keep the Viewer from clearing the transient transpose during selection. In
// Jampanion, transpose is a per-song saved setting; the host reapplies that
// setting after the Viewer selection event, and unsaved songs correctly fall
// back to zero.
const selectionTransposeMarker = 'JAMPANION_SELECTION_TRANSPOSE_V1';
const oldSelectSong = `function selectSong(songId) {
  state.selectedId = songId;
  state.semitones = 0;
  state.searchOpen = false;
  state.searchActiveIndex = -1;
  render();
  saveLastSong(currentSong());
  el.search.blur();
}`;
const newSelectSong = `function selectSong(songId) {
  state.selectedId = songId;
  state.searchOpen = false;
  state.searchActiveIndex = -1;
  render();
  saveLastSong(currentSong());
  el.search.blur();
}
// ${selectionTransposeMarker}`;
if (!html.includes(selectionTransposeMarker)) {
  if (html.includes(oldSelectSong)) {
    html = html.replace(oldSelectSong, newSelectSong);
    changed = true;
  }
}

// Keep the generated Viewer patch idempotent when a previously customized
// .build directory is reused instead of being freshly cloned.
const customizedSongsRuntimeMarker = 'JAMPANION_CUSTOMIZED_SONGS_V1';
if (!html.includes(customizedSongsRuntimeMarker) && html.includes("el.deleteAll.addEventListener('click'")) {
  const oldDeleteAll = `el.deleteAll.addEventListener('click', async () => {
  if (!confirm('Delete all imported songs?')) return;
  try {
    await clearSongLibrary();
  } catch (error) {
    alert(error instanceof Error ? error.message : String(error));
    return;
  }
  state.songs = [DEMO_SONG];
  state.preservedLibraryEntries = [];
  state.libraryWarnings = [];
  state.selectedId = DEMO_SONG.id;
  state.semitones = 0;
  saveLastSong(DEMO_SONG);
  el.settingsDialog.close();
  render();
});`;
  const runtime = `async function restoreSongsByIds(songIds) {
  const ids = new Set((Array.isArray(songIds) ? songIds : []).map((id) => String(id)));
  if (!ids.size) return { restored: 0 };
  const targets = state.songs.filter((song) => ids.has(String(song.id)) && song.source !== 'demo');
  if (!targets.length) return { restored: 0 };
  const restoredById = new Map();
  for (const song of targets) {
    const original = song.originalSourceRecord;
    if (song.originalSourceSong) {
      restoredById.set(String(song.id), JSON.parse(JSON.stringify(song.originalSourceSong)));
      continue;
    }
    if (!original?.body || typeof parseIRealCollection !== 'function') {
      restoredById.set(String(song.id), song);
      continue;
    }
    try {
      const protocol = /^(?:irealb|irealbook):\\/\\/$/i.test(original.protocol || '') ? original.protocol : 'irealb://';
      restoredById.set(String(song.id), parseIRealCollection(\`\${protocol}\${encodeURIComponent(original.body)}\`).songs?.[0] || song);
    } catch {
      restoredById.set(String(song.id), song);
    }
  }
  const restoredSongs = state.songs.map((song) => restoredById.get(String(song.id)) || song);
  await saveSongLibrary(restoredSongs.filter((song) => song.source !== 'demo'), state.preservedLibraryEntries);
  state.songs = restoredSongs;
  const selectedReplacement = restoredById.get(String(state.selectedId));
  if (selectedReplacement) state.selectedId = selectedReplacement.id;
  state.semitones = 0;
  saveLastSong(currentSong());
  render();
  return { restored: targets.length };
}

${oldDeleteAll}`
    .replace("  if (!confirm('Delete all imported songs?')) return;", `  const importedSongs = state.songs.filter((song) => song.source !== 'demo');
  if (!importedSongs.length) {
    alert('No imported songs to delete.');
    return;
  }
  if (!confirm('Delete all imported songs?')) return;
  const removedSongs = state.songs.filter((song) => song.source !== 'demo').map((song) => ({
    id: song.id,
    nativeIdentity: song.nativeIdentity || '',
    title: song.title || '',
    composer: song.composer || '',
    source: song.source || '',
    sourceRecord: song.sourceRecord || null,
    originalSourceRecord: song.originalSourceRecord || null,
    originalSourceSong: song.originalSourceSong || null
  }));`)
    .replace("  saveLastSong(DEMO_SONG);\n  el.settingsDialog.close();", "  saveLastSong(DEMO_SONG);\n  window.dispatchEvent(new CustomEvent('jampanion-library-cleared', { detail: { songs: removedSongs } }));\n  el.settingsDialog.close();");
  if (html.includes(oldDeleteAll)) html = html.replace(oldDeleteAll, runtime);
  else throw new Error('Viewer delete-all handler was not found for the customized-song runtime patch.');

  const oldExport = 'window.__chartViewer = { state, parseIRealCollection, buildRows, expandChartBars, deriveEndingNumbers, displayComposer, normaliseStaffText, libraryReady };';
  const newExport = 'window.__chartViewer = { state, parseIRealCollection, buildRows, expandChartBars, deriveEndingNumbers, displayComposer, normaliseStaffText, libraryReady, restoreSongsByIds };';
  if (!html.includes(oldExport)) throw new Error('Viewer export block was not found for the customized-song runtime patch.');
  html = html.replace(oldExport, `${newExport}\n// ${customizedSongsRuntimeMarker}`);
  changed = true;
}

const marker = 'data-jampanion-embedded-bridge="v12"';
if (!html.includes(marker)) {
  const bridge = `\n  <script type="module" ${marker}>\n    import { initializeEmbeddedViewer } from "../js/jazz-chart-host.js?v=22";\n    initializeEmbeddedViewer().catch(error => {\n      console.error("Jampanion embedded bridge failed", error);\n      document.documentElement.classList.remove("jampanion-startup-pending");\n      const bridgeTargetOrigin = window.location.origin === "null" ? "*" : window.location.origin;\n      window.parent?.postMessage({\n        channel: "jampanion-jcv-v12",\n        type: "bridge-error",\n        error: error instanceof Error ? error.message : String(error)\n      }, bridgeTargetOrigin);\n    });\n  </script>\n`;
  if (!html.includes('</body>')) throw new Error('Viewer HTML has no closing body tag.');
  const freshBridge = bridge.replace('jazz-chart-host.js?v=22', 'jazz-chart-host.js?v=52');
  html = html.replace('</body>', `${freshBridge}</body>`);
  changed = true;
}
if (changed) fs.writeFileSync(resolved, html);
