import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "src/Jampanion.Web/wwwroot/viewer/index.html");
const fontPath = path.join(root, "src/Jampanion.Web/wwwroot/viewer/assets/MuseJazzText.otf");
const viewerIconPath = path.join(root, "src/Jampanion.Web/wwwroot/icons/jampanion-viewer.png");
const appIconPath = path.join(root, "src/Jampanion.Web/wwwroot/icons/jampanion-32.png");
const outputPath = path.join(root, "local-viewer/index.html");

const LOCAL_VIEWER_VERSION = "1";
const MAIN_URL = "https://over-keys.github.io/Jampanion2/";
const ONLINE_VIEWER_URL = `${MAIN_URL}viewer/`;

function dataUrl(mimeType, filePath) {
  return `data:${mimeType};base64,${fs.readFileSync(filePath).toString("base64")}`;
}

let html = fs.readFileSync(sourcePath, "utf8").replace(/\r\n/g, "\n");
const fontUrl = dataUrl("font/otf", fontPath);
const viewerIconUrl = dataUrl("image/png", viewerIconPath);
const appIconUrl = dataUrl("image/png", appIconPath);

html = html
  .replace('<html lang="en">', `<html lang="en" data-jampanion-local-bundle="v${LOCAL_VIEWER_VERSION}">`)
  .replace(/\s*<link rel="manifest" href="\.\/manifest\.webmanifest\?v=1" \/>/, "")
  .replace('url("assets/MuseJazzText.otf")', `url("${fontUrl}")`)
  .replaceAll("../icons/jampanion-viewer.png?v=37", viewerIconUrl)
  .replaceAll("../icons/jampanion-32.png?v=37", appIconUrl)
  .replaceAll('href="../"', `href="${MAIN_URL}"`)
  .replaceAll('./help.html?v=36', `${ONLINE_VIEWER_URL}help.html?v=36`)
  .replaceAll('./help.en.html?v=36', `${ONLINE_VIEWER_URL}help.en.html?v=36`)
  .replace(
    /\n  <script>\n    if \("serviceWorker" in navigator[\s\S]*?\n  <\/script>/,
    `\n  <script data-jampanion-local-bundle="v${LOCAL_VIEWER_VERSION}"></script>`
  );

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, html, "utf8");
console.log(`Local Viewer bundle v${LOCAL_VIEWER_VERSION}: ${outputPath}`);
