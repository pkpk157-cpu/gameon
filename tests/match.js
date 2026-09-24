const GOENV = require("./lib/env.js");
/* Tap a Premier League fixture: the two squads side by side, each player's
   points (or ownership / value), whether the match is done, in play, or yet
   to kick off. The fixture stages all three states itself so the suite does
   not drift as the season moves on. */
const { chromium } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP;
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".svg":"image/svg+xml" };

const raw = JSON.parse(fs.readFileSync(APP + "/data.json", "utf8"));
const ds = raw.dataset;
const gw = 3;
ds.bootstrap.events.forEach((e) => {
  if (e.id === gw) { e.is_current = true; e.finished = false; e.data_checked = false; }
  else if (e.id > gw) { e.is_current = false; e.is_next = e.id === gw + 1; }
  else { e.is_current = false; e.is_next = false; }
});
ds.pitchGw = gw;
const fx = ds.gwFixtures[gw];
const DONE = fx.find((f) => f[0] === "IPS" && f[1] === "LIV");
const LIVE = fx.find((f) => f[0] === "NEW" && f[1] === "BOU");
const SOON = fx.find((f) => f[0] === "ARS" && f[1] === "CHE");
DONE[2] = 1; DONE[3] = 1; DONE[8] = 1; DONE[6] = 90;
LIVE[2] = 1; LIVE[3] = 0; LIVE[8] = 0; LIVE[6] = 63;
SOON[2] = 0; SOON[3] = 0; SOON[8] = 0; SOON[6] = 0;
// a hand-set provisional bonus in the live match so the note has to appear
ds.liveBonus = ds.liveBonus || {}; ds.liveBonus[gw] = ds.liveBonus[gw] || {};
const newEl = +Object.keys(ds.elements).find((id) => ds.elements[id][2] === "NEW" &&
  ((ds.breakdown[gw] || {})[id] || []).some((r) => r[0] === "minutes" && r[1] > 0));
ds.liveBonus[gw][newEl] = 2;
ds.livePoints[gw] = ds.livePoints[gw] || {};
ds.livePoints[gw][newEl] = (ds.livePoints[gw][newEl] || 0);
fs.writeFileSync("/tmp/match.json", JSON.stringify(raw));

const srv = http.createServer((q, r) => {
  let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  const f = u === "/data.json" ? "/tmp/match.json" : path.join(APP, u);
  fs.readFile(f, (e, b) => {
    if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { "content-type": T[path.extname(f)] || "text/plain", "cache-control": "no-store" }); r.end(b);
  });
});
let fails = 0;
const chk = (n, ok, d) => { if (!ok) { fails++; console.log("   FAIL " + n + (d ? " — " + d : "")); } else console.log("   ok   " + n); };

// what the page must show, recomputed here from the raw dataset
function expect(home, away) {
  const lp = ds.livePoints[gw] || {}, lb = ds.liveBonus[gw] || {}, bd = ds.breakdown[gw] || {};
  const side = (club) => {
    const ids = Object.keys(ds.elements).filter((id) => ds.elements[id][2] === club);
    const mins = (id) => { const r = (bd[id] || []).find((x) => x[0] === "minutes"); return r ? r[1] : 0; };
    const pts = (id) => (lp[id] || 0) + (lb[id] || 0);
    const feat = ids.filter((id) => mins(id) > 0);
    return { n: ids.length, featured: feat.length, total: feat.reduce((s, id) => s + pts(id), 0),
             pts: Object.fromEntries(ids.map((id) => [id, pts(id)])) };
  };
  return { home: side(home), away: side(away) };
}

(async () => {
  await new Promise((r) => srv.listen(9961, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  for (const width of [390, 320]) {
    console.log("-- " + width + "px");
    const ctx = await b.newContext({ viewport: { width, height: 800 }, deviceScaleFactor: 2,
      isMobile: true, hasTouch: true, serviceWorkers: "block" });
    const p = await ctx.newPage();
    const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.goto("http://localhost:9961/index.html#pl/" + gw, { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(1500);

    // fixture rows are tappable and carry the route
    const taps = await p.evaluate(() => [...document.querySelectorAll('[data-view="pl"] .fx.tap[data-plfx]')].map((r) =>
      r.getAttribute("data-plfx")));
    chk("every fixture is tappable", taps.length === 10, taps.length + " tappable");
    chk("tap route names gw and clubs", taps.includes(gw + "/IPS-LIV") && taps.includes(gw + "/NEW-BOU"), taps.join(","));

    // tap the live one
    await p.evaluate((g) => document.querySelector('[data-plfx="' + g + '/NEW-BOU"]').click(), gw);
    await p.waitForTimeout(700);
    chk("hash moves to the match", await p.evaluate(() => location.hash) === "#pl/" + gw + "/NEW-BOU", await p.evaluate(() => location.hash));
    const sheet = async () => p.evaluate(() => {
      const cols = [...document.querySelectorAll('[data-view="pl"] .mcol')];
      return {
        cols: cols.map((c) => ({
          club: c.querySelector(".mclub b").textContent,
          tot: (c.querySelector(".mtot") || {}).textContent || "",
          featured: [...c.querySelectorAll(":scope > .mrow")].map((r) => ({ el: +r.dataset.el, v: r.querySelector(".mv").textContent, name: r.querySelector(".mn").textContent })),
          rest: [...c.querySelectorAll(".mrest .mrow")].map((r) => ({ el: +r.dataset.el, v: r.querySelector(".mv").textContent })),
          restLabel: (c.querySelector(".mrest summary") || {}).textContent || ""
        })),
        notes: (document.querySelector('[data-view="pl"] .koline') || {}).textContent || "",
        on: (document.querySelector('[data-view="pl"] .pseg button.on') || {}).textContent || "",
        head: (document.querySelector('[data-view="pl"] .mhead .fx') || {}).innerText || "",
        sx: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth
      };
    });
    let s = await sheet();
    const e = expect("NEW", "BOU");
    chk("two columns, home then away", s.cols.length === 2 && s.cols[0].club === "Newcastle" && s.cols[1].club === "Bournemouth", JSON.stringify(s.cols.map((c) => c.club)));
    chk("Points view on by default", s.on === "Points", s.on);
    chk("featured count matches minutes lines (home)", s.cols[0].featured.length === e.home.featured, s.cols[0].featured.length + " vs " + e.home.featured);
    chk("featured count matches minutes lines (away)", s.cols[1].featured.length === e.away.featured, s.cols[1].featured.length + " vs " + e.away.featured);
    chk("whole squad listed (home)", s.cols[0].featured.length + s.cols[0].rest.length === e.home.n);
    const ptsOk = s.cols.every((c, i) => c.featured.concat(c.rest).every((r) => +r.v === (i ? e.away : e.home).pts[r.el]));
    chk("every player's points = live + provisional bonus", ptsOk);
    chk("home total is the sum of who featured", s.cols[0].tot === e.home.total + " pts", s.cols[0].tot + " vs " + e.home.total);
    chk("away total is the sum of who featured", s.cols[1].tot === e.away.total + " pts", s.cols[1].tot + " vs " + e.away.total);
    const sortedDesc = s.cols[0].featured.map((r) => +r.v).every((v, i, a) => i === 0 || a[i - 1] >= v);
    chk("featured sorted by points", sortedDesc, s.cols[0].featured.map((r) => r.v).join(","));
    chk("did-not-feature folded with a count", /Did not feature · \d+/.test(s.cols[0].restLabel), s.cols[0].restLabel);
    chk("in-play note", /In play/.test(s.notes), s.notes);
    chk("provisional bonus note", /provisional/.test(s.notes), s.notes);
    chk("no sideways scroll", s.sx <= s.cw, s.sx + ">" + s.cw);
    chk("header shows the score", /\d+\s*[–-]\s*\d+|\d+\s+\d+/.test(s.head.replace(/\n/g, " ")), JSON.stringify(s.head));

    // ownership and value views
    await p.evaluate(() => document.querySelector('[data-view="pl"] [data-metric="eo"]').click());
    await p.waitForTimeout(300);
    s = await sheet();
    chk("ownership view shows percentages", s.on === "Ownership" && s.cols[0].featured.every((r) => /%$/.test(r.v)), s.cols[0].featured.slice(0, 3).map((r) => r.v).join(","));
    chk("ownership view drops the pts total", s.cols[0].tot === "");
    await p.evaluate(() => document.querySelector('[data-view="pl"] [data-metric="val"]').click());
    await p.waitForTimeout(300);
    s = await sheet();
    chk("value view shows prices", s.on === "Value" && s.cols[0].featured.every((r) => /^£?\d+\.\d/.test(r.v)), s.cols[0].featured.slice(0, 3).map((r) => r.v).join(","));
    chk("no sideways scroll in value view", s.sx <= s.cw, s.sx + ">" + s.cw);
    await p.evaluate(() => document.querySelector('[data-view="pl"] [data-metric="pts"]').click());
    await p.waitForTimeout(300);

    // a row opens his own page, on the gameweek this match belongs to
    const first = await p.evaluate(() => {
      const r = document.querySelector('[data-view="pl"] .mcol .mrow');
      const gw = r.closest("[data-bgw]").getAttribute("data-bgw");
      r.click();
      return { name: r.querySelector(".mn").textContent, gw: gw, el: r.getAttribute("data-el") };
    });
    await p.waitForTimeout(900);
    const page = await p.evaluate(() => ({
      open: !!document.querySelector(".pphead"),
      hash: location.hash,
      title: (document.querySelector("#barTitle") || {}).textContent,
      rows: document.querySelectorAll(".ppexp .bdtbl tbody tr").length }));
    chk("row tap opens his page, condensed, carrying this gameweek",
        page.open && page.hash === "#player/" + first.el + "/" + first.gw && page.rows === 0,
        JSON.stringify(page));
    chk("and the bar names him", page.title === first.name, page.title + " vs " + first.name);
    // back to the match
    await p.evaluate(() => document.querySelector("#barBack").click());
    await p.waitForTimeout(700);

    // back arrow returns to the gameweek's fixture list, not the previous view
    await p.evaluate(() => document.querySelector("#barBack").click());
    await p.waitForTimeout(600);
    chk("back returns to the fixtures", await p.evaluate(() => location.hash) === "#pl/" + gw, await p.evaluate(() => location.hash));
    chk("fixture list is back", await p.evaluate(() => document.querySelectorAll('[data-view="pl"] .fx.tap').length) === 10);

    // finished match
    await p.evaluate((g) => { location.hash = "#pl/" + g + "/IPS-LIV"; }, gw);
    await p.waitForTimeout(700);
    s = await sheet();
    const e2 = expect("IPS", "LIV");
    chk("finished: featured counts", s.cols[0].featured.length === e2.home.featured && s.cols[1].featured.length === e2.away.featured);
    chk("finished: totals", s.cols[1].tot === e2.away.total + " pts", s.cols[1].tot + " vs " + e2.away.total);
    chk("finished: no in-play note", !/In play|Not kicked off/.test(s.notes), s.notes);

    // yet to kick off
    await p.evaluate((g) => { location.hash = "#pl/" + g + "/ARS-CHE"; }, gw);
    await p.waitForTimeout(700);
    s = await sheet();
    const e3 = expect("ARS", "CHE");
    chk("unstarted: whole squad shown open", s.cols[0].featured.length === e3.home.n && s.cols[0].rest.length === 0, s.cols[0].featured.length + "/" + e3.home.n);
    chk("unstarted: points shown as dashes", s.cols[0].featured.every((r) => r.v === "–"), s.cols[0].featured.slice(0, 3).map((r) => r.v).join(","));
    chk("unstarted: no total", s.cols[0].tot === "");
    chk("unstarted: kick-off note", /Not kicked off/.test(s.notes), s.notes);
    // squads in price order before kick-off
    const priceOrder = await p.evaluate(() => [...document.querySelectorAll('[data-view="pl"] .mcol:first-child .mrow')].map((r) => +r.dataset.el));
    const prices = priceOrder.map((id) => ds.elements[id][3]);
    chk("unstarted: price order", prices.every((v, i, a) => i === 0 || a[i - 1] >= v), prices.slice(0, 6).join(","));

    // unknown fixture
    await p.evaluate((g) => { location.hash = "#pl/" + g + "/ARS-LIV"; }, gw);
    await p.waitForTimeout(600);
    chk("unknown fixture explained", await p.evaluate(() => /not in Gameweek/.test(document.querySelector('[data-view="pl"]').textContent)));

    if (width === 390) {
      await p.evaluate((g) => { location.hash = "#pl/" + g + "/NEW-BOU"; }, gw);
      await p.waitForTimeout(700);
      await p.screenshot({ path: "match-live.png", fullPage: true });
      await p.evaluate(() => document.querySelector('[data-view="pl"] [data-metric="val"]').click());
      await p.waitForTimeout(300);
      await p.screenshot({ path: "match-val.png", fullPage: false });
      await p.emulateMedia({ colorScheme: "dark" });
      await p.evaluate(() => document.querySelector('[data-view="pl"] [data-metric="pts"]').click());
      await p.waitForTimeout(300);
      await p.screenshot({ path: "match-dark.png", fullPage: false });
    }
    chk("no JS errors", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  await b.close(); srv.close();
  console.log(fails ? "FAILS: " + fails : "ALL OK");
  process.exit(fails ? 1 : 0);
})();
