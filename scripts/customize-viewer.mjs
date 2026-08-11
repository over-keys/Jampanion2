import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!target) {
  console.error('Usage: node scripts/customize-viewer.mjs <viewer/index.html>');
  process.exit(2);
}
const resolved = path.resolve(target);
if (!fs.existsSync(resolved)) throw new Error(`Viewer index not found: ${resolved}`);
let html = fs.readFileSync(resolved, 'utf8');
html = html.replace('placeholder="irealbook://..."', 'placeholder="irealb://..."');
html = html.replaceAll('href="./help.html"', 'href="./help.html?v=31"');
html = html.replaceAll('href="./help.en.html"', 'href="./help.en.html?v=31"');
const marker = 'data-jampanion-embedded-bridge="v12"';
if (!html.includes(marker)) {
  const bridge = `\n  <script type="module" ${marker}>\n    import { initializeEmbeddedViewer } from "../js/jazz-chart-host.js?v=22";\n    initializeEmbeddedViewer().catch(error => {\n      console.error("Jampanion embedded bridge failed", error);\n      window.parent?.postMessage({\n        channel: "jampanion-jcv-v12",\n        type: "bridge-error",\n        error: error instanceof Error ? error.message : String(error)\n      }, "*");\n    });\n  </script>\n`;
  if (!html.includes('</body>')) throw new Error('Viewer HTML has no closing body tag.');
  const freshBridge = bridge.replace('jazz-chart-host.js?v=22', 'jazz-chart-host.js?v=33');
  html = html.replace('</body>', `${freshBridge}</body>`);
  fs.writeFileSync(resolved, html);
}
