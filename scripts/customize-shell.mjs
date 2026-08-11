import fs from "node:fs";
import path from "node:path";

const targets = process.argv.slice(2);
if (!targets.length) {
  console.error("Usage: customize-shell.mjs file...");
  process.exit(2);
}

for (const target of targets) {
  const resolved = path.resolve(target);
  if (!fs.existsSync(resolved)) throw new Error(`Startup file not found: ${resolved}`);
  let text = fs.readFileSync(resolved, "utf8");
  text = text
    .replaceAll("<title>Jampanion</title>", "<title>Jampanion2</title>")
    .replaceAll("<strong>Jampanion</strong>", "<strong>Jampanion2</strong>")
    .replaceAll("<PageTitle>Jampanion</PageTitle>", "<PageTitle>Jampanion2</PageTitle>")
    .replaceAll("Return to Jampanion", "Return to Jampanion2")
    .replaceAll('"name": "Jampanion"', '"name": "Jampanion2"')
    .replaceAll('"short_name": "Jampanion"', '"short_name": "Jampanion2"')
    .replaceAll('const APP_VERSION = "26"', 'const APP_VERSION = "27"');
  fs.writeFileSync(resolved, text);
}
