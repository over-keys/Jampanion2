import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
const modulePath = resolve(process.argv[2] || "integration/overlay/src/Jampanion.Web/wwwroot/js/jazz-chart-host.js");
const {
  gridCellToTick,
  buildSoloSequenceWithExpander,
  buildHeadOutSequenceWithExpander,
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
if (dsSolo.join(",") !== "30,31,32") throw new Error(`D.S. first-pass solo route wrong: ${dsSolo}`);
if (sawDirectiveInExpander) throw new Error("D.S./D.C. directive was not stripped from solo-loop expansion");

console.log(`Timing/form tests passed (${cases.length} timing + 3 form cases).`);

const headOutCoda = [{}, { codaEnd: true }, { note: "tag-to-skip" }, { codaStart: true }, {}];
const headOutRoute = buildHeadOutSequenceWithExpander(headOutCoda, 40, identityExpander).map(x => x.sourceIndex);
if (headOutRoute.join(",") !== "40,41,43,44") throw new Error(`standalone Coda head-out jump wrong: ${headOutRoute}`);
console.log("Standalone Coda head-out test passed.");

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
