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
  const fig = [...document.querySelectorAll(".pfig")].map(f => ({
    label: f.querySelector(".pfl").textContent.trim(),
    value: f.querySelector(".pfv").textContent.trim(),
    rank: (f.querySelector(".pfr") || {}).textContent || null
  }));
  const head = document.querySelector(".pphead");
  return {
    pos: txt(".ppos"), name: txt(".ppwho h2"), club: txt(".ppclub"),
    face: !!(head && head.querySelector(".face")),
    crest: !!(head && head.querySelector(".ppclub .crest")),
    price: txt(".ppprice b"), move: txt(".ppmv"),
    figs: fig, rankNote: txt(".pfnote"), go: txt(".pfgo"),
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
    chk(r.price === "£" + (meta[3] / 10).toFixed(1), "the price the data holds", r.price);
    chk(r.bar.title === meta[0] && /Forward/.test(r.bar.sub || ""), "the bar carries him, so the page never repeats it",
      r.bar.title + " / " + r.bar.sub);
    chk(r.bar.back, "and a way back");
    chk(r.figs.length === 3, "three figures", JSON.stringify(r.figs));
    chk(r.figs[0].value === (meta[9]).toFixed(1) && r.figs[1].value === (meta[8]).toFixed(1),
      "points per match and form are FPL's own numbers, not ours",
      JSON.stringify(r.figs.map(f => f.value)) + " vs " + meta[9] + "/" + meta[8]);
    chk(r.figs[2].value === meta[4].toFixed(1) + "%", "and FPL's ownership", r.figs[2].value);
    chk(/Ranking for Forwards/.test(r.rankNote || ""), "which position they rank him in", r.rankNote);
    chk(/of our \d+ own him/.test(r.go || ""), "plus the figure the official app cannot show", r.go);

    // the ranks, worked out here rather than read off the page
    const peers = Object.keys(ds.elements).filter(k => ds.elements[k][1] === 4);
    const rankBy = (slot) => {
      const mine = ds.elements[EL][slot];
      return peers.filter(k => ds.elements[k][slot] > mine).length + 1;
    };
    const want = [rankBy(9) + " of " + peers.length, rankBy(8) + " of " + peers.length, rankBy(4) + " of " + peers.length];
    const got = r.figs.map(f => (f.rank || "").replace(/\s+/g, " ").trim());
    chk(JSON.stringify(got) === JSON.stringify(want), "each rank is where he really stands among forwards",
      JSON.stringify(got) + " vs " + JSON.stringify(want));
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
     straight here now, and because a card is a question about one gameweek,
     it arrives with that gameweek already open. */
  {
    const { ctx, p, errs } = await open(b, "profile/" + ME, 390, ".pcard");
    const tapped = await p.evaluate(() => {
      const c = document.querySelector(".pcard[data-el]");
      const gw = c.closest("[data-bgw]").getAttribute("data-bgw");
      c.click();
      return { el: c.getAttribute("data-el"), gw: gw };
    });
    await p.waitForSelector(".pphead", { timeout: 15000 });
    await p.waitForTimeout(700);
    const where = await p.evaluate(() => ({
      hash: location.hash,
      page: !!document.querySelector(".pphead"),
      sheet: document.querySelector("#modalBack").classList.contains("show"),
      openGw: (document.querySelector("tr[data-ppgw].open") || {}).getAttribute
        ? document.querySelector("tr[data-ppgw].open").getAttribute("data-ppgw") : null,
      expanded: document.querySelectorAll(".ppexp").length
    }));
    chk(where.page && where.hash === "#player/" + tapped.el + "/" + tapped.gw,
      "a tap on a card opens his page, carrying the gameweek it came from", where.hash);
    chk(!where.sheet, "and no sheet is left over the top of it");
    chk(where.openGw === tapped.gw && where.expanded === 1,
      "with that gameweek already open, not left to be found again",
      where.openGw + " / " + where.expanded + " open");
    // and the breakdown shown is that gameweek's, not whichever was newest
    const shown = await p.evaluate(() => {
      const row = document.querySelector("tr[data-ppgw].open");
      const exp = document.querySelector(".ppexp");
      return { forGw: exp && exp.getAttribute("data-for"), rowGw: row && row.getAttribute("data-ppgw"),
               total: exp ? (exp.querySelector(".bdtotal") || {}).textContent : null };
    });
    chk(shown.forGw === tapped.gw && shown.rowGw === tapped.gw,
      "the breakdown belongs to the gameweek tapped", JSON.stringify(shown));
    chk(!!shown.total && /pts/.test(shown.total), "and it totals", shown.total);
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
    chk(r.figs.length === 3 && r.figs[0].value === "–" && r.figs[1].value === "–",
      "older data: the two figures it cannot know say so rather than showing nought",
      JSON.stringify(r.figs.map(f => f.value)));
    chk(r.figs[2].value !== "–", "older data: the one it does know is still shown", r.figs[2].value);
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
