const CACHE_NAME = "little-learner-v1";
const BASE = "/little-learner/";

// Cache the app shell on install
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll([
        BASE,
        BASE + "index.html",
        BASE + "manifest.json",
        BASE + "icon-192.png",
        BASE + "icon-512.png",
      ])
    )
  );
  self.skipWaiting();
});

// Clean old caches on activate
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first strategy: try network, fall back to cache
self.addEventListener("fetch", (e) => {
  // Skip non-GET and cross-origin requests (Firebase, Google Fonts, etc.)
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        // Cache successful responses
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
