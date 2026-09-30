import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'src/Jampanion.Web/wwwroot/viewer/index.html'), 'utf8');
function moduleBody(name, extra = '') {
  const marker = `const __${name} = (() => {`;
  const start = html.indexOf(marker) + marker.length;
  const end = html.indexOf('\n})();', start);
  assert.ok(start >= marker.length && end > start, `Missing Viewer module ${name}`);
  return html.slice(start, end).replace(/return \{([^\n]*)\};\s*$/, (_, fields) => `return {${fields}${extra}};`);
}
const expansion = Function(moduleBody('expand'))();
const parserContext = vm.createContext({ ...expansion, crypto: webcrypto, console });
const parser = vm.runInContext(`(() => {${moduleBody('ireal')}})()`, parserContext);
const music = Function(moduleBody('music'))();
const rendererContext = vm.createContext({ ...expansion, ...music, displayComposer: value => value });
const renderer = vm.runInContext(`(() => {${moduleBody('chartRenderer', ',resolveMusicalCellLayout,normaliseChordSlots')}})()`, rendererContext);
const layout = vm.runInContext(`(() => {${moduleBody('layout')}})()`, rendererContext);
function importSong(raw) {
  return parser.parseIRealCollection(`irealbook://${encodeURIComponent(`Regression=Tester=Swing=C=n=${raw}`)}`).songs[0];
}
function route(raw) { return expansion.expandChartBars(importSong(raw).bars).map(bar => bar._sourceIndex); }
assert.deepEqual(route('{C|N1D}N2E]{F|N1G}N2A<fine>]<D.C. al Fine>BZ'), [0,1,0,2,3,4,3,5,6,0,2,3,5]);
assert.deepEqual(route('{SC|N1D}N2E]{F|N1G}N2A<fine>]<D.S. al Fine>BZ'), [0,1,0,2,3,4,3,5,6,0,2,3,5]);
assert.deepEqual(route('{C|N1D}N2E|YF}N3GZ'), route('{C|N1D}N2E|F}N3GZ'));
assert.deepEqual(route('{C|N1D}N2E|YF}N3GZ'), [0,1,0,2,3,0,4]);
assert.throws(() => importSong('{C<100000000x>}'), /Repeat count/);
assert.throws(() => expansion.expandChartBars([{ startRepeat: true, endRepeat: true, repeatCount: 100000000 }]), /Repeat count/);
assert.throws(() => route('{C<64x>|{D<64x>|{E<64x>}F}G}'), /exceeds 8192 bars/);
assert.equal(route('{C<64x>}').length, 64);
console.log('PASS Expanded: local endings, D.C./D.S. Fine, layout breaks, repeat and total expansion limits');

// The fixed grid is persisted with edited native charts. Verify both note
// positions and the markup consumed by the accompaniment timing compiler.
const notation = { major: '△', minor: 'm', halfDim: 'ø7', dim: '○7' };
for (const [meter, total, cells] of [['4/4',32,[0,8,24]], ['3/4',24,[0,8,16]]]) {
  const bar = { timeSignature: meter, jampanionGridCells: total, chordSlots: cells.map((cell, i) => ({ chord: ['C','F','G'][i], cell })) };
  const starts = () => Array.from(renderer.resolveMusicalCellLayout(bar, renderer.normaliseChordSlots(bar)).slots, slot => slot.startCell);
  assert.deepEqual(starts(), cells);
  bar.chordSlots.pop();
  assert.deepEqual(starts(), cells.slice(0,2));
  bar.chordSlots.shift();
  assert.deepEqual(starts(), [8]);
  const markup = renderer.renderChartMarkup({ title: 'Regression', key: 'C', timeSignature: meter }, layout.buildRows(layout.resolveTimeSignatures([bar], meter)), notation, 4);
  assert.match(markup, /data-grid-start="8"/);
  assert.match(markup, new RegExp(`data-grid-total="${total}"`));
}
// Import-time compact spacing still retains its established normalization.
assert.deepEqual(Array.from(renderer.resolveMusicalCellLayout({ timeSignature:'4/4' }, [{chord:'C',cell:0},{chord:'F',cell:1},{chord:'G',cell:3}]).slots, slot => slot.startCell), [0,16,24]);
console.log('PASS chart edits: remaining chords keep their beats in 3/4 and 4/4; imported spacing is preserved');

const persisted = new Map();
const localStorage = { getItem: key => persisted.get(key) ?? null, setItem: (key, value) => persisted.set(key, value), removeItem: key => persisted.delete(key) };
const storageContext = vm.createContext({ ...parser, localStorage, console });
const library = vm.runInContext(`(() => {${moduleBody('storage')}})()`, storageContext);
const imported = importSong('C|F|G|CZ');
const edited = { ...structuredClone(imported), source:'native', nativeIdentity:'imported', title:'Edited', originalSourceRecord: imported.sourceRecord };
const newNative = { id:'new', source:'native', nativeIdentity:'native:new', title:'New' };
await library.saveSongLibrary([edited, newNative]);
let loaded = await library.loadSongLibrary();
assert.equal(loaded.songs.length, 1);
assert.equal(loaded.songs[0].title, 'Regression');
assert.equal(loaded.songs[0].source, 'ireal');

// Exercise the Viewer callback that cleans previously saved duplicate objects.
const cleanupStart = html.indexOf('async function saveLibraryAfterNativeRemoval(');
const cleanupEnd = html.indexOf('\nfunction updateCurrentSongDeleteButton', cleanupStart);
const cleanupContext = vm.createContext({ state: { songs:[], preservedLibraryEntries:[] }, saveSongLibrary: library.saveSongLibrary });
vm.runInContext(html.slice(cleanupStart, cleanupEnd), cleanupContext);
const deleteStart = html.indexOf('async function deleteSongById(');
const deleteEnd = html.indexOf('\nasync function deleteCurrentSongWithConfirmation', deleteStart);
cleanupContext.DEMO_SONG = { id:'demo', title:'Demo', source:'demo' };
cleanupContext.saveLastSong = () => {};
cleanupContext.render = () => {};
cleanupContext.currentSong = () => cleanupContext.state.songs.find(song => song.id === cleanupContext.state.selectedId);
vm.runInContext(html.slice(deleteStart, deleteEnd), cleanupContext);
const other = parser.parseIRealCollection('irealbook://' + encodeURIComponent('Other=Tester=Swing=C=n=C|C|CZ')).songs[0];
cleanupContext.state.songs = [edited, other];
cleanupContext.state.selectedId = edited.id;
let removedOverrides = false;
await vm.runInContext('deleteSongById', cleanupContext)(edited.id, async () => { removedOverrides = true; });
assert.equal(removedOverrides, true);
assert.equal(cleanupContext.state.songs.length, 1);
assert.equal(cleanupContext.state.songs[0].id, other.id);
assert.equal((await library.loadSongLibrary()).songs.length, 1);
assert.equal((await library.loadSongLibrary()).songs[0].title, 'Other');
const remainingId = cleanupContext.state.songs[0].id;
await vm.runInContext('deleteSongById', cleanupContext)(remainingId);
assert.equal(cleanupContext.state.songs[0].source, 'demo');
assert.equal((await library.loadSongLibrary()).songs.length, 0);
console.log('PASS single-song deletion: other songs persist; last-song deletion falls back to demo without saving it');

const nativeRecords = new Map();
const listeners = new Map();
const timers = [];
const hostContext = vm.createContext({ console, structuredClone, localStorage, setTimeout: fn => { timers.push(fn); }, window:{ confirm:()=>true }, MutationObserver:class { observe(){} }, testRecords:nativeRecords });
const host = fs.readFileSync(path.join(root,'src/Jampanion.Web/web-src/jazz-chart-host.js'),'utf8').replace(/\bexport /g,'');
vm.runInContext(host, hostContext);
hostContext.docStub = { getElementById: id => id === 'chartPage' ? {} : null, addEventListener:(event,fn)=>listeners.set(event,fn) };
hostContext.testViewer = { state: { songs:[edited, newNative], selectedId:edited.id, semitones:3 }, parseIRealCollection: parser.parseIRealCollection, saveLibraryAfterNativeRemoval: async (id, restored) => {
  cleanupContext.state.songs = hostContext.testViewer.state.songs;
  await vm.runInContext('saveLibraryAfterNativeRemoval', cleanupContext)(id, restored);
}};
// Substitute only UI effects and the storage boundary. The save/delete/revert,
// dirty flag, selection and serialization functions under test remain real.
vm.runInContext(`embeddedMode=true; viewer=testViewer; doc=docStub;
  annotateRenderedBars=()=>{}; forceRender=()=>{}; queueBootstrapNotification=()=>{};
  updateStandaloneSaveButton=()=>{}; annotateSongOptions=()=>{}; updateCustomizedSongsButton=()=>{};
  rememberSelectedSong=()=>{}; getBootstrap=()=>({selectedId:viewer.state.selectedId});
  openNativeDb=async()=>({close(){}});
  transactionRequest=async(db,mode,operation)=>operation({put(record){testRecords.set(record.identity,structuredClone(record.song));},delete(identity){testRecords.delete(identity);}});
`, hostContext);
const runHost = code => vm.runInContext(code, hostContext);

// A legacy Viewer copy and native DB copy must both disappear on deletion.
persisted.set('ireal-chart-viewer-local-library-v1', JSON.stringify({ schemaVersion:1, entries:[{kind:'legacy',song:newNative}] }));
nativeRecords.set('native:new', newNative);
hostContext.testViewer.state.selectedId = 'new';
await runHost('deleteCurrentNativeSong()');
assert.equal(nativeRecords.has('native:new'), false);
assert.equal((await library.loadSongLibrary()).songs.length, 1); // Other imported chart retained.
assert.equal((await library.loadSongLibrary()).songs[0].source, 'ireal');
// Individual Revert cleans a legacy edited copy and restores its original.
persisted.set('ireal-chart-viewer-local-library-v1', JSON.stringify({ schemaVersion:1, entries:[{kind:'legacy',song:edited}] }));
nativeRecords.set('imported', edited);
hostContext.testViewer.state.songs = [edited];
hostContext.testViewer.state.selectedId = edited.id;
const reverted = await runHost('revertCurrentSong()');
assert.equal(reverted.changed, true);
assert.equal(nativeRecords.has('imported'), false);
assert.equal((await library.loadSongLibrary()).songs[0].title, 'Regression');
console.log('PASS persistence: imports preserve originals; legacy native deletion and Revert survive library reload');

hostContext.window.confirm = () => false;
runHost('toolbarHasUnsavedChanges=true; viewer.state.semitones=3;');
const canceled = await runHost('revertCurrentSong()');
assert.equal(canceled.changed, false);
assert.equal(runHost('toolbarHasUnsavedChanges'), true);
assert.equal(hostContext.testViewer.state.semitones, 3);
runHost('installChartListeners()');
listeners.get('click')({ target:{closest:selector=>selector==='[data-favorite-song-id]'?{}:null} });
for (const timer of timers.splice(0)) timer();
assert.equal(hostContext.testViewer.state.semitones, 3);
listeners.get('click')({ target:{closest:selector=>selector==='[data-song-id]'?{}:null} });
for (const timer of timers.splice(0)) timer();
assert.equal(hostContext.testViewer.state.semitones, 0);
runHost('viewer.state.semitones=3;');
listeners.get('click')({ target:{closest:selector=>selector==='[data-song-id]'?{}:null} });
for (const timer of timers.splice(0)) timer();
assert.equal(hostContext.testViewer.state.semitones, 3);
runHost('viewer.state.songs[0].source="native"; restoreSelectedSongTranspose();');
assert.equal(hostContext.testViewer.state.semitones, 3);
console.log('PASS interaction: canceled Revert, favorites and same-song refresh preserve drafts; changed selection restores saved transpose');

// A write failure must reject Save without clearing the dirty flag. Retrying
// must persist the same draft and then clear it.
hostContext.testViewer.state.songs = [edited];
hostContext.testViewer.state.selectedId = edited.id;
runHost('toolbarHasUnsavedChanges=true; transactionRequest=async()=>{throw new Error("QuotaExceededError")};');
await assert.rejects(runHost('saveCurrentChart()'), /QuotaExceededError/);
assert.equal(runHost('toolbarHasUnsavedChanges'), true);
runHost('transactionRequest=async(db,mode,operation)=>operation({put(record){testRecords.set(record.identity,structuredClone(record.song))}});');
await runHost('saveCurrentChart()');
assert.equal(nativeRecords.get('imported').title, 'Edited');
assert.equal(runHost('toolbarHasUnsavedChanges'), false);
const setItem = localStorage.setItem;
localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
runHost('toolbarHasUnsavedChanges=true;');
await assert.rejects(runHost('saveCurrentChart()'), /settings could not be saved/);
assert.equal(runHost('toolbarHasUnsavedChanges'), true);
localStorage.setItem = setItem;
console.log('PASS Save: native and settings storage failures remain retryable and dirty');

let fetchCount = 0;
const synths = [];
class Synth {
  constructor() { this.bankCount=0; this.soundBankManager={addSoundBank:async()=>{this.bankCount++;}}; this.isReady=Promise.resolve(); synths.push(this); }
  connect(){} setLogLevel(){} setSystemParameter(){} programChange(){} controllerChange(){}
  disconnect(){this.disconnected=true;} destroy(){this.destroyed=true;}
}
const audioClock={state:'running',currentTime:0,audioWorklet:{addModule:async()=>{}},resume:async()=>{}};
const audioContext = vm.createContext({ URL, console, WorkletSynthesizer:Synth, navigator:{}, window:{ AudioContext:class{constructor(){return audioClock}},AudioWorkletNode:class{},addEventListener(){} }, fetch:async()=>({ok:++fetchCount>1,status:503,arrayBuffer:async()=>new ArrayBuffer(1)}) });
const audio = fs.readFileSync(path.join(root,'src/Jampanion.Web/web-src/jampanion-audio.js'),'utf8').replace(/^import .*$/m,'').replace(/\bexport /g,'').replace(/import.meta.url/g,JSON.stringify('https://example.test/js/audio.js'));
vm.runInContext(audio,audioContext);
const first = [vm.runInContext('primeAudio()',audioContext),vm.runInContext('primeAudio()',audioContext)];
for (const promise of first) await assert.rejects(promise,/SoundFont download failed/);
assert.equal(fetchCount,1);
assert.equal(synths[0].destroyed,true);
await vm.runInContext('primeAudio()',audioContext);
assert.equal(fetchCount,2);
assert.equal(synths.length,2);
assert.equal(synths[1].bankCount,1);
console.log('PASS audio: concurrent callers see the download failure; retry destroys the partial synth and loads the sound bank');

// Drive the real edit callbacks, rather than merely setting fixed-grid metadata.
runHost('openEditor=(anchor,value,commit)=>{globalThis.commitEdit=commit}; openEditorAtPoint=(x,y,value,commit)=>{globalThis.commitEdit=commit}; edited=async()=>{};');
for (const [meter, originalCells, expectedCells, removeIndex] of [
  ['4/4',[0,8,24],[0,8],2], ['4/4',[0,16],[16],0], ['3/4',[0,8,16],[0,8],2]
]) {
  const bar = { timeSignature:meter, chordSlots:originalCells.map((cell,index)=>({chord:['C','F','G'][index],cell})), cellCount:32 };
  const positioned = renderer.resolveMusicalCellLayout(bar, renderer.normaliseChordSlots(bar));
  const domSlots = positioned.slots.map((slot,index)=>({ dataset:{slotIndex:String(index),gridStart:String(slot.startCell),gridTotal:String(positioned.totalCells)} }));
  const barElement = {querySelectorAll:selector=>selector==='.chord-slot'?domSlots:[]};
  hostContext.anchor = {closest:()=>barElement};
  hostContext.testViewer.state.songs = [{id:'editor',title:'Editor',source:'native',timeSignature:meter,bars:[bar]}];
  hostContext.testViewer.state.selectedId = 'editor';
  runHost(`editChord(0,${removeIndex},anchor)`);
  await hostContext.commitEdit('');
  assert.deepEqual(Array.from(renderer.resolveMusicalCellLayout(bar, renderer.normaliseChordSlots(bar)).slots,slot=>slot.startCell),expectedCells);
}
for (const [meter,total,width,clickX,expectedCell] of [['4/4',32,128,70,16], ['3/4',24,96,70,16]]) {
  const rect = {left:0,top:0,width,height:64};
  const domSlot = { dataset:{slotIndex:'0',gridStart:'0',gridTotal:String(total)}, classList:{contains:()=>true},getBoundingClientRect:()=>rect,querySelector:()=>({getBoundingClientRect:()=>rect}) };
  hostContext.emptyBarElement = {querySelectorAll:selector=>selector==='.chord-slot'?[domSlot]:[],getBoundingClientRect:()=>rect,querySelector:()=>({getBoundingClientRect:()=>rect})};
  const bar = {timeSignature:meter,chordSlots:[],chords:[],jampanionNoChord:true,cellCount:8};
  hostContext.testViewer.state.songs = [{id:'empty',title:'Empty',source:'native',timeSignature:meter,bars:[bar]}];
  hostContext.testViewer.state.selectedId = 'empty';
  runHost(`addChordAtPoint(0,emptyBarElement,${clickX})`);
  await hostContext.commitEdit('F');
  const markup = renderer.renderChartMarkup({title:'Empty',key:'C',timeSignature:meter},layout.buildRows(layout.resolveTimeSignatures([bar],meter)),notation,4);
  assert.match(markup,new RegExp(`data-grid-start="${expectedCell}"`));
}
console.log('PASS edit callbacks: deleting chords freezes their rendered beats; first insertion on a later beat stays there');
