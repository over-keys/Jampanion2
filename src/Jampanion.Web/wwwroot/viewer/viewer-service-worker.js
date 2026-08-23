const CACHE_NAME = "jampanion-viewer-offline-v1";
const CORE_ASSETS = [
  "./index.html",
  "./help.html",
  "./help.en.html",
  "./help.css",
  "./assets/MuseJazzText.otf",
  "./licenses/MuseJazzText-OFL-1.1.txt",
  "./licenses/ireal-reader-MIT.txt"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CORE_ASSETS))
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
