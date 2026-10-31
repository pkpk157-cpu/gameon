const GOENV = require("./lib/env.js");
/* The transfer market. Across FPL: a gameweek's transfers per player are
   the season totals at its deadline less those at the deadline before, the
   total at a deadline being the season's less the open window's, which FPL
   resets at each one. A moment's lag at a deadline is put right on the next
   run; a gameweek with no earlier deadline read has no figures, not guessed
   ones. In Game On: the week's changes off the squads, the same reading as
   the profiles' Transfers, and the gameweek's own points as their return. */
const { chromium } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP, PORT = 8770;
const { marketOf } = require(path.join(APP, "scripts/fetch-data.js"));
const H = require(path.join(APP, "tests/audit/harness.js")).loadCompute();
const K = H.C, ds = H.ds;
const J = JSON.stringify;
let fails = 0; const chk = (ok, m, x) => { console.log((ok ? "  ok   " : "  FAIL ") + m + (x ? "  " + x : "")); if (!ok) fails++; };

// 1. across FPL, run by run
const day = 864e5, t0 = Date.UTC(2026, 9, 1);
const events = [1, 2, 3].map((id) => ({ id, deadline_time: new Date(t0 + id * 7 * day).toISOString() }));
const el = (id, tin, tout, win, wout) => ({ id, transfers_in: tin, transfers_out: tout, transfers_in_event: win, transfers_out_event: wout });
// in GW2's window (GW1 locked): season totals 1000 and 400 in, 300 and 50 so far this window
let m = marketOf([el(1, 1000, 200, 300, 20), el(2, 400, 900, 50, 100)], events, null, "a", t0 + 7 * day + 3600e3);
chk(m.locked === 1 && m.base[1].in[1] === 700 && m.base[1].in[2] === 350 && !m.gws[1] && m.open && m.open.gw === 2 && m.open.in[0][0] === 1 && m.open.total === 350,
    "a window open: the total at the last deadline is the season's less the window's; nothing claimed for a gameweek without the deadline before it", JSON.stringify({ base: m.base[1].in, open: m.open }));
// just past GW2's deadline, FPL not yet reset: the window count still the old one
m = marketOf([el(1, 1010, 205, 300, 20), el(2, 420, 910, 50, 100)], events, m, "b", t0 + 14 * day + 60e3);
const lag = m.gws[2];
// the next run, FPL reset: 10 and 20 in since the deadline
m = marketOf([el(1, 1015, 207, 10, 4), el(2, 425, 915, 20, 3)], events, m, "c", t0 + 14 * day + 360e3);
chk(m.gws[2] && m.gws[2].in[0][0] === 1 && m.gws[2].in[0][1] === 305 && m.gws[2].in[1][1] === 55 && m.gws[2].total === 360,
    "past the deadline, the gameweek is the two deadlines’ totals apart, exactly", JSON.stringify(m.gws[2]));
chk(!lag || lag.total < m.gws[2].total, "a run caught mid-reset is put right by the next", JSON.stringify(lag));
// a gameweek read stays when the next window moves on
m = marketOf([el(1, 1100, 260, 95, 57), el(2, 470, 990, 65, 78)], events, m, "d", t0 + 18 * day);
chk(m.gws[2] && m.gws[2].total === 360 && m.open.gw === 3, "a gameweek read holds while the next window fills");
// a count that would go backwards is not published
const bad = marketOf([el(1, 100, 200, 300, 20)], events, { base: {} }, "e", t0 + 8 * day);
chk(!bad.base[1] && !bad.open, "a reading that makes no sense (window above the season) is not kept", JSON.stringify(bad));
// every position's top eight is kept as well as the overall fifteen, so a list by position is complete
{
  const many = [];
  // 30 forwards bought most, then 12 goalkeepers, 12 defenders, 12 midfielders bought less
  for (let i = 0; i < 66; i++) {
    const type = i < 30 ? 4 : i < 42 ? 1 : i < 54 ? 2 : 3;
    many.push(Object.assign(el(i + 1, 5000, 0, 1000 - i * 10, 0), { element_type: type }));
  }
  const mm = marketOf(many, events, null, "g", t0 + 7 * day + 3600e3);
  const ids = mm.open.in.map((x) => x[0]), by = (t) => ids.filter((id) => many[id - 1].element_type === t);
  const want = (t) => many.filter((x) => x.element_type === t).sort((a, b) => b.transfers_in_event - a.transfers_in_event).slice(0, 8).map((x) => x.id);
  chk(mm.open.pos === 8 && ids.slice(0, 15).join() === many.slice(0, 15).map((x) => x.id).join() &&
      [1, 2, 3, 4].every((t) => by(t).slice(0, 8).join() === want(t).join()) &&
      mm.open.in.every((x, i) => !i || mm.open.in[i - 1][1] >= x[1]),
      "kept: the overall fifteen and every position's own top eight, biggest first, marked so", "kept " + ids.length + "; GK " + by(1).length + ", DEF " + by(2).length + ", MID " + by(3).length + ", FWD " + by(4).length);
}
const pre = marketOf([el(1, 0, 0, 500, 0)], events, null, "f", t0);
chk(pre.locked === 0 && pre.open === null, "before the first deadline there is no gameweek to read", JSON.stringify(pre));

// 2. Game On, off the squads: the same changes the profiles show
const gws = K.marketGws(ds);
let badWeeks = [];
gws.filter((g) => g <= +ds.pitchGw).forEach((g) => {
  const M = K.market(ds, g);
  let transfers = 0, managers = 0, ins = 0, outs = 0;
  const gains = [], hitNets = [];
  const lp0 = ds.livePoints[g] || {};
  ds.managers.forEach((mg) => {
    const w = K.transferLog(ds, mg.id).weeks.find((x) => x.gw === g);
    if (!w) return;
    managers++; transfers += Math.max(w.ins, w.outs); ins += w.ins; outs += w.outs;
    if (w.chip) return;
    const gs = w.rows.map((r) => (lp0[r.in] || 0) - (lp0[r.out] || 0));
    gains.push(...gs);
    if (w.hit) hitNets.push(gs.reduce((a, b) => a + b, 0) - w.hit);
  });
  const sumB = M.go.bought.reduce((s, x) => s + x.n, 0), sumS = M.go.sold.reduce((s, x) => s + x.n, 0);
  const lp = ds.livePoints[g] || {};
  // locked with nothing kicked off: no points beside the players, nothing judged
  const ahead = !!K.gwAhead(ds, g);
  const bOk = ahead ? M.go.bought.every((x) => x.pts === null) && M.go.sold.every((x) => x.pts === null) && !!M.ahead
    : M.go.bought.every((x) => x.pts === (lp[x.el] || 0)) && M.go.sold.every((x) => x.pts === (lp[x.el] || 0)) && !M.ahead;
  const P = M.go.paid, HP = M.go.hitsPaid;
  const paidOk = ahead ? P === null && !M.go.best.length && !M.go.worst.length
    : P && P.of === gains.length && P.won === gains.filter((x) => x > 0).length && P.lost === gains.filter((x) => x < 0).length && P.level === gains.filter((x) => x === 0).length;
  const hitsOk = ahead ? HP === null
    : HP && HP.of === hitNets.length && HP.won === hitNets.filter((x) => x > 0).length && HP.net === hitNets.reduce((a, b) => a + b, 0);
  const hits = ds.managers.reduce((s, mg) => s + ((((ds.history[mg.id] || {})[g]) || {}).h || 0), 0);
  if (M.go.transfers !== transfers || M.go.managers !== managers || sumB !== ins || sumS !== outs || !bOk || !paidOk || !hitsOk || M.go.hits !== hits)
    badWeeks.push("GW" + g);
  const sorted = (l, f) => l.every((x, i) => !i || f(l[i - 1]) >= f(x));
  if (!sorted(M.go.bought, (x) => x.n) || !sorted(M.go.best, (x) => x.gain) || !M.go.worst.every((x) => x.gain < 0)) badWeeks.push("GW" + g + " order");
});
chk(gws.length && !badWeeks.length, "every gameweek: transfers, managers, hits, who was bought and sold, and which transfers and hits paid agree with the squads", badWeeks.join(", ") || gws.join(","));

// 3. on the page
const raw = JSON.parse(fs.readFileSync(path.join(APP, "data.json"), "utf8"));
const lockedGw = gws.filter((g) => g <= +ds.pitchGw).pop();
const els = Object.keys(raw.dataset.elements).map(Number);
raw.dataset.market = { locked: lockedGw, base: {}, gws: {}, open: { gw: lockedGw + 1, at: new Date().toISOString(), in: els.slice(0, 15).map((e, i) => [e, 90000 - i * 1000]), out: els.slice(20, 35).map((e, i) => [e, 70000 - i * 1000]), total: 1234567, pos: 8 } };
raw.dataset.market.gws[lockedGw] = { in: els.slice(40, 55).map((e, i) => [e, 900000 - i * 1000]), out: els.slice(60, 75).map((e, i) => [e, 800000 - i * 1000]), total: 9000000 };
const body = JSON.stringify(raw);
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".svg":"image/svg+xml", ".webp":"image/webp", ".png":"image/png" };
const srv = http.createServer((q, r) => { let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  if (u === "/data.json") { r.writeHead(200, { "content-type": "application/json" }); r.end(body); return; }
  fs.readFile(path.join(APP, u), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { "content-type": T[path.extname(u)] || "application/octet-stream" }); r.end(b); }); });
(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  for (const w of [320, 360, 390]) {
    const c = await b.newContext({ viewport: { width: w, height: 800 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
    const p = await c.newPage(); const er = []; p.on("pageerror", (e) => er.push(e.message));
    await p.goto("http://localhost:" + PORT + "/index.html#classic", { waitUntil: "domcontentloaded" });
    await p.waitForSelector("section.view.active table.t tbody tr", { timeout: 20000 }); await p.waitForTimeout(2300);
    await p.click("#barYou"); await p.waitForTimeout(500);
    const order = await p.evaluate(() => [...document.querySelectorAll("#youBody .menu button")].map((x) => x.id));
    chk(order.indexOf("pfMarket") !== -1 && order.indexOf("pfMarket") + 1 === order.indexOf("pfPrices"), w + "px: Transfer market sits right above Price changes", order.join(","));
    await p.click("#pfMarket"); await p.waitForSelector("#mkGwSel", { timeout: 10000 }); await p.waitForTimeout(400);
    const a = await p.evaluate(() => ({ hash: location.hash, title: (document.querySelector("#barTitle") || document.querySelector(".bar h1") || {}).textContent,
      gw: document.querySelector("#mkGwSel").value, labs: [...document.querySelectorAll("section.view.active .lab-sm")].map((x) => x.textContent),
      cards: [...document.querySelectorAll("section.view.active .hcard .hl span")].map((x) => x.textContent), wide: document.documentElement.scrollWidth > innerWidth,
      notes: [...document.querySelectorAll("section.view.active .note")].map((x) => x.textContent).join(" | "),
      cut: [...document.querySelectorAll("section.view.active .hcard .hl span")].some((x) => x.scrollWidth > x.clientWidth + 1) }));
    chk(a.hash === "#market" && +a.gw === lockedGw, w + "px: it opens on the last locked gameweek", JSON.stringify({ hash: a.hash, gw: a.gw }));
    if (K.gwAhead(ds, lockedGw)) {
      // locked, not a ball kicked: buys and sales stand, nothing is judged yet
      chk(["Bought by Game On", "Sold by Game On", "Most bought across FPL", "Most sold across FPL"].every((x) => a.labs.indexOf(x) !== -1) &&
          a.labs.indexOf("Best moves") === -1 && a.cards.indexOf("Transfers paid") === -1 && a.cards.indexOf("Hits that paid") === -1 &&
          /No match has kicked off yet/.test(a.notes),
          w + "px: before kick-off: buys, sales and FPL's, no moves or hits judged, and it says why", a.labs.join(" | ") + " / " + a.notes);
    } else {
      chk(["Bought by Game On", "Sold by Game On", "Best moves", "Worst moves", "Most bought across FPL", "Most sold across FPL"].every((x) => a.labs.indexOf(x) !== -1),
          w + "px: Game On's buys and sales, the best and worst moves, and FPL's beside them", a.labs.join(" | "));
    }
    const heads = K.gwAhead(ds, lockedGw) ? "Transfers,Hits taken" : "Transfers,Hits taken,Transfers paid,Hits that paid";
    chk(a.cards.join(",") === heads && !a.cut && !a.wide, w + "px: " + (heads.split(",").length === 4 ? "four" : "two, until kick-off,") + " headline figures, none cut, nothing wider than the phone", a.cards.join(","));
    await p.selectOption("#mkGwSel", String(lockedGw + 1)); await p.waitForTimeout(500);
    const o = await p.evaluate(() => ({ lead: document.querySelector("section.view.active .statlead").textContent,
      cards: [...document.querySelectorAll("section.view.active .hcard .hl span")].map((x) => x.textContent),
      labs: [...document.querySelectorAll("section.view.active .lab-sm")].map((x) => x.textContent), text: document.querySelector("section.view.active").textContent }));
    // FPL keeps managers' transfers private until the deadline: the open week is FPL's alone, and says why
    chk(/so far/.test(o.lead) && o.cards.join(",") === "FPL\u2019s most bought" && o.labs.indexOf("Most bought across FPL") !== -1 && /As FPL had them at/.test(o.text) &&
        /Game On\u2019s own transfers show once the deadline passes/.test(o.text) && !/nobody yet|logged yet/.test(o.text),
        w + "px: the open week is FPL's figures so far, and says Game On's come after the deadline, never that nobody has moved", JSON.stringify({ lead: o.lead, cards: o.cards }));
    // every player row: name, position, today's price in brackets beside it, and how many at the end; the filter keeps one position
    // what the page was served: the open week kept with lists by position, the week before without
    const MO = K.market(raw.dataset, lockedGw + 1);
    const rowsOf = () => p.evaluate(() => [...document.querySelectorAll("section.view.active .hlist")].filter((l) => /across FPL|by Game On/.test(l.querySelector(".lab-sm").textContent))
      .map((l) => ({ t: l.querySelector(".lab-sm").textContent, r: [...l.querySelectorAll(".hrow")].map((r) => ({ name: r.querySelector(".hn").firstChild.textContent.trim(),
        pos: (r.querySelector(".hpos") || {}).textContent, price: (r.querySelector(".hpr") || {}).textContent, count: r.querySelector(".hp").textContent,
        cut: r.querySelector(".hn").scrollWidth > r.querySelector(".hn").clientWidth + 1 })) })));
    let rl = await rowsOf();
    const fin = rl.find((x) => x.t === "Most bought across FPL");
    chk(fin && fin.r.length && fin.r.every((x, i) => x.name === MO.fpl.in[i].name && x.pos === MO.fpl.in[i].pos && x.price === "(£" + (MO.fpl.in[i].price / 10).toFixed(1) + "m)" &&
          !/£/.test(x.count) && /\d/.test(x.count)),
        w + "px: each row names the player, his position and today's price in brackets, and ends on how many", JSON.stringify(fin && fin.r[0]));
    const cut = rl.reduce((a, l) => a.concat(l.r.filter((x) => x.cut).map((x) => l.t + ": " + x.name)), []);
    chk(!cut.length, w + "px: no row is cut short", cut.join(" | "));
    await p.click('#mkPos [data-pos="2"]'); await p.waitForTimeout(400);
    const want = MO.fpl.byPos ? MO.fpl.in.filter((x) => x.type === 2).slice(0, 8).map((x) => x.name) : null;
    rl = await rowsOf();
    const fd = rl.find((x) => x.t === "Most bought across FPL");
    chk(MO.fpl.byPos ? (fd && J(fd.r.map((x) => x.name)) === J(want) && fd.r.every((x) => x.pos === "DEF"))
                     : (!fd && await p.evaluate(() => /lists by position are kept from later weeks/.test(document.querySelector("section.view.active").textContent))),
        w + "px: DEF keeps FPL's own top defenders, or says plainly when the week was kept before lists by position", MO.fpl.byPos ? J(fd && fd.r.map((x) => x.name)) : "kept before");
    await p.selectOption("#mkGwSel", String(lockedGw)); await p.waitForTimeout(500);
    const ML = K.market(raw.dataset, lockedGw);
    rl = await rowsOf();
    const gb = rl.find((x) => x.t === "Bought by Game On");
    chk(gb && J(gb.r.map((x) => x.name)) === J(ML.go.bought.filter((x) => x.type === 2).slice(0, 8).map((x) => x.name)) && gb.r.every((x) => x.pos === "DEF"),
        w + "px: the filter holds across weeks, and Game On's buys by position are its own top eight", J(gb && gb.r.slice(0, 3)));
    chk(!rl.find((x) => x.t === "Most bought across FPL") && await p.evaluate(() => /lists by position are kept from later weeks/.test(document.querySelector("section.view.active").textContent)),
        w + "px: a week kept before lists by position says so for FPL's, rather than showing a partial list");
    await p.click('#mkPos [data-pos="all"]'); await p.waitForTimeout(300);
    chk(!er.length, w + "px: no JS errors", er.join(" | "));
    await c.close();
  }
  await b.close(); srv.close(); console.log(fails ? "FAILS: " + fails : "ALL OK"); process.exit(fails ? 1 : 0);
})();
