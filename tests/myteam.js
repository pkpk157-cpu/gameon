const GOENV = require("./lib/env.js");
/* My Team, from the button on the FPL card. It opens on the week ahead: your
   newest squad with the transfers you have logged applied, each man with his
   matches that gameweek and their difficulty, FPL's flag on him and whether
   one booking would ban him; on the pitch by position, two, five, five and
   three, as FPL's Transfers page lays a squad out, with no armband and no
   bench, since FPL publishes no eleven before the deadline. Every later week
   to the last is the same squad against that week's fixtures and deadline,
   its knocks and bans left to the coming week. Arrows step a week either way
   through every week played, each the profile's squad pitch, without the
   profile's Official/next switch and without moving the week the profile
   remembers. Back is FPL. */
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
// a later week: the same squad, that week's fixtures and deadline, no knocks or bans
{
  const g2 = nd.gw + 1, ev2 = ds.bootstrap.events.find((e) => e.id === g2), t2 = K.nextTeam(ds, me, g2);
  let off2 = 0;
  (t2 ? t2.squad : []).forEach((c) => {
    const club = ds.elements[c.el][2];
    const fx = (ds.gwFixtures[g2] || []).filter((f) => f[0] === club || f[1] === club).map((f) => ({ opp: f[0] === club ? f[1] : f[0], home: f[0] === club }));
    if (J(c.fixtures.map((f) => ({ opp: f.opp, home: f.home }))) !== J(fx) || c.flag || c.banned || c.ban) off2++;
  });
  chk(t2 && t2.gw === g2 && !t2.next && t2.deadline === Date.parse(ev2.deadline_time) && J(t2.squad.map((c) => c.el)) === J(nt.squad.map((c) => c.el)) && off2 === 0,
      "a later week: the same squad against that week's fixtures and deadline, no knocks or bans", t2 && ("GW" + t2.gw + ", " + off2 + " differ"));
  chk(K.nextTeam(ds, me, nd.gw - 1) === null && K.nextTeam(ds, me, 99) === null, "a week already played, or one that does not exist, is not a week ahead");
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
    const read = () => p.evaluate(() => ({ hash: location.hash, title: document.querySelector("#barTitle").textContent, sub: (document.querySelector("#barSub") || {}).textContent,
      back: getComputedStyle(document.querySelector("#barBack")).display !== "none", sel: !!document.querySelector("#myTeamBox select"),
      lab: document.querySelector("#myTeamBox .gwlab").textContent, arrows: [...document.querySelectorAll("#myTeamBox .gwarr")].map((x) => !x.disabled),
      head: (document.querySelector(".mthead") || {}).textContent || "",
      rows: [...document.querySelectorAll("#myTeamBox .pitch .prow")].map((row) => [...row.querySelectorAll(".pcard")].map((c) => ({ el: +c.getAttribute("data-el"),
        name: c.querySelector(".pname").textContent, opp: c.querySelector(".ppts").textContent,
        flag: (c.querySelector(".pname").className.match(/flagged (\w+)/) || [])[1] || "" }))),
      marks: document.querySelectorAll("#myTeamBox .pb.cap, #myTeamBox .pb.vice, #myTeamBox .pbench").length,
      total: (document.querySelector("#myTeamBox .pstat.main .v") || {}).textContent || null,
      wide: document.documentElement.scrollWidth > innerWidth + 1 }));
    const step = async (dir) => { await p.click("#myTeamBox .gwarr >> nth=" + (dir < 0 ? 0 : 1)); await p.waitForTimeout(450); return read(); };
    const pitchOf = (t) => [1, 2, 3, 4].map((ty) => t.squad.filter((c) => c.type === ty).map((c) => ({ el: c.el, name: c.name,
      opp: c.fixtures.length ? c.fixtures.map((f) => f.opp + " (" + (f.home ? "H" : "A") + ")").join(" ") : "No match", flag: c.flag ? c.flag.level : "" })));
    let pg = await read();
    chk(pg.hash === "#fpl/myteam" && pg.sub === "My Team" && pg.title === ds.managers[5].entryName && pg.back, w + "px: its own page, your team's name in the bar, back arrow", J({ hash: pg.hash, title: pg.title, sub: pg.sub }));
    chk(!pg.sel && pg.lab === "Gameweek " + nd.gw + " · next" && pg.arrows.join() === "true,true", w + "px: arrows, not a dropdown; it opens on the week ahead, a step either way", J({ lab: pg.lab, arrows: pg.arrows }));
    chk(pg.head.indexOf("Deadline: ") === 0 && (nt.changed ? pg.head.indexOf(nt.changed + " transfer") !== -1 : pg.head.indexOf("Your Gameweek " + nt.base + " squad · transfers show after the deadline") !== -1) && !/No transfers/.test(pg.head),
        w + "px: the deadline, and whose squad this is: never a claim that nothing has changed", pg.head);
    chk(J(pg.rows) === J(pitchOf(nt)), w + "px: the pitch by position, every man with his match and FPL's colour for any knock or ban", pg.rows.map((r) => r.length).join("-") + "; first " + J(pg.rows[0] && pg.rows[0][0]));
    chk(pg.marks === 0 && !pg.wide, w + "px: no armband and no bench, which only FPL knows before the deadline; nothing wider than the screen", "marks " + pg.marks);
    // a week on: that week's fixtures, its own deadline, no knocks
    pg = await step(1);
    const t2 = K.nextTeam(ds, me, nd.gw + 1);
    chk(pg.lab === "Gameweek " + (nd.gw + 1) && J(pg.rows) === J(pitchOf(t2)) && pg.head.indexOf("Deadline: ") === 0, w + "px: a week on, the same squad against that week's matches", pg.lab);
    // back past the week ahead: the last week played, its pitch and points
    await step(-1); pg = await step(-1);
    const played = K.squadGws(ds).filter((g) => ds.picks[g][me]), last = played[played.length - 1];
    chk(pg.lab === "Gameweek " + last && pg.total === String(K.managerPitch(ds, me, last).net) && !pg.sel && !(await p.evaluate(() => !!document.querySelector("#pitchWhen"))),
        w + "px: a week back is the week played: its pitch and points, the arrows still there", J({ lab: pg.lab, total: pg.total }));
    // the ends: the first week played and the last of the season
    for (let i = 0; i < 45 && (await read()).arrows[0]; i++) await step(-1);
    pg = await read();
    chk(pg.lab === "Gameweek " + played[0] && pg.arrows.join() === "false,true", w + "px: the first week played has no step back", pg.lab);
    for (let i = 0; i < 45 && (await read()).arrows[1]; i++) await step(1);
    pg = await read();
    const lastEv = Math.max(...ds.bootstrap.events.filter((e) => e.deadline_time).map((e) => e.id));
    chk(pg.lab === "Gameweek " + lastEv && pg.arrows.join() === "true,false" && pg.rows.flat().length === nt.squad.length, w + "px: the season's last week has no step on, and still your squad", pg.lab);
    // back to the week ahead, and a player opens as your player
    for (let i = 0; i < 45 && (await read()).lab !== "Gameweek " + nd.gw + " · next"; i++) await step(-1);
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
