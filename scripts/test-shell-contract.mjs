import fs from "node:fs";

const targets = process.argv.slice(2);
if (!targets.length) throw new Error("usage: test-shell-contract.mjs file...");
for (const file of targets) {
  const source = fs.readFileSync(file, "utf8");
  if (!source.includes("Jampanion2")) throw new Error(`Jampanion2 branding missing: ${file}`);
  if (source.includes("<strong>Jampanion</strong>")) throw new Error(`Old startup branding remains: ${file}`);
  if (source.includes('const APP_VERSION = "26"')) throw new Error(`Old cache version remains: ${file}`);
}
console.log(`Jampanion2 startup branding contract passed (${targets.length} files).`);
