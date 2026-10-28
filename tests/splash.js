const GOENV = require("./lib/env.js");
/* The crest is the icon at every size and the opening screen. */
const { chromium, devices } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP, PORT = 8749;
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".svg":"image/svg+xml", ".webp":"image/webp", ".png":"image/png" };
let delay = 0, failData = false, stamp = null;
const srv = http.createServer((q, r) => { let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  if (u === "/data.json" && failData) { r.writeHead(500); r.end(); return; }
  // a newer publish: the same data under a later stamp
  if (u === "/data.json" && stamp) { const j = JSON.parse(fs.readFileSync(path.join(APP, u), "utf8")); (j.dataset || j).updatedAt = stamp;
    setTimeout(() => { r.writeHead(200, { "content-type": "application/json" }); r.end(JSON.stringify(j)); }, delay); return; }
  setTimeout(() => fs.readFile(path.join(APP, u), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { "content-type": T[path.extname(u)] || "text/plain" }); r.end(b); }), u === "/data.json" ? delay : 0); });
let fails = 0; const chk = (ok, m, x) => { console.log((ok ? "  ok   " : "  FAIL ") + m + (x ? "  " + x : "")); if (!ok) fails++; };
const pngSize = f => { const b = fs.readFileSync(f); return b.readUInt32BE(16) + "x" + b.readUInt32BE(20); };
(async () => {
  await new Promise(r => srv.listen(PORT, r));
  // files and manifest
  const man = JSON.parse(fs.readFileSync(APP + "/manifest.json", "utf8"));
  chk(man.icons.length === 4 && man.icons.every(i => fs.existsSync(APP + "/" + i.src)), "manifest lists four PNG icons that exist", man.icons.map(i => i.src + " " + i.purpose).join(", "));
  // Android fills its icon shape only from an icon marked maskable; one with
  // a file of its own, at both sizes Chrome asks for, and never the same file
  // listed twice, so Chrome cannot settle on the plain one and sit it in a
  // white circle
  const mk = man.icons.filter(i => i.purpose === "maskable"), any = man.icons.filter(i => i.purpose === "any");
  chk(mk.map(i => i.sizes).sort().join(",") === "192x192,512x512" && any.length === 2 &&
      mk.every(i => any.every(a => a.src !== i.src)) && mk.every(i => pngSize(APP + "/" + i.src) === i.sizes),
      "maskable icons have files of their own, at 192 and 512", mk.map(i => i.src + " " + i.sizes).join(", "));
  chk(pngSize(APP + "/icon-512.png") === "512x512" && pngSize(APP + "/icon-192.png") === "192x192" && pngSize(APP + "/apple-touch-icon.png") === "180x180" && pngSize(APP + "/favicon-64.png") === "64x64", "icons are 512, 192, 180 and 64 square");
  chk(!fs.existsSync(APP + "/icon.svg") && !/icon\.svg/.test(fs.readFileSync(APP + "/index.html", "utf8") + fs.readFileSync(APP + "/sw.js", "utf8") + fs.readFileSync(APP + "/app.js", "utf8")), "the old SVG icon is gone and nothing refers to it");
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  // slow data: the splash shows, then leaves once drawn
  delay = 1500;
  let ctx = await b.newContext({ ...devices["iPhone 12"], serviceWorkers: "block" });
  let p = await ctx.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.goto("http://localhost:" + PORT + "/index.html#classic", { waitUntil: "domcontentloaded" }); await p.waitForTimeout(500);
  const mid = await p.evaluate(() => { const s = document.querySelector("#splash"); const i = s && s.querySelector("img"), t = s && s.querySelector(".splashtxt");
    const r = s && s.getBoundingClientRect(), ir = i.getBoundingClientRect(), tr = t.getBoundingClientRect();
    return { on: !!s && !s.classList.contains("gone"), covers: r && r.width === window.innerWidth && r.height === window.innerHeight,
      img: !!(i && i.complete && i.naturalWidth > 0), src: i.getAttribute("src"), bg: s && getComputedStyle(s).backgroundColor, text: t.innerText.replace(/\s+/g, " ").trim(),
      midX: Math.round(ir.left + ir.width / 2 - innerWidth / 2), midY: Math.round(ir.top + ir.height / 2 - innerHeight / 2),
      below: tr.top >= ir.bottom - 2 && tr.bottom < innerHeight, glow: !!s.querySelector(".spglow") }; });
  chk(mid.on && mid.covers && mid.img && mid.src === "logo-crest.webp" && mid.bg === "rgb(55, 0, 60)" && mid.glow,
      "while loading: the crest on the app's purple, its colours rising from the foot, covers the screen", JSON.stringify(mid));
  chk(mid.text === "The home of the FPL addicts" && mid.below, "and under it: The home of the FPL addicts", mid.text);
  chk(Math.abs(mid.midX) <= 1 && Math.abs(mid.midY) <= 20, "the crest sits in the middle of the screen", mid.midX + "," + mid.midY);
  const man2 = JSON.parse(fs.readFileSync(APP + "/manifest.json", "utf8"));
  chk(man2.background_color === "#37003c", "the phone's own launch screen is on the same purple", man2.background_color);
  await p.screenshot({ path: "splash.png" });
  await p.waitForTimeout(2500);
  chk(await p.evaluate(() => !document.querySelector("#splash") && document.querySelectorAll("section.view.active table.t tbody tr").length > 0), "once the standings are drawn the splash is gone from the page");
  chk(await p.evaluate(() => [...document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]')].map(l => l.getAttribute("href"))).then(a => a.join(",") === "apple-touch-icon.png,favicon-64.png,icon-192.png"), "the page links the PNG icons");
  chk(errs.length === 0, "no JS errors", errs.join(" | "));
  await ctx.close();
  // The opening screen is on for two seconds exactly, counted from the
  // opening: quick data does not cut it short, slow data does not hold it,
  // and failed data does not either. Its fade starts at 1.75s, so it is gone
  // at two; with reduced motion it simply goes at two.
  for (const [d, f, how, still] of [[0, false, "quick data"], [4000, false, "data still loading"], [0, true, "data failing"], [0, false, "reduced motion", true]]) {
    delay = d; failData = f;
    const c = await b.newContext({ ...devices["Pixel 7"], serviceWorkers: "block", reducedMotion: still ? "reduce" : "no-preference" }); const pg = await c.newPage();
    await pg.goto("http://localhost:" + PORT + "/index.html#classic", { waitUntil: "commit" });
    const t = await pg.evaluate(() => new Promise((res) => { let fade = null; const iv = setInterval(() => { const s = document.querySelector("#splash");
      if (s && s.classList.contains("gone") && fade == null) fade = Math.round(performance.now());
      if (!s || (s.classList.contains("gone") && +getComputedStyle(s).opacity === 0)) { clearInterval(iv);
        res({ fade, gone: Math.round(performance.now()), text: ((document.querySelector("section.view.active") || {}).innerText || "").trim().slice(0, 40) }); } }, 10); }));
    chk(t.fade >= (still ? 1990 : 1740) && t.fade <= (still ? 2150 : 1900) && t.gone >= 1990 && t.gone <= 2200,
        how + ": the opening screen is on for two seconds, no less and no more", JSON.stringify(t));
    if (d === 4000) chk(/Loading the league/.test(t.text), "a first open still loading says so behind it, rather than an empty page", t.text);
    await c.close();
  }
  delay = 0; failData = false;
  // A phone that already holds the data does not wait for the whole file to
  // come down again: it paints its own copy within a moment, its age in the
  // bar, and the newer publish replaces it on screen the moment it lands.
  for (const stale of [false, true]) {
    const c = await b.newContext({ ...devices["Pixel 7"], serviceWorkers: "block" }); const pg = await c.newPage(); const er = [];
    pg.on("pageerror", (e) => er.push(e.message));
    // the copy on the phone: just published, or twenty minutes old
    delay = 0; stamp = new Date(Date.now() - (stale ? 20 : 1) * 60000).toISOString();
    await pg.goto("http://localhost:" + PORT + "/index.html#classic", { waitUntil: "domcontentloaded" });
    await pg.waitForSelector("section.view.active table.t tbody tr", { timeout: 15000 });
    await pg.waitForTimeout(800);                               // the copy is stored
    const older = await pg.evaluate(() => window.GO_STORE.dataset().updatedAt);
    stamp = new Date().toISOString(); delay = 4000;
    await pg.goto("about:blank");
    const t0 = Date.now();
    await pg.goto("http://localhost:" + PORT + "/index.html#classic", { waitUntil: "domcontentloaded" });
    await pg.waitForFunction(() => document.querySelectorAll("section.view.active table.t tbody tr").length > 0, null, { timeout: 15000 });
    const shown = Date.now() - t0;
    const first = await pg.evaluate(() => ({ at: window.GO_STORE.dataset().updatedAt, sub: (document.querySelector("#barSub") || {}).textContent }));
    const age = Date.now() - Date.parse(older);
    chk(shown < (age < 5 * 60 * 1000 ? 1500 : 2600) && first.at === older, (stale ? "an older stored copy" : "a fresh stored copy") + " is drawn in a moment, not after the download", shown + "ms · " + first.sub);
    await pg.waitForFunction((st) => window.GO_STORE.dataset().updatedAt === st, stamp, { timeout: 15000 }).catch(() => {});
    await pg.waitForTimeout(600);
    const later = await pg.evaluate(() => ({ at: window.GO_STORE.dataset().updatedAt, sub: (document.querySelector("#barSub") || {}).textContent, rows: document.querySelectorAll("section.view.active table.t tbody tr").length }));
    chk(later.at === stamp && /just now|0m|1m/.test(later.sub || "") && later.rows > 0, (stale ? "older copy: " : "fresh copy: ") + "the newer publish replaces it on screen when it lands, no reload", JSON.stringify(later));
    chk(!er.length, "no JS errors when the newer data lands late", er.join(" | "));
    stamp = null; delay = 0;
    await c.close();
  }
  // An older stored copy and a download that lands within the opening
  // screen: the newest data is what is drawn first, behind it, so nothing is
  // swapped in front of the reader once it lifts.
  {
    const c = await b.newContext({ ...devices["Pixel 7"], serviceWorkers: "block" }); const pg = await c.newPage(); const er = [];
    pg.on("pageerror", (e) => er.push(e.message));
    delay = 0; stamp = new Date(Date.now() - 20 * 60000).toISOString();
    await pg.goto("http://localhost:" + PORT + "/index.html#classic", { waitUntil: "domcontentloaded" });
    await pg.waitForSelector("section.view.active table.t tbody tr", { timeout: 15000 });
    await pg.waitForTimeout(800);
    stamp = new Date().toISOString(); delay = 600;
    await pg.goto("about:blank");
    // when the download landed, in the page's own time: the app waits for it until a second after opening
    await pg.addInitScript(() => { const f0 = window.fetch; window.fetch = function (u) { const p = f0.apply(this, arguments);
      if (!/data\.json/.test(String(u))) return p;
      return p.then((r) => { const j0 = r.json.bind(r); r.json = () => j0().then((v) => { window.__landed = performance.now(); return v; }); return r; }); }; });
    await pg.addInitScript(() => { window.__drawn = []; const tick = () => { const ds = window.GO_STORE && window.GO_STORE.dataset && window.GO_STORE.dataset();
      if (ds && document.querySelector("section.view.active table.t tbody tr")) { const u = ds.updatedAt; const l = window.__drawn[window.__drawn.length - 1]; if (!l || l.u !== u) window.__drawn.push({ u: u, t: performance.now() }); }
      if (performance.now() < 3000) requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
    await pg.goto("http://localhost:" + PORT + "/index.html#classic", { waitUntil: "domcontentloaded" });
    await pg.waitForTimeout(3200);
    const drawn = await pg.evaluate(() => window.__drawn), landed = await pg.evaluate(() => window.__landed);
    // What the reader meets is what is drawn when the opening screen lifts, at two seconds. A download
    // landing inside the wait is the only thing drawn; one landing later still replaces the stored copy
    // behind the screen, so long as it lands with time to draw; one later than that is the slow case.
    const atLift = drawn.filter((x) => x.t <= 1990).pop(), seq = JSON.stringify(drawn.map((x) => x.u.slice(11, 19) + "@" + Math.round(x.t))) + " landed " + Math.round(landed) + "ms";
    if (landed < 900) chk(drawn.length === 1 && drawn[0].u === stamp, "an older stored copy waits for a quick download behind the opening screen: the newest is drawn first, nothing swapped after", seq);
    else if (landed < 1500) chk(atLift && atLift.u === stamp, "a download landing a little after the wait still replaces the stored copy before the opening screen lifts", seq);
    else chk(drawn[drawn.length - 1].u === stamp, "a slow download: the stored copy shows, and the newest replaces it when it lands", seq);
    chk(!er.length, "no JS errors", er.join(" | "));
    stamp = null; delay = 0;
    await c.close();
  }
  // a small phone: the crest and its line both fit
  {
    const c = await b.newContext({ viewport: { width: 320, height: 568 }, isMobile: true, serviceWorkers: "block" }); const pg = await c.newPage();
    delay = 1500; await pg.goto("http://localhost:" + PORT + "/index.html#classic", { waitUntil: "domcontentloaded" }); await pg.waitForTimeout(500);
    const f = await pg.evaluate(() => { const s = document.querySelector("#splash"), i = s.querySelector("img").getBoundingClientRect(), t = s.querySelector(".splashtxt").getBoundingClientRect();
      return { fits: i.left >= 0 && i.right <= innerWidth && i.top >= 0 && t.bottom <= innerHeight && t.left >= 0 && t.right <= innerWidth, apart: t.top >= i.bottom - 2 }; });
    chk(f.fits && f.apart, "on a 320px phone the crest and its line fit, apart", JSON.stringify(f));
    await c.close();
  }
  // Opened from the home screen, the phone has just shown its own launch
  // screen (the icon in a circle 47.9% of the width, dead centre, on the
  // manifest's purple) and fades it into the page. The first frame is that
  // same picture; the circle then draws away and the screen comes up.
  // Measured off a real phone's launch screen. Android, then an iPhone.
  delay = 2500;
  for (const [dev, how] of [["Pixel 7", "android"], ["iPhone 13", "ios"]]) {
    const c = await b.newContext({ ...devices[dev], serviceWorkers: "block" }); const pg = await c.newPage(); const er = [];
    pg.on("pageerror", (e) => er.push(e.message));
    if (how === "ios") await c.addInitScript(() => { Object.defineProperty(window.navigator, "standalone", { value: true, configurable: true }); });
    else await c.addInitScript(() => { const mm = window.matchMedia.bind(window);
      window.matchMedia = (q) => /display-mode:\s*standalone/.test(q) ? mm("(min-width: 0px)") : mm(q); });
    await pg.goto("http://localhost:" + PORT + "/index.html#classic", { waitUntil: "commit" });
    await pg.waitForSelector("#splash .sptile", { state: "attached", timeout: 5000 });
    // the first frame itself: every animation held at its start, so a busy
    // machine reaching this a moment late still reads frame zero
    const f0 = await pg.evaluate(() => { document.getAnimations().forEach((a) => { a.pause(); a.currentTime = 0; }); const s = document.querySelector("#splash"), t = s.querySelector(".sptile"), r = t.getBoundingClientRect(), cs = getComputedStyle(t);
      return { cls: document.documentElement.className, shown: cs.display !== "none", radius: cs.borderRadius, src: t.getAttribute("src"), op: +cs.opacity,
        w: +(r.width / innerWidth * 100).toFixed(1), cx: Math.round(r.left + r.width / 2 - innerWidth / 2), cy: Math.round(r.top + r.height / 2 - innerHeight / 2),
        bg: getComputedStyle(s).backgroundColor }; });
    const man3 = JSON.parse(fs.readFileSync(APP + "/manifest.json", "utf8"));
    chk(/applaunch/.test(f0.cls) && f0.shown && f0.op > 0.95 && f0.radius === "50%" && f0.src === "launch-tile.webp",
        how + " home screen: the first frame is the phone's own launch picture, the icon in a circle", JSON.stringify(f0));
    chk(Math.abs(f0.w - 47.9) < 0.3 && Math.abs(f0.cx) <= 1 && Math.abs(f0.cy) <= 1 && f0.bg === "rgb(55, 0, 60)" && man3.background_color === "#37003c",
        how + ": at the launch screen's size and place, on the manifest's purple", f0.w + "% · " + f0.cx + "," + f0.cy + " · " + f0.bg);
    // and the end of the hand-over
    const f1 = await pg.evaluate(() => { document.getAnimations().forEach((a) => { a.finish(); }); const s = document.querySelector("#splash"); const t = s.querySelector(".sptile"), cr = s.querySelector(".spcrest");
      return { tile: +getComputedStyle(t).opacity, crest: +getComputedStyle(cr).opacity, bands: +getComputedStyle(s.querySelector(".spbands")).opacity,
               text: +getComputedStyle(s.querySelector(".splashtxt")).opacity }; });
    chk(f1.tile === 0 && f1.crest === 1 && f1.bands === 1 && f1.text === 1, how + ": then the circle has gone and the screen is itself", JSON.stringify(f1));
    chk(!er.length, how + ": no JS errors on the launch", er.join(" | "));
    await c.close();
  }
  {
    // in a browser tab there is no launch screen to pick up from
    const c2 = await b.newContext({ ...devices["iPhone 13"], serviceWorkers: "block" }); const pg2 = await c2.newPage();
    await pg2.goto("http://localhost:" + PORT + "/index.html#classic", { waitUntil: "domcontentloaded" }); await pg2.waitForTimeout(300);
    const tab = await pg2.evaluate(() => ({ cls: document.documentElement.className, tile: getComputedStyle(document.querySelector("#splash .sptile")).display }));
    chk(!/applaunch/.test(tab.cls) && tab.tile === "none", "in a browser tab: no circle, the screen straight away", JSON.stringify(tab));
    await c2.close();
  }
  // data fails: the splash still leaves and the empty state shows the crest
  delay = 0; failData = true;
  ctx = await b.newContext({ ...devices["iPhone 12"], serviceWorkers: "block" });
  p = await ctx.newPage();
  await p.goto("http://localhost:" + PORT + "/index.html#classic", { waitUntil: "domcontentloaded" }); await p.waitForTimeout(2500);
  const emp = await p.evaluate(() => ({ splash: !!document.querySelector("#splash"), crest: !!document.querySelector(".empty img.big"), text: (document.querySelector(".empty") || {}).textContent }));
  chk(!emp.splash && emp.crest, "when the data cannot load the splash still leaves and the empty state wears the crest", emp.text && emp.text.trim().slice(0, 60));
  await p.screenshot({ path: "splash-empty.png" });
  await ctx.close();
  await b.close(); srv.close(); console.log(fails ? "FAILS: " + fails : "ALL OK");
})();
