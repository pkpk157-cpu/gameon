/* FPL Game On V12 — service worker (network-first for app + data, cache fallback) */
const CACHE = "gameon-v12-2";
const ASSETS = [
  "./", "./index.html", "./styles.css",
  "./config.js", "./api.js", "./data.js", "./compute.js", "./app.js",
  "./manifest.json", "./icon.svg"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.allSettled(ASSETS.map((a) => c.add(a))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Never cache cross-origin (proxy/FPL) calls — always go to network.
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate" || req.destination === "document") {
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put("./index.html", copy)).catch(() => {});
        return res;
      }).catch(() => caches.match("./index.html").then((c) => c || caches.match("./")))
    );
    return;
  }

  // Don't cache data.json (it changes each gameweek): network-first.
  // Ask the server to revalidate rather than trusting the browser's own HTTP
  // cache — otherwise a stale app.js can outlive a deploy for as long as its
  // max-age, and the device sits on an old build with no way to notice.
  const fresh = new Request(req.url, { cache: "no-cache", credentials: "same-origin" });
  e.respondWith(
    fetch(fresh).then((res) => {
      const copy = res.clone();
      if (!url.pathname.endsWith("data.json")) {
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    }).catch(() => caches.match(req))
  );
});
