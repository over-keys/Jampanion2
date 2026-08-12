import { readFileSync } from "node:fs";

const htmlPath = process.argv[2];
if (!htmlPath) throw new Error("Usage: node test-viewer-navigation.mjs VIEWER_INDEX_HTML");

const html = readFileSync(htmlPath, "utf8");
const start = html.indexOf("const __expand = (() => {");
const end = html.indexOf("\n})();\nconst { expandChartBars", start);
if (start < 0 || end < 0) throw new Error("Viewer expansion module was not found.");

const body = html.slice(start + "const __expand = (() => {".length, end);
const { expandChartBars } = Function(body)();
const route = bars => expandChartBars(bars).map(bar => bar._sourceIndex);

function assertRoute(name, bars, expected) {
  const actual = route(bars);
  if (actual.join(",") !== expected.join(",")) {
    throw new Error(`${name}: expected ${expected}, got ${actual}`);
  }
  console.log(`PASS ${name}: ${actual.join(" -> ")}`);
}

assertRoute("ordinary repeat", [
  { startRepeat: true }, { marker: "A" }, { endRepeat: true }, { final: true }
], [0, 1, 2, 0, 1, 2, 3]);

assertRoute("numbered endings", [
  { startRepeat: true }, { marker: "A" }, { ending: 1, endRepeat: true },
  { ending: 2, final: true }
], [0, 1, 2, 0, 1, 3]);

assertRoute("D.C. al Fine", [
  { marker: "A" }, { marker: "B" },
  { navigationSymbols: ["D.C. al Fine"], symbols: ["D.C. al Fine"] },
  { symbols: ["Fine"], displayDirectives: ["D.C. al Fine"], final: true }
], [0, 1, 2, 3, 0, 1, 2, 3]);

assertRoute("D.S. al Fine", [
  { symbols: ["segno"], marker: "A" }, { marker: "B" },
  { navigationSymbols: ["D.S. al Fine"], symbols: ["D.S. al Fine"] },
  { symbols: ["Fine"], displayDirectives: ["D.S. al Fine"], final: true }
], [0, 1, 2, 3, 0, 1, 2, 3]);

assertRoute("D.S. without Segno uses the head", [
  { marker: "A" }, { marker: "B" },
  { navigationSymbols: ["D.S. al Fine"], symbols: ["D.S. al Fine"] },
  { symbols: ["Fine"], displayDirectives: ["D.S. al Fine"], final: true }
], [0, 1, 2, 3, 0, 1, 2, 3]);

assertRoute("standalone To Coda/Coda stays written", [
  { marker: "A" }, { codaEnd: true, symbols: ["coda"] },
  { codaStart: true, symbols: ["coda"] }, { marker: "Coda", final: true }
], [0, 1, 2, 3]);

assertRoute("D.C. al Coda", [
  { marker: "A" }, { codaEnd: true, symbols: ["coda"] },
  { navigationSymbols: ["D.C. al Coda"], symbols: ["D.C. al Coda"] },
  { codaStart: true, symbols: ["coda"] },
  { marker: "Coda", displayDirectives: ["D.C. al Coda"], final: true }
], [0, 1, 2, 3, 4, 0, 1, 3, 4]);

assertRoute("D.S. al Coda", [
  { symbols: ["segno"], marker: "A" }, { codaEnd: true, symbols: ["coda"] },
  { navigationSymbols: ["D.S. al Coda"], symbols: ["D.S. al Coda"] },
  { codaStart: true, symbols: ["coda"] },
  { marker: "Coda", displayDirectives: ["D.S. al Coda"], final: true }
], [0, 1, 2, 3, 4, 0, 1, 3, 4]);

assertRoute("D.C. al 3rd End.", [
  { startRepeat: true }, { marker: "A" }, { ending: 1, endRepeat: true },
  { ending: 2, endRepeat: true },
  { navigationSymbols: ["D.C. al 3rd End."], symbols: ["D.C. al 3rd End."], displayDirectives: ["D.C. al 3rd End."] },
  { ending: 3, final: true }
], [0, 1, 2, 0, 1, 3, 4, 0, 1, 5]);

console.log("Viewer navigation tests passed.");
