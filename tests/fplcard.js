const GOENV = require("./lib/env.js");
/* Your team at the top of FPL, the way FPL's app opens: team and manager,
   the latest gameweek's average, your points and the highest, the next
   deadline in the phone's own time; then your leagues. Your points are the
   app's own figure, the same as every table; your points open your team,
   the highest opens his. */
const { chromium } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP, PORT = 8774;
const H = require(path.join(APP, "tests/audit/harness.js")).loadCompute();
const K = H.C, ds = H.ds;
let fails = 0; const chk = (ok, m, x) => { console.log((ok ? "  ok   " : "  FAIL ") + m + (x ? "  " + x : "")); if (!ok) fails++; };
const me = ds.managers[5], gw = +ds.pitchGw, ev = ds.bootstrap.events.find((e) => +e.id === gw);
const next = ds.bootstrap.events.find((e) => e.deadline_time && Date.parse(e.deadline_time) > Date.now());
const ENTRY = { id: me.id, player_region_iso_code_short: "IN", leagues: { classic: [{ id: 314, name: "Overall", entry_rank: 1000, entry_last_rank: 1200, league_type: "s" }], h2h: [] } };
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".svg":"image/svg+xml", ".webp":"image/webp", ".png":"image/png" };
const srv = http.createServer((q, r) => { let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  fs.readFile(path.join(APP, u), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { "content-type": T[path.extname(u)] || "application/octet-stream" }); r.end(b); }); });
(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  for (const w of [320, 390]) {
    const c = await b.newContext({ viewport: { width: w, height: 800 }, isMobile: true, hasTouch: true, serviceWorkers: "block", timezoneId: "Asia/Kolkata" });
    await c.addInitScript((id) => { try { localStorage.setItem("go12.me", String(id)); localStorage.setItem("go12.theo", "off"); } catch (e) {} }, me.id);
    const p = await c.newPage(); const er = []; p.on("pageerror", (e) => er.push(e.message));
    await p.route((u) => /entry/.test(decodeURIComponent(u.toString())) && !/localhost/.test(u.toString()), (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ENTRY) }));
    await p.goto("http://localhost:" + PORT + "/index.html#fpl", { waitUntil: "domcontentloaded" });
    await p.waitForSelector(".fplcard", { timeout: 20000 }); await p.waitForTimeout(2500);
    const c1 = await p.evaluate(() => { const card = document.querySelector(".fplcard"); const n = [...card.querySelectorAll(".fcn b")].map((x) => x.textContent);
      const first = document.querySelector("section.view.active").firstElementChild;
      return { who: card.querySelector(".fcwho b").textContent, mgr: card.querySelector(".fcwho span").textContent, badge: card.querySelector(".fcbadge").textContent,
        gw: card.querySelector(".fcgw").textContent, n, next: (card.querySelector(".fcnext") || {}).textContent || "", first: first === card,
        leagues: document.querySelectorAll(".flrow").length, wide: card.scrollWidth > card.clientWidth + 1,
        oneLine: card.querySelector(".fcnext b") ? card.querySelector(".fcnext b").getClientRects().length === 1 && card.querySelector(".fcnext b").getBoundingClientRect().height < 30 : true }; });
    const pts = K.gwScore(ds, me.id, gw);
    const initials = me.playerName.replace(/['’]/g, "").split(/\s+/).slice(0, 2).map((x) => x[0].toUpperCase()).join("");
    chk(c1.first && c1.who === me.entryName && c1.mgr === "\u{1F1EE}\u{1F1F3}" + me.playerName && c1.badge === initials, w + "px: the card leads the page: team, flag and manager, his initials", JSON.stringify({ who: c1.who, mgr: c1.mgr, badge: c1.badge }));
    const fig = (v) => (v ? Number(v).toLocaleString("en-US") : "–");
    chk(c1.gw.startsWith(ev.name) && c1.n[0] === fig(ev.average) && c1.n[1] === String(pts) && c1.n[2] === fig(ev.highest),
        w + "px: average and highest are FPL's, the points the app's own", JSON.stringify({ gw: c1.gw, n: c1.n, want: [ev.average, pts, ev.highest] }));
    if (next) {
      const d = new Date(next.deadline_time); const ist = new Date(d.getTime() + 330 * 60000);
      const want = ist.toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" }) + " " + ist.getUTCDate() + " " + ist.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }) +
        " at " + String(ist.getUTCHours()).padStart(2, "0") + ":" + String(ist.getUTCMinutes()).padStart(2, "0");
      chk(c1.next.indexOf(next.name) === 0 && c1.next.indexOf("Deadline: " + want) !== -1 && c1.oneLine, w + "px: the next deadline in the phone's own time, on one line", c1.next);
    }
    chk(c1.leagues > 0 && !c1.wide, w + "px: the leagues follow it, nothing wider than the card", c1.leagues + " league rows");
    await p.click(".fcn.main"); await p.waitForTimeout(600);
    chk(await p.evaluate((id) => location.hash === "#profile/" + id, me.id), w + "px: your points open your team", await p.evaluate(() => location.hash));
    if (ev.highestEntry) {
      await p.goBack(); await p.waitForSelector(".fplcard", { timeout: 10000 }); await p.waitForTimeout(500);
      await p.click(".fcn:last-child"); await p.waitForTimeout(600);
      const h = await p.evaluate(() => location.hash);
      chk(h === "#fpl/team/" + ev.highestEntry || h === "#profile/" + ev.highestEntry, w + "px: the highest opens that team", h);
    }
    chk(!er.length, w + "px: no JS errors", er.join(" | "));
    await c.close();
  }
  // no team chosen: no card, the prompt as before
  const c = await b.newContext({ viewport: { width: 390, height: 800 }, serviceWorkers: "block" }); const p = await c.newPage();
  await p.goto("http://localhost:" + PORT + "/index.html#fpl", { waitUntil: "domcontentloaded" }); await p.waitForTimeout(2600);
  chk(await p.evaluate(() => !document.querySelector(".fplcard") && !!document.querySelector("#flPick")), "with no team chosen there is no card, only the prompt to choose one");
  await b.close(); srv.close(); console.log(fails ? "FAILS: " + fails : "ALL OK"); process.exit(fails ? 1 : 0);
})();
