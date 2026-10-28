/* FPL Game On V12 — service worker.

   The app itself (the page, its styles and scripts, the crest) opens from the
   phone, every file from one stored release, and never waits on the network.
   A new release is fetched in the background when one is published and takes
   over on the next open. Opening used to revalidate every file with the
   server first, which on a weak signal held the opening screen for ten
   seconds; and since files were fetched one by one, a deploy landing mid-open
   could pair an old page with new styles.

   BUILD is a hash of the release's files, written by scripts/stamp-sw.js and
   checked by scripts/check-sources.js on every push: it changes when, and
   only when, the app does, so a worker is reinstalled for a new release and
   not for the data the updater publishes every five minutes. */
const BUILD = "9b2a70dacb8d";
const CACHE = "gameon-" + BUILD;
// Player and club pictures, kept across releases: they do not change with one.
const PHOTOS = "gameon-photos";
const ASSETS = [
  "./index.html", "./styles.css",
  "./config.js", "./scripts/bonus.js", "./api.js", "./data.js", "./usage.js", "./compute.js", "./theo.js", "./app.js",
  "./manifest.json", "./favicon-64.png", "./logo-splash.webp", "./logo-crest.webp", "./launch-tile.webp",
  "./logo-tile.webp", "./logo-tile-inv.webp", "./pl-lion.webp", "./fpl-tile.webp"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      // Revalidated, not trusted from the browser's own cache (GitHub Pages
      // lets it keep a file ten minutes, which could be the release before),
      // and all or nothing: a release missing a file is not installed, and
      // the one before carries on until the next try.
      .then((c) => Promise.all(ASSETS.map((a) => fetch(new Request(a, { cache: "no-cache" })).then((res) => {
        if (!res.ok) throw new Error(a + " " + res.status);
        return c.put(a, res);
      }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== PHOTOS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const SHELL = new Set(ASSETS.map((a) => new URL(a, self.location).pathname));
SHELL.add(new URL("./", self.location).pathname);

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Never cache cross-origin (proxy/FPL) calls — always go to network.
  if (url.origin !== self.location.origin) return;
  // The data has its own keeping (data.js): the browser fetches it as asked.
  if (url.pathname.endsWith("data.json")) return;

  // The page and its files: from the stored release, at once. Only a phone
  // with nothing stored yet (the very first open) goes to the network.
  if (req.mode === "navigate" || SHELL.has(url.pathname)) {
    const key = (req.mode === "navigate" || url.pathname === new URL("./", self.location).pathname) ? "./index.html" : req;
    e.respondWith(
      caches.open(CACHE).then((c) => c.match(key, { ignoreSearch: true })).then((hit) => hit ||
        fetch(req.mode === "navigate" ? req.url : req, { credentials: "same-origin" }).then((res) => {
          if (res.redirected && req.mode === "navigate") return fetch(req);
          return res;
        }))
    );
    return;
  }

  // Pictures and anything else of ours: kept once fetched, shown from the
  // phone, and refreshed behind it for next time.
  e.respondWith(
    caches.open(PHOTOS).then((c) => c.match(req).then((hit) => {
      const net = fetch(req).then((res) => {
        // Only a good answer is worth keeping: a miss stored here would be
        // served back for as long as the cache lives.
        if (res.ok) c.put(req, res.clone()).catch(() => {});
        return res;
      });
      if (hit) { net.catch(() => {}); return hit; }
      return net;
    }))
  );
});
