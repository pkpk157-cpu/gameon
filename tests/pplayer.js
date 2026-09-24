const GOENV = require("./lib/env.js");
/* A footballer's own page. The sheet answers what he scored; this answers
   whether to own him, so it is a page with an address rather than a sheet over
   whatever you were looking at. What is worth checking is that the numbers on
   it are the numbers in the data, that the rating column survives the width of
   a phone, and that data published before any of this existed still draws a
   page rather than a mess. */
const { chromium } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP, PORT = 8796, ME = 1255976;
const FULL = GOENV.STATES + "/player-page.json";
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".svg":"image/svg+xml", ".webp":"image/webp", ".png":"image/png" };

const base = JSON.parse(fs.readFileSync(FULL, "utf8"));
// the same data as published before today: no form, no points per match, no
// difficulty on any fixture
const older = JSON.parse(JSON.stringify(base));
Object.keys(older.dataset.elements).forEach((el) => { older.dataset.elements[el].length = 8; });
Object.keys(older.dataset.gwFixtures).forEach((gw) =>
  older.dataset.gwFixtures[gw].forEach((f) => { f.length = 9; }));

let BODY = JSON.stringify(base);
const srv = http.createServer((q, r) => { let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  if (u === "/data.json") { r.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }); r.end(BODY); return; }
  fs.readFile(path.join(APP, u), (e, b) => { if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { "content-type": T[path.extname(u)] || "text/plain", "cache-control": "no-store" }); r.end(b); }); });
let fails = 0; const chk = (ok, m, x) => { console.log((ok ? "  ok   " : "  FAIL ") + m + (x ? "  " + x : "")); if (!ok) fails++; };

const ds = base.dataset;
// a forward who has played, so every part of the page has something to draw
const EL = Object.keys(ds.elements).filter((k) => ds.elements[k][1] === 4)
  .sort((a, b) => ds.elements[b][3] - ds.elements[a][3])[0];

const look = (p) => p.evaluate(() => {
  const txt = (s) => { const e = document.querySelector(s); return e ? e.textContent.trim() : null; };
  const boxes = [...document.querySelectorAll(".pprbox")].map(x => ({
    lab: x.querySelector(".pprl").textContent.replace(/\s+/g, " ").trim(),
    val: x.querySelector(".pprv").textContent.trim(),
    sub: x.querySelector(".pprs").textContent.replace(/\s+/g, " ").trim(),
    // where the number sits, so four boxes can be checked for sitting level
    valTop: Math.round(x.querySelector(".pprv").getBoundingClientRect().top),
    clipped: [".pprl", ".pprv", ".pprs"].filter(sel => {
      const e = x.querySelector(sel); return e && e.scrollWidth > e.clientWidth + 1; }).join(",")
  }));
  const head = document.querySelector(".pphead");
  const rail = document.querySelector(".pprwrap");
  return {
    pos: txt(".ppos"), name: txt(".ppwho h2"), club: txt(".ppclub"),
    face: !!(head && head.querySelector(".face")),
    crest: !!(head && head.querySelector(".ppclub .crest")),
    boxes: boxes,
    railScrolls: !!rail && rail.scrollWidth > rail.clientWidth + 1,
    strip: [...document.querySelectorAll(".pstcell")].map(c => ({
      gw: c.querySelector(".pstgw").textContent, next: c.classList.contains("next"),
      fdr: !!c.querySelector(".fdr"), val: c.querySelector(".pstv").textContent.trim() })),
    bar: { title: txt("#barTitle"), sub: txt("#barSub"),
           back: !!document.querySelector("#barBack") && document.querySelector("#barBack").style.display !== "none" },
    tabs: [...document.querySelectorAll("[data-pp]")].map(b => b.getAttribute("data-pp") + (b.classList.contains("on") ? "*" : "")),
    wide: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  };
});
const rows = (p) => p.evaluate(() => [...document.querySelectorAll("#ppPanel tbody tr")].filter(r => !r.classList.contains("ppexp")).map(r => {
  const c = [...r.children].map(td => td.textContent.trim());
  const fdr = r.querySelector(".fdr");
  return { cells: c, gw: r.getAttribute("data-ppgw"),
           fdr: fdr ? fdr.textContent.trim() : null,
           // the rating is the point of the tab: it must be on the card
           fdrSeen: fdr ? (fdr.getBoundingClientRect().right <= r.closest(".card").getBoundingClientRect().right + 1
                           && fdr.getBoundingClientRect().width > 0) : null };
}));

async function open(b, hash, w, waitFor) {
  const ctx = await b.newContext({ viewport: { width: w || 390, height: 1100 }, deviceScaleFactor: 2, isMobile: (w || 390) < 560, hasTouch: true, serviceWorkers: "block", colorScheme: "dark", reducedMotion: "reduce" });
  await ctx.addInitScript((me) => { try { localStorage.setItem("go12.me", JSON.stringify(me)); } catch (e) {} }, ME);
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.goto("http://127.0.0.1:" + PORT + "/index.html#" + hash, { waitUntil: "domcontentloaded" });
  await p.waitForSelector(waitFor || ".pphead, .callout", { timeout: 20000 });
  await p.waitForTimeout(600);
  return { ctx, p, errs };
}

(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  const meta = ds.elements[EL];
  console.log("  player: " + meta[0] + " (" + EL + ")");

  /* --- the page, against the data behind it ------------------------------ */
  {
    const { ctx, p, errs } = await open(b, "player/" + EL);
    const r = await look(p);
    chk(r.name === meta[5], "his full name, as the data spells it", r.name + " vs " + meta[5]);
    chk(r.pos === "Forward", "his position", r.pos);
    chk(r.face && r.crest, "a face and a club crest");
    chk((r.club || "").indexOf((ds.teamNames || {})[meta[2]] || meta[2]) !== -1, "his club in full", r.club);
    // the four numbers, each against the data behind it
    const labs = ["Total points", "Price", "Owned by FPL", "Owned by GO"];
    chk(r.boxes.length === 4, "four boxes in the rail", JSON.stringify(r.boxes.map(x => x.lab)));
    chk(r.boxes.map(x => x.lab).join("|") === labs.join("|"),
      "in the order asked for", r.boxes.map(x => x.lab).join(" | "));
    chk(r.bar.title === meta[0] && /Forward/.test(r.bar.sub || ""),
      "the bar carries him, so the page never repeats it", r.bar.title + " / " + r.bar.sub);
    chk(r.bar.back, "and a way back");
    chk(r.boxes[1].val === "\u00a3" + (meta[3] / 10).toFixed(1), "the price the data holds", r.boxes[1].val);
    chk(r.boxes[2].val === meta[4].toFixed(1) + "%" && r.boxes[2].sub === "of all squads",
      "FPL's ownership", r.boxes[2].val + " / " + r.boxes[2].sub);
    const sums = await p.evaluate((el) => {
      const d = window.GO_STORE.dataset(), lp = d.livePoints || {};
      let t = 0; Object.keys(lp).forEach(g => { const v = lp[g][el]; if (typeof v === "number") t += v; });
      const own = window.GO_COMPUTE.leagueOwnership(d);
      return { total: t, count: own ? (own.count[el] || 0) : 0, managers: own ? own.managers : 0,
               goPct: own && own.pct[el] != null ? own.pct[el] : null };
    }, +EL);
    chk(r.boxes[0].val === String(sums.total), "total points is every gameweek we hold, added up",
      r.boxes[0].val + " vs " + sums.total);
    chk(r.boxes[0].sub === (meta[9]).toFixed(1) + " per match",
      "with FPL's own points per match under it, not ours", r.boxes[0].sub);
    chk(r.boxes[3].val === (sums.goPct == null ? "\u2013" : sums.goPct.toFixed(1) + "%"),
      "how much of this league owns him", r.boxes[3].val);
    chk(r.boxes[3].sub === sums.count + " of " + sums.managers,
      "and how many that actually is", r.boxes[3].sub);
    // the complaint that started this: crowded boxes, text running together
    chk(r.boxes.every(x => !x.clipped), "nothing in a box is trimmed",
      JSON.stringify(r.boxes.filter(x => x.clipped)));
    chk(new Set(r.boxes.map(x => x.valTop)).size === 1,
      "and all four numbers sit level, whatever the label above them did",
      JSON.stringify(r.boxes.map(x => x.valTop)));
    // the page's blocks are the same distance apart all the way down, the tab
    // switch included \u2014 it is not a card, and the card rhythm used to skip it
    const gaps = await p.evaluate(() => {
      const view = document.querySelector('.view[data-view="player"]');
      const rs = [...view.children].filter(e => e.getBoundingClientRect().height > 0).map(e => e.getBoundingClientRect());
      return rs.slice(1).map((r, i) => Math.round(r.top - rs[i].bottom));
    });
    chk(gaps.length >= 3 && new Set(gaps).size === 1, "every block the same distance from the next", gaps.join(","));
    chk(await p.evaluate(() => !document.querySelector(".pstnote")), "no caption under the strip");
    // the columns: none narrower than its own heading, and the flexible one
    // takes what is left rather than a fixed 150px that belongs to manager names
    const colsOk = await p.evaluate(() => [...document.querySelectorAll("table.pptbl thead th")].every(th => th.scrollWidth <= th.clientWidth + 1));
    chk(colsOk, "no column heading is trimmed");
    chk(errs.length === 0, "no page errors", errs.join(" | "));
    await ctx.close();
  }

  /* --- what he has done, and what is ahead ------------------------------- */
  {
    const { ctx, p, errs } = await open(b, "player/" + EL);
    const r = await look(p);
    const was = r.strip.filter(c => !c.next), next = r.strip.filter(c => c.next);
    chk(was.length > 0 && next.length > 0, "the strip has both halves", JSON.stringify(r.strip.map(c => c.gw)));
    chk(was.every(c => !c.fdr && /pt/.test(c.val)), "what he did is points", JSON.stringify(was.map(c => c.val)));
    chk(next.every(c => c.fdr), "what is ahead is a difficulty rating", JSON.stringify(next.map(c => c.val)));
    // results read against the fixtures behind them
    const rs = await rows(p);
    chk(rs.length > 0, "every gameweek he has played", String(rs.length));
    const gws = rs.map(x => +x.cells[0]);
    chk(gws.every((g, i) => i === 0 || g < gws[i - 1]), "newest first", gws.join(","));
    const club = meta[2];
    let wrong = [];
    rs.forEach(x => {
      const gw = +x.cells[0], sc = x.cells[2];
      if (!sc) return;
      const f = (ds.gwFixtures[gw] || []).filter(y => y[0] === club || y[1] === club)[0];
      if (!f || f[4] == null) return;
      const home = f[0] === club;
      const want = home ? f[4] + " - " + f[5] : f[5] + " - " + f[4];
      if (sc !== want) wrong.push("GW" + gw + " shows " + sc + " want " + want);
    });
    chk(wrong.length === 0, "and his side of every scoreline, the right way round", wrong.join(" | "));
    chk(errs.length === 0, "results: no page errors", errs.join(" | "));
    await ctx.close();
  }

  /* --- a row opens its own breakdown, under it rather than over the page -- */
  {
    const { ctx, p, errs } = await open(b, "player/" + EL);
    const first = await p.evaluate(() => {
      const r = document.querySelector("tr[data-ppgw]");
      return { gw: r.getAttribute("data-ppgw"), pts: r.children[3].textContent.trim() };
    });
    await p.evaluate(() => document.querySelector("tr[data-ppgw]").click());
    await p.waitForTimeout(350);
    const exp = await p.evaluate(() => {
      const e = document.querySelector(".ppexp");
      if (!e) return null;
      const tot = [...e.querySelectorAll(".bdtotal")].map(t => t.textContent.replace(/\s+/g, " ").trim());
      return { forGw: e.getAttribute("data-for"), rows: e.querySelectorAll("tbody tr").length, total: tot[0],
               open: !!document.querySelector("tr[data-ppgw].open") };
    });
    chk(!!exp, "the row opens");
    chk(exp && exp.forGw === first.gw, "on its own gameweek", exp && exp.forGw);
    chk(exp && exp.rows > 1, "with the lines behind the points", exp && String(exp.rows));
    chk(exp && exp.total.indexOf(first.pts.replace("*", "")) !== -1,
      "and a total that agrees with the row it opened from", (exp && exp.total) + " vs " + first.pts);
    chk(exp && exp.open, "the row is marked open");
    // a second row closes the first — one at a time, or the table becomes a wall
    await p.evaluate(() => { const r = [...document.querySelectorAll("tr[data-ppgw]")]; if (r[1]) r[1].click(); });
    await p.waitForTimeout(350);
    chk(await p.evaluate(() => document.querySelectorAll(".ppexp").length) === 1, "opening another closes the first");
    // tapping the open one shuts it
    await p.evaluate(() => { const r = document.querySelector("tr[data-ppgw].open"); if (r) r.click(); });
    await p.waitForTimeout(350);
    chk(await p.evaluate(() => document.querySelectorAll(".ppexp").length) === 0, "tapping it again shuts it");
    chk(errs.length === 0, "expanding: no page errors", errs.join(" | "));
    await ctx.close();
  }

  /* --- the fixtures tab, and its rating column --------------------------- */
  for (const w of [320, 390, 768]) {
    const { ctx, p, errs } = await open(b, "player/" + EL, w);
    await p.click('[data-pp="fixtures"]');
    await p.waitForTimeout(400);
    const rs = await rows(p);
    chk(rs.length > 0, w + ": the fixtures still to play", String(rs.length));
    chk(rs.every(x => x.fdr !== null), w + ": every one rated");
    // the column that kept being pushed off the card
    chk(rs.every(x => x.fdrSeen), w + ": and the rating is on the card, not over its edge",
      JSON.stringify(rs.filter(x => !x.fdrSeen).slice(0, 2)));
    chk(!(await look(p)).wide, w + ": the page does not scroll sideways");
    if (w === 390) await p.screenshot({ path: path.join(GOENV.OUT, "pplayer.png") });
    chk(errs.length === 0, w + ": no page errors", errs.join(" | "));
    await ctx.close();
  }

  /* --- the way in: a tap on a card, landing on that gameweek -------------
     There used to be a sheet between the two, holding a points breakdown and a
     season table — most of what this page does and less of it. The tap comes
     straight here now, and the page opens condensed at the top, every
     gameweek closed, whichever gameweek the card came from. */
  {
    const { ctx, p, errs } = await open(b, "profile/" + ME, 390, ".pcard");
    const tapped = await p.evaluate(() => {
      const c = document.querySelector(".pcard[data-el]");
      const gw = c.closest("[data-bgw]").getAttribute("data-bgw");
      // tapped from the squad, some way down the page
      document.querySelector(".pitch").scrollIntoView({ block: "start" });
      const y = window.scrollY;
      c.click();
      return { el: c.getAttribute("data-el"), gw: gw, y: y };
    });
    await p.waitForSelector(".pphead", { timeout: 15000 });
    await p.waitForTimeout(700);
    const where = await p.evaluate(() => ({
      hash: location.hash,
      page: !!document.querySelector(".pphead"),
      sheet: document.querySelector("#modalBack").classList.contains("show"),
      openRows: document.querySelectorAll("tr[data-ppgw].open").length,
      expanded: document.querySelectorAll(".ppexp").length,
      y: window.scrollY
    }));
    chk(where.page && where.hash === "#player/" + tapped.el + "/" + tapped.gw,
      "a tap on a card opens his page, carrying the gameweek it came from", where.hash);
    chk(!where.sheet, "and no sheet is left over the top of it");
    chk(where.openRows === 0 && where.expanded === 0,
      "condensed: no gameweek opened on arrival", where.openRows + " rows / " + where.expanded + " open");
    chk(where.y < 40, "and the page starts at the top, not scrolled to a row", "scrollY " + where.y);
    // a row still opens on a tap, with its own gameweek's breakdown
    await p.evaluate((gw) => { const r = document.querySelector('tr[data-ppgw="' + gw + '"]'); if (r) r.click(); }, tapped.gw);
    await p.waitForTimeout(300);
    const shown = await p.evaluate(() => {
      const row = document.querySelector("tr[data-ppgw].open");
      const exp = document.querySelector(".ppexp");
      return { forGw: exp && exp.getAttribute("data-for"), rowGw: row && row.getAttribute("data-ppgw"),
               total: exp ? (exp.querySelector(".bdtotal") || {}).textContent : null };
    });
    chk(shown.forGw === tapped.gw && shown.rowGw === tapped.gw,
      "a tap on that gameweek's row opens its breakdown", JSON.stringify(shown));
    chk(!!shown.total && /pts/.test(shown.total), "and it totals", shown.total);
    // back lands where he was tapped, not at the top of the profile
    await p.evaluate(() => document.querySelector("#barBack").click());
    await p.waitForTimeout(700);
    const backAt = await p.evaluate(() => ({ hash: location.hash, y: window.scrollY,
      pitchTop: document.querySelector(".pitch").getBoundingClientRect().top, vh: window.innerHeight }));
    chk(backAt.hash === "#profile/" + ME, "back returns to the profile", backAt.hash);
    chk(tapped.y > 200 && Math.abs(backAt.y - tapped.y) <= 40 && backAt.pitchTop < backAt.vh && backAt.pitchTop > -200,
      "and to the squad, where he was tapped, not the top", "tapped at " + tapped.y + ", back at " + backAt.y + ", pitch top " + Math.round(backAt.pitchTop));
    await p.evaluate((el) => { location.hash = "player/" + el; }, tapped.el);
    await p.waitForSelector(".pphead", { timeout: 15000 });
    await p.waitForTimeout(500);
    // coming back later must not keep reopening that row
    await p.evaluate(() => { location.hash = "classic"; });
    await p.waitForTimeout(500);
    await p.evaluate((el) => { location.hash = "player/" + el; }, tapped.el);
    await p.waitForSelector(".pphead", { timeout: 15000 });
    await p.waitForTimeout(600);
    chk(await p.evaluate(() => document.querySelectorAll(".ppexp").length) === 0,
      "arriving without a gameweek opens nothing");
    // the figures explain themselves
    await p.click("#ppWhat");
    await p.waitForTimeout(400);
    chk(await p.evaluate(() => !!document.querySelector("#modalBack.show")), "and the page says what its figures mean");
    chk(errs.length === 0, "the way in: no page errors", errs.join(" | "));
    await ctx.close();
  }

  /* --- data published before any of this existed -------------------------- */
  {
    BODY = JSON.stringify(older);
    const { ctx, p, errs } = await open(b, "player/" + EL);
    const r = await look(p);
    chk(!!r.name, "older data: the page still draws", r.name);
    chk(r.boxes.length === 4 && r.boxes[0].sub === "this season",
      "older data: the box that cannot know its per-match figure says nothing rather than nought",
      JSON.stringify(r.boxes.map(x => x.sub)));
    chk(r.boxes[2].val !== "\u2013" && r.boxes[3].val !== "\u2013",
      "older data: the two it does know are still shown",
      r.boxes[2].val + " / " + r.boxes[3].val);
    await p.click('[data-pp="fixtures"]');
    await p.waitForTimeout(400);
    const rs = await rows(p);
    chk(rs.length > 0 && rs.every(x => x.fdr === "–"),
      "older data: every rating is a dash, not a nought", JSON.stringify(rs.slice(0, 3).map(x => x.fdr)));
    chk(errs.length === 0, "older data: no page errors", errs.join(" | "));
    BODY = JSON.stringify(base);
    await ctx.close();
  }

  /* --- a player who is not there ----------------------------------------- */
  {
    const { ctx, p, errs } = await open(b, "player/99999");
    chk(await p.evaluate(() => !!document.querySelector(".callout") && !document.querySelector(".pphead")),
      "a player who is not in the data gets a plain answer, not a broken page");
    chk(errs.length === 0, "missing player: no page errors", errs.join(" | "));
    await ctx.close();
  }

  await b.close(); srv.close();
  console.log(fails ? fails + " FAILURES" : "all ok");
  process.exit(fails ? 1 : 0);
})();
