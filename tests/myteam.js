const GOENV = require("./lib/env.js");
/* My Team, from the button on the FPL card. It opens on the week ahead: your
   newest squad with the transfers you have logged applied, each man with his
   matches that gameweek and their difficulty, FPL's flag on him and whether
   one booking would ban him; on the pitch by position, two, five, five and
   three, as FPL's Transfers page lays a squad out, with no armband and no
   bench, since FPL publishes no eleven before the deadline. The same picker holds every week already played, each the
   profile's squad pitch, without the profile's Official/next switch and
   without moving the week the profile remembers. Back is FPL. */
const { chromium } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP, PORT = 8784;
const H = require(path.join(APP, "tests/audit/harness.js")).loadCompute();
const K = H.C, ds = H.ds;
let fails = 0; const chk = (ok, m, x) => { console.log((ok ? "  ok   " : "  FAIL ") + m + (x ? "  " + x : "")); if (!ok) fails++; };
const J = JSON.stringify;
const me = ds.managers[5].id;

// 1. the week ahead, worked out
const nd = K.nextDeadline(ds), nt = K.nextTeam(ds, me);
const held = K.squadGws(ds).filter((g) => g < nd.gw && ds.picks[g] && ds.picks[g][me]);
const base = held[held.length - 1];
const pd = K.pendingSquad(ds, me);
const want = (pd && pd.gw === nd.gw ? pd.squad.map((c) => c.el) : ds.picks[base][me].p.map((x) => +x[0])).slice().sort((a, b) => a - b);
chk(nt && nt.gw === nd.gw && J(nt.squad.map((c) => c.el).sort((a, b) => a - b)) === J(want), "the week ahead is the next deadline's, the squad yours as it stands", nt && ("GW" + nt.gw + ", " + nt.squad.length + " players"));
const S = K.suspensions(ds);
let off = 0;
nt.squad.forEach((c) => {
  const club = ds.elements[c.el][2];
  const fx = (ds.gwFixtures[nt.gw] || []).filter((f) => f[0] === club || f[1] === club)
    .map((f) => ({ opp: f[0] === club ? f[1] : f[0], home: f[0] === club, fdr: (f[0] === club ? f[9] : f[10]) || 0 }));
  if (J(c.fixtures.map((f) => ({ opp: f.opp, home: f.home, fdr: f.fdr }))) !== J(fx)) off++;
  if (J(c.flag) !== J(K.availability(ds, c.el, null))) off++;
  const b = S.byId[c.el];
  if (c.banned !== (b ? b.banned : null) || J(c.ban) !== J(b && b.next && b.next.away === 1 ? b.next : null)) off++;
});
chk(off === 0, "every man's matches, difficulty, flag and ban as the fixtures, FPL and Suspensions have them", off + " differ");
// transfers logged for the week ahead: the new man is in and marked, the one he replaced is out
{
  const d2 = JSON.parse(J(ds)), inn = Object.keys(d2.elements).map(Number).find((e) => d2.elements[e][1] === d2.elements[want[0]][1] && want.indexOf(e) === -1);
  const out = d2.picks[nd.gw - 1] ? d2.picks[nd.gw - 1][me].p[0][0] : null;
  if (out != null) {
    d2.pending = { gw: nd.gw, at: new Date().toISOString(), moves: { [me]: [[inn, out]] } };
    const K2 = require(path.join(APP, "tests/audit/harness.js")).loadCompute().C;
    const t2 = K2.nextTeam(d2, me);
    chk(t2 && t2.changed === 1 && t2.squad.some((c) => c.el === inn && c.isNew) && !t2.squad.some((c) => c.el === out),
        "a transfer logged for the week ahead: the new man in and marked, the old one gone", t2 && J({ changed: t2.changed }));
  }
}
// the season over: no week ahead
{
  const d3 = JSON.parse(J(ds)); d3.bootstrap.events.forEach((e) => { e.deadline_time = "2020-01-01T00:00:00Z"; });
  chk(K.nextTeam(d3, me) === null, "no deadline ahead, no week ahead");
}

// 2. the page
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".svg":"image/svg+xml", ".webp":"image/webp", ".png":"image/png" };
const srv = http.createServer((q, r) => { let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  fs.readFile(path.join(APP, u), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { "content-type": T[path.extname(u)] || "application/octet-stream" }); r.end(b); }); });
(async () => {
  await new Promise((r) => srv.listen(PORT, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  for (const w of [320, 390]) {
    const c = await b.newContext({ viewport: { width: w, height: 800 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
    await c.addInitScript((id) => { try { localStorage.setItem("go12.me", String(id)); localStorage.setItem("go12.theo", "off"); } catch (e) {} }, me);
    await c.route((u) => !/localhost/.test(u.toString()), (route) => route.abort());
    const p = await c.newPage(); const er = []; p.on("pageerror", (e) => er.push(e.message));
    // the profile's squad first, to see My Team leaves its week alone
    await p.goto("http://localhost:" + PORT + "/index.html#profile/" + me + "/squad", { waitUntil: "domcontentloaded" }); await p.waitForTimeout(3200);
    const profWeek = await p.evaluate(() => document.querySelector("#pitchBox #pitchGwSel").value);
    await p.goto("http://localhost:" + PORT + "/index.html#fpl"); await p.waitForSelector(".fplcard", { timeout: 15000 }); await p.waitForTimeout(600);
    const btn = await p.evaluate(() => { const a = document.querySelector(".fplcard .fcbtn"); return a ? { t: a.textContent.trim(), icon: !!a.querySelector("svg path"), last: a === document.querySelector(".fplcard").lastElementChild, fits: a.getBoundingClientRect().right <= innerWidth } : null; });
    chk(btn && btn.t === "My Team" && btn.icon && btn.last && btn.fits, w + "px: the FPL card ends with a My Team button, its icon drawn", J(btn));
    await p.click(".fplcard .fcbtn"); await p.waitForTimeout(900);
    const pg = await p.evaluate(() => ({ hash: location.hash, title: document.querySelector("#barTitle").textContent, sub: (document.querySelector("#barSub") || {}).textContent,
      back: getComputedStyle(document.querySelector("#barBack")).display !== "none",
      sel: document.querySelector("#mtGwSel").value, opts: [...document.querySelectorAll("#mtGwSel option")].map((o) => o.value),
      head: document.querySelector(".mthead").textContent,
      rows: [...document.querySelectorAll("#myTeamBox .pitch .prow")].map((row) => [...row.querySelectorAll(".pcard")].map((c) => ({ el: +c.getAttribute("data-el"),
        name: c.querySelector(".pname").textContent, opp: c.querySelector(".ppts").textContent,
        flag: (c.querySelector(".pname").className.match(/flagged (\w+)/) || [])[1] || "" }))),
      marks: document.querySelectorAll("#myTeamBox .pb.cap, #myTeamBox .pb.vice, #myTeamBox .pbench").length,
      wide: document.documentElement.scrollWidth > innerWidth + 1 }));
    chk(pg.hash === "#fpl/myteam" && pg.sub === "My Team" && pg.title === ds.managers[5].entryName && pg.back, w + "px: its own page, your team's name in the bar, back arrow", J({ hash: pg.hash, title: pg.title, sub: pg.sub }));
    chk(pg.sel === "next" && J(pg.opts) === J(K.squadGws(ds).filter((g) => ds.picks[g][me]).map(String).concat(["next"])), w + "px: it opens on the week ahead; the picker holds every week played and the next", pg.opts.join(","));
    chk(pg.head.indexOf("Deadline: ") === 0 && (nt.changed ? pg.head.indexOf(nt.changed + " transfer") !== -1 : /No transfers made yet/.test(pg.head)), w + "px: the deadline, and the transfers made", pg.head);
    const wantRows = [1, 2, 3, 4].map((t) => nt.squad.filter((c) => c.type === t).map((c) => ({ el: c.el, name: c.name,
      opp: c.fixtures.length ? c.fixtures.map((f) => f.opp + " (" + (f.home ? "H" : "A") + ")").join(" ") : "No match",
      flag: c.flag ? c.flag.level : "" })));
    chk(J(pg.rows) === J(wantRows), w + "px: the pitch by position, every man with his match and FPL's colour for any knock or ban", pg.rows.map((r) => r.length).join("-") + "; first " + J(pg.rows[0] && pg.rows[0][0]));
    chk(pg.marks === 0 && !pg.wide, w + "px: no armband and no bench, which only FPL knows before the deadline; nothing wider than the screen", "marks " + pg.marks);
    // a week played: the squad pitch, no Official/next switch, the week ahead still on offer
    const past = K.squadGws(ds).filter((g) => ds.picks[g][me])[0];
    await p.selectOption("#mtGwSel", String(past)); await p.waitForTimeout(700);
    const pp = await p.evaluate(() => ({ pitch: !!document.querySelector("#myTeamBox .pitch"), sel: document.querySelector("#mtGwSel").value,
      next: !!document.querySelector('#mtGwSel option[value="next"]'), when: !!document.querySelector("#pitchWhen"), total: (document.querySelector("#myTeamBox .pstat.main .v") || {}).textContent }));
    chk(pp.pitch && pp.sel === String(past) && pp.next && !pp.when && pp.total === String(K.managerPitch(ds, me, past).net), w + "px: a week played is its pitch and points, the week ahead still in the picker", J(pp));
    await p.selectOption("#mtGwSel", "next"); await p.waitForTimeout(500);
    chk(await p.evaluate(() => document.querySelectorAll("#myTeamBox .pitch .pcard").length) === nt.squad.length, w + "px: and back to the week ahead");
    await p.click("#myTeamBox .pitch .pcard"); await p.waitForTimeout(700);
    chk(await p.evaluate(() => location.hash) === "#player/" + nt.squad[0].el + "/" + nt.base + "/" + me, w + "px: a player opens his page, as your player", await p.evaluate(() => location.hash));
    await p.goBack(); await p.waitForTimeout(700);
    await p.click("#barBack"); await p.waitForTimeout(700);
    chk(await p.evaluate(() => location.hash) === "#fpl", w + "px: back is FPL");
    await p.goto("http://localhost:" + PORT + "/index.html#profile/" + me + "/squad"); await p.waitForTimeout(1500);
    chk(await p.evaluate(() => document.querySelector("#pitchBox #pitchGwSel").value) === profWeek, w + "px: the profile's squad keeps its own week", profWeek);
    chk(!er.length, w + "px: no JS errors", er.join(" | "));
    await c.close();
  }
  // no team chosen: the page says to choose one
  const c = await b.newContext({ viewport: { width: 390, height: 800 }, serviceWorkers: "block" }); const p = await c.newPage();
  await c.route((u) => !/localhost/.test(u.toString()), (route) => route.abort());
  await p.goto("http://localhost:" + PORT + "/index.html#fpl/myteam", { waitUntil: "domcontentloaded" }); await p.waitForTimeout(3000);
  chk(await p.evaluate(() => /Choose your team/.test(document.querySelector("section.view.active").textContent)), "no team chosen: it asks for one");
  await b.close(); srv.close(); console.log(fails ? "FAILS: " + fails : "ALL OK"); process.exit(fails ? 1 : 0);
})();
