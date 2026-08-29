import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "src/Jampanion.Web/wwwroot/viewer/index.html");
const fontPath = path.join(root, "src/Jampanion.Web/wwwroot/viewer/assets/MuseJazzText.otf");
const viewerIconPath = path.join(root, "src/Jampanion.Web/wwwroot/icons/jampanion-viewer.png");
const appIconPath = path.join(root, "src/Jampanion.Web/wwwroot/icons/jampanion-32.png");
const outputPath = path.join(root, "local-viewer/index.html");

const LOCAL_VIEWER_VERSION = "6";
const MAIN_URL = "https://over-keys.github.io/Jampanion2/";
const ONLINE_VIEWER_URL = `${MAIN_URL}viewer/`;

function dataUrl(mimeType, filePath) {
  return `data:${mimeType};base64,${fs.readFileSync(filePath).toString("base64")}`;
}

let html = fs.readFileSync(sourcePath, "utf8").replace(/\r\n/g, "\n");
const fontUrl = dataUrl("font/otf", fontPath);
const viewerIconUrl = dataUrl("image/png", viewerIconPath);
const appIconUrl = dataUrl("image/png", appIconPath);
const localModeLink = `        <a id="jampanionModeLink" href="${MAIN_URL}" title="Open Jampanion2 accompaniment mode" aria-label="Open Jampanion2 accompaniment mode" style="flex:0 0 30px;width:30px;height:30px;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;border:1px solid #b9c4c8;border-radius:5px;background:#fff;color:#253036;text-decoration:none;">\n          <img src="${appIconUrl}" alt="" width="22" height="22" style="width:22px;height:22px;border-radius:6px;object-fit:cover;" />\n        </a>`;

html = html
  .replace('<html lang="en">', `<html lang="en" data-jampanion-local-bundle="v${LOCAL_VIEWER_VERSION}">`)
  .replace(/\s*<link rel="manifest" href="\.\/manifest\.webmanifest\?v=1" \/>/, "")
  .replace('url("assets/MuseJazzText.otf")', `url("${fontUrl}")`)
  .replaceAll("../icons/jampanion-viewer.png?v=44", viewerIconUrl)
  .replaceAll('./help.html?v=44', ONLINE_VIEWER_URL + 'help.html?v=44')
  .replaceAll('./help.en.html?v=44', ONLINE_VIEWER_URL + 'help.en.html?v=44')
  .replace(
    '      <div class="toolbar-main">\n        <div class="search-wrap">',
    `      <div class="toolbar-main">\n${localModeLink}\n        <div class="search-wrap">`
  )
  .replace(
    /\n  <script type="module" data-jampanion-embedded-bridge="v12">[\s\S]*?\n  <\/script>/,
    `
  <script type="module" data-jampanion-embedded-bridge="v12">
    const isStandaloneViewer = window.parent === window && !new URL(location.href).searchParams.has("integrated");
    if (isStandaloneViewer) {
      document.documentElement.classList.remove("jampanion-startup-pending");
    } else {
      import("../js/jazz-chart-host.js?v=44").then(({ initializeEmbeddedViewer }) => {
        return initializeEmbeddedViewer();
      }).catch(error => {
        console.error("Jampanion embedded bridge failed", error);
        document.documentElement.classList.remove("jampanion-startup-pending");
      });
    }
  </script>`
  )
  .replace(
    /\n  <script>\n    \/\/ Remove the old optional Viewer worker[\s\S]*?\n  <\/script>/,
    ""
  );

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, html, "utf8");
console.log(`Local Viewer bundle v${LOCAL_VIEWER_VERSION}: ${outputPath}`);
