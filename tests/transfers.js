const GOENV = require("./lib/env.js");
/* A manager's transfers and what they returned, and every squad's profit:
   read off the squads and the scores the app already holds, one figure
   wherever it shows. The log follows the squads, not FPL's raw log, so a
   wildcard's changes of mind never reach the page; a Free Hit counts its one
   week; a player sold on stops counting the week he left. Profit is what the
   fifteen would fetch over what they cost, the same sum as the pitch's. */
const { chromium } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP, PORT = 8768;
const H = require(path.join(APP, "tests/audit/harness.js")).loadCompute();
const K = H.C, ds = H.ds;
let fails = 0; const chk = (ok, m, x) => { console.log((ok ? "  ok   " : "  FAIL ") + m + (x ? "  " + x : "")); if (!ok) fails++; };
const lp = ds.livePoints, done = K.scoredGws(ds);
const pts = (el, ws) => ws.reduce((s, w) => s + ((lp[w] || {})[el] || 0), 0);
const squadOf = (id, g) => ((ds.picks[g] || {})[id] || { p: [] }).p.map((x) => x[0]);
const chipsOf = (id) => { const c = {}; (ds.chips[id] || []).forEach((x) => { c[x.gw] = x.n; }); return c; };

// 1. every manager, every week: what changed is what the squads say
let weeks = 0, rowsChecked = 0, bad = [], fhOk = 0, wcSeen = 0, netBad = [];
ds.managers.forEach((m) => {
  const L = K.transferLog(ds, m.id), ch = chipsOf(m.id);
  let net = 0, hits = 0;
  L.weeks.forEach((w) => {
    weeks++;
    let b = w.gw - 1; while (b > 1 && ch[b] === "freehit") b--;
    const pre = squadOf(m.id, b), post = squadOf(m.id, w.gw);
    const ins = post.filter((x) => pre.indexOf(x) === -1), outs = pre.filter((x) => post.indexOf(x) === -1);
    if (w.ins !== ins.length || w.outs !== outs.length) bad.push(m.id + "@" + w.gw + " counts");
    if (!w.chip && w.rows.length !== Math.max(ins.length, outs.length)) bad.push(m.id + "@" + w.gw + " unpaired");
    w.rows.forEach((r) => {
      rowsChecked++;
      if (ins.indexOf(r.in) === -1 || outs.indexOf(r.out) === -1) bad.push(m.id + "@" + w.gw + " not a change");
      // the span: from this week until the first later squad (not a Free Hit's) without him
      let end = null;
      if (w.chip === "freehit") end = w.gw + 1;
      else for (let k = w.gw + 1; k <= +ds.pitchGw; k++) { if (ch[k] === "freehit") continue; if (squadOf(m.id, k).indexOf(r.in) === -1) { end = k; break; } }
      const span = done.filter((x) => x >= w.gw && (end == null || x < end));
      const want = span.length ? pts(r.in, span) - pts(r.out, span) : null;
      if (want !== r.gain) bad.push(m.id + "@" + w.gw + " gain " + r.gain + " vs " + want);
      if (w.chip === "freehit" && r.weeks <= 1) fhOk++;
    });
    if (w.chip === "wildcard") wcSeen++;
    const sum = w.rows.filter((r) => r.gain !== null).reduce((s, r) => s + r.gain, 0);
    if (w.net !== null && w.net !== sum - w.hit) netBad.push(m.id + "@" + w.gw);
    if (w.net !== null) net += w.net; hits += w.hit;
  });
  if (net !== L.net || hits !== L.hits) netBad.push(m.id + " totals");
});
chk(weeks > 900 && rowsChecked > 1500 && !bad.length, "every week's changes are the squads' own, paired, each counted over the weeks the new man stayed",
    weeks + " weeks · " + rowsChecked + " pairs · " + bad.slice(0, 4).join(", "));
chk(!netBad.length, "a week's net is its gains less its hit, and the season's is the sum of its weeks", netBad.slice(0, 4).join(", "));
chk(fhOk > 0 && wcSeen > 100, "a Free Hit counts its one week; wildcards are there as weeks of their own", fhOk + " Free Hit pairs · " + wcSeen + " wildcards");
const churn = ds.managers.map((m) => (((ds.moves || {})[3] || {})[m.id] || []).length).reduce((a, b) => Math.max(a, b), 0);
const wc3 = ds.managers.map((m) => K.transferLog(ds, m.id).weeks.filter((w) => w.chip === "wildcard").map((w) => Math.max(w.ins, w.outs))).flat();
chk(churn > 15 && wc3.every((n) => n <= 15), "a wildcard is never more than fifteen changes, however much FPL's log churned", "log up to " + churn + " · squads up to " + Math.max(...wc3));

// 2. profit: the same sum as the pitch, and the board in order
let same = 0, diff = [];
ds.managers.forEach((m) => {
  const P = K.squadProfit(ds, m.id), pit = K.managerPitch(ds, m.id, ds.buysGw);
  if (!P || !pit || pit.sellValue == null) return;
  same++;
  if (P.sell !== pit.sellValue || P.paid !== pit.paidValue || P.profit !== pit.sellValue - pit.paidValue) diff.push(m.id);
});
chk(same > 200 && !diff.length, "a squad's profit is the pitch's sells-for less its bought-for", same + " squads · " + diff.slice(0, 4).join(","));
const B = K.profitBoard(ds);
chk(B && B.squads.every((x, i) => !i || B.squads[i - 1].profit >= x.profit), "the profit board runs from most to least");
chk(B && B.bestBuys.length && B.bestBuys.every((x) => x.rise === x.now - x.paid && x.rise > 0) && B.bestBuys.every((x, i) => !i || B.bestBuys[i - 1].rise >= x.rise),
    "best buys are rises since purchase, biggest first", B && B.bestBuys.slice(0, 3).map((x) => x.name + " +" + x.rise).join(", "));

// 3. on the page: a fold on the profile, a card on squad values, a line on the pitch
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".svg":"image/svg+xml", ".webp":"image/webp", ".png":"image/png" };
const srv = http.createServer((q, r) => { let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  fs.readFile(path.join(APP, u), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { "content-type": T[path.extname(u)] || "application/octet-stream" }); r.end(b); }); });
(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  const id = ds.managers.find((m) => K.transferLog(ds, m.id).weeks.some((w) => w.hit) && K.squadProfit(ds, m.id)).id;
  const L = K.transferLog(ds, id), P = K.squadProfit(ds, id);
  for (const w of [320, 390]) {
    const c = await b.newContext({ viewport: { width: w, height: 800 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
    const p = await c.newPage(); const er = []; p.on("pageerror", (e) => er.push(e.message));
    await p.goto("http://localhost:" + PORT + "/index.html#profile/" + id, { waitUntil: "domcontentloaded" });
    await p.waitForSelector("#ps-transfers", { timeout: 20000 }); await p.waitForTimeout(2300);
    const f = await p.evaluate(() => { const d = document.querySelector("#ps-transfers"); const peek = document.querySelector('.pfoldpeek[data-for="ps-transfers"]');
      return { open: d.open, chip: d.querySelector("summary .chip").textContent, peekRows: peek ? peek.querySelectorAll("tbody tr").length : 0,
               peekGw: peek ? (peek.querySelector(".trw") || {}).textContent : null, rows: d.querySelectorAll("tbody tr").length,
               fits: [...document.querySelectorAll(".trlog")].every((t) => t.scrollWidth <= t.closest(".tablewrap").clientWidth + 1) }; });
    const newest = L.weeks[L.weeks.length - 1];
    const wantRows = L.weeks.reduce((s, x) => s + (x.chip ? 1 : x.rows.length + (x.hit ? 1 : 0)), 0);
    const sign = (v) => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v);
    chk(!f.open && f.chip === "net " + sign(L.net) + " pts" && f.peekGw === "GW" + newest.gw,
        w + "px: Transfers is folded, its net on the chip and its newest week showing", JSON.stringify({ chip: f.chip, peek: f.peekGw }));
    chk(f.rows === wantRows && f.fits, w + "px: opened, every week is there and the table fits", f.rows + " rows (want " + wantRows + ")");
    await p.locator('[data-metric="val"]').first().click(); await p.waitForTimeout(400);
    const note = await p.evaluate(() => { const n = [...document.querySelectorAll(".note")].find((x) => /^Bought for/.test(x.textContent)); return n ? n.textContent : null; });
    const mv = (t) => "£" + (t / 10).toFixed(1) + "m";
    chk(note === "Bought for " + mv(P.paid) + " · " + (P.profit > 0 ? "+" + mv(P.profit) + " profit" : P.profit < 0 ? mv(-P.profit) + " loss" : "no profit yet") + " if sold today",
        w + "px: the value view says what the squad cost and its profit", note);
    await p.evaluate(() => { location.hash = "stats/value"; }); await p.waitForTimeout(1200);
    const sv = await p.evaluate(() => [...document.querySelectorAll(".lab-sm")].map((x) => x.textContent));
    chk(sv.indexOf("Biggest profit") !== -1 && sv.indexOf("Best buys") !== -1, w + "px: squad values lists the biggest profits and the best buys", sv.join(" | "));
    const older = await p.evaluate(() => { const s = document.querySelector("#stGwSel"); const o = [...s.options].map((x) => x.value); return o[o.length - 2]; });
    await p.selectOption("#stGwSel", older); await p.waitForTimeout(600);
    const sv2 = await p.evaluate(() => [...document.querySelectorAll(".lab-sm")].map((x) => x.textContent));
    chk(sv2.indexOf("Biggest profit") === -1, w + "px: an earlier gameweek, whose purchase prices are not held, shows no profit", "GW" + older);
    chk(!er.length, w + "px: no JS errors", er.join(" | "));
    await c.close();
  }
  await b.close(); srv.close(); console.log(fails ? "FAILS: " + fails : "ALL OK"); process.exit(fails ? 1 : 0);
})();
