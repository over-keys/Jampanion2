import fs from "node:fs";

const file = process.argv[2];
if (!file) throw new Error("usage: test-help-en-contract.mjs viewer/help.en.html");
const source = fs.readFileSync(file, "utf8");
const requirements = [
  ["Jampanion English help title", /<title>Help · Jampanion2<\/title>/],
  ["Jampanion English opening description", /Jampanion2 displays[\s\S]*practice or play along with piano, bass, and drums/],
  ["English accompaniment and editing section", /id="jampanion"/],
  ["English session instructions", /Start session[\s\S]*Stop/],
  ["English head out instructions", /Back to head[\s\S]*Head Out[\s\S]*returns to the theme[\s\S]*Head out queued/],
  ["English head out distinction", /Stop vs Head Out[\s\S]*Stop stops the accompaniment[\s\S]*Head Out keeps playback running/],
  ["English Save instructions", /chart edits, rehearsal marks, the transposed key, tempo, and style changes[\s\S]*press Save/],
  ["English revert instructions", /restores the original iReal chart/],
  ["English revert settings instructions", /Revert resets saved key, tempo, and style settings/],
  ["English key persistence instructions", /Key[\s\S]*saved per song when you press Save and restored next time/],
  ["English four-bar style changes", /next four-bar boundary/],
  ["English rehearsal mark editing instructions", /Double-click the left side of a row without a mark[\s\S]*Confirm an empty value to remove it/],
  ["English rehearsal style context instructions", /Right-click a rehearsal mark or its bar[\s\S]*assign a section style only/]
];
for (const [name, pattern] of requirements) {
  if (!pattern.test(source)) throw new Error(`Jampanion English help contract missing: ${name}`);
}
console.log(`Jampanion English help contract passed (${requirements.length} checks).`);
