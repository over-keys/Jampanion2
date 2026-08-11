import fs from "node:fs";
import path from "node:path";

const [browserFile, audioFile, homeLogicFile] = process.argv.slice(2);
if (!browserFile || !audioFile || !homeLogicFile) {
  console.error("Usage: customize-background-playback.mjs browser.js audio.js Home.razor.cs");
  process.exit(2);
}

function read(target) {
  const resolved = path.resolve(target);
  if (!fs.existsSync(resolved)) throw new Error(`Background playback source not found: ${resolved}`);
  return { resolved, source: fs.readFileSync(resolved, "utf8") };
}

const browser = read(browserFile);
const visibilityRegistration = `export function registerPageVisibilityStop(dotNetReference) {
    if (pageVisibilityStopHandler) {
        document.removeEventListener("visibilitychange", pageVisibilityStopHandler);
    }

    pageVisibilityStopReference = dotNetReference;
    pageVisibilityStopHandler = () => {
        if (document.visibilityState !== "hidden") {
            return;
        }

        // Stop the Web Audio scheduler immediately, before background timer
        // throttling can make the accompaniment drift or stutter.
        window.dispatchEvent(new Event("jampanion-page-hidden"));
        const reference = pageVisibilityStopReference;
        if (reference && typeof reference.invokeMethodAsync === "function") {
            void reference.invokeMethodAsync("StopSessionFromVisibilityAsync").catch(() => {});
        }
    };
    document.addEventListener("visibilitychange", pageVisibilityStopHandler);
}`;
if (!browser.source.includes(visibilityRegistration)) {
  throw new Error("Upstream page-visibility stop handler changed; inspect before customizing.");
}
browser.source = browser.source.replace(visibilityRegistration, `export function registerPageVisibilityStop() {
    // Background playback is intentional in the integrated app. Keep this
    // export for the upstream page, but never stop audio on visibility changes.
}`);
fs.writeFileSync(browser.resolved, browser.source);

const audio = read(audioFile);
const pageHiddenStop = `    window.addEventListener("jampanion-page-hidden", () => {
        stopSession();
    });
`;
if (!audio.source.includes(pageHiddenStop)) {
  throw new Error("Upstream page-hidden audio stop handler changed; inspect before customizing.");
}
audio.source = audio.source.replace(pageHiddenStop, "");
fs.writeFileSync(audio.resolved, audio.source);

const home = read(homeLogicFile);
home.source = home.source
  .replaceAll('jampanion-audio.js?v=29', 'jampanion-audio.js?v=30')
  .replaceAll('jampanion-browser.js?v=30', 'jampanion-browser.js?v=31');
fs.writeFileSync(home.resolved, home.source);

console.log("Background playback customization applied.");
