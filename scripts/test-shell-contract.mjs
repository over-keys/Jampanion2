import fs from "node:fs";

const targets = process.argv.slice(2);
if (!targets.length) throw new Error("usage: test-shell-contract.mjs file...");
for (const file of targets) {
  const source = fs.readFileSync(file, "utf8");
  if (!source.includes("Jampanion2")) throw new Error(`Jampanion2 branding missing: ${file}`);
  if (source.includes("<strong>Jampanion</strong>")) throw new Error(`Old startup branding remains: ${file}`);
  if (source.includes('const APP_VERSION = "26"')) throw new Error(`Old cache version remains: ${file}`);

  if (source.includes("blazor-error-ui") &&
      !source.includes("Please clear your browser's cached files for this site, then reload the page.")) {
    throw new Error(`Fatal error cache-recovery guidance missing: ${file}`);
  }
  if (source.includes("blazor-error-ui") &&
      !source.includes('const APP_VERSION = "33"')) {
    throw new Error(`Standalone cache generation missing: ${file}`);
  }
  if (source.includes("blazor-error-ui") &&
      !source.includes('script.setAttribute("autostart", "false")')) {
    throw new Error(`Manual Blazor startup guard missing: ${file}`);
  }
  if (source.includes("blazor-error-ui") &&
      !source.includes('cache: "reload"')) {
    throw new Error(`Fresh boot-resource reload policy missing: ${file}`);
  }
  if (source.includes("blazor-error-ui") &&
      !source.includes("BOOT_RECOVERY_KEY")) {
    throw new Error(`Automatic stale-cache boot recovery missing: ${file}`);
  }
}
console.log(`Jampanion2 startup branding contract passed (${targets.length} files).`);
