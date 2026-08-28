import fs from "node:fs";

const file = process.argv[2] || "local-viewer/index.html";
const html = fs.readFileSync(file, "utf8");
const checks = [
  ["local bundle marker", html.includes('data-jampanion-local-bundle="v4"')],
  ["embedded Viewer code is present", html.includes("const __names")],
  ["font is embedded", html.includes("data:font/otf;base64,")],
  ["Viewer icon is embedded", html.includes("data:image/png;base64,")],
  ["local accompaniment link is present", html.includes('id="jampanionModeLink"') && html.includes('href="https://over-keys.github.io/Jampanion2/"')],
  ["service worker is not required", !html.includes("serviceWorker")],
  ["main link stays online", html.includes("https://over-keys.github.io/Jampanion2/")],
  ["local storage library remains", html.includes("localStorage")]
];

const failures = checks.filter(([, passed]) => !passed).map(([name]) => name);
if (failures.length) throw new Error(`Local Viewer checks failed: ${failures.join(", ")}`);
console.log(`Local Viewer contract passed (${checks.length} checks).`);
