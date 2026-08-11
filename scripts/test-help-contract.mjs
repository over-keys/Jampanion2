import fs from "node:fs";

const file = process.argv[2];
if (!file) throw new Error("usage: test-help-contract.mjs viewer/help.html");
const source = fs.readFileSync(file, "utf8");
const requirements = [
  ["Jampanion help title", /<title>ヘルプ · Jampanion2<\/title>/],
  ["Jampanion opening description", /iReal形式[\s\S]*伴奏に合わせて練習・演奏できるアプリです/],
  ["accompaniment and editing section", /id="jampanion"/],
  ["session instructions", /Start session[\s\S]*Stop/],
  ["head out instructions", /Back to head[\s\S]*Head Out[\s\S]*テーマに戻って[\s\S]*Head out queued/],
  ["head out distinction", /StopとHead Outの違い[\s\S]*Stopはその場で伴奏を止めます[\s\S]*Head Outは/],
  ["single Save instructions", /コード、リハーサルマーク、テンポ、スタイルの変更[\s\S]*Save/],
  ["four-bar style changes", /次の4小節区切り/],
  ["chord editing instructions", /コードを<strong>ダブルクリック<\/strong>/],
  ["rehearsal style instructions", /Swing \/ Latin \/ Bossa \/ Ballad/],
  ["mixer persistence instructions", /Piano、Bass、Drumsの音量とミュート[\s\S]*保存/],
  ["MIDI instructions", /Audio &amp; MIDI[\s\S]*MIDI input[\s\S]*MIDI output/]
];
for (const [name, pattern] of requirements) {
  if (!pattern.test(source)) throw new Error(`Jampanion help contract missing: ${name}`);
}
console.log(`Jampanion help contract passed (${requirements.length} checks).`);
