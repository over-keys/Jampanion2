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
  ["English Save instructions", /chart edits, rehearsal marks, tempo, and style changes[\s\S]*press Save/],
  ["English four-bar style changes", /next four-bar boundary/]
];
for (const [name, pattern] of requirements) {
  if (!pattern.test(source)) throw new Error(`Jampanion English help contract missing: ${name}`);
}
console.log(`Jampanion English help contract passed (${requirements.length} checks).`);
