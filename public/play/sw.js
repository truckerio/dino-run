const SHELL_CACHE = "world-runner-play-shell-v1";
const RUNTIME_CACHE = "world-runner-play-runtime-v1";
const OFFLINE_URL = "/play/?room=painting-01";
const SHELL_URLS = [
  OFFLINE_URL,
  "/play/styles.css",
  "/play/pwa.js",
  "/play/game.js?v=jet-obstacles-1",
  "/play/manifest.webmanifest",
  "/play/icons/icon-192.png",
  "/play/icons/icon-512.png",
  "/play/icons/apple-touch-icon.png",
  "/vendor/phaser.min.js",
  "/socket.io/socket.io.js",
  "/config.js",
  "/assets/character/blue-godzilla/run-sheet.png?v=godzilla-palette-2",
  "/assets/character/blue-godzilla/night/run-sheet.png?v=night-palette-2",
  "/assets/character/blue-godzilla/duck-sheet.png?v=godzilla-palette-2",
  "/assets/character/blue-godzilla/night/duck-sheet.png?v=night-palette-2",
  "/assets/character/blue-godzilla/jump-00.png?v=godzilla-palette-2",
  "/assets/character/blue-godzilla/night/jump-00.png?v=night-palette-2",
  "/assets/character/blue-godzilla/dead-00.png?v=godzilla-palette-2",
  "/assets/character/blue-godzilla/night/dead-00.png?v=night-palette-2",
  "/assets/obstacles/ruin-single.png",
  "/assets/obstacles/night/ruin-single.png?v=night-palette-1",
  "/assets/obstacles/jet-day.png?v=source-jet-1",
  "/assets/obstacles/night/jet-night.png?v=source-jet-1",
  "/assets/backgrounds/cloud-trex.png",
  "/assets/platform/ground-from-strip.png",
  "/assets/wonders/day/great-wall.png",
  "/assets/wonders/day/taj-mahal.png",
  "/assets/wonders/day/colosseum.png",
  "/assets/wonders/day/christ.png",
  "/assets/wonders/day/pyramid.png",
  "/assets/wonders/day/machu-picchu.png",
  "/assets/wonders/day/petra.png",
  "/assets/wonders/night/great-wall.png",
  "/assets/wonders/night/taj-mahal.png",
  "/assets/wonders/night/colosseum.png",
  "/assets/wonders/night/christ.png",
  "/assets/wonders/night/pyramid.png",
  "/assets/wonders/night/machu-picchu.png",
  "/assets/wonders/night/petra.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => ![SHELL_CACHE, RUNTIME_CACHE].includes(key))
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate" && url.pathname.startsWith("/play")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          return cached || caches.match(OFFLINE_URL);
        })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (!response.ok) return response;
        const copy = response.clone();
        caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
        return response;
      });
    })
  );
});
