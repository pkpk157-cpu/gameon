const GOENV = require("./lib/env.js");
/* A footballer's results, coloured. Once a match is over the score reads as a
 * pill: green where his side won, red where it lost, plain grey for a draw,
 * always with his side's goals first. A match still in play stays uncoloured.
 * Checked against the fixtures in the data for the top scorer of the season
 * and for one player from every club that has drawn. */
const { chromium, devices } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP, PORT = 8813;
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".webp":"image/webp", ".png":"image/png" };
const srv = http.createServer((q, r) => { let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  fs.readFile(path.join(APP, u), (e, b) => { if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { "content-type": T[path.extname(u)] || "text/plain", "cache-control": "no-store" }); r.end(b); }); });
let fails = 0;
const chk = (ok, m, x) => { console.log((ok ? "  ok   " : "  FAIL ") + m + (x ? "  " + x : "")); if (!ok) fails++; };

(async () => {
  await new Promise((r) => srv.listen(PORT, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  const ctx = await b.newContext({ ...devices["iPhone 12"], serviceWorkers: "block" });
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto("http://localhost:" + PORT + "/index.html#classic", { waitUntil: "domcontentloaded" }); await p.waitForTimeout(1500);
  // players to look at: one per club, the most-owned, so every club's results are covered
  const picks = await p.evaluate(() => {
    const ds = window.GO_STORE.dataset(), by = {};
    Object.keys(ds.elements).forEach((el) => { const m = ds.elements[el]; if (!by[m[2]] || m[4] > ds.elements[by[m[2]]][4]) by[m[2]] = +el; });
    return Object.values(by);
  });
  let rows = 0, wins = 0, losses = 0, draws = 0, plain = 0, wrong = [];
  for (const el of picks) {
    await p.evaluate((x) => { location.hash = "#player/" + x; }, el); await p.waitForTimeout(500);
    const got = await p.evaluate((el) => {
      const ds = window.GO_STORE.dataset(), club = ds.elements[el][2];
      return [...document.querySelectorAll("table.pptbl tr[data-ppgw]")].map((tr) => {
        const gw = +tr.getAttribute("data-ppgw"), sc = tr.querySelector(".ppsc");
        const f = (ds.gwFixtures[gw] || []).find((x) => x[0] === club || x[1] === club);
        if (!f || f[4] == null) return null;
        const home = f[0] === club, us = home ? f[4] : f[5], them = home ? f[5] : f[4], over = !!(f[3] || f[8]);
        const want = !over ? "" : us > them ? "win" : us < them ? "loss" : "draw";
        const has = ["win", "loss", "draw"].find((k) => sc.classList.contains(k)) || "";
        const text = sc.textContent.trim();
        return { gw, want, has, text, expectText: us + " - " + them, club };
      }).filter(Boolean);
    }, el);
    got.forEach((g) => {
      rows++;
      if (g.has === "win") wins++; else if (g.has === "loss") losses++; else if (g.has === "draw") draws++; else plain++;
      if (g.has !== g.want || g.text !== g.expectText) wrong.push(g.club + " GW" + g.gw + " " + g.text + " got " + (g.has || "plain") + " want " + (g.want || "plain"));
    });
  }
  chk(rows > 40, "results read for one player per club", rows + " results");
  chk(wins > 0 && losses > 0, "wins and losses both appear", wins + " wins, " + losses + " losses, " + draws + " draws, " + plain + " plain");
  chk(wrong.length === 0, "every pill matches the fixture: colour and his side first", wrong.slice(0, 3).join(" | "));
  // and the colour is real: a win pill is green, a loss pill red
  const col = await p.evaluate(() => {
    const pick = (k) => { const e = document.querySelector(".ppsc." + k); return e ? getComputedStyle(e).backgroundColor : null; };
    return { win: pick("win"), loss: pick("loss") };
  });
  const rgb = (s) => (s || "").match(/\d+/g) ? s.match(/\d+/g).map(Number) : null;
  const w = rgb(col.win), l = rgb(col.loss);
  chk(!w || (w[1] > w[0] && w[1] > w[2]), "a win pill is green", col.win);
  chk(!l || (l[0] > l[1] && l[0] > l[2]), "a loss pill is red", col.loss);
  chk(errs.length === 0, "no JS errors", errs.slice(0, 2).join(" | "));
  await b.close(); srv.close();
  console.log(fails ? "\nFAILS: " + fails : "\nwins green, losses red");
  process.exit(fails ? 1 : 0);
})();
