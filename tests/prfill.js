const GOENV = require("./lib/env.js");
/* Price changes fills in rather than freezing. Six hundred rows are six hundred
   rows of layout, and a browser will not paint half a table: the old code asked
   for the rest of them inside requestAnimationFrame, which runs *before* the
   frame is laid out, so the split bought nothing and the screen stayed empty
   until every row was ready. A screenful goes in first and reaches the glass;
   the rest follow a hundred at a time behind it. This checks both halves — that
   it really does arrive in steps, and that nothing it arrives in the middle of
   comes out wrong. */
const { chromium } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP, PORT = 8793, ME = 1255976, RATE = 6;
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".svg":"image/svg+xml", ".webp":"image/webp", ".png":"image/png" };
const srv = http.createServer((q, r) => { let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  fs.readFile(path.join(APP, u), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { "content-type": T[path.extname(u)] || "text/plain" }); r.end(b); }); });
let fails = 0; const chk = (ok, m, x) => { console.log((ok ? "  ok   " : "  FAIL ") + m + (x ? "  " + x : "")); if (!ok) fails++; };

// Watches the table grow: the row count after every mutation, whether a frame
// was painted between one step and the next, and the blocking time of each
// frame while it happens.
const WATCH = () => {
  window.__W = { steps: [], blocks: [], frames: 0, cols: {} };
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__W.blocks.push(Math.round(e.blockingDuration)); })
      .observe({ type: "long-animation-frame", buffered: true });
  } catch (e) {}
  const tick = () => { window.__W.frames++; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  const cols = () => [...document.querySelectorAll("table.pricetbl thead th")]
    .map(t => Math.round(t.getBoundingClientRect().width));
  const start = () => new MutationObserver(() => {
    const n = document.querySelectorAll("table.pricetbl tbody tr").length;
    const last = window.__W.steps[window.__W.steps.length - 1];
    if (!n || (last && last.n === n)) return;
    window.__W.steps.push({ n: n, frame: window.__W.frames });
    if (window.__W.steps.length === 1) {
      requestAnimationFrame(() => requestAnimationFrame(() => { window.__W.cols.first = cols(); }));
    }
    if (n >= 659) requestAnimationFrame(() => requestAnimationFrame(() => { window.__W.cols.full = cols(); window.__W.done = 1; }));
  }).observe(document.documentElement, { childList: true, subtree: true });
  if (document.documentElement) start();
  else document.addEventListener("readystatechange", function once () {
    if (document.documentElement) { document.removeEventListener("readystatechange", once); start(); }
  });
};

const rows = (p) => p.evaluate(() => [...document.querySelectorAll("table.pricetbl tbody .who")].map(e => e.textContent));

(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });

  const open = async (w, throttle) => {
    const ctx = await b.newContext({ viewport: { width: w, height: 844 }, deviceScaleFactor: 2, isMobile: w < 560, hasTouch: true, serviceWorkers: "block", colorScheme: "dark" });
    await ctx.addInitScript((me) => { try { localStorage.setItem("go12.me", JSON.stringify(me)); localStorage.removeItem("go12.favs"); } catch (e) {} }, ME);
    const p = await ctx.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
    await p.addInitScript(WATCH);
    if (throttle) { const cdp = await ctx.newCDPSession(p); await cdp.send("Emulation.setCPUThrottlingRate", { rate: RATE }); }
    await p.goto("http://127.0.0.1:" + PORT + "/index.html#prices", { waitUntil: "domcontentloaded" });
    await p.waitForFunction(() => window.__W && window.__W.done, null, { timeout: 60000 });
    return { ctx, p, errs };
  };

  /* --- it arrives in steps, and every player still arrives --------------- */
  for (const w of [390, 320, 768]) {
    const { ctx, p, errs } = await open(w, w === 390);
    const W = await p.evaluate(() => window.__W);
    const all = await rows(p);
    chk(all.length === 659, w + ": every player is in the table", String(all.length));
    chk(W.steps.length >= 4, w + ": the table arrives in steps rather than all at once", W.steps.map(s => s.n).join(" -> "));
    chk(W.steps[0].n <= 40, w + ": the first step is a screenful, not the whole list", String(W.steps[0].n));
    // the crux: a frame was painted between the first rows and the second batch
    chk(W.steps[1] && W.steps[1].frame > W.steps[0].frame,
      w + ": the first rows reach the glass before the rest are asked for",
      "frames " + W.steps.map(s => s.frame).join(","));
    chk(W.steps[W.steps.length - 1].n === 659, w + ": the last step completes the list", String(W.steps[W.steps.length - 1].n));
    chk(JSON.stringify(W.cols.first) === JSON.stringify(W.cols.full),
      w + ": the columns do not shift as the rest lands", JSON.stringify(W.cols.first) + " vs " + JSON.stringify(W.cols.full));
    if (w === 390) {
      const worst = Math.max(0, ...W.blocks);
      // the one-shot append blocked for 1330ms on this same throttled machine
      chk(worst < 800, "390 throttled: no frame blocks anywhere near as long as the old one-shot append did", worst + "ms");
    }
    chk(errs.length === 0, w + ": no page errors", errs.join(" | "));
    await ctx.close();
  }

  /* --- sorting while it is still filling gives one sort, not two --------- */
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: "block", colorScheme: "dark" });
    await ctx.addInitScript((me) => { try { localStorage.setItem("go12.me", JSON.stringify(me)); } catch (e) {} }, ME);
    const p = await ctx.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
    const cdp = await ctx.newCDPSession(p); await cdp.send("Emulation.setCPUThrottlingRate", { rate: RATE });
    await p.goto("http://127.0.0.1:" + PORT + "/index.html#prices", { waitUntil: "domcontentloaded" });
    // tap the name header the moment the first rows exist, mid-fill
    await p.waitForSelector("table.pricetbl tbody tr", { timeout: 30000 });
    await p.evaluate(() => document.querySelector('th[data-sort="name"]').click());
    await p.waitForFunction(() => document.querySelectorAll("table.pricetbl tbody tr").length >= 659, null, { timeout: 60000 });
    await p.waitForTimeout(700);
    const names = await rows(p);
    chk(names.length === 659, "sorted mid-fill: still every player, exactly once", String(names.length));
    const coll = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });
    let bad = null;
    for (let i = 1; i < names.length; i++) if (coll.compare(names[i - 1], names[i]) > 0) { bad = names[i - 1] + " before " + names[i] + " at " + i; break; }
    chk(!bad, "sorted mid-fill: one sort all the way down, not two stitched together", bad || "");
    chk(errs.length === 0, "sorted mid-fill: no page errors", errs.join(" | "));
    await ctx.close();
  }

  /* --- searching while it is filling, and leaving while it is filling ---- */
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: "block", colorScheme: "dark" });
    await ctx.addInitScript((me) => { try { localStorage.setItem("go12.me", JSON.stringify(me)); } catch (e) {} }, ME);
    const p = await ctx.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
    const cdp = await ctx.newCDPSession(p); await cdp.send("Emulation.setCPUThrottlingRate", { rate: RATE });
    await p.goto("http://127.0.0.1:" + PORT + "/index.html#prices", { waitUntil: "domcontentloaded" });
    await p.waitForSelector("table.pricetbl tbody tr", { timeout: 30000 });
    // whoever is top of the list today — a name read off the page rather than
    // written in here, so a transfer out of the league never fails this
    const who = await p.evaluate(() => document.querySelector("table.pricetbl tbody .who").textContent);
    await p.evaluate((q) => { const s = document.querySelector("#prSearch"); s.value = q; s.dispatchEvent(new Event("input", { bubbles: true })); }, who);
    await p.waitForTimeout(2200);
    const found = await rows(p);
    chk(found.length > 0 && found.length < 20 && found.every(n => n === who),
      "searched mid-fill: the search wins and the rest of the list does not arrive behind it", who + " -> " + found.join(", "));
    // clear it: the whole list comes back, once
    await p.evaluate(() => { const s = document.querySelector("#prSearch"); s.value = ""; s.dispatchEvent(new Event("input", { bubbles: true })); });
    await p.waitForFunction(() => document.querySelectorAll("table.pricetbl tbody tr").length >= 659, null, { timeout: 60000 });
    await p.waitForTimeout(900);
    chk((await rows(p)).length === 659, "searched mid-fill: clearing it brings every player back exactly once");

    // walk away mid-fill: nothing throws, and coming back is whole
    await p.evaluate(() => { location.hash = "prices"; location.reload(); });
    await p.waitForSelector("table.pricetbl tbody tr", { timeout: 30000 });
    await p.evaluate(() => { location.hash = "classic"; });
    await p.waitForTimeout(2500);
    // views are kept rather than thrown away, so the table is still there —
    // what matters is that it stopped working while nobody was looking at it
    const parked = await p.evaluate(() => {
      const v = document.querySelector('.view[data-view="prices"]');
      return { active: v.classList.contains("active"), rows: v.querySelectorAll("table.pricetbl tbody tr").length };
    });
    await p.waitForTimeout(1500);
    const still = await p.evaluate(() => document.querySelectorAll('.view[data-view="prices"] table.pricetbl tbody tr').length);
    chk(!parked.active && still === parked.rows,
      "left mid-fill: the hidden table stops filling instead of laying out rows nobody is looking at",
      parked.rows + " -> " + still);
    await p.evaluate(() => { location.hash = "prices"; });
    await p.waitForFunction(() => document.querySelectorAll("table.pricetbl tbody tr").length >= 659, null, { timeout: 60000 });
    await p.waitForTimeout(900);
    chk((await rows(p)).length === 659, "came back after leaving mid-fill: every player, exactly once");
    chk(errs.length === 0, "mid-fill traffic: no page errors", errs.join(" | "));
    await ctx.close();
  }

  /* --- the two small tabs do not need filling at all --------------------- */
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: "block", colorScheme: "dark" });
    await ctx.addInitScript((me) => { try { localStorage.setItem("go12.me", JSON.stringify(me)); localStorage.setItem("go12.favs", "[]"); } catch (e) {} }, ME);
    const p = await ctx.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
    await p.goto("http://127.0.0.1:" + PORT + "/index.html#prices", { waitUntil: "domcontentloaded" });
    await p.waitForSelector("table.pricetbl tbody tr", { timeout: 30000 });
    await p.waitForTimeout(1200);
    await p.click('[data-who="mine"]'); await p.waitForTimeout(700);
    const mine = await rows(p);
    chk(mine.length >= 11 && mine.length <= 15, "My team holds a squad, filled in one go", String(mine.length));
    await p.click('[data-who="favs"]'); await p.waitForTimeout(700);
    chk((await rows(p)).length === 0 && await p.evaluate(() => !!document.querySelector(".nohits")), "Starred is empty and says why");
    await p.click('[data-who="all"]');
    await p.waitForFunction(() => document.querySelectorAll("table.pricetbl tbody tr").length >= 659, null, { timeout: 60000 });
    await p.waitForTimeout(700);
    chk((await rows(p)).length === 659, "back to All players: every player, exactly once");
    chk(errs.length === 0, "tabs: no page errors", errs.join(" | "));
    await ctx.close();
  }

  await b.close(); srv.close();
  console.log(fails ? fails + " FAILURES" : "all ok");
  process.exit(fails ? 1 : 0);
})();
