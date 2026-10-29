const GOENV = require("./lib/env.js");
/* Suspensions. Premier League bookings add up through the season and a ban
   falls due at three marks, each counted on the club's own league matches:
   five by its 19th (one match), ten by its 32nd (two), fifteen in the season
   (three). A mark that can no longer be reached before its cut-off, one
   booking a match being the most that counts, gives way to the next. The
   bookings are recounted here from the fixtures' own events; who is banned
   now is FPL's flag, in its words. Then the page: the banned, everyone a
   booking or two away, and your squad, every man ordered by how close. */
const { chromium } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP, PORT = 8782;
const H = require(path.join(APP, "tests/audit/harness.js")).loadCompute();
const K = H.C, ds = H.ds;
let fails = 0; const chk = (ok, m, x) => { console.log((ok ? "  ok   " : "  FAIL ") + m + (x ? "  " + x : "")); if (!ok) fails++; };
const J = JSON.stringify;

// 1. the marks
const mk = (y, n) => { const r = K.banMark(y, n); return r ? [r.at, r.ban, r.away, r.left] : null; };
[[0, 0, [5, 1, 5, 19]], [4, 8, [5, 1, 1, 11]], [4, 18, [5, 1, 1, 1]],
 [3, 18, [10, 2, 7, 14]],          // two needed, one match left in the window: the next mark
 [4, 19, [10, 2, 6, 13]],          // the 19th played without the fifth: on to ten
 [5, 10, [10, 2, 5, 22]], [9, 31, [10, 2, 1, 1]], [9, 32, [15, 3, 6, 6]],
 [14, 37, [15, 3, 1, 1]], [14, 38, null], [15, 20, null], [13, 37, null]]
  .forEach(([y, n, want]) => chk(J(mk(y, n)) === J(want), y + " bookings, " + n + " club matches: " + (want ? want[2] + " from a " + want[1] + "-match ban at " + want[0] : "no mark left"), J(mk(y, n))));

// 2. the count, from the fixtures' own events
const S = K.suspensions(ds);
const played = {}, yc = {};
Object.keys(ds.gwFixtures || {}).forEach((g) => (ds.gwFixtures[g] || []).forEach((f, i) => {
  if (!f[2]) return;
  played[f[0]] = (played[f[0]] || 0) + 1; played[f[1]] = (played[f[1]] || 0) + 1;
  ((ds.gwEvents[g] || [])[i] || []).forEach((e) => { if (e[1] === "y") yc[e[2]] = (yc[e[2]] || 0) + e[3]; });
}));
let off = 0;
S.rows.forEach((r) => { const want = yc[r.id] || 0, n = r.team ? (played[r.team] || 0) : null;
  if (r.y !== want || r.played !== n || J(r.next) !== J(n == null ? null : K.banMark(want, n))) off++; });
chk(S.rows.length === Object.keys(ds.elements).length && off === 0, "every player's bookings, his club's matches and his next mark, recounted", off + " differ of " + S.rows.length);
const susp = Object.keys(ds.flags || {}).filter((id) => ds.flags[id][0] === "s").map(Number).sort((a, b) => a - b);
chk(J(S.suspended.map((r) => r.id).sort((a, b) => a - b)) === J(susp) && S.suspended.every((r) => r.banned === (ds.flags[r.id][3] || "Suspended")),
    "the suspended are FPL's, in its words", S.suspended.map((r) => r.name + ": " + r.banned).join(" | "));
const close = S.rows.filter((r) => !r.banned && r.next && r.next.away <= 2);
chk(close.length === S.close.length && S.close.every((r, i) => !i || S.closer(S.close[i - 1], r) <= 0),
    "close: everyone one or two away and not already out, nearest first", S.close.length + " players");
// a second booking in one match is a red alone in FPL's record, so nothing is counted twice
let both = 0;
Object.keys(ds.gwEvents || {}).forEach((g) => (ds.gwEvents[g] || []).forEach((ev) => {
  if (!ev) return; const per = {};
  ev.forEach((e) => { per[e[2]] = per[e[2]] || {}; per[e[2]][e[1]] = 1; });
  Object.keys(per).forEach((el) => { if (per[el].y && per[el].r) both++; });
}));
chk(both === 0, "no sending-off carries a booking in the same match in FPL's record", both + " found");

// 3. the page
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".svg":"image/svg+xml", ".webp":"image/webp", ".png":"image/png" };
const srv = http.createServer((q, r) => { let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  fs.readFile(path.join(APP, u), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { "content-type": T[path.extname(u)] || "application/octet-stream" }); r.end(b); }); });
const me = ds.managers[5].id;
(async () => {
  await new Promise((r) => srv.listen(PORT, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  for (const w of [320, 390]) {
    const c = await b.newContext({ viewport: { width: w, height: 800 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
    await c.addInitScript((id) => { try { localStorage.setItem("go12.me", String(id)); localStorage.setItem("go12.theo", "off"); } catch (e) {} }, me);
    await c.route((u) => !/localhost/.test(u.toString()), (route) => route.abort());
    const p = await c.newPage(); const er = []; p.on("pageerror", (e) => er.push(e.message));
    await p.goto("http://localhost:" + PORT + "/index.html#classic", { waitUntil: "domcontentloaded" }); await p.waitForTimeout(3000);
    await p.click("#barYou"); await p.waitForTimeout(500);
    const menu = await p.evaluate(() => { const g = [...document.querySelectorAll("#youBody .menu")].find((m) => (m.querySelector(".lab-sm") || {}).textContent === "Players");
      return g ? [...g.querySelectorAll("button")].map((x) => x.textContent.trim() + (x.querySelector("svg rect,svg path") ? "" : " (no icon)")) : []; });
    chk(menu.join("|") === "Transfer market|Price changes|Player stats|Suspensions", w + "px: Suspensions sits under Player stats, with its icon", menu.join(" | "));
    await p.click("#pfBans"); await p.waitForTimeout(900);
    const pg = await p.evaluate(() => {
      const v = document.querySelector("section.view.active"), tb = [...v.querySelectorAll("table")];
      const rows = (t) => [...t.querySelectorAll("tbody tr[data-el]")].map((tr) => ({ id: +tr.getAttribute("data-el"), cells: [...tr.cells].map((c) => c.innerText.replace(/\s+/g, " ").trim()) }));
      return { hash: location.hash, title: document.querySelector("#barTitle").textContent, back: getComputedStyle(document.querySelector("#barBack")).display !== "none",
        secs: [...v.querySelectorAll(".section-title h2")].map((x) => x.textContent), t: tb.map(rows),
        notes: [...v.querySelectorAll(".psnote")].map((x) => x.textContent), wide: document.documentElement.scrollWidth > innerWidth + 1 };
    });
    chk(pg.hash === "#bans" && pg.title === "Suspensions" && pg.back && pg.secs.join("|") === "Suspended now|Close to a ban|Your squad",
        w + "px: its own page, named in the bar, back arrow, three sections in order", J({ hash: pg.hash, title: pg.title, secs: pg.secs }));
    chk(J(pg.t[0].map((r) => r.id)) === J(S.suspended.map((r) => r.id)) && pg.t[0].every((r, i) => r.cells[1] === S.suspended[i].banned),
        w + "px: suspended now, each with FPL's note", J(pg.t[0].map((r) => r.cells[1])));
    const cell = (r) => [String(r.y), r.next ? String(r.next.away) : "–", r.next ? r.next.ban + (r.next.ban === 1 ? " match" : " matches") : "–"];
    chk(J(pg.t[1].map((r) => r.id)) === J(S.close.map((r) => r.id)) && pg.t[1].every((r, i) => J(r.cells.slice(2)) === J(cell(S.close[i]))),
        w + "px: close to a ban, every row its bookings, how far and the ban", pg.t[1].length + " rows; first " + J(pg.t[1][0] && pg.t[1][0].cells));
    const mine = K.mySquadIds(ds, me).map((id) => S.byId[id]).sort(S.closer);
    chk(J(pg.t[2].map((r) => r.id)) === J(mine.map((r) => r.id)) && pg.t[2].every((r, i) => J(r.cells.slice(1)) === J(cell(mine[i]))),
        w + "px: your squad, every player, nearest a ban first", pg.t[2].length + " players; first " + J(pg.t[2][0] && pg.t[2][0].cells));
    chk(/club’s 19th league match: (most have )?\d+ left\./.test(pg.notes[1] || "") || !S.close.length, w + "px: the note says when the bookings must come by", pg.notes[1]);
    chk(!pg.wide, w + "px: nothing wider than the screen");
    if (pg.t[1].length) {
      await p.evaluate(() => document.querySelectorAll("section.view.active .card")[1].querySelector("tbody tr[data-el]").click()); await p.waitForTimeout(700);
      chk(await p.evaluate(() => location.hash) === "#player/" + S.close[0].id + "/" + ds.pitchGw, w + "px: a row opens that player", await p.evaluate(() => location.hash));
    }
    chk(!er.length, w + "px: no JS errors", er.join(" | "));
    await c.close();
  }
  // no team chosen: the lists, and a prompt where your squad would be
  const c = await b.newContext({ viewport: { width: 390, height: 800 }, serviceWorkers: "block" }); const p = await c.newPage();
  await c.route((u) => !/localhost/.test(u.toString()), (route) => route.abort());
  await p.goto("http://localhost:" + PORT + "/index.html#bans", { waitUntil: "domcontentloaded" }); await p.waitForTimeout(3000);
  chk(await p.evaluate(() => !!document.querySelector("#bnPick") && document.querySelectorAll("section.view.active table").length === 2), "no team chosen: the two lists, and a prompt to choose one");
  await b.close(); srv.close(); console.log(fails ? "FAILS: " + fails : "ALL OK"); process.exit(fails ? 1 : 0);
})();
