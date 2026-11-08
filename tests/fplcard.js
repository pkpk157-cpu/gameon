const GOENV = require("./lib/env.js");
/* Your team at the top of FPL, the way FPL's app opens: team and manager,
   the latest gameweek's average, your points and the highest, the next
   deadline in the phone's own time; then your leagues. Your points are the
   app's own figure, the same as every table; your points open your team,
   the highest opens his. GO | FPL on the card and on your own squad says
   whose average and highest they show: FPL's on the card, Game On's on
   your squad, each remembered on its own. */
const { chromium } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP, PORT = 8774;
const H = require(path.join(APP, "tests/audit/harness.js")).loadCompute();
const K = H.C, ds = H.ds;
let fails = 0; const chk = (ok, m, x) => { console.log((ok ? "  ok   " : "  FAIL ") + m + (x ? "  " + x : "")); if (!ok) fails++; };
const me = ds.managers[5], gw = +ds.pitchGw, ev = ds.bootstrap.events.find((e) => +e.id === gw);
const fx = K.fplGwFigures(ds, gw), gx = K.goGwFigures(ds, gw);
// FPL's figures fill in as each match day settles; until it finishes the week they say "so far"
const sofar = (f) => (!f.final && (f.average != null || f.highest != null) ? " so far" : "");
{
  // FPL's figures as FPL has them, and beating its average judged only once it has finished the week
  const ev = (ds.bootstrap.events || []).find((e) => +e.id === +gw) || {};
  const HL = K.highlights(ds, gw), fa = HL && HL.gwStats ? HL.gwStats.fplAverage : null;
  chk(fx.average === (ev.average > 0 ? ev.average : null) && fx.highest === (ev.highest > 0 ? ev.highest : null) && fx.final === !!ev.finished &&
      fa === (fx.final ? fx.average : null),
      "FPL's average and highest as FPL has published them" + (fx.final ? "" : ", so far") + "; Beat the average waits for FPL to finish the week",
      JSON.stringify({ gw, fx, statsAvg: fa }));
}

{
  // overall rank: FPL's figure from the gameweek history, the card's week (the
  // week before while nothing in it has kicked off), and the change since the
  // last week that has a rank, for every manager and every week
  let bad = [], seen = 0;
  ds.managers.forEach((m) => {
    const h = ds.history[m.id] || {};
    Object.keys(h).map(Number).forEach((g) => {
      const o = K.overallRank(ds, m.id, g), ug = K.gwAhead(ds, g) ? g - 1 : g;
      const r = h[ug] && h[ug].r > 0 ? h[ug].r : null;
      let p = ug - 1; while (p > 0 && !(h[p] && h[p].r > 0)) p--;
      const want = r ? { gw: ug, rank: r, prevGw: p > 0 ? p : null, gain: p > 0 ? h[p].r - r : null } : null;
      if (JSON.stringify(o) !== JSON.stringify(want)) bad.push([m.id, g, o, want]); else seen++;
    });
  });
  chk(!bad.length && seen > 1000, "overall rank on the card is the history's, with places gained since the week before (" + seen + " manager-weeks)", JSON.stringify(bad.slice(0, 2)));
  chk(K.overallRank(ds, -1, gw) === null && K.overallRank({}, me.id, gw) === null, "no history, no rank: never a made-up one");
}

{
  // the live grid: points bands by players played, only while the week is live
  const lv = K.liveGwId(ds);
  if (lv) {
    const g = K.highlights(ds, lv).gwStats, G = g.grid;
    const rowSums = G.cells.map((r) => r.reduce((a, b) => a + b, 0));
    chk(G && rowSums.every((s, i) => s === g.buckets[i].n) && G.colTotals.reduce((a, b) => a + b, 0) === g.count - G.unknown && G.unknown === 0,
        "live grid: each band's row adds up to its Managers figure in Where everyone landed; every manager counted once", JSON.stringify({ rowSums, bands: g.buckets.map((b) => b.n), unknown: G.unknown }));
    const L = K.lms(ds), lt = L && L.live && L.live.table;
    let off = [];
    (lt || []).forEach((r) => { const a = G.at[r.id]; if (!a || a[2] !== r.played || a[3] !== r.playedTotal) off.push([r.id, a, r.played, r.playedTotal]); });
    chk(lt && lt.length && !off.length, "live grid: each manager's played count is the one Last Manager Standing shows (" + (lt ? lt.length : 0) + " survivors)", JSON.stringify(off.slice(0, 3)));
    let place = [];
    Object.keys(G.at).forEach((id) => { const a = G.at[id], sc = K.gwScore(ds, +id, lv), b = g.buckets[a[0]], c = G.cols[a[1]];
      if (!(sc >= b.lo && sc <= b.hi && a[2] >= c[0] && a[2] <= c[1])) place.push([id, sc, a]); });
    chk(!place.length && G.cols.every((c, i) => i === 0 || c[0] === G.cols[i - 1][1] + 1) && G.cols.length <= 8,
        "live grid: everyone sits in their band and their played column; columns run on without gaps, eight at most", JSON.stringify(place.slice(0, 3)));
  }
  const done = K.finishedGws(ds).filter((x) => x !== lv)[0];
  chk(!done || !K.highlights(ds, done).gwStats.grid, "a finished week has no live grid", "GW" + done);
}

// the next deadline shows only once the card's gameweek is finished and finalised
const cardFinal = K.finishedGws(ds).indexOf(+ds.pitchGw) !== -1;
const next = cardFinal ? ds.bootstrap.events.find((e) => e.deadline_time && Date.parse(e.deadline_time) > Date.now()) : null;
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
      return { who: card.querySelector(".fcwho b").textContent, mgr: card.querySelector(".fcwho span").textContent, badge: !!card.querySelector(".fcbadge"),
        gw: card.querySelector(".fcgw > span:nth-child(2)").textContent, src: [...card.querySelectorAll(".srcpill button")].map((x) => x.textContent + (x.classList.contains("on") ? "*" : "")).join("|"), n, labs: [...card.querySelectorAll(".fcn span")].map((x) => x.textContent.trim()), next: (card.querySelector(".fcnext") || {}).textContent || "", first: first === card,
        leagues: document.querySelectorAll(".flrow").length, wide: card.scrollWidth > card.clientWidth + 1,
        // each figure's label on one line and whole, "so far" and all
        labFit: [...card.querySelectorAll(".fcn span")].every((x) => x.scrollWidth <= x.clientWidth + 1 && x.getClientRects().length === 1),
        oneLine: card.querySelector(".fcnext b") ? card.querySelector(".fcnext b").getClientRects().length === 1 && card.querySelector(".fcnext b").getBoundingClientRect().height < 30 : true }; });
    const pts = K.gwScore(ds, me.id, gw);
    chk(c1.first && c1.who === me.entryName && c1.mgr === "\u{1F1EE}\u{1F1F3}" + me.playerName && !c1.badge, w + "px: the card leads the page: team, flag and manager, no badge", JSON.stringify({ who: c1.who, mgr: c1.mgr }));
    const fig = (v) => (v ? Number(v).toLocaleString("en-US") : "–");
    chk(c1.labs.join("|") === "Average" + sofar(fx) + "|Points|Highest" + sofar(fx), w + "px: the card's average and highest are FPL's, plain" + (sofar(fx) ? ", so far until FPL finishes the week" : ""), c1.labs.join(" | "));
    chk(c1.labFit, w + "px: every label fits on its line, uncut");
    chk(c1.gw.startsWith(ev.name) && c1.src === "GO|FPL*" && c1.n[0] === fig(fx.average) && c1.n[1] === String(pts) && c1.n[2] === fig(fx.highest),
        w + "px: the card opens on FPL: average and highest are FPL's, the points the app's own", JSON.stringify({ gw: c1.gw, src: c1.src, n: c1.n, want: [fx.average, pts, fx.highest] }));
    if (next) {
      const d = new Date(next.deadline_time); const ist = new Date(d.getTime() + 330 * 60000);
      const want = ist.toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" }) + " " + ist.getUTCDate() + " " + ist.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }) +
        " at " + String(ist.getUTCHours()).padStart(2, "0") + ":" + String(ist.getUTCMinutes()).padStart(2, "0");
      chk(c1.next.indexOf(next.name) === 0 && c1.next.indexOf("Deadline: " + want) !== -1 && c1.oneLine, w + "px: the next deadline in the phone's own time, on one line", c1.next);
    } else {
      chk(!c1.next, w + "px: GW" + ds.pitchGw + " not finished and finalised: no next deadline on the card yet", c1.next);
    }
    chk(c1.leagues > 0 && !c1.wide, w + "px: the leagues follow it, nothing wider than the card", c1.leagues + " league rows");
    {
      const lv = K.liveGwId(ds) === gw, btn = await p.$(".fplcard .fcgrid");
      chk(lv ? !!btn : !btn, w + "px: the live grid's button is on the card " + (lv ? "while the week is live" : "only while a week is live: not now"));
      if (btn) {
        await btn.click(); await p.waitForTimeout(400);
        const G = K.highlights(ds, gw).gwStats.grid;
        const t = await p.evaluate(() => { const m = document.querySelector("#modalBack"), tb = m.querySelector(".lgtbl");
          return { title: document.querySelector("#modalTitle").textContent, cells: [...tb.querySelectorAll("tbody tr")].map((r) => [...r.querySelectorAll("td.lgc")].map((c) => +c.textContent || 0)),
            fits: tb.scrollWidth <= tb.parentElement.clientWidth + 1 && document.documentElement.scrollWidth <= innerWidth, you: tb.querySelectorAll("td.you").length }; });
        const meAt = G.at[me.id];
        chk(t.title === "Live: points and players played" && JSON.stringify(t.cells) === JSON.stringify(G.cells) && t.fits && t.you === (meAt ? 1 : 0),
            w + "px: it opens the grid: every cell the computed count, yours marked, nothing wider than the phone", JSON.stringify({ title: t.title, fits: t.fits, you: t.you }));
        // a cell opens its managers, most points first; tapped again it closes
        const bi = G.cells.findIndex((r) => r.some((n) => n > 1)), ci = G.cells[bi].findIndex((n) => n > 1);
        await p.click('td[data-lg="' + bi + "," + ci + '"]'); await p.waitForTimeout(500);
        const want = Object.keys(G.at).filter((id) => G.at[id][0] === bi && G.at[id][1] === ci).map(Number)
          .map((id) => ({ id, p: K.gwScore(ds, id, gw), t: (K.managerMap(ds)[id] || {}).entryName || "" }))
          .sort((x, y) => (y.p - x.p) || x.t.localeCompare(y.t)).map((x) => x.id);
        const got = await p.evaluate(() => ({ ids: [...document.querySelectorAll("#lgList .lgrow")].map((b) => +b.getAttribute("data-lgid")),
          head: (document.querySelector("#lgList .lglh") || {}).textContent || "", shown: !document.querySelector("#lgList").hidden,
          below: document.querySelector("#lgList").getBoundingClientRect().top >= document.querySelector("#modalBack .hd").getBoundingClientRect().bottom - 1 }));
        chk(got.shown && JSON.stringify(got.ids) === JSON.stringify(want) && new RegExp("played" + want.length + " managers?$").test(got.head) && got.below,
            w + "px: a cell lists its " + want.length + " managers, most points first, its heading in view", JSON.stringify({ head: got.head, n: got.ids.length, below: got.below }));
        await p.click('td[data-lg="' + bi + "," + ci + '"]'); await p.waitForTimeout(300);
        chk(await p.evaluate(() => document.querySelector("#lgList").hidden), w + "px: tapped again, the list closes");
        await p.click('td[data-lg="' + bi + "," + ci + '"]'); await p.waitForTimeout(500);
        await p.click("#lgList .lgrow"); await p.waitForTimeout(700);
        const op = await p.evaluate(() => [location.hash, document.querySelector("#modalBack").classList.contains("show")]);
        chk(op[0] === "#profile/" + want[0] && !op[1], w + "px: a manager in it opens his profile, the sheet closed", JSON.stringify(op));
        await p.goBack(); await p.waitForTimeout(700);
        chk(await p.evaluate(() => location.hash === "#fpl" && !!document.querySelector(".fplcard")), w + "px: back returns to FPL", await p.evaluate(() => location.hash));
        // opened again and again, a tap opens the list every time (its
        // handlers once piled up, one per opening, and cancelled out)
        const every = [];
        for (let k = 0; k < 4; k++) {
          await p.click(".fplcard .fcgrid"); await p.waitForTimeout(350);
          await p.click('td[data-lg="' + bi + "," + ci + '"]'); await p.waitForTimeout(350);
          every.push(await p.evaluate(() => { const l = document.querySelector("#lgList"); return !!l && !l.hidden && l.querySelectorAll(".lgrow").length; }));
          await p.click("#modalClose"); await p.waitForTimeout(350);
        }
        chk(every.every((n) => n === want.length), w + "px: opened four times over, a tap shows the list every time", JSON.stringify(every));
      }
    }
    {
      const o = K.overallRank(ds, me.id, gw), liveNow = K.liveGwId(ds) === gw;
      const rk = await p.evaluate(() => { const a = document.querySelector(".fplcard .fcrank"); if (!a) return null; const r = a.getBoundingClientRect(), card = document.querySelector(".fplcard").getBoundingClientRect();
        return { l: a.querySelector(".fcrl").textContent, n: a.querySelector("b").textContent, mv: a.querySelector(".fcrm") ? a.querySelector(".fcrm").className : "", d: (a.querySelector(".fcrm span") || {}).textContent || "",
          href: a.getAttribute("href"), aria: a.getAttribute("aria-label"), one: r.height < 40, inside: r.left >= card.left && r.right <= card.right }; });
      if (!o) chk(rk === null, w + "px: no rank from FPL yet: no rank row");
      else {
        const mv = o.gain == null ? "" : o.gain > 0 ? "up" : o.gain < 0 ? "down" : "same";
        chk(rk && rk.l === (liveNow && o.gw === gw ? "Live rank" : "Overall rank") && rk.n === o.rank.toLocaleString("en-US") && (mv ? rk.mv === "fcrm " + mv : rk.mv === "") &&
            rk.d === (mv && mv !== "same" ? Math.abs(o.gain).toLocaleString("en-US") : ""),
            w + "px: " + (rk && rk.l) + " " + o.rank + " under the figures, " + (mv || "no") + " " + (o.gain == null ? "" : Math.abs(o.gain)) + " since GW" + o.prevGw, JSON.stringify(rk));
        chk(rk.one && rk.inside && rk.href === "#fpl/history" && /since Gameweek|no change|rank d/.test(rk.aria), w + "px: on one line, inside the card, opening the history; says it all to a screen reader", rk.aria);
      }
    }
    await p.click(".fcn.main"); await p.waitForTimeout(600);
    const sq = await p.evaluate(() => { const s = document.querySelector("#ps-squad"); const bar = document.querySelector("header.topbar").getBoundingClientRect().height + ((document.querySelector("#profChips") || { getBoundingClientRect: () => ({ height: 0 }) }).getBoundingClientRect().height);
      return { hash: location.hash, top: s ? Math.round(s.getBoundingClientRect().top - bar) : null }; });
    // whose figures are whose, said on both: FPL's on the card, Game On's beside your squad
    const labs = await p.evaluate(() => [...document.querySelectorAll(".pstats .l")].map((x) => x.textContent.trim()).concat([...document.querySelectorAll(".srcrow .srcpill button")].map((x) => x.textContent + (x.classList.contains("on") ? "*" : "")).join("|")));
    chk(labs[0] === "Average" && /^Highest/.test(labs[2]) && labs[3] === "GO*|FPL", w + "px: your squad opens on GO: its average and highest are Game On's, plain", labs.join(" | "));
    chk(sq.hash === "#profile/" + me.id + "/squad" && sq.top != null && sq.top >= -2 && sq.top <= 24, w + "px: your points open your profile at your squad, just under the bar", JSON.stringify(sq));
    // the arrow by your name opens your gameweek history: FPL's table, FPL's figures
    await p.goBack(); await p.waitForSelector(".fplcard", { timeout: 10000 }); await p.waitForTimeout(500);
    await p.click(".fchead"); await p.waitForSelector(".ghist", { timeout: 10000 }); await p.waitForTimeout(300);
    const gh = await p.evaluate(() => ({ hash: location.hash, title: document.querySelector("#barTitle").textContent, back: getComputedStyle(document.querySelector("#barBack")).display !== "none",
      head: [...document.querySelectorAll(".ghist thead th")].map((x) => x.textContent), rows: [...document.querySelectorAll(".ghist tbody tr")].map((r) => [...r.cells].map((c) => c.textContent.trim())),
      stick: getComputedStyle(document.querySelector(".ghist tbody td")).position }));
    const hist = ds.history[me.id], gws = Object.keys(hist).map(Number).sort((a, b) => a - b);
    const want = gws.map((g) => { const x = hist[g]; return [String(g), x.r ? x.r.toLocaleString("en-US") : "\u2013", x.pc != null ? Number(x.pc).toFixed(1) + "%" : "\u2013", "",
      x.t.toLocaleString("en-US"), x.gr ? x.gr.toLocaleString("en-US") : "\u2013", String(K.gwScore(ds, me.id, g)), String(K.gwBench(ds, me.id, g)), String(x.tr || 0), String(x.h || 0), (x.v / 10).toFixed(1)]; });
    chk(gh.hash === "#fpl/history" && gh.title === me.entryName && gh.back && gh.head.join(",") === "GW,OR,%,#,OP,GWR,GWP,PB,TM,TC,\u00a3" && gh.stick === "sticky",
        w + "px: the arrow opens your gameweek history, FPL's columns, the gameweek held at the left", JSON.stringify({ hash: gh.hash, head: gh.head.join(",") }));
    chk(JSON.stringify(gh.rows) === JSON.stringify(want), w + "px: every gameweek's row is the stored figures, points and bench as the app counts them", JSON.stringify(gh.rows[gh.rows.length - 1]));
    await p.click("#ghKey"); await p.waitForTimeout(300);
    chk(await p.evaluate(() => /Table key/.test(document.querySelector("#modalBack").textContent) && document.querySelectorAll("#modalBack dt").length === 11), w + "px: the table key explains all eleven columns");
    await p.evaluate(() => document.querySelector("#modalClose").click()); await p.waitForTimeout(300);
    await p.click("#barBack"); await p.waitForTimeout(500);
    chk(await p.evaluate(() => location.hash === "#fpl" && !!document.querySelector(".fplcard")), w + "px: back returns to FPL");
    await p.click(".fcn.main"); await p.waitForTimeout(500);
    if (fx.highestEntry) {
      await p.goBack(); await p.waitForSelector(".fplcard", { timeout: 10000 }); await p.waitForTimeout(500);
      await p.click(".fcn:last-child"); await p.waitForTimeout(600);
      const h = await p.evaluate(() => location.hash);
      chk(h === "#fpl/team/" + fx.highestEntry || h === "#profile/" + fx.highestEntry, w + "px: the highest opens that team", h);
    }
    chk(!er.length, w + "px: no JS errors", er.join(" | "));
    await c.close();
  }
  // GO | FPL: each card switches its own two figures, and remembers
  {
    const c = await b.newContext({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
    await c.addInitScript((id) => { try { if (!sessionStorage.getItem("seeded")) { localStorage.clear(); localStorage.setItem("go12.me", String(id)); localStorage.setItem("go12.theo", "off"); sessionStorage.setItem("seeded", "1"); } } catch (e) {} }, me.id);
    const p = await c.newPage(); const er = []; p.on("pageerror", (e) => er.push(e.message));
    await p.route((u) => /entry/.test(decodeURIComponent(u.toString())) && !/localhost/.test(u.toString()), (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ENTRY) }));
    const card = () => p.evaluate(() => { const c = document.querySelector(".fplcard"); return { n: [...c.querySelectorAll(".fcn b")].map((x) => x.textContent), labs: [...c.querySelectorAll(".fcn span")].map((x) => x.textContent.trim()).join("|"),
      on: (c.querySelector(".srcpill .on") || {}).textContent, wide: c.scrollWidth > c.clientWidth + 1 }; });
    const squad = () => p.evaluate(() => ({ st: [...document.querySelectorAll("#pitchBox .pstats .pstat")].map((x) => [x.querySelector(".v").textContent, x.querySelector(".l").textContent.trim()]),
      on: (document.querySelector("#pitchBox .srcrow .on") || {}).textContent, pill: !!document.querySelector("#pitchBox .srcpill") }));
    const fig = (v) => (v == null ? "—" : Number(v).toLocaleString("en-US"));
    await p.goto("http://localhost:" + PORT + "/index.html#fpl", { waitUntil: "domcontentloaded" });
    await p.waitForSelector(".fplcard", { timeout: 20000 }); await p.waitForTimeout(2500);
    await p.click(".fplcard .srcpill [data-src=go]"); await p.waitForTimeout(300);
    let k = await card();
    chk(k.on === "GO" && k.labs === "Average|Points|Highest" && k.n[0] === fig(gx.average) && k.n[1] === String(K.gwScore(ds, me.id, gw)) && k.n[2] === fig(gx.highest && gx.highest.pts) && !k.wide,
        "card on GO: Game On's average and highest, plain labels, your points unchanged", JSON.stringify(k));
    await p.click(".fplcard .fcn:last-child"); await p.waitForTimeout(600);
    chk(await p.evaluate(() => location.hash) === "#profile/" + gx.highest.id, "card on GO: the highest opens that manager's profile", await p.evaluate(() => location.hash));
    // the squad keeps its own choice: still Game On's
    await p.goto("http://localhost:" + PORT + "/index.html#profile/" + me.id + "/squad"); await p.waitForTimeout(1800);
    const pit = K.managerPitch(ds, me.id, gw);
    let s = await squad();
    chk(s.on === "GO" && s.st[0][0] === fig(pit.average) && s.st[0][1] === "Average" && s.st[2][0] === fig(pit.highest.pts) && /^Highest/.test(s.st[2][1]),
        "squad opens on GO, whatever the card is on", JSON.stringify(s));
    await p.click("#pitchBox .srcpill [data-src=fpl]"); await p.waitForTimeout(400);
    s = await squad();
    chk(s.on === "FPL" && s.st[0][0] === fig(fx.average) && s.st[0][1] === "Average" + sofar(fx) && s.st[1][0] === String(pit.net) && s.st[2][0] === fig(fx.highest) && s.st[2][1].indexOf("Highest" + sofar(fx)) === 0,
        "squad on FPL: FPL's average and highest, your points unchanged", JSON.stringify(s));
    // an earlier week on FPL: that week's figures
    const gws = K.squadGws(ds), g0 = gws[0], f0 = K.fplGwFigures(ds, g0);
    await p.selectOption("#pitchGwSel", String(g0)); await p.waitForTimeout(400);
    s = await squad();
    chk(s.on === "FPL" && s.st[0][0] === fig(f0.average) && s.st[2][0] === fig(f0.highest), "squad on FPL, gameweek " + g0 + ": FPL's figures for that week", JSON.stringify(s));
    await p.click("#pitchBox .psegrow [data-metric=eo]"); await p.waitForTimeout(400);
    s = await squad();
    chk(!s.pill && s.st[0][1] === "GO avg", "Ownership has no switch and stays Game On's, labelled so", JSON.stringify(s));
    // both remembered
    await p.reload(); await p.waitForTimeout(1800);
    await p.evaluate(() => { const b = document.querySelector("#pitchBox .psegrow [data-metric=pts]"); if (b) b.click(); }); await p.waitForTimeout(400);
    s = await squad();
    chk(s.on === "FPL", "the squad remembers FPL", JSON.stringify(s));
    await p.goto("http://localhost:" + PORT + "/index.html#fpl"); await p.waitForSelector(".fplcard", { timeout: 10000 }); await p.waitForTimeout(800);
    k = await card();
    chk(k.on === "GO" && k.n[0] === fig(gx.average), "the card remembers GO", JSON.stringify(k));
    // your profile's Form leads to your gameweek history, and back to Form
    await p.goto("http://localhost:" + PORT + "/index.html#profile/" + me.id + "/form"); await p.waitForTimeout(1800);
    const gb = await p.evaluate(() => { const b = document.querySelector("#ps-form .ghbtn"); return b ? { t: b.textContent.trim(), right: b.getBoundingClientRect().right <= window.innerWidth } : null; });
    chk(gb && /^Gameweek history/.test(gb.t) && gb.right, "your Form has a Gameweek history button, on screen", JSON.stringify(gb));
    await p.click("#ps-form .ghbtn"); await p.waitForSelector(".ghist", { timeout: 10000 }); await p.waitForTimeout(300);
    chk(await p.evaluate(() => location.hash) === "#fpl/history", "it opens your gameweek history");
    await p.click("#barBack"); await p.waitForTimeout(1200);
    chk(await p.evaluate(() => location.hash) === "#profile/" + me.id + "/form", "back returns to your Form", await p.evaluate(() => location.hash));
    // someone else's squad: no switch, Game On's figures labelled GO
    const other = ds.managers.find((m) => +m.id !== +me.id && K.managerPitch(ds, m.id, gw));
    await p.goto("http://localhost:" + PORT + "/index.html#profile/" + other.id + "/squad"); await p.waitForTimeout(1800);
    s = await squad();
    chk(!s.pill && s.st[0][1] === "GO avg" && /^GO highest/.test(s.st[2][1]), "another manager's squad: no switch, labels say GO", JSON.stringify(s));
    // and so does every other manager's: their history, their stored figures, back to their Form
    await p.goto("http://localhost:" + PORT + "/index.html#profile/" + other.id + "/form"); await p.waitForTimeout(1800);
    await p.click("#ps-form .ghbtn"); await p.waitForSelector(".ghist", { timeout: 10000 }); await p.waitForTimeout(300);
    const oh = await p.evaluate(() => ({ hash: location.hash, title: document.querySelector("#barTitle").textContent,
      rows: [...document.querySelectorAll(".ghist tbody tr")].map((r) => [...r.cells].map((c) => c.textContent.trim())) }));
    const hO = ds.history[other.id], gO = Object.keys(hO).map(Number).filter((g) => typeof hO[g].p === "number").sort((a, b) => a - b);
    const wantO = gO.map((g) => { const x = hO[g]; return [String(g), x.r ? x.r.toLocaleString("en-US") : "\u2013", x.pc != null ? Number(x.pc).toFixed(1) + "%" : "\u2013",
      x.t.toLocaleString("en-US"), x.gr ? x.gr.toLocaleString("en-US") : "\u2013", String(K.gwScore(ds, other.id, g)), String(K.gwBench(ds, other.id, g)), String(x.tr || 0), String(x.h || 0), (x.v / 10).toFixed(1)]; });
    const gotO = oh.rows.map((r) => r.filter((_, i) => i !== 3));
    chk(oh.hash === "#fpl/history/" + other.id && oh.title === other.entryName, "another manager's Form opens their gameweek history, their name in the bar", JSON.stringify({ hash: oh.hash, title: oh.title }));
    chk(gotO.length > 0 && JSON.stringify(gotO) === JSON.stringify(wantO), "every row is their stored figures", JSON.stringify(gotO[gotO.length - 1]) + " vs " + JSON.stringify(wantO[wantO.length - 1]));
    await p.click("#barBack"); await p.waitForTimeout(1200);
    chk(await p.evaluate(() => location.hash) === "#profile/" + other.id + "/form", "back returns to their Form", await p.evaluate(() => location.hash));
    await p.goto("http://localhost:" + PORT + "/index.html#fpl/history/999999999"); await p.waitForTimeout(1200);
    chk(await p.evaluate(() => /not in Game On/.test(document.querySelector("section.view.active").textContent)), "a history for someone not in Game On says so");
    chk(!er.length, "switching: no JS errors", er.join(" | "));
    await c.close();
  }
  // no team chosen: no card, the prompt as before
  const c = await b.newContext({ viewport: { width: 390, height: 800 }, serviceWorkers: "block" }); const p = await c.newPage();
  await p.goto("http://localhost:" + PORT + "/index.html#fpl", { waitUntil: "domcontentloaded" }); await p.waitForTimeout(2600);
  chk(await p.evaluate(() => !document.querySelector(".fplcard") && !!document.querySelector("#flPick")), "with no team chosen there is no card, only the prompt to choose one");
  await b.close(); srv.close(); console.log(fails ? "FAILS: " + fails : "ALL OK"); process.exit(fails ? 1 : 0);
})();
