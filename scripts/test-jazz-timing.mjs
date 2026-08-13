import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
const modulePath = resolve(process.argv[2] || "integration/overlay/src/Jampanion.Web/wwwroot/js/jazz-chart-host.js");
const {
  gridCellToTick,
  buildSoloSequenceWithExpander,
  buildHeadOutSequenceWithExpander,
  materializeSequence,
  extractIRealTempoFromRecord,
  extractIRealPlayerStyleFromRecord
} = await import(pathToFileURL(modulePath).href);

const cases = [
  ["4/4 beat 1", 0, 8, "4/4", 0],
  ["4/4 beat 3", 4, 8, "4/4", 960],
  ["4/4 3&", 5, 8, "4/4", 1200],
  ["4/4 beat 4", 6, 8, "4/4", 1440],
  ["4/4 4&", 7, 8, "4/4", 1680],
  ["3/4 midpoint", 3, 6, "3/4", 720],
  ["3/4 beat 3", 4, 6, "3/4", 960],
];
for (const [name, start, total, meter, expected] of cases) {
  const actual = gridCellToTick(start, total, meter);
  if (actual !== expected) throw new Error(`${name}: expected ${expected}, got ${actual}`);
}

// Known Jazz 1460 regression geometries from the approved Chart Viewer audit.
const specialTicks = [0, 16, 24].map(cell => gridCellToTick(cell, 32, "4/4"));
if (specialTicks.join(",") !== "0,960,1440")
  throw new Error(`9.20 Special timing regressed: ${specialTicks}`);
const balladTicks = [16, 20, 24, 28].map(cell => gridCellToTick(cell, 32, "4/4"));
if (balladTicks.join(",") !== "960,1200,1440,1680")
  throw new Error(`A Ballad 3/3&/4/4& timing regressed: ${balladTicks}`);

const identityExpander = bars => bars.map((bar, index) => ({ ...bar, _sourceIndex: index }));
const ordinary = [{}, {}, {}];
const ordinarySolo = buildSoloSequenceWithExpander(ordinary, 10, identityExpander).map(x => x.sourceIndex);
if (ordinarySolo.join(",") !== "10,11,12") throw new Error(`ordinary solo route wrong: ${ordinarySolo}`);

const standaloneCoda = [{}, {}, { codaStart: true }, {}];
const codaSolo = buildSoloSequenceWithExpander(standaloneCoda, 20, identityExpander).map(x => x.sourceIndex);
if (codaSolo.join(",") !== "20,21") throw new Error(`standalone Coda leaked into solo loop: ${codaSolo}`);

const dsForm = [{}, {}, { navigationSymbols: ["D.S. al Coda"], symbols: ["D.S. al Coda"] }, { codaStart: true }];
let sawDirectiveInExpander = false;
const dsSolo = buildSoloSequenceWithExpander(dsForm, 30, bars => {
  sawDirectiveInExpander = bars.some(bar => [...(bar.symbols || []), ...(bar.navigationSymbols || [])].some(x => /^D\.[CS]\./i.test(String(x))));
  return identityExpander(bars);
}).map(x => x.sourceIndex);
if (dsSolo.join(",") !== "30,31,32,33") throw new Error(`D.S. full-form solo route wrong: ${dsSolo}`);
if (!sawDirectiveInExpander) throw new Error("D.S./D.C. directive was not passed to the full-form expander");

// Playback route policy must never create a second navigation algorithm. Both
// solo and Head Out receive the complete written form, including the Coda
// destination, and therefore agree for D.C./D.S. charts.
const jumpRouteInputs = [];
const jumpRouteExpander = bars => {
  jumpRouteInputs.push(bars);
  return identityExpander(bars);
};
const jumpSolo = buildSoloSequenceWithExpander(dsForm, 30, jumpRouteExpander)
  .map(x => x.sourceIndex);
const jumpHeadOut = buildHeadOutSequenceWithExpander(dsForm, 30, jumpRouteExpander)
  .map(x => x.sourceIndex);
if (jumpSolo.join(",") !== jumpHeadOut.join(",")) {
  throw new Error(`D.S. solo/head-out routes diverged: solo=${jumpSolo}, headOut=${jumpHeadOut}`);
}
if (jumpRouteInputs.length !== 2 || jumpRouteInputs.some(input => input.length !== dsForm.length)) {
  throw new Error("D.S. playback routes did not use the complete written form");
}

const dcThirdEndingForm = [
  { startRepeat: true },
  {},
  { ending: 1, endRepeat: true },
  { ending: 2, endRepeat: true },
  { symbols: ["D.C. al 3rd End."], navigationSymbols: ["D.C. al 3rd End."], displayDirectives: ["D.C. al 3rd End."] },
  { ending: 3, final: true }
];
const dcThirdEndingExpander = bars => {
  const hasDirective = bars.some(bar => (bar.navigationSymbols || []).some(value => /^D\.C\./i.test(String(value))));
  if (!hasDirective) return identityExpander(bars);
  const route = [0, 1, 2, 0, 1, 3, 4, 0, 1, 5];
  return route.map(index => ({ ...bars[index], _sourceIndex: index }));
};
const dcThirdEndingSolo = buildSoloSequenceWithExpander(dcThirdEndingForm, 50, dcThirdEndingExpander)
  .map(x => x.sourceIndex);
if (dcThirdEndingSolo.join(",") !== "50,51,52,50,51,53,54,50,51,55") {
  throw new Error(`D.C. al 3rd End. route stopped before the target ending: ${dcThirdEndingSolo}`);
}

const playbackBar = (overrides = {}) => ({
  repeatBar: false,
  repeatTwoBars: false,
  repeatTwoBarsContinuation: false,
  chords: [],
  jampanionNoChord: false,
  ...overrides
});
const repeatSong = {
  bars: [
    playbackBar({ chords: ["C7"] }),
    playbackBar({ chords: ["F7"] }),
    playbackBar({ repeatBar: true }),
    playbackBar({ chords: ["Bb7"] })
  ]
};
const repeatTiming = new Map([
  [0, { meter: "4/4", events: [{ startTick: 0, symbol: "C7" }] }],
  [1, { meter: "4/4", events: [{ startTick: 0, symbol: "F7" }] }],
  [2, { meter: "4/4", events: [{ startTick: 0, symbol: "%" }] }],
  [3, { meter: "4/4", events: [{ startTick: 0, symbol: "Bb7" }] }]
]);
const repeatRoute = materializeSequence(
  [0, 1, 2, 3, 0, 2].map(sourceIndex => ({ sourceIndex })),
  repeatSong,
  repeatTiming,
  []
).map(bar => bar.chords[0].symbol);
if (repeatRoute.join(",") !== "C7,F7,F7,Bb7,C7,F7") {
  throw new Error(`written % context was lost after a jump: ${repeatRoute}`);
}

const slashSong = {
  bars: [playbackBar({ chords: ["C7"] }), playbackBar({ chords: ["/", "G7"] })]
};
const slashTiming = new Map([
  [0, { meter: "4/4", events: [{ startTick: 0, symbol: "C7" }] }],
  [1, { meter: "4/4", events: [{ startTick: 0, symbol: "/" }, { startTick: 960, symbol: "G7" }] }]
]);
const slashRoute = materializeSequence(
  [0, 1, 0, 1].map(sourceIndex => ({ sourceIndex })),
  slashSong,
  slashTiming,
  []
).map(bar => bar.chords.map(chord => chord.symbol).join("/"));
if (slashRoute.join(",") !== "C7,C7/G7,C7,C7/G7") {
  throw new Error(`written slash context was lost after a jump: ${slashRoute}`);
}

console.log(`Timing/form tests passed (${cases.length} timing + 6 form cases).`);

const headOutCoda = [
  { marker: "Fm7" },
  { marker: "Fm7", codaEnd: true },
  { marker: "C-7" },
  { marker: "C-7" },
  { marker: "B7#9" },
  { marker: "B7#9" },
  { marker: "Coda", codaStart: true },
  { marker: "Coda" }
];
const headOutRoute = buildHeadOutSequenceWithExpander(headOutCoda, 40, identityExpander).map(x => x.sourceIndex);
if (headOutRoute.join(",") !== "40,41,46,47") throw new Error(`standalone Coda head-out route wrong: ${headOutRoute}`);
console.log("Standalone Coda head-out test passed (To Coda skips the written tail).");

const irealTempo180 = extractIRealTempoFromRecord({
  protocol: "irealb://",
  body: "Twinkle Twinkle=Traditional==Fiddle Tune=G==1r34LbKcu7ABC=Pop-Country=180=1"
});
if (irealTempo180 !== 180) throw new Error(`iReal BPM 180 was not decoded: ${irealTempo180}`);

const encodedForumRecord = encodeURIComponent("Twinkle Twinkle=Traditional==Fiddle Tune=G==1r34LbKcu7ABC=Pop-Country=180=1");
const encodedTempo = extractIRealTempoFromRecord({ protocol: "irealb://", body: encodedForumRecord });
if (encodedTempo !== 180) throw new Error(`URL-encoded iReal BPM 180 was not decoded: ${encodedTempo}`);

const irealTempo118 = extractIRealTempoFromRecord({
  protocol: "irealb://",
  body: "6dim=Composer Unknown==Medium Swing=C=7=1r34LbKcu7XYZ=Jazz-Medium Up Swing 2=118=21"
});
if (irealTempo118 !== 118) throw new Error(`iReal BPM 118 was not decoded: ${irealTempo118}`);

const irealTempoMissing = extractIRealTempoFromRecord({
  protocol: "irealb://",
  body: "Dear Old Stockholm=Traditional==Medium Swing=D-==1r34LbKcu7XYZ=Jazz-Medium Swing=0=3"
});
if (irealTempoMissing !== null) throw new Error(`iReal BPM 0 must mean unspecified: ${irealTempoMissing}`);
console.log("iReal tempo metadata tests passed (180, 118, unspecified 0).");

const playerStyleSwing = extractIRealPlayerStyleFromRecord({
  body: "Tune=Composer==Medium Swing=C==1r34LbKcu7XYZ=Jazz-Medium Up Swing 2=118=1"
});
if (playerStyleSwing !== "Swing") throw new Error(`iReal player Swing style was not decoded: ${playerStyleSwing}`);
const playerStyleBossa = extractIRealPlayerStyleFromRecord({
  body: "Tune=Composer==Medium Swing=C==1r34LbKcu7XYZ=Bossa Nova=140=1"
});
if (playerStyleBossa !== "BossaNova") throw new Error(`iReal player Bossa style was not decoded: ${playerStyleBossa}`);
const unsupportedPlayerStyle = extractIRealPlayerStyleFromRecord({
  body: "Tune=Composer==Medium Swing=C==1r34LbKcu7XYZ=Pop-Country=140=1"
});
if (unsupportedPlayerStyle !== null) throw new Error(`Unsupported iReal player style must fall back to chart style: ${unsupportedPlayerStyle}`);
console.log("iReal player-style metadata tests passed.");
