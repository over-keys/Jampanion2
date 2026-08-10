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
  ["XyQ three-chord 4/4 normalization", /meterTop === 4 && meterBottom === 4 && chordSlots\.length === 3[\s\S]*rawCells\[2\] === 3[\s\S]*starts = \[0, Math\.floor\(totalCells \/ 2\), Math\.floor\(totalCells \* 3 \/ 4\)\]/],
  ["four-column responsive layout", /function\s+responsiveColumns\s*\([^)]*\)\s*\{\s*return\s+4\s*;/s],
  ["embedded v12 bridge", /data-jampanion-embedded-bridge="v12"/]
];
for (const [name, pattern] of requirements) {
  if (!pattern.test(source)) throw new Error(`Pinned Jazz Chart Viewer contract missing: ${name}`);
}
console.log(`Pinned Jazz Chart Viewer integration contract passed (${requirements.length} checks).`);
