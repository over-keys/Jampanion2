const SETTINGS_KEY = "jampanion-jazz-song-settings-v1";
const LAST_SONG_KEY = "jampanion-jazz-last-song-v1";
const DEVICE_SETTINGS_KEY = "jampanion-jazz-device-settings-v1";
const MIXER_SETTINGS_KEY = "jampanion-jazz-mixer-settings-v1";
const NATIVE_DB = "jampanion-jazz-native";
const NATIVE_STORE = "songs";
const NATIVE_DB_VERSION = 1;
const PPQ = 480;
const IREAL_MUSIC_PREFIX = "1r34LbKcu7";

let frame;
let win;
let doc;
let viewer;
let dotNet;
let editingEnabled = true;
let nativeSongs = new Map();
let observer;
let mobileControlsScrollCleanup;
let embeddedLayoutObserver;
let embeddedLayoutMutationObserver;
let embeddedLayoutTimer;
let embeddedFrameContentHeight = 0;
let libraryTimer;
let lastLibrarySignature = "";
let editInput;
let contextMenu;
let notifying = false;
let globalKeyHandler;
let embeddedKeyHandler;
let playbackLockedSongId = "";
let initialized = false;
let embeddedMode = false;
let frameOrigin = null;
let parentBridgeListenerInstalled = false;
let embeddedBridgeListenerInstalled = false;
let bridgeReady = false;
let bridgeStartupError = null;
let bridgeRequestId = 0;
let lastSongRestorePending = true;
let standaloneNewButton;
let standaloneSaveButton;
let standaloneRevertButton;
let toolbarHasUnsavedChanges = false;
let toolbarRevertVisible = false;
const bridgePending = new Map();
const bridgeReadyWaiters = new Set();
const BRIDGE_CHANNEL = "jampanion-jcv-v12";

function postToFrame(message) {
    const target = frame?.contentWindow;
    if (!target) throw new Error("Jazz Chart Viewer frame is not available.");
    target.postMessage({ channel: BRIDGE_CHANNEL, ...message }, frameOrigin || "*");
}

function postToParent(message) {
    if (window.parent === window) return;
    window.parent.postMessage({ channel: BRIDGE_CHANNEL, ...message }, "*");
}

function installParentBridgeListener() {
    if (parentBridgeListenerInstalled) return;
    parentBridgeListenerInstalled = true;
    window.addEventListener("message", event => {
        if (!frame || event.source !== frame.contentWindow) return;
        const data = event.data;
        if (!data || data.channel !== BRIDGE_CHANNEL) return;
        if (data.type === "bridge-error") {
            bridgeStartupError = String(data.error || "Jazz Chart Viewer embedded bridge failed.");
            for (const resolve of bridgeReadyWaiters) resolve();
            bridgeReadyWaiters.clear();
            return;
        }
        if (data.type === "ready") {
            bridgeStartupError = null;
            bridgeReady = true;
            for (const resolve of bridgeReadyWaiters) resolve();
            bridgeReadyWaiters.clear();
            return;
        }
        if (data.type === "response") {
            const pending = bridgePending.get(data.id);
            if (!pending) return;
            bridgePending.delete(data.id);
            clearTimeout(pending.timer);
            if (data.ok) pending.resolve(data.value);
            else pending.reject(new Error(data.error || "Jazz Chart Viewer bridge request failed."));
            return;
        }
        if (data.type === "event") {
        if (data.name === "bootstrapChanged") {
                void dotNet?.invokeMethodAsync("ChartBootstrapChanged", data.value);
            } else if (data.name === "edited") {
                void dotNet?.invokeMethodAsync("ChartEdited", String(data.message || "Chart updated"));
            } else if (data.name === "spaceShortcut") {
                void dotNet?.invokeMethodAsync("HandleSpaceShortcut");
            } else if (data.name === "toolbarSave") {
                invokeToolbarAction("SaveChartFromToolbar", "save");
            } else if (data.name === "toolbarRevert") {
                invokeToolbarAction("RevertChartFromToolbar", "revert");
            } else if (data.name === "toolbarNew") {
                void dotNet?.invokeMethodAsync("NewSongFromToolbar");
            } else if (data.name === "layoutChanged") {
                applyEmbeddedFrameHeight(data.value?.height);
            }
        }
    });
}

function invokeToolbarAction(methodName, action) {
    if (!dotNet) return;
    void dotNet.invokeMethodAsync(methodName).then(() => {
        postToFrame({ type: "toolbarResult", action, ok: true });
    }).catch(error => {
        postToFrame({
            type: "toolbarResult",
            action,
            ok: false,
            error: error instanceof Error ? error.message : String(error)
        });
    });
}

async function waitForEmbeddedReady(timeoutMs = 15000) {
    if (bridgeReady) return;
    const started = performance.now();
    while (!bridgeReady && performance.now() - started < timeoutMs) {
        if (bridgeStartupError) throw new Error(bridgeStartupError);
        try { postToFrame({ type: "ping" }); } catch {}
        await Promise.race([
            new Promise(resolve => {
                bridgeReadyWaiters.add(resolve);
                setTimeout(() => {
                    bridgeReadyWaiters.delete(resolve);
                    resolve();
                }, 120);
            }),
            delay(140)
        ]);
    }
    if (bridgeStartupError) throw new Error(bridgeStartupError);
    if (!bridgeReady) throw new Error("Jazz Chart Viewer accompaniment bridge did not become ready.");
}

function requestEmbedded(action, args = {}, timeoutMs = 60000) {
    return new Promise((resolve, reject) => {
        const id = ++bridgeRequestId;
        const timer = setTimeout(() => {
            bridgePending.delete(id);
            reject(new Error(`Jazz Chart Viewer bridge timed out while running ${action}.`));
        }, timeoutMs);
        bridgePending.set(id, { resolve, reject, timer });
        try { postToFrame({ type: "request", id, action, args }); }
        catch (error) {
            bridgePending.delete(id);
            clearTimeout(timer);
            reject(error);
        }
    });
}

function installEmbeddedBridgeListener() {
    if (embeddedBridgeListenerInstalled) return;
    embeddedBridgeListenerInstalled = true;
    window.addEventListener("message", async event => {
        if (event.source !== window.parent) return;
        const data = event.data;
        if (!data || data.channel !== BRIDGE_CHANNEL) return;
        if (data.type === "ping") {
            postToParent({ type: "ready" });
            return;
        }
        if (data.type === "toolbarResult") {
            handleToolbarResult(data);
            return;
        }
        if (data.type !== "request") return;
        try {
            const args = data.args || {};
            let value;
            switch (data.action) {
                case "getState": value = getBootstrap(); break;
                case "compilePlayback": value = await compilePlayback(); break;
                case "saveSongSettings": value = saveSongSettings(args.identity, args.tempoBpm, args.accompanimentStyle, args.tempoExplicit, args.semitoneShift); break;
                case "saveCurrentChart": value = await saveCurrentChart(); break;
                case "revertCurrentSong": value = await revertCurrentSong(); break;
                case "selectSong": value = selectSong(args.songId); break;
                case "setPlaybackState": value = setPlaybackState(args.isPlaying, args.sourceIndex); break;
                case "highlightSourceBar": value = highlightSourceBar(args.sourceIndex, args.occurrence); break;
                case "createNewSong": value = await createNewSong(args.title, args.barCount, args.meter, args.key, args.accompanimentStyle); break;
                case "deleteCurrentNativeSong": value = await deleteCurrentNativeSong(); break;
                case "setToolbarState": value = setToolbarState(args.dirty, args.canRevert); break;
                case "setToolbarRevertVisible": value = setToolbarRevertVisible(args.visible); break;
                default: throw new Error(`Unknown Jazz Chart Viewer bridge action: ${data.action}`);
            }
            postToParent({ type: "response", id: data.id, ok: true, value });
        } catch (error) {
            postToParent({
                type: "response",
                id: data.id,
                ok: false,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    });
}

async function waitForLocalViewer(timeoutMs = 15000) {
    const deadline = performance.now() + timeoutMs;
    while (performance.now() < deadline) {
        viewer = window.__chartViewer || null;
        if (viewer?.state && typeof viewer.expandChartBars === "function") return;
        await delay(40);
    }
    throw new Error("Jazz Chart Viewer did not expose its chart API.");
}

export async function initialize(frameId, dotNetReference) {
    embeddedMode = false;
    dotNet = dotNetReference || dotNet;
    const requestedFrame = document.getElementById(frameId);
    if (!requestedFrame) throw new Error("Jazz Chart Viewer frame was not found.");
    if (frame !== requestedFrame) {
        frame = requestedFrame;
        bridgeReady = false;
        bridgeStartupError = null;
        initialized = false;
        if (!frame.dataset.jampanionBridgeLoadHook) {
            frame.dataset.jampanionBridgeLoadHook = "1";
            frame.addEventListener("load", () => {
                bridgeReady = false;
                bridgeStartupError = null;
                try { postToFrame({ type: "ping" }); } catch {}
            });
        }
    }
    try {
        frameOrigin = new URL(frame.src, window.location.href).origin;
        if (frameOrigin === "null") frameOrigin = "*";
    } catch {
        frameOrigin = "*";
    }
    installParentBridgeListener();
    installParentShortcuts();
    await waitForEmbeddedReady();
    initialized = true;
    return await requestEmbedded("getState", {}, 10000);
}

export function initializeMobileControlsScrollHint() {
    const controls = document.querySelector(".jamp-mobile-controls");
    if (!controls) return;
    mobileControlsScrollCleanup?.();
    const update = () => {
        const maxScroll = Math.max(0, controls.scrollWidth - controls.clientWidth);
        controls.classList.toggle("can-scroll-left", controls.scrollLeft > 1);
        controls.classList.toggle("can-scroll-right", controls.scrollLeft < maxScroll - 1);
    };
    controls.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update, { passive: true });
    mobileControlsScrollCleanup = () => {
        controls.removeEventListener("scroll", update);
        window.removeEventListener("resize", update);
        mobileControlsScrollCleanup = null;
    };
    update();
}

function applyEmbeddedFrameHeight(height) {
    const numericHeight = Math.ceil(Number(height) || 0);
    if (numericHeight > 0) embeddedFrameContentHeight = numericHeight;
    if (!frame) return;
    const mobile = window.matchMedia?.("(max-width: 700px)").matches === true;
    if (!mobile) {
        frame.style.removeProperty("height");
        frame.style.removeProperty("min-height");
        return;
    }
    const targetHeight = Math.max(160, embeddedFrameContentHeight);
    if (targetHeight <= 0) return;
    frame.style.height = `${targetHeight}px`;
    frame.style.minHeight = `${targetHeight}px`;
}

function installEmbeddedLayoutObserver() {
    if ((embeddedLayoutObserver || embeddedLayoutMutationObserver) || !embeddedMode || window.parent === window) return;
    const notify = () => {
        clearTimeout(embeddedLayoutTimer);
        embeddedLayoutTimer = setTimeout(() => {
            const toolbarHeight = doc?.querySelector(".toolbar")?.getBoundingClientRect().height || 0;
            const chartHeight = doc?.querySelector(".chart-scale-frame")?.getBoundingClientRect().height || 0;
            const fallbackHeight = Math.max(
                doc?.body?.scrollHeight || 0,
                doc?.documentElement?.scrollHeight || 0
            );
            const height = Math.ceil(toolbarHeight + chartHeight + 8) || fallbackHeight;
            if (height > 0) postToParent({ type: "event", name: "layoutChanged", value: { height } });
        }, 0);
    };
    if (window.ResizeObserver) {
        embeddedLayoutObserver = new ResizeObserver(notify);
        for (const element of [
            doc?.documentElement,
            doc?.body,
            doc?.querySelector(".chart-scale-frame"),
            doc?.querySelector(".chart-page")
        ].filter(Boolean)) {
            embeddedLayoutObserver.observe(element);
        }
    }
    if (window.MutationObserver && doc?.body) {
        embeddedLayoutMutationObserver = new MutationObserver(notify);
        embeddedLayoutMutationObserver.observe(doc.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["class", "style"]
        });
    }
    window.addEventListener("resize", notify, { passive: true });
    notify();
}

export async function initializeEmbeddedViewer() {
    embeddedMode = true;
    win = window;
    doc = document;
    if (window.parent !== window) doc.body.classList.add("jampanion-embedded");
    await waitForLocalViewer();
    if (!initialized) {
        try { installIntegrationCss(); } catch (error) { console.warn("Integration CSS setup failed", error); }
        try { installChartListeners(); } catch (error) { console.warn("Chart listener setup failed", error); }
        // Both integrated and standalone Viewer modes use one compact toolbar
        // row for Fit, New, Save, and Revert.
        try { installStandaloneSaveButton(); } catch (error) { console.warn("Toolbar action setup failed", error); }
        try { annotateRenderedBars(); } catch (error) { console.warn("Chart annotation failed", error); }
        try { startLibraryWatcher(); } catch (error) { console.warn("Library watcher setup failed", error); }
        try { installEmbeddedShortcuts(); } catch (error) { console.warn("Embedded shortcut setup failed", error); }
        try { restoreLastSelectedSong(); } catch (error) { console.warn("Last song restore failed", error); }
        installEmbeddedBridgeListener();
        installEmbeddedLayoutObserver();
        initialized = true;
        void loadNativeSongs().then(() => {
            try {
                const changed = applyNativeOverrides();
                if (changed) forceRender();
                restoreLastSelectedSong();
                restoreStoredTranspose();
                annotateRenderedBars();
                syncStandaloneRevertState();
                queueBootstrapNotification();
            } catch (error) {
                console.warn("Native song merge failed", error);
            }
        }).catch(error => console.warn("Native song storage unavailable", error));
    }
    postToParent({ type: "ready" });
    queueBootstrapNotification();
    return getBootstrap();
}

function shortcutBelongsToInteractiveControl(target) {
    const tag = target?.tagName?.toLowerCase?.() || "";
    if (tag === "input" || tag === "textarea" || tag === "select" || tag === "button" || tag === "a") return true;
    if (target?.isContentEditable) return true;
    if (target?.closest?.('[role="button"], [role="option"], .search-wrap, .search-options')) return true;
    return false;
}

function installParentShortcuts() {
    if (!globalKeyHandler) {
        globalKeyHandler = event => {
            if (event.code !== "Space" || event.repeat || shortcutBelongsToInteractiveControl(event.target)) return;
            event.preventDefault();
            void dotNet?.invokeMethodAsync("HandleSpaceShortcut");
        };
        document.addEventListener("keydown", globalKeyHandler);
    }
}

function installEmbeddedShortcuts() {
    if (embeddedKeyHandler) return;
    embeddedKeyHandler = event => {
        if (event.code !== "Space" || event.repeat || shortcutBelongsToInteractiveControl(event.target)) return;
        event.preventDefault();
        postToParent({ type: "event", name: "spaceShortcut" });
    };
    document.addEventListener("keydown", embeddedKeyHandler);
}

async function waitForViewer() {
    const deadline = performance.now() + 60000;
    let lastError = null;
    while (performance.now() < deadline) {
        try {
            win = frame?.contentWindow || null;
            doc = frame?.contentDocument || null;
            viewer = win?.__chartViewer || null;
            if (win && doc && viewer?.state && typeof viewer.expandChartBars === "function") return;
        } catch (error) {
            lastError = error;
        }
        await delay(50);
    }
    const suffix = lastError?.message ? ` (${lastError.message})` : "";
    throw new Error(`Jazz Chart Viewer did not finish loading${suffix}.`);
}

function installIntegrationCss() {
    if (doc.getElementById("jampanion-jcv-style")) return;
    const style = doc.createElement("style");
    style.id = "jampanion-jcv-style";
    style.textContent = `
      body.jampanion-playback .key-group,
      body.jampanion-playback #settingsButton,
      body.jampanion-playback .search-wrap { pointer-events:none !important; opacity:.48 !important; }
      body.jampanion-playback .score-header h1,
      body.jampanion-playback .rehearsal-mark,
      body.jampanion-playback .bar { cursor:default !important; }
      body.jampanion-embedded .chart-viewport {
        min-width:0 !important;
      }
      @media (max-width: 700px) {
        body.jampanion-embedded .app-shell {
          height:auto !important;
          min-height:0 !important;
        }
        body.jampanion-embedded .chart-viewport {
        height:auto !important;
        min-height:0 !important;
        overflow:visible !important;
        padding-bottom:0 !important;
        }
      }
      .jamp-edit-input {
        position:fixed; z-index:99999; box-sizing:border-box; min-width:0;
        height:28px; padding:2px 5px; border:1.5px solid #1f5f74; border-radius:4px;
        background:white; color:#111; font:600 15px/1 Arial,sans-serif;
        text-align:left; box-shadow:0 2px 8px #0002;
      }
      .jamp-context-menu {
        position:fixed; z-index:100000; min-width:190px; padding:5px;
        border:1px solid #b8c2c7; border-radius:7px; background:#fff;
        box-shadow:0 8px 28px #0003; font:13px/1.2 system-ui,sans-serif;
      }
      .jamp-context-menu button { display:block; width:100%; border:0; border-radius:4px;
        padding:7px 9px; text-align:left; background:transparent; color:#222; }
      .jamp-context-menu button:hover { background:#eef4f6; }
      .jamp-context-menu hr { border:0; border-top:1px solid #e3e7e9; margin:4px 2px; }
      .jamp-context-menu .selected::after { content:'✓'; float:right; font-weight:700; }
      .jamp-section-style {
        position:absolute; z-index:8; left:0; top:-18px;
        box-sizing:border-box; width:100%; max-width:100%; min-width:0;
        height:18px; margin:0; padding:0; overflow:visible;
        color:#53636a; font:700 16px/16px Arial,Helvetica,sans-serif;
        letter-spacing:-.04em; text-align:center; white-space:nowrap;
        pointer-events:none;
      }
      .utility-group .standalone-save,
      .scale-group .standalone-save {
        box-sizing:border-box; flex:0 0 auto; width:auto; min-width:0;
        padding-inline:4px; text-align:center; white-space:nowrap;
        display:inline-flex; align-items:center; justify-content:center;
      }
      .utility-group .standalone-save[hidden],
      .scale-group .standalone-save[hidden] { display:none !important; }
      .utility-group .standalone-save:disabled,
      .scale-group .standalone-save:disabled {
        opacity:.45; cursor:default; pointer-events:none;
        border-color:#cbd2d5; background:#edf0f1; color:#68757b;
      }
    `;
    doc.head.appendChild(style);
}

function installChartListeners() {
    const page = doc.getElementById("chartPage");
    if (!page) throw new Error("Jazz Chart Viewer chart page was not found.");

    // The upstream viewer may replace #chartPage during a song selection or
    // native-chart promotion. Delegate from the iframe document so editing
    // survives those renders instead of remaining attached to a dead element.
    doc.addEventListener("dblclick", handleDoubleClick, true);
    doc.addEventListener("contextmenu", handleContextMenu, true);
    doc.addEventListener("click", event => {
        if (!event.target.closest?.("[data-song-id]")) return;
        setTimeout(() => {
            rememberSelectedSong();
            updateStandaloneSaveButton();
        }, 0);
    }, true);
    doc.addEventListener("pointerdown", event => {
        if (contextMenu && !event.target.closest?.(".jamp-context-menu")) closeContextMenu();
    }, true);

    observer = new MutationObserver(() => {
        annotateRenderedBars();
        queueBootstrapNotification();
    });
    observer.observe(doc, { childList: true, subtree: true });

    for (const id of ["keyDown", "keyUp", "accidentalGroup", "viewModeGroup", "scale", "scaleAuto"]) {
        doc.getElementById(id)?.addEventListener("click", () => {
            if (id === "keyDown" || id === "keyUp") setToolbarState(true, true);
            updateStandaloneSaveButton();
            queueBootstrapNotification();
        }, true);
    }
}

function handleToolbarResult(data) {
    const button = data.action === "revert" ? standaloneRevertButton : standaloneSaveButton;
    if (!button) return;
    if (!data.ok) {
        button.disabled = false;
        window.alert(String(data.error || "Toolbar action failed."));
        updateStandaloneSaveButton();
        return;
    }
    button.textContent = data.action === "save" ? "Saved" : "Revert";
    window.setTimeout(() => {
        if (button.isConnected) button.textContent = data.action === "save" ? "Save" : "Revert";
    }, 1200);
    updateStandaloneSaveButton();
}

function installStandaloneSaveButton() {
    if (standaloneSaveButton) return;
    const fitButton = doc.getElementById("scaleAuto");
    if (!fitButton) return;

    const newButton = doc.createElement("button");
    newButton.id = "jampanionStandaloneNew";
    newButton.type = "button";
    newButton.className = "text-button standalone-save";
    newButton.textContent = "New";
    newButton.title = "Create a new editable chart";
    newButton.setAttribute("aria-label", "Create a new editable chart");
    newButton.addEventListener("click", async () => {
        if (newButton.disabled) return;
        if (window.parent !== window) {
            postToParent({ type: "event", name: "toolbarNew" });
            return;
        }
        const title = window.prompt("Song title", "Untitled");
        if (title === null) return;
        newButton.disabled = true;
        try {
            await createNewSong(title, 32, "4/4", "C", "Swing");
        } catch (error) {
            window.alert(error instanceof Error ? error.message : String(error));
        } finally {
            updateStandaloneSaveButton();
        }
    });
    standaloneNewButton = newButton;

    const button = doc.createElement("button");
    button.id = "jampanionStandaloneSave";
    button.type = "button";
    button.className = "text-button standalone-save";
    button.textContent = "Save";
    button.title = "Save chart, key, tempo, and style";
    button.setAttribute("aria-label", "Save chart, key, tempo, and style");
    button.addEventListener("click", async () => {
        button.disabled = true;
        try {
            if (window.parent !== window) {
                postToParent({ type: "event", name: "toolbarSave" });
            } else {
                await saveCurrentChart();
                button.textContent = "Saved";
                window.setTimeout(() => { if (button.isConnected) button.textContent = "Save"; }, 1200);
            }
        } catch (error) {
            button.textContent = "Save";
            window.alert(error instanceof Error ? error.message : String(error));
        } finally {
            updateStandaloneSaveButton();
        }
    });
    standaloneSaveButton = button;

    const revertButton = doc.createElement("button");
    revertButton.id = "jampanionStandaloneRevert";
    revertButton.type = "button";
    revertButton.className = "text-button standalone-save";
    revertButton.textContent = "Revert";
    revertButton.title = "Restore the original iReal chart";
    revertButton.setAttribute("aria-label", "Restore the original iReal chart");
    revertButton.addEventListener("click", async () => {
        revertButton.disabled = true;
        try {
            if (window.parent !== window) {
                postToParent({ type: "event", name: "toolbarRevert" });
            } else {
                await revertCurrentSong();
                revertButton.textContent = "Revert";
                window.setTimeout(() => { if (revertButton.isConnected) revertButton.textContent = "Revert"; }, 1200);
            }
        } catch (error) {
            revertButton.textContent = "Revert";
            window.alert(error instanceof Error ? error.message : String(error));
        } finally {
            updateStandaloneSaveButton();
        }
    });
    standaloneRevertButton = revertButton;
    fitButton.after(newButton, button, revertButton);
    updateStandaloneSaveButton();
}

function updateStandaloneSaveButton() {
    if (!standaloneSaveButton) return;
    const song = currentSong();
    const embeddedToolbar = window.parent !== window;
    const hasChanges = embeddedToolbar
        ? toolbarHasUnsavedChanges
        : toolbarHasUnsavedChanges || hasUnsavedStandaloneSettings(song);
    standaloneSaveButton.disabled = !editingEnabled || !song || !hasChanges;
    if (standaloneNewButton) standaloneNewButton.disabled = !editingEnabled;
    if (!standaloneRevertButton) return;
    standaloneRevertButton.hidden = !toolbarRevertVisible;
    standaloneRevertButton.disabled = !editingEnabled || !toolbarRevertVisible;
}

export function setToolbarState(dirty, canRevert = dirty) {
    if (!embeddedMode) return requestEmbedded("setToolbarState", { dirty, canRevert }, 10000);
    toolbarHasUnsavedChanges = Boolean(dirty);
    toolbarRevertVisible = Boolean(canRevert);
    updateStandaloneSaveButton();
}

export function setToolbarRevertVisible(visible) {
    if (!embeddedMode) return requestEmbedded("setToolbarRevertVisible", { visible }, 10000);
    toolbarRevertVisible = Boolean(visible);
    updateStandaloneSaveButton();
}

function startLibraryWatcher() {
    libraryTimer = window.setInterval(() => {
        if (!editingEnabled && playbackLockedSongId && viewer?.state?.selectedId !== playbackLockedSongId) {
            viewer.state.selectedId = playbackLockedSongId;
            forceRender();
        }
        const before = librarySignature();
        let libraryChanged = false;
        if (before !== lastLibrarySignature) {
            lastLibrarySignature = before;
            libraryChanged = true;
            const changed = applyNativeOverrides();
            if (changed) {
                libraryChanged = true;
                forceRender();
            }
            annotateRenderedBars();
            queueBootstrapNotification();
            updateStandaloneSaveButton();
        }
        if (lastSongRestorePending && libraryChanged) restoreLastSelectedSong();
        else if (libraryChanged) restoreStoredTranspose();
    }, 700);
    lastLibrarySignature = librarySignature();
}

function librarySignature() {
    return (viewer?.state?.songs || []).map(song => `${song.id}|${song.title}|${song.composer}|${song.source}`).join("\n");
}

function songIdentity(song) {
    if (!song) return "";
    if (song.nativeIdentity) return String(song.nativeIdentity);
    const record = song.sourceRecord;
    if (record?.body) {
        const fields = String(record.body).split("=");
        return `${fields[0] || song.title || ""}\n${fields[1] || song.composer || ""}`.trim();
    }
    return `${song.title || ""}\n${song.composer || ""}`.trim();
}

function readLastSongReference() {
    try {
        const value = JSON.parse(localStorage.getItem(LAST_SONG_KEY) || "null");
        if (typeof value === "string") return { id: value, identity: "" };
        if (!value || typeof value !== "object") return null;
        const id = String(value.id || "");
        const identity = String(value.identity || "");
        return id || identity ? { id, identity } : null;
    } catch {
        return null;
    }
}

function rememberSelectedSong(song = currentSong()) {
    if (!song) return;
    try {
        localStorage.setItem(LAST_SONG_KEY, JSON.stringify({
            id: String(song.id || ""),
            identity: songIdentity(song)
        }));
        lastSongRestorePending = false;
    } catch {
        // Song selection remains usable when persistent storage is unavailable.
    }
}

function restoreLastSelectedSong() {
    if (!lastSongRestorePending) return false;
    const reference = readLastSongReference();
    if (!reference) {
        lastSongRestorePending = false;
        return restoreStoredTranspose();
    }
    const target = (viewer?.state?.songs || []).find(song =>
        (reference.identity && songIdentity(song) === reference.identity) ||
        (reference.id && String(song.id || "") === reference.id)
    );
    if (!target) {
        // The Viewer has already selected its first available song; retain that
        // fallback until the saved song appears in a later library refresh.
        return false;
    }
    const selectionChanged = viewer.state.selectedId !== target.id;
    const previousSemitoneShift = Number(viewer.state.semitones) || 0;
    viewer.state.selectedId = target.id;
    viewer.state.semitones = songSettings(target).semitoneShift;
    const changed = selectionChanged || previousSemitoneShift !== viewer.state.semitones;
    lastSongRestorePending = false;
    if (changed) {
        forceRender();
        annotateRenderedBars();
    }
    updateStandaloneSaveButton();
    return changed;
}

function currentSong() {
    const state = viewer.state;
    return state.songs.find(song => song.id === state.selectedId) || state.songs[0];
}

function loadSettingsMap() {
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") || {}; }
    catch { return {}; }
}

function saveSettingsMap(value) {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(value)); }
    catch { /* current-session state remains usable */ }
}

function removeSongSettings(identity) {
    if (!identity) return;
    const map = loadSettingsMap();
    if (!Object.prototype.hasOwnProperty.call(map, identity)) return;
    delete map[identity];
    saveSettingsMap(map);
}

function hasSavedSongOverrides(song) {
    const stored = loadSettingsMap()[songIdentity(song)];
    if (!stored) return false;
    const semitoneShift = Number(stored.semitoneShift);
    if (Number.isFinite(semitoneShift) && Math.trunc(semitoneShift) !== 0) return true;

    const meter = String(song?.timeSignature || "4/4");
    const sourceStyle = meter === "3/4"
        ? "JazzWaltz"
        : iRealPlayerStyleForSong(song) || inferredStyle(song);
    if (stored.accompanimentStyle && stored.accompanimentStyle !== sourceStyle) return true;

    if (stored.tempoExplicit === true) {
        const storedTempo = validTempo(stored.tempoBpm);
        const sourceTempo = validTempo(song?.tempoBpm) ?? iRealTempoForSong(song);
        if (storedTempo != null && (sourceTempo == null || storedTempo !== sourceTempo)) return true;
    }
    return false;
}

function canRevertSong(song) {
    return Boolean(song && (
        hasSavedSongOverrides(song) ||
        (song.source === "native" && song.originalSourceRecord?.body)
    ));
}

function syncStandaloneRevertState(song = currentSong()) {
    if (window.parent !== window) return;
    toolbarRevertVisible = canRevertSong(song);
    updateStandaloneSaveButton();
}

function inferredStyle(song) {
    const meter = String(song?.timeSignature || "4/4");
    if (meter === "3/4") return "JazzWaltz";
    const style = String(song?.style || "").toLowerCase();
    if (style.includes("ballad") || style.includes("slow swing")) return "JazzBallad";
    if (style.includes("bossa")) return "BossaNova";
    if (/(latin|mambo|salsa|afro[- ]?cuban|montuno)/.test(style)) return "AfroCubanLatin";
    return "Swing";
}

export function extractIRealPlayerStyleFromRecord(record, meter = "4/4") {
    if (String(meter) === "3/4") return "JazzWaltz";
    if (!record || typeof record.body !== "string") return null;
    let body = record.body.trim();
    if (!body.includes("=") && /%3d/i.test(body)) {
        try { body = decodeURIComponent(body); } catch { /* keep original */ }
    }
    const fields = body.split("=");
    const musicIndex = fields.findIndex(field => String(field || "").startsWith(IREAL_MUSIC_PREFIX));
    if (musicIndex < 0) return null;
    const raw = String(fields[musicIndex + 1] || "").trim().toLowerCase();
    if (!raw) return null;
    if (raw.includes("bossa")) return "BossaNova";
    if (raw.includes("ballad") || raw.includes("slow swing")) return "JazzBallad";
    if (/(latin|mambo|salsa|afro[- ]?cuban|montuno)/.test(raw)) return "AfroCubanLatin";
    if (raw.includes("waltz")) return "JazzWaltz";
    if (raw.includes("swing") || raw.startsWith("jazz")) return "Swing";
    return null;
}

function iRealPlayerStyleForSong(song) {
    const meter = String(song?.timeSignature || "4/4");
    return extractIRealPlayerStyleFromRecord(song?.sourceRecord, meter)
        ?? extractIRealPlayerStyleFromRecord(song?.originalSourceRecord, meter);
}

function defaultTempoForStyle(style) {
    switch (String(style || "Swing")) {
        case "JazzBallad": return 70;
        case "BossaNova": return 140;
        case "JazzWaltz": return 150;
        case "AfroCubanLatin": return 180;
        default: return 120;
    }
}

function validTempo(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric >= 40 && numeric <= 300 ? numeric : null;
}

export function extractIRealTempoFromRecord(record) {
    if (!record || typeof record.body !== "string") return null;
    let body = record.body.trim();
    if (!body.includes("=") && /%3d/i.test(body)) {
        try { body = decodeURIComponent(body); } catch { /* keep the original body */ }
    }
    const fields = body.split("=");
    const musicIndex = fields.findIndex(field => String(field || "").startsWith(IREAL_MUSIC_PREFIX));
    if (musicIndex < 0) return null;

    // Modern irealb:// records append player metadata after the scrambled music:
    //   ... = music = accompaniment style = BPM = repeats
    // BPM 0/blank means no usable explicit tempo and falls back to the style default.
    return validTempo(fields[musicIndex + 2]);
}

function iRealTempoForSong(song) {
    return extractIRealTempoFromRecord(song?.sourceRecord)
        ?? extractIRealTempoFromRecord(song?.originalSourceRecord);
}

function songSettings(song) {
    const identity = songIdentity(song);
    const stored = loadSettingsMap()[identity] || {};
    const meter = String(song?.timeSignature || "4/4");
    const sourcePlayerStyle = iRealPlayerStyleForSong(song);
    const accompanimentStyle = meter === "3/4"
        ? "JazzWaltz"
        : (stored.accompanimentStyle || sourcePlayerStyle || inferredStyle(song));
    const sourceTempo = validTempo(song?.tempoBpm) ?? iRealTempoForSong(song);
    const storedTempo = validTempo(stored.tempoBpm);
    const storedSemitoneShift = Number(stored.semitoneShift);

    // A user-entered tempo has priority. Otherwise an iReal/source tempo is
    // authoritative. Only a chart with neither uses the style-aware Auto value.
    const storedTempoExplicit = stored.tempoExplicit === true ||
        (stored.tempoExplicit == null && storedTempo != null);
    const tempoExplicit = sourceTempo != null || storedTempoExplicit;
    const tempoBpm = storedTempoExplicit
        ? storedTempo
        : sourceTempo != null
            ? sourceTempo
            : defaultTempoForStyle(accompanimentStyle);

    return {
        tempoBpm: clamp(tempoBpm, 40, 300),
        tempoExplicit,
        tempoUserExplicit: storedTempoExplicit,
        accompanimentStyle,
        semitoneShift: Number.isFinite(storedSemitoneShift) ? Math.trunc(storedSemitoneShift) : 0
    };
}

function restoreStoredTranspose(song = currentSong()) {
    const next = songSettings(song).semitoneShift;
    const changed = (Number(viewer.state.semitones) || 0) !== next;
    viewer.state.semitones = next;
    if (changed) {
        forceRender();
        annotateRenderedBars();
    }
    return changed;
}

function hasUnsavedStandaloneSettings(song = currentSong()) {
    if (!song) return false;
    return (Number(viewer?.state?.semitones) || 0) !== songSettings(song).semitoneShift;
}

export function saveSongSettings(identity, tempoBpm, accompanimentStyle, tempoExplicit = true, semitoneShift = 0) {
    if (!embeddedMode) {
        return requestEmbedded("saveSongSettings", { identity, tempoBpm, accompanimentStyle, tempoExplicit, semitoneShift }, 10000);
    }
    if (!identity) return null;
    const map = loadSettingsMap();
    map[identity] = {
        tempoBpm: tempoExplicit === true
            ? clamp(Number(tempoBpm) || defaultTempoForStyle(accompanimentStyle), 40, 300)
            : null,
        tempoExplicit: tempoExplicit === true,
        accompanimentStyle: String(accompanimentStyle || "Swing"),
        semitoneShift: Number.isFinite(Number(semitoneShift)) ? Math.trunc(Number(semitoneShift)) : 0
    };
    saveSettingsMap(map);
    queueBootstrapNotification();
    return getBootstrap();
}

function sidebarListTitle(song) {
    const title = song?.title || "Untitled";
    return song?.source === "demo" ? `${title} (Demo)` : title;
}

function summary(song) {
    const settings = songSettings(song);
    return {
        id: song.id,
        identity: songIdentity(song),
        title: sidebarListTitle(song),
        composer: displayComposer(song.composer || ""),
        originalStyle: song.style || "",
        key: song.key || "C",
        timeSignature: song.timeSignature || "4/4",
        tempoBpm: settings.tempoBpm,
        tempoExplicit: settings.tempoExplicit,
        tempoUserExplicit: settings.tempoUserExplicit,
        accompanimentStyle: settings.accompanimentStyle,
        semitoneShift: settings.semitoneShift,
        isNative: song.source === "native",
        hasOriginalSource: Boolean(song.originalSourceRecord?.body),
        hasSavedOverrides: hasSavedSongOverrides(song)
    };
}

function getBootstrap() {
    const song = currentSong();
    const settings = songSettings(song);
    return {
        songs: (viewer.state.songs || []).map(summary).sort((a, b) => a.title.localeCompare(b.title)),
        selectedId: song?.id || "",
        selectedIdentity: songIdentity(song),
        title: sidebarListTitle(song),
        composer: displayComposer(song?.composer || ""),
        key: displayedKey(),
        timeSignature: song?.timeSignature || "4/4",
        tempoBpm: settings.tempoBpm,
        tempoExplicit: settings.tempoExplicit,
        tempoUserExplicit: settings.tempoUserExplicit,
        accompanimentStyle: settings.accompanimentStyle,
        semitoneShift: Number(viewer.state.semitones) || 0,
        isNative: song?.source === "native",
        hasOriginalSource: Boolean(song?.originalSourceRecord?.body),
        hasSavedOverrides: hasSavedSongOverrides(song),
        viewMode: viewer.state.viewMode || "original"
    };
}

async function notifyBootstrap(value = getBootstrap()) {
    if (notifying) return;
    notifying = true;
    try {
        if (embeddedMode) postToParent({ type: "event", name: "bootstrapChanged", value });
        else if (dotNet) await dotNet.invokeMethodAsync("ChartBootstrapChanged", value);
    } finally { notifying = false; }
}

let notifyTimer;
function queueBootstrapNotification() {
    clearTimeout(notifyTimer);
    notifyTimer = setTimeout(() => {
        updateStandaloneSaveButton();
        void notifyBootstrap();
    }, 80);
}

export function getState() { return embeddedMode ? getBootstrap() : requestEmbedded("getState", {}, 10000); }

export function selectSong(songId) {
    if (!embeddedMode) return requestEmbedded("selectSong", { songId }, 10000);
    if (!editingEnabled) return getBootstrap();
    const song = viewer.state.songs.find(item => item.id === songId);
    if (!song) throw new Error("The selected song is no longer in the library.");
    viewer.state.selectedId = song.id;
    viewer.state.semitones = songSettings(song).semitoneShift;
    setToolbarState(false, canRevertSong(song));
    forceRender();
    annotateRenderedBars();
    rememberSelectedSong(song);
    queueBootstrapNotification();
    return getBootstrap();
}

export function setPlaybackState(isPlaying, sourceIndex = -1) {
    if (!embeddedMode) return requestEmbedded("setPlaybackState", { isPlaying, sourceIndex }, 10000);
    const playing = Boolean(isPlaying);
    editingEnabled = !playing;
    playbackLockedSongId = playing ? (currentSong()?.id || viewer.state.selectedId || "") : "";
    doc.body.classList.toggle("jampanion-playback", playing);
    const search = doc.getElementById("search");
    if (search) {
        search.disabled = playing;
        if (playing) search.blur();
    }
    if (playing) {
        const options = doc.getElementById("searchOptions") || doc.querySelector(".search-options");
        if (options) options.innerHTML = "";
    }
    highlightSourceBar(sourceIndex, 0);
    updateStandaloneSaveButton();
}

function scrollPlaybackTarget(target) {
    const mobile = window.matchMedia?.("(max-width: 700px)").matches === true;
    const embeddedMobile = mobile && window.parent !== window;

    // The integrated mobile page expands the iframe to the chart's full
    // height. Scrolling inside that iframe on every bar change causes small
    // vertical corrections even when consecutive bars share a system. Let
    // the parent page scroll only when the active bar leaves its visible band.
    if (!embeddedMobile) {
        target.scrollIntoView({
            block: mobile ? "center" : "nearest",
            inline: "nearest",
            behavior: "smooth"
        });
    }

    // The integrated page has its own sticky session row around this iframe.
    // Make sure the parent page has not left the target underneath that row or
    // below the mobile viewport. The extra margin is intentional hysteresis:
    // it prevents repeated tiny corrections around an edge.
    if (!embeddedMobile) return;
    try {
        const frameRect = window.frameElement?.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        if (!frameRect) return;
        const controlsBottom = Number(window.parent.document.querySelector(".jamp-mobile-controls")?.getBoundingClientRect().bottom || 0);
        const viewportBottom = Number(window.parent.innerHeight || 0);
        const usableHeight = Math.max(0, viewportBottom - controlsBottom);
        const edgeMargin = Math.max(16, usableHeight * 0.075);
        const topInset = controlsBottom + edgeMargin;
        const bottomInset = viewportBottom - edgeMargin;
        const targetTop = frameRect.top + targetRect.top;
        const targetBottom = frameRect.top + targetRect.bottom;
        const delta = targetTop < topInset
            ? targetTop - topInset
            : targetBottom > bottomInset
                ? targetBottom - bottomInset
                : 0;
        if (Math.abs(delta) > 12) {
            window.parent.scrollBy({ top: delta, left: 0, behavior: "smooth" });
        }
    } catch {
        // A standalone viewer or cross-origin parent needs no parent scroll.
    }
}

export function highlightSourceBar(sourceIndex, occurrence = 0) {
    if (!embeddedMode) return requestEmbedded("highlightSourceBar", { sourceIndex, occurrence }, 10000);
    for (const element of doc.querySelectorAll(".bar.jamp-current-playback")) {
        element.classList.remove("jamp-current-playback");
        element.style.removeProperty("box-shadow");
        element.style.removeProperty("background");
    }
    if (!Number.isInteger(sourceIndex) || sourceIndex < 0) return;
    const candidates = [...doc.querySelectorAll(`.bar[data-source-index="${sourceIndex}"]`)];
    const requested = Math.max(0, Number(occurrence) || 0);
    const target = viewer.state.viewMode === "expanded"
        ? candidates[Math.min(requested, Math.max(0, candidates.length - 1))]
        : candidates[0];
    if (!target) return;
    target.classList.add("jamp-current-playback");
    target.style.boxShadow = "inset 0 0 0 3px rgba(30,105,130,.42)";
    target.style.background = "rgba(30,105,130,.055)";
    scrollPlaybackTarget(target);
}

function annotateRenderedBars() {
    if (!viewer?.state || !doc) return;
    const song = currentSong();
    if (!song) return;
    const displayed = viewer.state.viewMode === "expanded"
        ? viewer.expandChartBars(song.bars || [])
        : (song.bars || []).map((bar, index) => ({ ...bar, _sourceIndex: index }));
    const elements = [...doc.querySelectorAll("#chartPage .bar:not(.spacer)")];
    for (let index = 0; index < elements.length; index++) {
        const source = displayed[index];
        const sourceIndex = Number.isInteger(source?._sourceIndex) ? source._sourceIndex : index;
        elements[index].dataset.sourceIndex = String(sourceIndex);
        elements[index].dataset.displayIndex = String(index);
    }
    const styledSectionBadges = [];
    for (const row of doc.querySelectorAll("#chartPage .system-row")) {
        const bar = row.querySelector(".bar:not(.spacer)");
        const lead = row.querySelector(".system-lead");
        if (!bar || !lead) continue;
        lead.dataset.sourceIndex = bar.dataset.sourceIndex || "";
        const sourceIndex = Number(lead.dataset.sourceIndex);
        const sourceBar = Number.isInteger(sourceIndex) ? song.bars?.[sourceIndex] : null;
        const styleLabel = sourceBar?.section
            ? sectionStyleAbbreviation(sourceBar.jampanionStyleOverride)
            : "";
        const current = lead.querySelector(".jamp-section-style");
        lead.classList.toggle("jamp-has-section-style", Boolean(styleLabel));
        if (!styleLabel) {
            current?.remove();
            continue;
        }
        const badge = current || doc.createElement("span");
        badge.className = "jamp-section-style";
        if (badge.textContent !== styleLabel) badge.textContent = styleLabel;
        const styleName = sectionStyleName(sourceBar.jampanionStyleOverride);
        const title = `Section style: ${styleName}`;
        if (badge.title !== title) badge.title = title;
        const ariaLabel = `Section style ${styleName}`;
        if (badge.getAttribute("aria-label") !== ariaLabel) badge.setAttribute("aria-label", ariaLabel);
        if (!current) lead.appendChild(badge);
        styledSectionBadges.push({ badge, lead });
    }
    const commonFontSize = commonSectionStyleBadgeFontSize(styledSectionBadges);
    for (const { badge, lead } of styledSectionBadges) {
        fitSectionStyleBadge(badge, lead, commonFontSize);
    }
}

function sectionStyleAbbreviation(style) {
    switch (String(style || "")) {
        case "Swing": return "Swing";
        case "JazzBallad": return "Ballad";
        case "BossaNova": return "Bossa";
        case "AfroCubanLatin": return "Latin";
        case "JazzWaltz": return "Waltz";
        default: return "";
    }
}

function commonSectionStyleBadgeFontSize(entries) {
    const maximumFontSize = 22;
    let fittedFontSize = maximumFontSize;
    for (const { badge, lead } of entries) {
        const availableWidth = Math.max(1, lead.clientWidth || lead.offsetWidth);
        badge.style.width = "max-content";
        badge.style.maxWidth = "none";
        badge.style.fontSize = `${maximumFontSize}px`;
        badge.style.lineHeight = `${maximumFontSize}px`;
        badge.style.height = `${maximumFontSize}px`;
        const naturalWidth = Math.max(1, badge.offsetWidth);
        fittedFontSize = Math.min(
            fittedFontSize,
            maximumFontSize * Math.max(1, availableWidth - 1) / naturalWidth
        );
    }
    return Math.min(maximumFontSize, Math.max(10, fittedFontSize));
}

function fitSectionStyleBadge(badge, lead, fontSize) {
    const availableWidth = Math.max(1, lead.clientWidth || lead.offsetWidth);
    const fittedFontSize = Math.max(10, Number(fontSize) || 10);
    const mark = lead.querySelector(".rehearsal-mark");
    const markCenter = mark
        ? mark.offsetLeft + (mark.offsetWidth / 2)
        : availableWidth / 2;
    badge.style.left = "0px";
    badge.style.top = `-${Math.ceil(fittedFontSize) + 4}px`;
    badge.style.width = "max-content";
    badge.style.maxWidth = "none";
    badge.style.fontSize = `${fittedFontSize.toFixed(2)}px`;
    const lineHeight = Math.ceil(fittedFontSize);
    badge.style.lineHeight = `${lineHeight}px`;
    badge.style.height = `${lineHeight + 2}px`;
    const fittedWidth = Math.max(1, badge.offsetWidth);
    badge.style.width = `${fittedWidth}px`;
    badge.style.maxWidth = `${fittedWidth}px`;
    badge.style.left = `${(markCenter - fittedWidth / 2).toFixed(2)}px`;
    badge.style.top = `-${lineHeight + 2}px`;
}

function sectionStyleName(style) {
    switch (String(style || "")) {
        case "Swing": return "Swing";
        case "JazzBallad": return "Ballad";
        case "BossaNova": return "Bossa Nova";
        case "AfroCubanLatin": return "Latin";
        case "JazzWaltz": return "Jazz Waltz";
        default: return "song default";
    }
}

function forceRender() {
    const group = doc.getElementById("viewModeGroup");
    if (!group) return;
    const current = viewer.state.viewMode || "original";
    const other = current === "original" ? "expanded" : "original";
    const otherButton = group.querySelector(`button[data-value="${other}"]`);
    const currentButton = group.querySelector(`button[data-value="${current}"]`);
    otherButton?.click();
    currentButton?.click();
}

async function ensureOriginalView() {
    const prior = viewer.state.viewMode || "original";
    if (prior === "original") {
        annotateRenderedBars();
        await nextFrames(2);
        return () => {};
    }
    doc.querySelector('#viewModeGroup button[data-value="original"]')?.click();
    await nextFrames(3);
    annotateRenderedBars();
    return () => {
        doc.querySelector(`#viewModeGroup button[data-value="${prior}"]`)?.click();
    };
}

function displayedKey() {
    return (doc.getElementById("keyValue")?.textContent || currentSong()?.key || "C").trim();
}

function displayComposer(value) {
    try { return viewer.displayComposer ? viewer.displayComposer(value) : value; }
    catch { return value; }
}

async function captureSourceTiming(song) {
    const restore = await ensureOriginalView();
    try {
        annotateRenderedBars();
        const result = new Map();
        let activeMeter = song.timeSignature || "4/4";
        for (let index = 0; index < (song.bars || []).length; index++) {
            const sourceBar = song.bars[index];
            if (sourceBar.timeSignature) activeMeter = normalizeMeter(sourceBar.timeSignature) || activeMeter;
            const element = doc.querySelector(`.bar[data-source-index="${index}"]`);
            const slots = [...(element?.querySelectorAll(".chord-slot") || [])];
            const events = [];
            for (const slotElement of slots) {
                const slotIndex = Number(slotElement.dataset.slotIndex);
                const sourceSlot = sourceBar.chordSlots?.[slotIndex];
                if (!sourceSlot || sourceSlot.hidden) continue;
                // Use the Viewer-rendered grid, not the raw iReal source cell.
                // This preserves Viewer-owned normalizations such as XyQ's
                // compact 4/4 three-chord [1,2,4] -> written [1,3,4].
                const total = Math.max(1, Number(slotElement.dataset.gridTotal) || 1);
                const start = Math.max(0, Number(slotElement.dataset.gridStart) || 0);
                events.push({
                    startTick: gridCellToTick(start, total, activeMeter),
                    symbol: String(sourceSlot.chord || "").trim()
                });
            }
            if (!events.length && sourceBar.chords?.length) {
                const values = sourceBar.chords.filter(Boolean);
                const ticks = barTicks(activeMeter);
                values.forEach((symbol, position) => events.push({
                    startTick: Math.floor(position * ticks / values.length), symbol
                }));
            }
            result.set(index, { meter: activeMeter, events });
        }
        return result;
    } finally {
        restore();
        await nextFrames(2);
        annotateRenderedBars();
    }
}

export async function compilePlayback() {
    if (!embeddedMode) return await requestEmbedded("compilePlayback", {}, 60000);
    const song = currentSong();
    if (!song) throw new Error("No song is selected.");
    const timing = await captureSourceTiming(song);
    const loopStart = findLoopStart(song.bars || []);
    const loopSource = (song.bars || []).slice(loopStart);

    const soloSequence = buildSoloSequence(loopSource, loopStart);
    const headOutSequence = buildHeadOutSequence(loopSource, loopStart);
    const leadSource = (song.bars || []).slice(0, loopStart);
    const leadSequence = leadSource.length
        ? offsetExpanded(viewer.expandChartBars(leadSource), 0)
        : [];
    const openingSequence = [...leadSequence, ...soloSequence];

    const styles = effectiveStyles(song.bars || []);
    const materialized = {
        opening: materializeSequence(openingSequence, song, timing, styles),
        solo: materializeSequence(soloSequence, song, timing, styles),
        headout: materializeSequence(headOutSequence, song, timing, styles)
    };
    const meters = new Set([
        ...materialized.opening,
        ...materialized.solo,
        ...materialized.headout
    ].map(bar => bar.timeSignature));
    const meter = meters.size === 1 ? [...meters][0] : "mixed";
    const accidental = viewer.state.settings?.accidental || "auto";
    const key = displayedKey();
    const preferFlats = accidental === "flat" || (accidental === "auto" && /[♭b]/.test(key));

    return {
        title: song.title || "Untitled",
        originalKey: song.key || "C",
        displayedKey: key,
        timeSignature: meter,
        semitoneShift: Number(viewer.state.semitones) || 0,
        preferFlats,
        openingBars: materialized.opening,
        soloBars: materialized.solo,
        headOutBars: materialized.headout
    };
}

function buildSoloSequence(loopSource, sourceOffset) {
    return buildSoloSequenceWithExpander(loopSource, sourceOffset, bars => viewer.expandChartBars(bars));
}

function buildHeadOutSequence(loopSource, sourceOffset) {
    return buildHeadOutSequenceWithExpander(loopSource, sourceOffset, bars => viewer.expandChartBars(bars));
}

export function buildHeadOutSequenceWithExpander(loopSource, sourceOffset, expandChartBars) {
    if (!loopSource.length) return [];
    const hasJump = loopSource.some(bar =>
        [...(bar.navigationSymbols || []), ...(bar.symbols || [])]
            .some(value => /^D\.[CS]\./i.test(String(value))));
    if (hasJump) {
        return offsetExpanded(expandChartBars(loopSource), sourceOffset);
    }

    // Chart Viewer intentionally leaves a standalone To Coda/Coda pair in
    // written order in Expanded view. Playback has a different requirement:
    // reserve the destination for HeadOut and take the written To Coda only on
    // the final chorus. Use the same Chart Viewer repeat expander on both sides
    // of the jump; only the navigation edge is session-specific.
    const codaStart = loopSource.findIndex((bar, index) => index > 0 && Boolean(bar.codaStart));
    if (codaStart > 0) {
        const toCoda = loopSource.findIndex((bar, index) => index < codaStart && Boolean(bar.codaEnd));
        if (toCoda >= 0) {
            const main = offsetExpanded(expandChartBars(loopSource.slice(0, toCoda + 1)), sourceOffset);
            const coda = offsetExpanded(expandChartBars(loopSource.slice(codaStart)), sourceOffset + codaStart);
            return [...main, ...coda];
        }
    }
    return offsetExpanded(expandChartBars(loopSource), sourceOffset);
}

export function buildSoloSequenceWithExpander(loopSource, sourceOffset, expandChartBars) {
    if (!loopSource.length) return [];
    let jumpIndex = -1;
    for (let index = 0; index < loopSource.length; index++) {
        const bar = loopSource[index];
        const nav = [...(bar.navigationSymbols || []), ...(bar.symbols || [])];
        if (nav.some(value => /^D\.[CS]\./i.test(String(value)))) {
            jumpIndex = index;
            break;
        }
    }

    // A written Coda destination is a last-chorus destination. When no D.C./D.S.
    // directive is present, Jazz Chart Viewer deliberately leaves it in written
    // order for display; the accompaniment solo loop must still stop before that
    // destination so Coda is reserved for HeadOut.
    const independentCoda = jumpIndex < 0
        ? loopSource.findIndex((bar, index) => index > 0 && Boolean(bar.codaStart))
        : -1;
    const firstPass = jumpIndex >= 0
        ? loopSource.slice(0, jumpIndex + 1)
        : independentCoda > 0
            ? loopSource.slice(0, independentCoda)
            : loopSource.slice();
    const cleaned = firstPass.map(bar => ({
        ...structuredCloneSafe(bar),
        symbols: (bar.symbols || []).filter(value => !/^D\.[CS]\./i.test(String(value))),
        navigationSymbols: [],
        displayDirectives: (bar.displayDirectives || []).filter(value => !/^D\.[CS]\./i.test(String(value)))
    }));
    return offsetExpanded(expandChartBars(cleaned), sourceOffset);
}

function offsetExpanded(bars, offset) {
    return (bars || []).map((bar, index) => ({
        sourceIndex: offset + (Number.isInteger(bar._sourceIndex) ? bar._sourceIndex : index)
    }));
}

function materializeSequence(sequence, song, timing, styles) {
    const output = [];
    for (const item of sequence) {
        const sourceIndex = item.sourceIndex;
        const sourceBar = song.bars?.[sourceIndex];
        const info = timing.get(sourceIndex);
        if (!sourceBar || !info) continue;
        let chords = info.events
            .filter(event => event.symbol)
            .map(event => ({ ...event }));

        if (sourceBar.repeatTwoBars || sourceBar.repeatTwoBarsContinuation) {
            chords = cloneChords(output.at(-2)?.chords || output.at(-1)?.chords || []);
        } else if (sourceBar.repeatBar || chords.some(event => event.symbol === "%" || event.symbol === "%%")) {
            chords = cloneChords(output.at(-1)?.chords || []);
        } else {
            const resolved = [];
            let active = output.at(-1)?.chords?.at(-1)?.symbol || null;
            for (const event of chords.sort((a, b) => a.startTick - b.startTick)) {
                let symbol = event.symbol;
                if (symbol === "/") {
                    if (!active) continue;
                    symbol = active;
                }
                const invisibleBass = String(symbol).match(/^[Ww]\/([A-G])([#b]?)$/);
                if (invisibleBass) {
                    const prior = active || output.at(-1)?.chords?.at(-1)?.symbol || "C";
                    const harmony = String(prior).replace(/\/[A-G][#b]?$/, "");
                    symbol = `${harmony}/${invisibleBass[1]}${invisibleBass[2]}`;
                }
                if (symbol === "%" || symbol === "%%") continue;
                active = symbol;
                if (!resolved.length || resolved.at(-1).symbol !== symbol || resolved.at(-1).startTick !== event.startTick) {
                    resolved.push({ startTick: event.startTick, symbol });
                }
            }
            chords = resolved;
        }

        if (!chords.length) {
            chords = sourceBar.jampanionNoChord === true
                ? [{ startTick: 0, symbol: "N.C." }]
                : cloneChords(output.at(-1)?.chords || [{ startTick: 0, symbol: "N.C." }]);
        }
        if (chords[0].startTick !== 0) {
            // A later written change must never be pulled early merely to satisfy
            // TuneBar's tick-zero invariant. Carry the prior bar when one exists;
            // the first bar remains N.C. until its first written chord.
            const prior = output.at(-1)?.chords?.at(-1)?.symbol || "N.C.";
            chords.unshift({ startTick: 0, symbol: prior });
        }

        output.push({
            sourceIndex,
            timeSignature: info.meter,
            section: sourceBar.section || "",
            styleOverride: styles[sourceIndex] || null,
            chords
        });
    }
    return output;
}

function cloneChords(chords) {
    return (chords || []).map(chord => ({ startTick: chord.startTick, symbol: chord.symbol }));
}

function effectiveStyles(bars) {
    const result = [];
    let active = null;
    for (let index = 0; index < bars.length; index++) {
        const bar = bars[index];
        if (bar.section) active = bar.jampanionStyleOverride || null;
        result[index] = active;
    }
    return result;
}

function findLoopStart(bars) {
    const marked = bars.findIndex(bar => String(bar.section || "").trim());
    if (marked < 0) return 0;
    const first = String(bars[marked].section || "").trim().toLowerCase();
    if (!isLeadInName(first)) return 0;
    for (let index = marked + 1; index < bars.length; index++) {
        const label = String(bars[index].section || "").trim();
        if (label && !isLeadInName(label.toLowerCase())) return index;
    }
    return 0;
}

function isLeadInName(value) {
    return ["i", "intro", "v", "verse"].includes(value);
}

function normalizeMeter(value) {
    const match = String(value || "").match(/^(\d+)\/(\d+)$/);
    return match ? `${Number(match[1])}/${Number(match[2])}` : null;
}

function barTicks(meter) {
    const normalized = normalizeMeter(meter) || "4/4";
    const [top, bottom] = normalized.split("/").map(Number);
    return Math.round(PPQ * top * 4 / bottom);
}

export function gridCellToTick(startCell, totalCells, meter) {
    const ticks = barTicks(meter);
    const total = Math.max(1, Number(totalCells) || 1);
    const start = Math.max(0, Number(startCell) || 0);
    return Math.max(0, Math.min(ticks - 1, Math.round(start / total * ticks)));
}

function rehearsalBandHeight(row) {
    const reference = row?.querySelector?.(".system-lead .rehearsal-mark") || doc.querySelector(".rehearsal-mark");
    const height = Number(reference?.getBoundingClientRect?.().height || 0);
    return height > 0 ? height : 24;
}

function isRehearsalEditPoint(event, bar) {
    const rect = bar?.getBoundingClientRect?.();
    if (!rect) return false;
    const bandHeight = rehearsalBandHeight(bar.closest?.(".system-row"));
    return event.clientY >= rect.top && event.clientY <= rect.top + bandHeight;
}

function handleDoubleClick(event) {
    if (!editingEnabled || viewer.state.viewMode !== "original") return;
    const title = event.target.closest?.(".score-header h1");
    if (title) {
        event.preventDefault();
        editTitle(title);
        return;
    }
    const mark = event.target.closest?.(".rehearsal-mark");
    if (mark) {
        event.preventDefault();
        const lead = mark.closest(".system-lead");
        editRehearsal(Number(lead?.dataset.sourceIndex), mark);
        return;
    }
    const lead = event.target.closest?.(".system-lead");
    if (lead) {
        const firstBar = lead.closest(".system-row")?.querySelector(".bar:not(.spacer)");
        const sourceIndex = Number(firstBar?.dataset.sourceIndex);
        if (Number.isInteger(sourceIndex) && isRehearsalEditPoint(event, firstBar)) {
            event.preventDefault();
            editRehearsal(sourceIndex, lead);
        }
        return;
    }
    const clickedBar = event.target.closest?.(".bar:not(.spacer)");
    if (clickedBar) {
        const sourceIndex = Number(clickedBar.dataset.sourceIndex);
        const grid = chordInputGrid(sourceIndex, clickedBar, event.clientX);
        const clickedChord = event.target.closest?.(".chord");
        const clickedChordSlot = clickedChord?.closest?.(".chord-slot");
        const clickedChordBar = clickedChordSlot?.closest?.(".bar");
        const clickedSlotIndex = Number(clickedChordSlot?.dataset.slotIndex);
        // The pointer position decides the beat before hit-testing the chord
        // text. A long first-beat chord must not steal a double-click that is
        // visibly placed on beats 2–4. A blank part of a chord slot remains
        // an insertion point, so only the chord text itself can edit a slot.
        if (Number.isInteger(sourceIndex) && clickedChord && clickedChordBar === clickedBar &&
            Number.isInteger(clickedSlotIndex) &&
            chordSlotBeat(clickedChordSlot, grid.total, grid.renderedTotal) === grid.startCell) {
            event.preventDefault();
            editChord(sourceIndex, clickedSlotIndex, clickedChordSlot);
            return;
        }
        if (Number.isInteger(sourceIndex) && grid.startCell > 0) {
            event.preventDefault();
            addChordAtPoint(sourceIndex, clickedBar, event.clientX);
            return;
        }
    }
    const chord = event.target.closest?.(".chord");
    if (chord) {
        const slot = chord.closest(".chord-slot");
        const bar = slot?.closest(".bar");
        const sourceIndex = Number(bar?.dataset.sourceIndex);
        const slotIndex = Number(slot?.dataset.slotIndex);
        if (bar && Number.isInteger(sourceIndex) && Number.isInteger(slotIndex)) {
            event.preventDefault();
            editChord(sourceIndex, slotIndex, slot);
            return;
        }
    }
    const bar = event.target.closest?.(".bar:not(.spacer)");
    if (bar && isRehearsalEditPoint(event, bar)) {
        const sourceIndex = Number(bar.dataset.sourceIndex);
        if (Number.isInteger(sourceIndex)) {
            event.preventDefault();
            editRehearsal(sourceIndex, bar);
        }
        return;
    }
    const slot = event.target.closest?.(".chord-slot");
    if (slot) {
        event.preventDefault();
        const bar = slot.closest(".bar");
        if (bar) {
            // A rendered chord slot can span several empty beat cells. Let
            // addChordAtPoint use the actual pointer position: it edits an
            // existing chord only when that exact beat already has one, and
            // otherwise opens a new editor at the clicked beat.
            addChordAtPoint(Number(bar.dataset.sourceIndex), bar, event.clientX);
        }
        return;
    }
    if (bar) {
        event.preventDefault();
        addChordAtPoint(Number(bar.dataset.sourceIndex), bar, event.clientX);
    }
}

function handleContextMenu(event) {
    if (!editingEnabled || viewer.state.viewMode !== "original") return;
    const barElement = event.target.closest?.(".bar:not(.spacer)") ||
        event.target.closest?.(".system-lead")?.closest?.(".system-row")?.querySelector?.(".bar:not(.spacer)");
    if (!barElement) return;
    const sourceIndex = Number(barElement.dataset.sourceIndex);
    if (!Number.isInteger(sourceIndex)) return;
    event.preventDefault();
    showBarMenu(sourceIndex, event.clientX, event.clientY);
}

function editTitle(anchor) {
    const song = currentSong();
    openEditor(anchor, song.title || "", async value => {
        const title = value.trim();
        if (!title || title === song.title) return;
        promoteNative(song);
        song.title = title;
        stageNative(song);
        forceRender();
        await edited("Title updated");
    });
}

function editRehearsal(sourceIndex, anchor) {
    const bar = currentSong()?.bars?.[sourceIndex];
    if (!bar) return;
    openEditor(anchor, bar.section || "", async value => {
        const label = value.trim().replace(/[|\r\n]/g, "");
        const nextSection = label || null;
        const nextStyle = label ? (bar.jampanionStyleOverride || null) : null;
        if ((bar.section || null) === nextSection &&
            (bar.jampanionStyleOverride || null) === nextStyle) return;
        promoteNative(currentSong());
        bar.section = label || null;
        if (!label) bar.jampanionStyleOverride = null;
        stageNative(currentSong());
        forceRender();
        await edited(label ? "Rehearsal mark updated" : "Rehearsal mark removed");
    });
}

function editChord(sourceIndex, slotIndex, anchor) {
    const song = currentSong();
    const bar = song?.bars?.[sourceIndex];
    const slot = bar?.chordSlots?.[slotIndex];
    if (!slot) return;
    openEditor(anchor, slot.chord || "", async value => {
        const chord = value.trim();
        if (chord === slot.chord) return;
        promoteNative(song);
        if (!chord) {
            bar.chordSlots.splice(slotIndex, 1);
            bar.jampanionNoChord = bar.chordSlots.filter(item => !item.hidden).length === 0;
            rebuildChordList(bar);
            stageNative(song);
            forceRender();
            await edited("Chord removed");
            return;
        }
        bar.jampanionNoChord = false;
        slot.chord = chord;
        rebuildChordList(bar);
        stageNative(song);
        forceRender();
        await edited("Chord updated");
    });
}

function addChordAtPoint(sourceIndex, barElement, clientX) {
    const song = currentSong();
    const bar = song?.bars?.[sourceIndex];
    if (!bar) return;
    const sourceSlots = bar.chordSlots || (bar.chordSlots = []);
    const hasVisibleSlot = sourceSlots.some(slot => !slot.hidden);
    const { total, startCell, insertCell, inputLeft } = chordInputGrid(sourceIndex, barElement, clientX);
    const rect = barElement.getBoundingClientRect();

    normalizeBarGridFromDom(bar, barElement, total);

    const inputHeight = 28;
    const chordTop = rect.top + (rect.height - inputHeight) / 2;
    openEditorAtPoint(inputLeft, chordTop, "", async value => {
        const chord = value.trim();
        if (!chord) return;
        promoteNative(song);
        bar.jampanionNoChord = false;
        const sourceCell = hasVisibleSlot ? insertCell : startCell;
        if (!hasVisibleSlot && startCell > 0 && !sourceSlots.some(slot => slot.hidden && Number(slot.cell) === 0)) {
            // The Viewer intentionally places a lone chord on beat 1. Keep a
            // hidden hold anchor so a first chord entered on beats 2–4 keeps
            // its requested position without adding visible harmony.
            sourceSlots.push({ chord: "/", alternates: [], cell: 0, small: false, fermata: false, hidden: true });
        }
        sourceSlots.push({ chord, alternates: [], cell: sourceCell, small: false, fermata: false, hidden: false });
        sourceSlots.sort((a, b) => Number(a.cell || 0) - Number(b.cell || 0));
        rebuildChordList(bar);
        stageNative(song);
        forceRender();
        await edited("Chord added");
    });
}

function chordInputGrid(sourceIndex, barElement, clientX) {
    const song = currentSong();
    const domSlots = [...(barElement?.querySelectorAll?.(".chord-slot") || [])];
    const first = domSlots[0];
    const renderedTotal = first?.classList.contains("cell-positioned-slot")
        ? Number(first.dataset.gridTotal)
        : 0;
    const meter = song ? resolvedMeterAt(song.bars, sourceIndex) : "4/4";
    const maxInputCells = meter === "3/4" ? 3 : 4;
    const total = Math.min(maxInputCells, Math.max(1, renderedTotal || maxInputCells));
    const rect = barElement?.querySelector?.(".chords")?.getBoundingClientRect?.() ||
        barElement?.getBoundingClientRect?.();
    const fraction = rect
        ? clamp((clientX - rect.left) / Math.max(1, rect.width), 0, .9999)
        : 0;
    const startCell = Math.min(total - 1, Math.floor(fraction * total));
    const insertCell = renderedTotal > 1
        ? Math.round(startCell * renderedTotal / total)
        : startCell;
    const visualOffset = domSlots.map(slot => {
        const slotRect = slot.getBoundingClientRect?.();
        const chordRect = slot.querySelector?.(".chord")?.getBoundingClientRect?.();
        return slotRect && chordRect ? chordRect.left - slotRect.left : null;
    }).find(value => Number.isFinite(value)) || 0;
    return {
        domSlots,
        total,
        renderedTotal,
        startCell,
        insertCell,
        inputLeft: rect
            ? rect.left + (renderedTotal > 1
                ? insertCell / renderedTotal
                : startCell / total) * rect.width + visualOffset
            : clientX
    };
}

function chordSlotBeat(slot, total, renderedTotal) {
    if (!slot) return -1;
    const start = Math.max(0, Number(slot.dataset.gridStart) || 0);
    if (renderedTotal > 1) {
        return Math.max(0, Math.min(total - 1, Math.floor(start / (renderedTotal / total))));
    }
    const count = Math.max(1, Number(slot.dataset.slotCount) || 1);
    const index = Math.max(0, Number(slot.dataset.slotIndex) || 0);
    return Math.max(0, Math.min(total - 1, Math.floor(index * total / count)));
}

function normalizeBarGridFromDom(bar, barElement, total) {
    const sourceSlots = bar.chordSlots || (bar.chordSlots = []);
    const domSlots = [...barElement.querySelectorAll(".chord-slot")];
    for (const element of domSlots) {
        const index = Number(element.dataset.slotIndex);
        const gridStart = Number(element.dataset.gridStart) || 0;
        if (sourceSlots[index]) sourceSlots[index].cell = gridStart;
    }

    const alternateRefs = [];
    for (const slot of sourceSlots) {
        const alternates = Array.isArray(slot.alternates) ? slot.alternates : [];
        for (let index = 0; index < alternates.length; index++) {
            alternateRefs.push({ slot, index });
        }
    }
    let cursor = 0;
    for (const group of barElement.querySelectorAll(".alternate-cell")) {
        const inline = String(group.style.gridColumn || "");
        const match = inline.match(/^(\d+)/);
        const startCell = match ? Math.max(0, Number(match[1]) - 1) : 0;
        const count = Math.max(1, group.querySelectorAll(".alternate-chord").length);
        for (let index = 0; index < count && cursor < alternateRefs.length; index++, cursor++) {
            const ref = alternateRefs[cursor];
            const current = ref.slot.alternates[ref.index];
            ref.slot.alternates[ref.index] = typeof current === "string"
                ? { chord: current, cell: startCell }
                : { ...current, cell: startCell };
        }
    }
    bar.cellCount = total;
}

function rebuildChordList(bar) {
    bar.chords = (bar.chordSlots || []).filter(slot => !slot.hidden).map(slot => slot.chord);
}

function showBarMenu(sourceIndex, x, y) {
    closeContextMenu();
    const song = currentSong();
    const bar = song?.bars?.[sourceIndex];
    if (!bar) return;
    const menu = doc.createElement("div");
    menu.className = "jamp-context-menu";
    contextMenu = menu;

    if (!bar.section) return;
    const styles = resolvedMeterAt(song.bars || [], sourceIndex) === "3/4"
        ? [[null, "Use song default"], ["JazzWaltz", "Jazz Waltz"]]
        : [
            [null, "Use song default"],
            ["Swing", "Swing"], ["JazzBallad", "Ballad"], ["BossaNova", "Bossa Nova"],
            ["AfroCubanLatin", "Latin"]
        ];
    for (const [value, label] of styles) {
        const button = addMenuButton(menu, label, async () => {
            closeContextMenu();
            const nextStyle = value || null;
            if ((bar.jampanionStyleOverride || null) === nextStyle) return;
            promoteNative(song);
            bar.jampanionStyleOverride = nextStyle;
            stageNative(song);
            await edited(value ? `Section style: ${label}` : "Section style: song default");
        });
        if ((bar.jampanionStyleOverride || null) === value) button.classList.add("selected");
    }

    doc.body.appendChild(menu);
    const rect = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(4, Math.min(x, win.innerWidth - rect.width - 4))}px`;
    menu.style.top = `${Math.max(4, Math.min(y, win.innerHeight - rect.height - 4))}px`;
}

function addMenuButton(menu, text, action) {
    const button = doc.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); void action(); });
    menu.appendChild(button);
    return button;
}

function closeContextMenu() {
    contextMenu?.remove();
    contextMenu = null;
}

function openEditor(anchor, value, commit) {
    const isChord = Boolean(anchor?.closest?.(".chord-slot"));
    const isRehearsal = Boolean(anchor?.closest?.(".rehearsal-mark") || anchor?.closest?.(".system-lead") || anchor?.classList?.contains?.("bar"));
    const visualAnchor = isChord ? (anchor.querySelector?.(".chord") || anchor) : anchor;
    const rect = visualAnchor?.getBoundingClientRect?.() || { left: 20, top: 20, width: 140, height: 30 };
    const width = isChord ? Math.max(88, rect.width) : isRehearsal ? 64 : Math.min(180, Math.max(120, rect.width));
    const height = isChord ? rect.height : 28;
    const left = rect.left;
    const top = rect.top;
    openEditorAtPoint(left, top, value, commit, width, height);
}

function openEditorAtPoint(left, top, value, commit, width = 64, height = 28) {
    closeEditor(false);
    const input = doc.createElement("input");
    input.className = "jamp-edit-input";
    input.value = value;
    const inputWidth = Math.max(1, Math.min(width, 180));
    const inputHeight = Math.max(1, Math.min(height, 180));
    const maxLeft = Math.max(4, (win.innerWidth || inputWidth + 8) - inputWidth - 4);
    const maxTop = Math.max(4, (win.innerHeight || inputHeight + 8) - inputHeight - 4);
    input.style.left = `${Math.max(4, Math.min(left, maxLeft))}px`;
    input.style.top = `${Math.max(4, Math.min(top, maxTop))}px`;
    input.style.width = `${inputWidth}px`;
    input.style.height = `${inputHeight}px`;
    editInput = input;
    let finished = false;
    const finish = async shouldCommit => {
        if (finished) return;
        finished = true;
        const next = input.value;
        input.remove();
        if (editInput === input) editInput = null;
        if (shouldCommit) await commit(next);
    };
    input.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === "Tab") { event.preventDefault(); void finish(true); }
        else if (event.key === "Escape") { event.preventDefault(); void finish(false); }
    });
    input.addEventListener("blur", () => void finish(true));
    doc.body.appendChild(input);
    input.focus();
    input.setSelectionRange(0, 0);
}

function closeEditor(commit = false) {
    if (!editInput) return;
    if (commit) editInput.blur();
    else { editInput.remove(); editInput = null; }
}

async function edited(message) {
    annotateRenderedBars();
    setToolbarState(true, canRevertSong(currentSong()));
    updateStandaloneSaveButton();
    queueBootstrapNotification();
    if (embeddedMode) postToParent({ type: "event", name: "edited", message });
    else if (dotNet) await dotNet.invokeMethodAsync("ChartEdited", message);
}

function promoteNative(song) {
    if (!song) return;
    if (song.source !== "native") {
        song.nativeIdentity = songIdentity(song);
        song.originalSourceRecord = song.sourceRecord ? structuredCloneSafe(song.sourceRecord) : null;
        song.source = "native";
        song.nativeSchemaVersion = 1;
    }
}

function stageNative(song) {
    if (!song) return;
    promoteNative(song);
    nativeSongs.set(songIdentity(song), structuredCloneSafe(song));
}

async function persistNative(song) {
    if (!song) return;
    stageNative(song);
    const identity = songIdentity(song);
    nativeSongs.set(identity, structuredCloneSafe(song));
    await putNativeRecord(identity, song);
}

export async function saveCurrentChart() {
    if (!embeddedMode) return await requestEmbedded("saveCurrentChart", {}, 10000);
    if (!editingEnabled) throw new Error("Stop playback before saving the chart.");
    const song = currentSong();
    if (!song) return getBootstrap();

    // Viewer mode has no separate accompaniment Save control. Persist the
    // complete current settings bundle here too, including the toolbar's
    // current transposition, so a standalone Save behaves like integrated
    // Save and the setting is restored on the next visit.
    const settings = songSettings(song);
    saveSongSettings(
        songIdentity(song),
        settings.tempoBpm,
        settings.accompanimentStyle,
        settings.tempoExplicit,
        Number(viewer.state.semitones) || 0);

    if (song.source === "native") await persistNative(song);
    setToolbarState(false, canRevertSong(song));
    updateStandaloneSaveButton();
    annotateRenderedBars();
    queueBootstrapNotification();
    return getBootstrap();
}

async function loadNativeSongs() {
    nativeSongs = new Map();
    try {
        const database = await openNativeDb();
        const records = await transactionRequest(database, "readonly", store => store.getAll());
        database.close();
        for (const record of records || []) {
            if (record?.identity && record?.song) nativeSongs.set(record.identity, record.song);
        }
    } catch {
        // Native editing remains available for this session even if IndexedDB is blocked.
    }
}

function applyNativeOverrides() {
    if (!viewer?.state?.songs) return false;
    const selectedIdentity = songIdentity(currentSong());
    const output = [];
    const used = new Set();
    let changed = false;
    for (const song of viewer.state.songs) {
        const identity = songIdentity(song);
        const native = nativeSongs.get(identity);
        if (native) {
            output.push(structuredCloneSafe(native));
            used.add(identity);
            changed = changed || song.source !== "native" || song.id !== native.id;
        } else {
            output.push(song);
        }
    }
    for (const [identity, native] of nativeSongs) {
        if (!used.has(identity) && !output.some(song => songIdentity(song) === identity)) {
            output.push(structuredCloneSafe(native));
            changed = true;
        }
    }
    if (changed) {
        viewer.state.songs = output;
        const selected = output.find(song => songIdentity(song) === selectedIdentity) || output[0];
        if (selected) viewer.state.selectedId = selected.id;
    }
    return changed;
}

function openNativeDb() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(NATIVE_DB, NATIVE_DB_VERSION);
        request.onerror = () => reject(request.error);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(NATIVE_STORE)) db.createObjectStore(NATIVE_STORE, { keyPath: "identity" });
        };
        request.onsuccess = () => resolve(request.result);
    });
}

function transactionRequest(database, mode, operation) {
    return new Promise((resolve, reject) => {
        const tx = database.transaction(NATIVE_STORE, mode);
        const store = tx.objectStore(NATIVE_STORE);
        let result;
        let request;
        try { request = operation(store); }
        catch (error) { reject(error); return; }
        request.onsuccess = () => { result = request.result; };
        request.onerror = () => reject(request.error);
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
    });
}

async function putNativeRecord(identity, song) {
    try {
        const database = await openNativeDb();
        await transactionRequest(database, "readwrite", store => store.put({ identity, song: structuredCloneSafe(song) }));
        database.close();
    } catch {
        // Do not block chart editing if persistence is unavailable.
    }
}

export async function createNewSong(title, barCount, meter, key, accompanimentStyle) {
    if (!embeddedMode) return await requestEmbedded("createNewSong", { title, barCount, meter, key, accompanimentStyle }, 10000);
    if (!editingEnabled) throw new Error("Stop playback before creating a song.");
    title = String(title || "").trim();
    if (!title) throw new Error("Enter a song title.");
    barCount = clamp(Math.round(Number(barCount) || 32), 4, 512);
    meter = meter === "3/4" ? "3/4" : "4/4";
    key = String(key || "C").trim() || "C";
    const id = `native-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
    const identity = `native:${id}`;
    const bars = Array.from({ length: barCount }, (_, index) => ({
        chords: [],
        chordSlots: [],
        alternateChords: [],
        section: index === 0 ? "A" : null,
        ending: null, symbols: [], navigationSymbols: [], displayDirectives: [], texts: [],
        startRepeat: false, endRepeat: false, doubleStart: false, doubleEnd: false,
        final: index === barCount - 1, repeatBar: false, repeatTwoBars: false,
        repeatTwoBarsContinuation: false, repeatCount: null,
        cellCount: meter === "3/4" ? 6 : 8, verticalSpace: 0,
        timeSignature: index === 0 ? meter : null, meterGrouping: null,
        systemBreak: false, codaStart: false, codaEnd: false, endMarker: false,
        jampanionStyleOverride: null, jampanionNoChord: true
    }));
    const song = {
        id, nativeIdentity: identity, title, composer: "", style: "", key,
        timeSignature: meter, bars, warnings: [], importedAt: Date.now(),
        source: "native", sourceRecord: null, originalSourceRecord: null,
        parserVersion: 18, nativeSchemaVersion: 1
    };
    nativeSongs.set(identity, structuredCloneSafe(song));
    await putNativeRecord(identity, song);
    viewer.state.songs.push(song);
    viewer.state.selectedId = id;
    restoreStoredTranspose();
    saveSongSettings(identity, defaultTempoForStyle(meter === "3/4" ? "JazzWaltz" : accompanimentStyle || "Swing"), meter === "3/4" ? "JazzWaltz" : accompanimentStyle || "Swing", false);
    forceRender();
    annotateRenderedBars();
    rememberSelectedSong(song);
    await edited("New song created");
    return getBootstrap();
}

export async function deleteCurrentNativeSong() {
    if (!embeddedMode) return await requestEmbedded("deleteCurrentNativeSong", {}, 10000);
    const song = currentSong();
    if (!song || song.source !== "native") return getBootstrap();
    const identity = songIdentity(song);
    const originalRecord = song.originalSourceRecord ? structuredCloneSafe(song.originalSourceRecord) : null;
    removeSongSettings(identity);
    nativeSongs.delete(identity);
    try {
        const database = await openNativeDb();
        await transactionRequest(database, "readwrite", store => store.delete(identity));
        database.close();
    } catch {}

    const currentIndex = viewer.state.songs.findIndex(item => item.id === song.id);
    let restored = null;
    if (originalRecord?.body && typeof viewer.parseIRealCollection === "function") {
        try {
            const protocol = /^(?:irealb|irealbook):\/\/$/i.test(originalRecord.protocol || "")
                ? originalRecord.protocol
                : "irealb://";
            restored = viewer.parseIRealCollection(`${protocol}${encodeURIComponent(originalRecord.body)}`).songs?.[0] || null;
        } catch (error) {
            console.warn("Original iReal chart could not be restored", error);
        }
    }

    if (restored) {
        if (currentIndex >= 0) viewer.state.songs.splice(currentIndex, 1, restored);
        else viewer.state.songs.push(restored);
        viewer.state.selectedId = restored.id;
    } else {
        viewer.state.songs = viewer.state.songs.filter(item => item.id !== song.id);
        viewer.state.selectedId = viewer.state.songs[0]?.id || "";
    }
    restoreStoredTranspose();
    forceRender();
    annotateRenderedBars();
    rememberSelectedSong(currentSong());
    queueBootstrapNotification();
    return getBootstrap();
}

export async function revertCurrentSong() {
    if (!embeddedMode) return await requestEmbedded("revertCurrentSong", {}, 10000);
    const song = currentSong();
    if (!song) return getBootstrap();
    setToolbarState(false, false);
    removeSongSettings(songIdentity(song));
    if (song.source === "native" && song.originalSourceRecord?.body) {
        return await deleteCurrentNativeSong();
    }
    restoreStoredTranspose();
    forceRender();
    annotateRenderedBars();
    rememberSelectedSong(song);
    queueBootstrapNotification();
    return getBootstrap();
}

function resolvedMeterAt(bars, sourceIndex) {
    let meter = "4/4";
    for (let index = 0; index <= sourceIndex && index < bars.length; index++) {
        if (bars[index].timeSignature) meter = normalizeMeter(bars[index].timeSignature) || meter;
    }
    return meter;
}

function structuredCloneSafe(value) {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
}

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function nextFrame() { return new Promise(resolve => requestAnimationFrame(resolve)); }
async function nextFrames(count) { for (let i = 0; i < count; i++) await nextFrame(); }

export function getDevicePreferences() {
    try {
        const value = JSON.parse(localStorage.getItem(DEVICE_SETTINGS_KEY) || "{}");
        return { inputId: String(value?.inputId || ""), outputId: String(value?.outputId || "") };
    } catch {
        return { inputId: "", outputId: "" };
    }
}

export function saveDevicePreferences(inputId, outputId) {
    try {
        localStorage.setItem(DEVICE_SETTINGS_KEY, JSON.stringify({
            inputId: String(inputId || ""),
            outputId: String(outputId || "")
        }));
    } catch {}
}

export function getMixerPreferences() {
    try {
        const value = JSON.parse(localStorage.getItem(MIXER_SETTINGS_KEY) || "null");
        if (!value || typeof value !== "object") return null;
        return {
            pianoEnabled: value.pianoEnabled !== false,
            bassEnabled: value.bassEnabled !== false,
            drumsEnabled: value.drumsEnabled !== false,
            midiThruEnabled: value.midiThruEnabled === true,
            pianoVolume: clamp(Number(value.pianoVolume), 0, 100),
            bassVolume: clamp(Number(value.bassVolume), 0, 100),
            drumsVolume: clamp(Number(value.drumsVolume), 0, 100),
            vibraphoneVolume: clamp(Number(value.vibraphoneVolume), 0, 100)
        };
    } catch {
        return null;
    }
}

export function saveMixerPreferences(value) {
    try {
        localStorage.setItem(MIXER_SETTINGS_KEY, JSON.stringify({
            pianoEnabled: value?.pianoEnabled !== false,
            bassEnabled: value?.bassEnabled !== false,
            drumsEnabled: value?.drumsEnabled !== false,
            midiThruEnabled: value?.midiThruEnabled === true,
            pianoVolume: clamp(Number(value?.pianoVolume), 0, 100),
            bassVolume: clamp(Number(value?.bassVolume), 0, 100),
            drumsVolume: clamp(Number(value?.drumsVolume), 0, 100),
            vibraphoneVolume: clamp(Number(value?.vibraphoneVolume), 0, 100)
        }));
    } catch {}
}

export function dispose() {
    observer?.disconnect();
    mobileControlsScrollCleanup?.();
    if (globalKeyHandler) document.removeEventListener("keydown", globalKeyHandler);
    if (embeddedKeyHandler) document.removeEventListener("keydown", embeddedKeyHandler);
    globalKeyHandler = null;
    observer = null;
    if (libraryTimer) clearInterval(libraryTimer);
    libraryTimer = null;
    closeEditor(false);
    closeContextMenu();
    dotNet = null;
    viewer = null;
    doc = null;
    win = null;
    frame = null;
}
