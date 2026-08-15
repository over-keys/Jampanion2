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

const lookAheadConstant = "const LOOK_AHEAD_SECONDS = 0.12;";
if (!audio.source.includes(lookAheadConstant)) {
  throw new Error("Upstream audio look-ahead constant changed; inspect before customizing.");
}
audio.source = audio.source.replace(
  lookAheadConstant,
  `${lookAheadConstant}\nconst BACKGROUND_LOOK_AHEAD_SECONDS = 4.0;`);

const schedulerLookAhead = "    schedulePendingThrough(audioContext.currentTime + LOOK_AHEAD_SECONDS);";
if (!audio.source.includes(schedulerLookAhead)) {
  throw new Error("Upstream scheduler look-ahead call changed; inspect before customizing.");
}
audio.source = audio.source.replace(
  schedulerLookAhead,
  `    const lookAhead = typeof document !== "undefined" && document.visibilityState === "hidden"\n        ? BACKGROUND_LOOK_AHEAD_SECONDS\n        : LOOK_AHEAD_SECONDS;\n    schedulePendingThrough(audioContext.currentTime + lookAhead);`);

const visibilityWakeHandler = `    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
            resumeAudioAfterPageWake();
        }
    });`;
if (!audio.source.includes(visibilityWakeHandler)) {
  throw new Error("Upstream audio visibility handler changed; inspect before customizing.");
}
audio.source = audio.source.replace(
  visibilityWakeHandler,
  `    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") {
            // Queue a wider window immediately, before background timer
            // throttling becomes aggressive. AudioWorklet then owns those
            // timestamped events even if the page timer is delayed.
            schedulerTick();
            return;
        }
        if (document.visibilityState === "visible") {
            resumeAudioAfterPageWake();
        }
    });`);

const continuationCursor = "    eventCursor = findCursorAt(scheduledThroughSeconds + 0.0001);";
if (!audio.source.includes(continuationCursor)) {
  throw new Error("Upstream continuation cursor changed; inspect before customizing.");
}
audio.source = audio.source.replace(
  continuationCursor,
  `    // The continuation boundary is chosen after scheduledThroughSeconds, so
    // never rewind the cursor into notes already handed to the AudioWorklet
    // or an external MIDI output. Rewinding to the live position would emit
    // those protected notes a second time after a background-style change.
    eventCursor = findCursorAt(scheduledThroughSeconds + 0.0001, true);`);

const positionExport = `export function getPosition() {
    if (!audioContext || playbackStart === null) {
        return 0;
    }
    return Math.max(0, audioContext.currentTime - playbackStart);
}`;
if (!audio.source.includes(positionExport)) {
  throw new Error("Upstream audio position export changed; inspect before customizing.");
}
audio.source = audio.source.replace(
  positionExport,
  `export function getProtectedThrough() {
    if (!audioContext || playbackStart === null) {
        return 0;
    }
    // Continuation replacement cannot retract notes already handed to the
    // AudioWorklet or an external MIDI output. Expose that protected horizon
    // so .NET can choose a later musical boundary after returning from the
    // background.
    return Math.max(getPosition(), scheduledThroughSeconds);
}

${positionExport}`);

fs.writeFileSync(audio.resolved, audio.source);

const home = read(homeLogicFile);
home.source = home.source
  .replaceAll('jampanion-audio.js?v=29', 'jampanion-audio.js?v=31')
  .replaceAll('jampanion-audio.js?v=30', 'jampanion-audio.js?v=31')
  .replaceAll('jampanion-browser.js?v=30', 'jampanion-browser.js?v=31');
fs.writeFileSync(home.resolved, home.source);

console.log("Background playback customization applied.");
