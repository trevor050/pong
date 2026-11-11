/*
 * Offline support. The whole app is precached as one versioned set and served
 * cache-first, so it opens instantly and never mixes files from two deploys.
 * VERSION is a content hash of the precached files: run `npm run stamp` after
 * changing any of them (CI fails if it is stale). A new VERSION installs in
 * the background and takes over on the next launch.
 */
const VERSION = "endless-pong-41712459";

const PRECACHE = [
  "./",
  "index.html",
  "styles.css",
  "js/physics.js",
  "js/settings.js",
  "js/render.js",
  "js/app.js",
  "fonts/space-grotesk-latin.woff2",
  "favicon.svg",
  "manifest.webmanifest",
  "icons/icon.svg",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      // Bypass the HTTP cache so a new version never precaches stale files.
      .then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.open(VERSION).then(async (cache) => {
      // Every navigation (any query or hash) gets the app shell.
      const cached =
        request.mode === "navigate" ? await cache.match("./") : await cache.match(request, { ignoreSearch: true });
      return cached || fetch(request);
    })
  );
});
