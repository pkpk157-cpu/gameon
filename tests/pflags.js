const GOENV = require("./lib/env.js");
/* Who is hurt, banned or a doubt. The marks themselves are the easy part; what
   this is really for is the two rules underneath them — that a fit player draws
   absolutely nothing, and that a flag never appears over a gameweek the reader
   is looking back at, because FPL publishes today's news and nothing else. */
const { chromium } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP, PORT = 8795, ME = 1255976;
const FL = GOENV.STATES + "/player-flags.json";
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".svg":"image/svg+xml", ".webp":"image/webp", ".png":"image/png" };
let DATA = FL, BODY = null;
const srv = http.createServer((q, r) => { let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  if (u === "/data.json" && BODY) {
    r.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }); r.end(BODY); return;
  }
  const f = u === "/data.json" ? DATA : path.join(APP, u);
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { "content-type": T[path.extname(f)] || "text/plain", "cache-control": "no-store" }); r.end(b); }); });
let fails = 0; const chk = (ok, m, x) => { console.log((ok ? "  ok   " : "  FAIL ") + m + (x ? "  " + x : "")); if (!ok) fails++; };

// what the marks on screen say, card by card
const cards = (p) => p.evaluate(() => [...document.querySelectorAll(".pcard[data-el]")].map(c => {
  const f = c.querySelector(".pflag"), n = c.querySelector(".pname");
  const lv = (e) => e ? ["out", "major", "minor"].filter(k => e.classList.contains(k))[0] || null : null;
  const tri = f && f.querySelector("svg > path");
  return {
    el: +c.getAttribute("data-el"),
    mark: lv(f),
    tint: n && n.classList.contains("flagged") ? lv(n) : null,
    // solid for a man who is out, hollow for a doubt. The paint decides it,
    // not the width: stroke-width stays 1 whether or not a stroke is drawn.
    solid: tri ? (getComputedStyle(tri).stroke === "none" && getComputedStyle(tri).fill !== "none") : null,
    label: f ? f.getAttribute("aria-label") : null,
    spills: (() => { if (!f) return false;
      const a = f.getBoundingClientRect(), b = c.getBoundingClientRect();
      return a.left < b.left - 1 || a.right > b.right + 1 || a.bottom > b.bottom + 1; })()
  };
}));

async function open(w, hash) {
  const ctx = await BROWSER.newContext({ viewport: { width: w || 390, height: 900 }, deviceScaleFactor: 2, isMobile: (w || 390) < 560, hasTouch: true, serviceWorkers: "block", colorScheme: "dark", reducedMotion: "reduce" });
  await ctx.addInitScript((me) => { try { localStorage.setItem("go12.me", JSON.stringify(me)); } catch (e) {} }, ME);
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.goto("http://127.0.0.1:" + PORT + "/index.html#" + (hash || ("profile/" + ME)), { waitUntil: "domcontentloaded" });
  await p.waitForSelector(".pcard", { timeout: 20000 });
  await p.waitForTimeout(700);
  return { ctx, p, errs };
}
let BROWSER = null;

(async () => {
  await new Promise(r => srv.listen(PORT, r));
  BROWSER = await chromium.launch({ executablePath: GOENV.CHROME });
  const ds = JSON.parse(fs.readFileSync(FL, "utf8")).dataset;

  /* --- what is drawn matches what the data says, card for card ----------- */
  {
    const { ctx, p, errs } = await open(390);
    const rows = await cards(p);
    // the level each card should be showing, worked out from the file rather
    // than from the page, so this checks the app against its source
    const want = await p.evaluate(() => {
      const K = window.GO_COMPUTE, d = window.GO_STORE.dataset();
      const gws = K.squadGws(d), gw = gws[gws.length - 1];
      const out = {};
      [...document.querySelectorAll(".pcard[data-el]")].forEach(c => {
        const el = +c.getAttribute("data-el");
        const a = K.availability(d, el, gw);
        out[el] = a ? a.level : null;
      });
      return out;
    });
    chk(rows.length >= 11, "a full pitch to look at", String(rows.length));
    const wrongMark = rows.filter(r => r.mark !== want[r.el]);
    chk(wrongMark.length === 0, "every card carries exactly the mark its player's flag calls for",
      JSON.stringify(wrongMark.slice(0, 3)));
    const wrongTint = rows.filter(r => r.tint !== want[r.el]);
    chk(wrongTint.length === 0, "and the name bar takes the same colour as the mark",
      JSON.stringify(wrongTint.slice(0, 3)));
    const fit = rows.filter(r => !want[r.el]);
    chk(fit.length > 0 && fit.every(r => !r.mark && !r.tint),
      "a fit player draws nothing at all — " + fit.length + " of " + rows.length + " cards untouched");
    // FPL leaves news on players who have recovered; "a" with 100% is not news
    const stale = Object.keys(ds.flags).filter(el => ds.flags[el][0] === "a");
    chk(stale.length > 0 && stale.every(el => !want[+el]),
      "news left on a man who is fit again flags nobody", stale.join(","));
    const marked = rows.filter(r => r.mark);
    chk(marked.length > 0 && marked.every(r => !r.spills), "no mark spills out of its card",
      JSON.stringify(marked.filter(r => r.spills)));
    chk(marked.every(r => r.label && /: /.test(r.label)), "each mark says who and what, for a screen reader",
      JSON.stringify(marked.map(r => r.label).slice(0, 3)));
    chk(errs.length === 0, "no page errors", errs.join(" | "));
    await ctx.close();
  }

  /* --- the bands, and the shape that carries them ------------------------ */
  {
    const { ctx, p, errs } = await open(390);
    const bands = await p.evaluate(() => {
      const K = window.GO_COMPUTE, d = window.GO_STORE.dataset();
      const gws = K.squadGws(d), gw = gws[gws.length - 1];
      // put one of each straight to the function rather than hunting a squad
      const el = Object.keys(d.flags)[0];
      const one = (f) => { d.flags[el] = f; const a = K.availability(d, +el, gw); return a ? a.level : null; };
      const keep = d.flags[el].slice();
      const r = {
        injured:   one(["i", 0, 0, "x", null]),
        suspended: one(["s", null, null, "x", null]),
        zero:      one(["d", 0, 0, "x", null]),
        c25:       one(["d", 25, 25, "x", null]),
        c50:       one(["d", 50, 50, "x", null]),
        c75:       one(["d", 75, 75, "x", null]),
        doubtOnly: one(["d", null, null, "x", null]),
        fit:       one(["a", 100, 100, "", null]),
        unknown:   one(["u", null, null, "x", null])
      };
      d.flags[el] = keep;
      return r;
    });
    chk(bands.injured === "out" && bands.suspended === "out" && bands.zero === "out" &&
        bands.unknown === "out", "injured, suspended, out and unavailable all read as out", JSON.stringify(bands));
    chk(bands.c25 === "major" && bands.c50 === "major", "25% and 50% are the middle band");
    chk(bands.c75 === "minor" && bands.doubtOnly === "minor", "75%, and a doubt with no number, are the light one");
    chk(bands.fit === null, "a fit player has no band at all");
    const rows = (await cards(p)).filter(r => r.mark);
    const outs = rows.filter(r => r.mark === "out"), doubts = rows.filter(r => r.mark !== "out");
    chk(!outs.length || outs.every(r => r.solid === true), "out is drawn solid",
      JSON.stringify(outs.map(r => r.solid)));
    chk(!doubts.length || doubts.every(r => r.solid === false), "a doubt is drawn hollow — colour alone is not a state",
      JSON.stringify(doubts.map(r => r.solid)));
    chk(errs.length === 0, "bands: no page errors", errs.join(" | "));
    await ctx.close();
  }

  /* --- looking back: today's news says nothing about an old pitch --------- */
  {
    const { ctx, p, errs } = await open(390);
    const back = await p.evaluate(() => {
      const K = window.GO_COMPUTE, d = window.GO_STORE.dataset();
      const gws = K.squadGws(d), latest = gws[gws.length - 1];
      const older = gws.filter(g => +g < +latest);
      const el = +Object.keys(d.flags).filter(e => d.flags[e][0] !== "a")[0];
      return { latest: latest, older: older,
               now: !!K.availability(d, el, latest),
               then: older.map(g => !!K.availability(d, el, g)) };
    });
    chk(back.older.length > 0, "there are earlier gameweeks to look back at", JSON.stringify(back.older));
    chk(back.now === true, "a flag shows over the squad owned now");
    chk(back.then.every(x => x === false),
      "and over none of the earlier ones — a knock in September says nothing about August",
      JSON.stringify(back.then));
    chk(errs.length === 0, "looking back: no page errors", errs.join(" | "));
    await ctx.close();
  }

  /* --- the banner across the player's sheet ------------------------------ */
  {
    const { ctx, p, errs } = await open(390);
    await p.evaluate(() => { const f = document.querySelector(".pcard .pflag"); if (f) f.closest(".pcard").click(); });
    await p.waitForTimeout(700);
    const bar = await p.evaluate(() => {
      const b = document.querySelector(".pflagbar");
      if (!b) return null;
      const modal = b.closest("#modalBack") || document.querySelector("#modalBack");
      const who = document.querySelector(".bdwho");
      return { level: ["out", "major", "minor"].filter(k => b.classList.contains(k))[0],
               text: b.textContent, hasIcon: !!b.querySelector("svg"),
               aboveName: !!who && (b.compareDocumentPosition(who) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
               fits: b.scrollWidth <= b.clientWidth + 1 };
    });
    chk(!!bar, "the sheet opens with a banner across the top");
    chk(bar && bar.aboveName, "above the player's name, where the official app puts it");
    chk(bar && bar.hasIcon && /\S/.test(bar.text), "carrying the mark and what FPL actually said", bar && bar.text);
    chk(bar && /FPL said so/.test(bar.text),
      "and when FPL said it — a fortnight-old knock is not this morning's", bar && bar.text);
    chk(bar && bar.fits, "the banner does not overflow");
    // a fit player's sheet has none
    await p.evaluate(() => { const c = document.querySelector("#modalBack .mclose, #modalBack [aria-label='Close']"); if (c) c.click(); });
    await p.waitForTimeout(400);
    await p.evaluate(() => {
      const cs = [...document.querySelectorAll(".pcard[data-el]")].filter(c => !c.querySelector(".pflag"));
      if (cs[0]) cs[0].click();
    });
    await p.waitForTimeout(700);
    chk(await p.evaluate(() => !document.querySelector(".pflagbar")), "a fit player's sheet has no banner");
    chk(errs.length === 0, "banner: no page errors", errs.join(" | "));
    await ctx.close();
  }

  /* --- it fits, and data without flags is the app as it was --------------- */
  for (const w of [320, 390, 768]) {
    const { ctx, p, errs } = await open(w);
    const rows = await cards(p);
    chk(rows.filter(r => r.mark).every(r => !r.spills), w + ": no mark spills out of its card");
    chk(await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1),
      w + ": the pitch does not widen the page");
    if (w === 390) await p.screenshot({ path: path.join(GOENV.OUT, "pflags.png") });
    chk(errs.length === 0, w + ": no page errors", errs.join(" | "));
    await ctx.close();
  }
  {
    // Data published before any of this existed. Built here by taking the key
    // back out, rather than by serving the repo's own data.json and trusting it
    // not to have one: the moment the updater published flags, that control
    // stopped being a control and this failed for the wrong reason.
    const bare = JSON.parse(fs.readFileSync(FL, "utf8"));
    delete bare.dataset.flags;
    BODY = JSON.stringify(bare);
    const { ctx, p, errs } = await open(390);
    const rows = await cards(p);
    chk(rows.length >= 11 && rows.every(r => !r.mark && !r.tint),
      "data with no flags key: not one mark, and every name bar as it was", String(rows.length));
    chk(await p.evaluate(() => !document.querySelector(".pflagbar")), "...and no banner anywhere");
    chk(errs.length === 0, "no flags: no page errors", errs.join(" | "));
    BODY = null;
    await ctx.close();
  }

  await BROWSER.close(); srv.close();
  console.log(fails ? fails + " FAILURES" : "all ok");
  process.exit(fails ? 1 : 0);
})();
