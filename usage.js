/* FPL Game On V12 — usage beacons.
   What the app sends to the league's own counter (usage-worker.mjs): which
   tab was opened, and how long the app was on screen. A random id kept on
   the phone tells one device from another; the manager id is included only
   when this phone has "Highlight my team" set. Nothing is sent when the
   worker address is not configured, when this phone has switched counting
   off in Settings, or on localhost unless ?usagedev=1 asks for it. Every
   call is wrapped: the app cannot tell whether a beacon got through. */
(function () {
  "use strict";
  var DEV_KEY = "go12.dev", ME_KEY = "go12.me", SKIP_KEY = "skipgc";
  var FLUSH_MS = 10000, SLICE_MS = 10 * 60 * 1000, MAX_QUEUE = 40;
  var queue = [], timer = 0, shownAt = null, lastView = null, sent = 0;

  function lsGet(k) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function lsRaw(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  function url() {
    try { var c = window.GO_STORE && window.GO_STORE.config(); return (c && c.usageUrl || "").replace(/\/+$/, ""); } catch (e) { return ""; }
  }
  function enabled() {
    if (!url()) return false;
    if (lsRaw(SKIP_KEY) === "t") return false;
    var local = /^(localhost|127\.|\[?::1)/.test(location.hostname);
    if (local && location.search.indexOf("usagedev") === -1) return false;
    return true;
  }
  function device() {
    var d = lsGet(DEV_KEY);
    if (typeof d === "string" && /^[A-Za-z0-9_-]{8,40}$/.test(d)) return d;
    d = "";
    try { d = (crypto.randomUUID ? crypto.randomUUID() : "").replace(/-/g, ""); } catch (e) {}
    if (!d) d = String(Date.now().toString(36)) + Math.random().toString(36).slice(2, 12);
    d = d.slice(0, 32);
    lsSet(DEV_KEY, d);
    return d;
  }
  function me() { var m = lsGet(ME_KEY); return typeof m === "number" && m > 0 ? m : null; }
  function app() {
    try {
      if (navigator.standalone) return "app";
      if (window.matchMedia && matchMedia("(display-mode: standalone)").matches) return "app";
    } catch (e) {}
    return "web";
  }
  function theme() {
    var t = document.documentElement.getAttribute("data-theme");
    if (t === "dark" || t === "light") return t;
    try { return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"; } catch (e) { return "light"; }
  }

  function flush(now) {
    if (timer) { clearTimeout(timer); timer = 0; }
    if (!queue.length || !enabled()) { queue = []; return; }
    var body = JSON.stringify({ v: 1, d: device(), m: me(), a: app(), th: theme(), ev: queue });
    queue = [];
    var to = url() + "/beacon";
    try {
      // text/plain keeps the browser from asking the worker's permission first;
      // sendBeacon survives the page going away, which is exactly when a
      // session ends.
      if (now && navigator.sendBeacon && navigator.sendBeacon(to, new Blob([body], { type: "text/plain" }))) { sent++; return; }
      fetch(to, { method: "POST", body: body, keepalive: true, headers: { "content-type": "text/plain" } }).catch(function () {});
      sent++;
    } catch (e) {}
  }
  function push(ev) {
    if (!enabled()) return;
    queue.push(ev);
    if (queue.length >= MAX_QUEUE) { flush(false); return; }
    if (!timer) timer = setTimeout(function () { timer = 0; flush(false); }, FLUSH_MS);
  }

  // A view: one per tab change, as the app reports them.
  function view(path) {
    lastView = path;
    push({ t: "view", p: path });
  }
  // A session: from the app coming on screen to it leaving, in seconds. A
  // long stretch on screen is reported in slices, so a tab left open still
  // counts progressively and never claims more than it should.
  function closeSlice() {
    if (shownAt === null) return;
    var s = Math.round((Date.now() - shownAt) / 1000);
    shownAt = null;
    if (s >= 1) push({ t: "session", p: lastView, s: s });
  }
  function onVisible() { if (document.visibilityState === "visible") { if (shownAt === null) shownAt = Date.now(); } else { closeSlice(); flush(true); } }
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("pagehide", function () { closeSlice(); flush(true); });
  setInterval(function () {
    if (shownAt !== null && Date.now() - shownAt >= SLICE_MS) { closeSlice(); shownAt = Date.now(); flush(false); }
  }, 60000);
  if (document.visibilityState === "visible") shownAt = Date.now();

  window.GO_USAGE = {
    view: view,
    flush: function () { closeSlice(); flush(true); if (document.visibilityState === "visible") shownAt = Date.now(); },
    // for the suites: what this page would send, and whether it sends at all
    state: function () { return { enabled: enabled(), device: enabled() ? device() : null, me: me(), app: app(), theme: theme(), queued: queue.length, sent: sent }; }
  };
})();
