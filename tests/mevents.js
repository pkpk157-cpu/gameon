const GOENV = require("./lib/env.js");
/* Match events under the score: who scored, who set them up, who was booked.
   The things worth checking are the ones a reader could catch us out on — that
   the names under a score add up to it, that an own goal is counted for the
   side it counted for and said to be one, and that a match page with no events
   in its data looks exactly as it did before any of this existed. */
const { chromium } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP, PORT = 8794, ME = 1255976;
const EV = GOENV.STATES + "/match-events.json";
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".svg":"image/svg+xml", ".webp":"image/webp", ".png":"image/png" };
let DATA = EV, BODY = null;
const srv = http.createServer((q, r) => { let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  if (u === "/data.json" && BODY) {
    r.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }); r.end(BODY); return;
  }
  const f = u === "/data.json" ? DATA : path.join(APP, u);
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { "content-type": T[path.extname(f)] || "text/plain", "cache-control": "no-store" }); r.end(b); }); });
let fails = 0; const chk = (ok, m, x) => { console.log((ok ? "  ok   " : "  FAIL ") + m + (x ? "  " + x : "")); if (!ok) fails++; };

// what the published data says about each match, read straight from the file,
// so the page is checked against the source and not against itself
const ds = JSON.parse(fs.readFileSync(EV, "utf8")).dataset;
const picked = { first: null, og: null, brace: null, cards: null, mismatch: null, none: null };
Object.keys(ds.gwEvents).forEach((gw) => (ds.gwEvents[gw] || []).forEach((ev, i) => {
  const f = ds.gwFixtures[gw][i], tag = gw + "/" + f[0] + "-" + f[1];
  if (!ev) { if (!picked.none && f[2]) picked.none = tag; return; }
  if (!picked.first) picked.first = tag;
  if (!picked.og && ev.some(e => e[1] === "o")) picked.og = tag;
  if (!picked.brace && ev.some(e => e[1] === "g" && e[3] > 1)) picked.brace = tag;
  if (!picked.cards && ev.some(e => e[1] === "y") && ev.some(e => e[1] === "r")) picked.cards = tag;
  let h = 0, a = 0;
  ev.forEach(e => { if (e[1] === "g") e[0] === 0 ? h += e[3] : a += e[3];
                    if (e[1] === "o") e[0] === 0 ? a += e[3] : h += e[3]; });
  if (!picked.mismatch && (h !== f[4] || a !== f[5])) picked.mismatch = tag;
}));

const look = (p) => p.evaluate(() => {
  const card = document.querySelector(".card.mev");
  if (!card) return { card: false };
  const sides = [...card.querySelectorAll(".mevside")].map(s => [...s.querySelectorAll(".mevrow")].map(r => ({
    kind: [...r.classList].filter(c => ["g","a","y","r","pm","ps"].indexOf(c) !== -1)[0],
    og: r.classList.contains("og"),
    mine: r.classList.contains("mine"),
    name: (r.querySelector(".who") || {}).textContent,
    x: (r.querySelector(".mevx") || {}).textContent || "",
    tag: (r.querySelector(".mevt") || {}).textContent || "",
    owned: (r.querySelector(".mevo") || {}).textContent || "",
    el: r.getAttribute("data-el"),
    // anything the box could not hold — both halves, not whichever is there
    clipped: [".who", ".mevt", ".mevx"].filter((sel) => {
      const w = r.querySelector(sel);
      return !!w && w.scrollWidth > w.clientWidth + 1;
    }).join(",")
  })));
  const score = document.querySelector(".card.mhead");
  const seg = document.querySelector(".psegrow");
  return {
    card: true,
    // under the score, above the metric picker — where it was asked for
    underScore: !!score && (score.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
    aboveSeg: !!seg && (card.compareDocumentPosition(seg) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
    home: sides[0] || [], away: sides[1] || [],
    note: (card.querySelector(".mevnote") || {}).textContent || "",
    cardFills: [...card.querySelectorAll("svg.evcard")].map(s => s.getAttribute("class")),
    fits: card.scrollWidth <= document.documentElement.clientWidth + 1,
    heading: (card.querySelector(".mevhd") || {}).textContent
  };
});

async function open(b, tag, w, opts) {
  const ctx = await b.newContext(Object.assign({ viewport: { width: w || 390, height: 900 }, deviceScaleFactor: 2, isMobile: (w || 390) < 560, hasTouch: true, serviceWorkers: "block", colorScheme: "dark", reducedMotion: "reduce" }, opts || {}));
  await ctx.addInitScript((me) => { try { if (me) localStorage.setItem("go12.me", JSON.stringify(me)); else localStorage.clear(); } catch (e) {} }, (opts && opts.me === null) ? null : ME);
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.goto("http://127.0.0.1:" + PORT + "/index.html#pl/" + tag, { waitUntil: "domcontentloaded" });
  await p.waitForSelector(".card.mhead", { timeout: 20000 });
  await p.waitForTimeout(500);
  return { ctx, p, errs };
}
const goalsIn = (list) => list.filter(r => r.kind === "g").reduce((n, r) => n + (r.x ? +r.x.replace(/\D/g, "") : 1), 0);
const scoreOf = (tag) => { const [gw, pair] = tag.split("/"); const [h, a] = pair.split("-");
  const f = ds.gwFixtures[gw].filter(x => x[0] === h && x[1] === a)[0]; return { h: f[4], a: f[5] }; };

(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  console.log("  matches: " + JSON.stringify(picked));
  chk(picked.first && picked.og && picked.brace && picked.cards && picked.mismatch,
    "the fixture has a match of each kind to check", JSON.stringify(picked));

  /* --- every match that tallies, tallies on screen too ------------------- */
  {
    const { ctx, p, errs } = await open(b, picked.first);
    const r = await look(p);
    chk(r.card, "the events card is there");
    chk(r.heading === "Match events", "titled Match events", r.heading);
    chk(r.underScore && r.aboveSeg, "sitting under the score and above the metric picker",
      JSON.stringify({ underScore: r.underScore, aboveSeg: r.aboveSeg }));
    const s = scoreOf(picked.first);
    chk(goalsIn(r.home) === s.h && goalsIn(r.away) === s.a,
      "the names under the score add up to it", goalsIn(r.home) + "-" + goalsIn(r.away) + " vs " + s.h + "-" + s.a);
    chk(!/do not add up/.test(r.note), "no caveat where none is needed");
    chk(/who, not when/.test(r.note), "and it says plainly that there are no minutes", r.note);
    chk(errs.length === 0, "no page errors", errs.join(" | "));
    await ctx.close();
  }

  /* --- an own goal counts for the other side, and says so ---------------- */
  {
    const { ctx, p, errs } = await open(b, picked.og);
    const r = await look(p);
    const og = r.home.concat(r.away).filter(x => x.og);
    chk(og.length === 1, "exactly one own goal on the page", String(og.length));
    chk(og[0] && og[0].tag === "o.g.", "marked o.g. so nobody reads it as a transfer", og[0] && og[0].tag);
    chk(og[0] && og[0].kind === "g", "and counted as a goal");
    // the man who put it in plays for the other side, so he must be listed
    // under the side he scored FOR, not the one he plays for
    const [gw, pair] = picked.og.split("/"); const [hh, aa] = pair.split("-");
    const raw = ds.gwEvents[gw][ds.gwFixtures[gw].findIndex(x => x[0] === hh && x[1] === aa)];
    const ogEl = raw.filter(e => e[1] === "o")[0];
    const ogSide = ogEl[0] === 0 ? "home" : "away", shownIn = r.home.some(x => x.og) ? "home" : "away";
    chk(ogSide !== shownIn, "listed under the side it counted for, not the side he plays for",
      "plays " + ogSide + ", listed " + shownIn);
    const s = scoreOf(picked.og);
    chk(goalsIn(r.home) === s.h && goalsIn(r.away) === s.a,
      "and the score still adds up with it counted", goalsIn(r.home) + "-" + goalsIn(r.away) + " vs " + s.h + "-" + s.a);
    chk(errs.length === 0, "no page errors", errs.join(" | "));
    await ctx.close();
  }

  /* --- a brace, both cards, both penalties ------------------------------- */
  {
    const { ctx, p, errs } = await open(b, picked.brace);
    const r = await look(p);
    const two = r.home.concat(r.away).filter(x => x.x);
    chk(two.length === 1 && /2/.test(two[0].x), "a brace is one row saying ×2, not two rows", JSON.stringify(two));
    chk(errs.length === 0, "brace: no page errors", errs.join(" | "));
    await ctx.close();
  }
  {
    const { ctx, p, errs } = await open(b, picked.cards);
    const r = await look(p);
    const all = r.home.concat(r.away);
    chk(all.some(x => x.kind === "y") && all.some(x => x.kind === "r"), "a booking of each colour",
      all.map(x => x.kind).join(","));
    chk(r.cardFills.some(c => /\by\b/.test(c)) && r.cardFills.some(c => /\br\b/.test(c)),
      "each drawn as a filled card of its own colour", r.cardFills.join(" | "));
    chk(all.some(x => x.kind === "pm" && x.tag === "pen missed"), "a missed penalty says so",
      JSON.stringify(all.filter(x => x.kind === "pm")));
    chk(all.some(x => x.kind === "ps" && x.tag === "pen saved"), "a saved one says so",
      JSON.stringify(all.filter(x => x.kind === "ps")));
    chk(all.every(x => !x.clipped), "and no label is trimmed to nonsense",
      JSON.stringify(all.filter(x => x.clipped)));
    chk(errs.length === 0, "cards: no page errors", errs.join(" | "));
    await ctx.close();
  }

  /* --- when it does not add up, say so ----------------------------------- */
  {
    const { ctx, p, errs } = await open(b, picked.mismatch);
    const r = await look(p);
    const s = scoreOf(picked.mismatch);
    chk(goalsIn(r.home) !== s.h || goalsIn(r.away) !== s.a, "this one genuinely does not add up",
      goalsIn(r.home) + "-" + goalsIn(r.away) + " vs " + s.h + "-" + s.a);
    chk(/do not add up|a few minutes late/.test(r.note),
      "so the page says which way it is rather than leaving the reader to wonder", r.note);
    chk(errs.length === 0, "mismatch: no page errors", errs.join(" | "));
    await ctx.close();
  }

  /* --- the league's own angle -------------------------------------------- */
  {
    const { ctx, p, errs } = await open(b, picked.first);
    const r = await look(p);
    const owned = r.home.concat(r.away).filter(x => x.owned);
    chk(owned.length > 0, "how many of us owned him, beside the name", JSON.stringify(owned.slice(0, 3)));
    chk(owned.every(x => +x.owned > 0 && +x.owned <= ds.managers.length),
      "and never more than there are managers", String(ds.managers.length));
    chk(new RegExp("our " + ds.managers.length).test(r.note), "which the note explains", r.note);
    // tapping a row opens that player's breakdown, as a squad row does
    await p.click(".mevrow[data-el]");
    await p.waitForTimeout(600);
    chk(await p.evaluate(() => !!document.querySelector("#modalBack.show")), "tapping an event opens the player breakdown");
    chk(errs.length === 0, "ownership: no page errors", errs.join(" | "));
    await ctx.close();
  }
  {
    // nobody has said who they are: no row is anyone's, and nothing breaks
    const { ctx, p, errs } = await open(b, picked.first, 390, { me: null });
    const r = await look(p);
    chk(r.card && r.home.concat(r.away).every(x => !x.mine), "nameless: nothing is highlighted as yours");
    chk(errs.length === 0, "nameless: no page errors", errs.join(" | "));
    await ctx.close();
  }

  /* --- it fits, at every width ------------------------------------------- */
  for (const w of [320, 390, 768]) {
    const { ctx, p, errs } = await open(b, picked.cards, w);
    const r = await look(p);
    chk(r.fits, w + ": the card does not widen the page");
    chk(r.home.concat(r.away).every(x => !x.clipped), w + ": nothing is trimmed to nonsense",
      JSON.stringify(r.home.concat(r.away).filter(x => x.clipped)));
    if (w === 390) await p.screenshot({ path: path.join(GOENV.OUT, "mevents.png") });
    chk(errs.length === 0, w + ": no page errors", errs.join(" | "));
    await ctx.close();
  }

  /* --- a match with no events, and a dataset with none at all ------------- */
  if (picked.none) {
    const { ctx, p, errs } = await open(b, picked.none);
    const r = await look(p);
    chk(!r.card, "a match with nothing to report shows no card at all", picked.none);
    chk(errs.length === 0, "empty match: no page errors", errs.join(" | "));
    await ctx.close();
  }
  {
    // Data published before any of this existed. Built here by taking the key
    // back out, rather than by serving the repo's own data.json and trusting it
    // not to have one: the moment the updater published events, that control
    // stopped being a control and this failed for the wrong reason.
    const bare = JSON.parse(fs.readFileSync(EV, "utf8"));
    delete bare.dataset.gwEvents;
    BODY = JSON.stringify(bare);
    const { ctx, p, errs } = await open(b, picked.first);
    const r = await look(p);
    chk(!r.card, "data with no events at all: the page is exactly as it was");
    chk(await p.evaluate(() => !!document.querySelector(".mcols") && !!document.querySelector(".psegrow")),
      "...squads and metric picker still there");
    chk(errs.length === 0, "no events: no page errors", errs.join(" | "));
    BODY = null;
    await ctx.close();
  }

  /* --- the own-goal rule, against the real published data ---------------
     Everything above runs on a made-up fixture, which can only prove the page
     draws what it is given. This proves the rule itself: in FPL's data an own
     goal is credited to the man who put it in, who plays for the other side.
     Every real scoreline has to come out of that — home score = goals by home
     players + own goals by away players — and if FPL ever changed which side
     it files them under, this is what would notice. Skipped where a club plays
     twice in a gameweek, since then a player's club no longer names one match. */
  {
    const real = JSON.parse(fs.readFileSync(path.join(APP, "data.json"), "utf8")).dataset;
    const club = (el) => (real.elements[el] || [])[2];
    const ogs = {};                       // gw -> element -> own goals
    Object.keys(real.breakdown || {}).forEach((gw) => {
      Object.keys(real.breakdown[gw] || {}).forEach((el) => {
        (real.breakdown[gw][el] || []).forEach((r) => {
          if (r[0] === "own_goals" && r[1]) ogs[gw] = Object.assign(ogs[gw] || {}, { [el]: r[1] });
        });
      });
    });
    let checked = 0, withOg = 0, wrong = [];
    Object.keys(real.gwFixtures || {}).forEach((gw) => {
      const fx = real.gwFixtures[gw] || [];
      const plays = {};
      fx.forEach((f) => { plays[f[0]] = (plays[f[0]] || 0) + 1; plays[f[1]] = (plays[f[1]] || 0) + 1; });
      const goals = ((real.liveStats || {})[gw] || {}).g || {};
      fx.forEach((f) => {
        if (!f[3] || f[4] == null || f[5] == null) return;
        if (plays[f[0]] > 1 || plays[f[1]] > 1) return;
        const own = (side) => Object.keys(goals).reduce((n, el) => n + (club(el) === side ? goals[el] : 0), 0);
        const og = (side) => Object.keys(ogs[gw] || {}).reduce((n, el) => n + (club(el) === side ? ogs[gw][el] : 0), 0);
        const h = own(f[0]) + og(f[1]), a = own(f[1]) + og(f[0]);
        checked++;
        if (og(f[0]) || og(f[1])) withOg++;
        if (h !== +f[4] || a !== +f[5]) wrong.push("GW" + gw + " " + f[0] + " " + f[4] + "-" + f[5] + " " + f[1] + " works out " + h + "-" + a);
      });
    });
    chk(checked > 0, "real data: there are finished matches to check against", String(checked));
    chk(withOg > 0, "real data: and some of them turned on an own goal", String(withOg));
    chk(wrong.length === 0, "real data: every scoreline comes out of the own-goal rule",
      wrong.slice(0, 4).join(" | "));
  }

  await b.close(); srv.close();
  console.log(fails ? fails + " FAILURES" : "all ok");
  process.exit(fails ? 1 : 0);
})();
