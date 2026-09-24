const GOENV = require("./lib/env.js");
/* A tile on the Gameweek tab opens its figure across the season. The series
 * is read through highlights() itself, so every bar is the number the tab
 * would print for that week; the week the tab is on is marked and its bar
 * carries the tile's own value; the live week is hatched; the list beneath
 * repeats the numbers with who they belong to, and a manager's name opens
 * his profile. Tiles that name a manager no longer open the profile from the
 * tile — the chart does that — and nothing errors on a narrow phone. */
const { chromium, devices } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP, PORT = 8815;
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".webp":"image/webp", ".png":"image/png" };
const srv = http.createServer((q, r) => { let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  fs.readFile(path.join(APP, u), (e, b) => { if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { "content-type": T[path.extname(u)] || "text/plain", "cache-control": "no-store" }); r.end(b); }); });
let fails = 0;
const chk = (ok, m, x) => { console.log((ok ? "  ok   " : "  FAIL ") + m + (x ? "  " + x : "")); if (!ok) fails++; };
const digits = (s) => String(s).replace(/[^\d.,]/g, "").replace(/,/g, "");

(async () => {
  await new Promise((r) => srv.listen(PORT, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  for (const w of [390, 320]) {
    const ctx = await b.newContext({ viewport: { width: w, height: 760 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: "block" });
    const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.goto("http://localhost:" + PORT + "/index.html#stats", { waitUntil: "domcontentloaded" }); await p.waitForTimeout(1500);
    await p.evaluate(() => { location.hash = "#stats/gw"; }); await p.waitForTimeout(300);
    // the series agrees with the tab, week by week
    const agree = await p.evaluate(() => {
      const ds = window.GO_STORE.dataset(), C = window.GO_COMPUTE, S = C.gwSeries(ds);
      const bad = [];
      S.gws.forEach((g) => { const H = C.highlights(ds, g), s = H.gwStats; if (!s) return;
        const at = (k) => S.series[k].find((p) => p.gw === g);
        if (at("top").v !== s.top.p || at("low").v !== s.low.p || at("average").v !== s.average || at("aboveAvg").v !== s.aboveAvg || at("benchTotal").v !== s.benchTotal) bad.push(g);
        if (H.potw && at("potw").v !== H.potw.pts) bad.push("potw" + g);
        if (H.squads && H.squads.bestCaptain && at("bestCap").v !== H.squads.bestCaptain.pts * 2) bad.push("cap" + g);
      });
      return { gws: S.gws.length, bad };
    });
    chk(agree.bad.length === 0 && agree.gws > 1, w + ": every series value is the tab's own for that week", agree.gws + " gameweeks" + (agree.bad.length ? " bad " + agree.bad.join(",") : ""));
    const tiles = await p.evaluate(() => [...document.querySelectorAll("#stBox .hcard[data-trend]")].map((t) => ({
      key: t.getAttribute("data-trend"), label: t.querySelector(".hl span").textContent.trim(), big: t.querySelector(".hv").textContent.trim(), entry: t.hasAttribute("data-entry") })));
    chk(tiles.length >= 10, w + ": the Gameweek tab's tiles open a trend", tiles.length + " tiles");
    chk(tiles.every((t) => !t.entry), w + ": a trend tile is not also a profile link");
    const gw = await p.evaluate(() => +document.querySelector("#stGwSel").value);
    let opened = 0, matched = 0, wrong = [];
    for (const t of tiles) {
      await p.click('#stBox .hcard[data-trend="' + t.key + '"]'); await p.waitForTimeout(350);
      const got = await p.evaluate((gw) => {
        const back = document.querySelector("#modalBack"); if (!back.classList.contains("show")) return null;
        const svg = document.querySelector("#modalBody .trchart svg");
        const on = svg && svg.querySelector(".barP.on"); const bars = svg ? svg.querySelectorAll(".barP").length : 0;
        const rows = [...document.querySelectorAll("#modalBody .trrow")].map((r) => ({ gw: r.querySelector(".trgw").textContent.trim(), v: r.querySelector(".trv").textContent.trim(), on: r.classList.contains("on") }));
        const cur = rows.find((r) => r.on);
        const r = svg && svg.getBoundingClientRect(), m = document.querySelector("#modalBody").getBoundingClientRect();
        return { title: document.querySelector("#modalTitle").textContent, bars, hasOn: !!on, rows: rows.length, cur, fits: !svg || (r.left >= m.left - 1 && r.right <= m.right + 1) };
      }, gw);
      if (!got) { wrong.push(t.key + " no sheet"); continue; }
      opened++;
      if (got.cur && digits(got.cur.v) === digits(t.big)) matched++; else wrong.push(t.key + " " + (got.cur && got.cur.v) + " vs " + t.big);
      if (got.bars > 1 && !got.hasOn) wrong.push(t.key + " no marked bar");
      if (!got.fits) wrong.push(t.key + " chart overflows");
      if (got.rows !== agree.gws) wrong.push(t.key + " rows " + got.rows);
      await p.click("#modalClose"); await p.waitForTimeout(200);
    }
    chk(opened === tiles.length, w + ": every tile opens its sheet", opened + " of " + tiles.length);
    chk(matched === tiles.length && wrong.length === 0, w + ": the marked week carries the tile's own value, the list has every week, the chart fits", wrong.slice(0, 4).join(" | "));
    // a manager's name in the list opens his profile
    await p.click('#stBox .hcard[data-trend="top"]'); await p.waitForTimeout(350);
    const who = await p.evaluate(() => { const e = document.querySelector("#modalBody .trwho[data-entry]"); return e ? e.getAttribute("data-entry") : null; });
    if (who) { await p.click("#modalBody .trwho[data-entry]"); await p.waitForTimeout(600);
      const after = await p.evaluate(() => ({ hash: location.hash, open: document.querySelector("#modalBack").classList.contains("show") }));
      chk(after.hash === "#profile/" + who && !after.open, w + ": a name in the list opens the profile and the sheet closes", JSON.stringify(after)); }
    // the live week, if there is one, is hatched
    const live = await p.evaluate(() => { const ds = window.GO_STORE.dataset(); return window.GO_COMPUTE.liveGwId(ds); });
    if (live) {
      await p.evaluate(() => { location.hash = "#stats"; }); await p.waitForTimeout(800);
      await p.evaluate(() => { location.hash = "#stats/gw"; }); await p.waitForTimeout(200);
      await p.click('#stBox .hcard[data-trend="average"]'); await p.waitForTimeout(350);
      const hatched = await p.evaluate(() => !!document.querySelector("#modalBody .barP.live") && !!document.querySelector("#modalBody #trhatch"));
      chk(hatched, w + ": the live week's bar is hatched");
      await p.click("#modalClose"); await p.waitForTimeout(150);
    }
    chk(errs.length === 0, w + ": no JS errors", errs.slice(0, 2).join(" | "));
    await ctx.close();
  }
  await b.close(); srv.close();
  console.log(fails ? "\nFAILS: " + fails : "\nevery tile has its season");
  process.exit(fails ? 1 : 0);
})();
