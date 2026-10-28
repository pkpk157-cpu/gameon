const GOENV = require("./lib/env.js");
/* What a manager paid for a player, his price today and what FPL would hand
   back: worked out once, and the same figure wherever it shows. The squad's
   realisable value and the player page's row read one rule. A Free Hit
   week's buys never price a squad that FPL has handed back. The row is on the
   player page only when he is opened from a Game On squad that owns him. */
const { chromium } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP, PORT = 8766;
const { purchasePrices } = require(path.join(APP, "scripts/fetch-data.js"));
const H = require(path.join(APP, "tests/audit/harness.js")).loadCompute();
const K = H.C, ds = H.ds;
let fails = 0; const chk = (ok, m, x) => { console.log((ok ? "  ok   " : "  FAIL ") + m + (x ? "  " + x : "")); if (!ok) fails++; };

// 1. the purchase price, from the transfer log
const t = (event, el, cost, day) => ({ event, element_in: el, element_in_cost: cost, time: "2026-09-" + String(day).padStart(2, "0") + "T10:00:00Z" });
const squad = { p: [[1, 1, 0, 0], [2, 1, 0, 0], [3, 1, 0, 0], [4, 1, 0, 0]] };
const start = { 1: 50, 2: 60, 3: 70, 4: 80 };
const log = [t(2, 2, 62, 2), t(4, 2, 65, 20), t(4, 3, 71, 20), t(6, 4, 85, 28), t(9, 1, 55, 30)];
const fh = (g) => +g === 4;
let m = purchasePrices(log, squad, 8, fh, start);
chk(m[1] === 50, "an original pick costs his season-start price; a buy after this gameweek does not count", JSON.stringify(m));
chk(m[2] === 62, "a player bought, then bought again in a Free Hit week, cost what was paid before it", String(m[2]));
chk(m[3] === 70, "an original pick bought again in a Free Hit week keeps his season-start price", String(m[3]));
chk(m[4] === 85, "a plain transfer costs what was paid", String(m[4]));
m = purchasePrices(log, squad, 4, fh, start);
chk(m[2] === 65 && m[3] === 71, "the Free Hit squad itself is priced at what it paid that week", JSON.stringify(m));

// 2. what FPL hands back
const S = K.sellFor;
chk(S(55, 58) === 56 && S(55, 57) === 56 && S(55, 56) === 55 && S(55, 55) === 55 && S(55, 52) === 52,
    "half of a rise, rounded down per tenth; a fall in full", [S(55, 58), S(55, 57), S(55, 56), S(55, 55), S(55, 52)].join(","));

// 3. one figure everywhere: the player row and the pitch agree for every player of every squad
let n = 0, bad = [], sums = 0, sumBad = [];
const gw = +ds.buysGw;
ds.managers.forEach((mg) => {
  const pit = K.managerPitch(ds, mg.id, gw); if (!pit) return;
  const all = [].concat.apply([], pit.lines.map((l) => l.players || l)).concat(pit.bench);
  let s = 0, complete = true;
  all.forEach((p) => { const o = K.ownedPrice(ds, mg.id, p.el); if (!o) { complete = false; return; } n++; s += o.sell;
    if (p.sell != null && (o.sell !== p.sell || o.now !== p.price)) bad.push(mg.id + "/" + p.el); });
  if (complete && pit.sellValue != null) { sums++; if (s !== pit.sellValue) sumBad.push(mg.id); }
});
chk(n > 1000 && !bad.length, "the player row and the pitch give every owned player the same now and sells", n + " players · " + bad.slice(0, 5).join(","));
chk(sums > 100 && !sumBad.length, "a squad's realisable value is the sum of its players' sells", sums + " squads · " + sumBad.slice(0, 5).join(","));
const anyFh = ds.managers.find((mg) => ((ds.picks[gw] || {})[mg.id] || {}).c === "freehit");
if (anyFh) chk(K.ownedPrice(ds, anyFh.id, ds.picks[gw][anyFh.id].p[0][0]) === null, "a Free Hit squad, borrowed for the week, has no purchase prices");
const owner = ds.managers.find((mg) => (ds.picks[gw] || {})[mg.id] && ((ds.picks[gw][mg.id]).c || "") !== "freehit").id;
const owned = ds.picks[gw][owner].p.map((x) => x[0]);
const notOwned = Object.keys(ds.elements).map(Number).find((el) => owned.indexOf(el) === -1);
chk(K.ownedPrice(ds, owner, notOwned) === null, "a player the squad does not own has no price row");

// 4. on the page: only from a squad that owns him, on one line, on a small phone
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".svg":"image/svg+xml", ".webp":"image/webp", ".png":"image/png" };
const srv = http.createServer((q, r) => { let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  fs.readFile(path.join(APP, u), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { "content-type": T[path.extname(u)] || "application/octet-stream" }); r.end(b); }); });
(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  for (const w of [320, 390]) {
    const c = await b.newContext({ viewport: { width: w, height: 800 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
    const p = await c.newPage(); const er = []; p.on("pageerror", (e) => er.push(e.message));
    await p.goto("http://localhost:" + PORT + "/index.html#profile/" + owner, { waitUntil: "domcontentloaded" });
    await p.waitForSelector(".pcard[data-el]", { timeout: 20000 }); await p.waitForTimeout(2300);
    const el = await p.locator(".pcard[data-el]").first().getAttribute("data-el");
    await p.locator(".pcard[data-el]").first().click();
    await p.waitForSelector("section.view.active .pphead", { timeout: 10000 }); await p.waitForTimeout(300);
    const o = K.ownedPrice(ds, owner, +el), money = (v) => "£" + (v / 10).toFixed(1);
    const row = await p.evaluate(() => { const r = document.querySelector("#ppBuy"); if (!r) return null;
      const rr = r.getBoundingClientRect(); return { text: r.innerText.replace(/\s+/g, " "), fits: r.scrollWidth <= r.clientWidth + 1, h: rr.height,
        lines: new Set([...r.querySelectorAll(".ppbv")].map((x) => Math.round(x.getBoundingClientRect().top))).size }; });
    const flat = row ? row.text.replace(/\s+/g, "") : "";
    chk(o && flat.indexOf("PricingPaid") === 0 && flat.indexOf("Paid" + money(o.paid)) !== -1 && flat.indexOf("Now" + money(o.now)) !== -1 && flat.indexOf("Sells" + money(o.sell)) !== -1,
        w + "px: opened from his squad, the player page shows paid, now and sells", row && row.text);
    chk(row && row.fits && row.lines === 1 && row.h < 48, w + "px: on one line, nothing cut", JSON.stringify(row));
    await p.evaluate((el) => { location.hash = "player/" + el; }, el); await p.waitForTimeout(500);
    chk(await p.evaluate(() => !document.querySelector("#ppBuy") && !!document.querySelector("section.view.active .pphead")),
        w + "px: opened from anywhere else, no row");
    chk(!er.length, w + "px: no JS errors", er.join(" | "));
    await c.close();
  }
  await b.close(); srv.close(); console.log(fails ? "FAILS: " + fails : "ALL OK"); process.exit(fails ? 1 : 0);
})();
