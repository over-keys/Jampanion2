const CACHE_NAME = "jampanion-viewer-offline-v2";
const CORE_ASSETS = [
  "./index.html",
  "./help.html",
  "./help.en.html",
  "./help.css",
  "./assets/MuseJazzText.otf",
  "./licenses/MuseJazzText-OFL-1.1.txt",
  "./licenses/ireal-reader-MIT.txt",
  "../icons/jampanion-32.png?v=37"
];

async function cacheCoreAssets() {
  const cache = await caches.open(CACHE_NAME);
  const results = await Promise.all(CORE_ASSETS.map(async asset => {
    try {
      await cache.add(asset);
      return true;
    } catch (error) {
      console.warn("Offline Viewer asset could not be cached:", asset, error);
      return false;
    }
  }));
  if (!results[0]) throw new Error("Offline Viewer shell could not be cached.");
}

self.addEventListener("install", event => {
  event.waitUntil(
    cacheCoreAssets()
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => key.startsWith("jampanion-viewer-offline-") && key !== CACHE_NAME)
        .map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(CACHE_NAME).then(cache => cache.put("./index.html", copy));
          }
          return response;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(request, { ignoreSearch: true })
      .then(cached => cached || fetch(request).then(response => {
        if (response.ok && url.pathname.includes("/viewer/")) {
          const copy = response.clone();
          void caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
      }))
  );
});
