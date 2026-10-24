const GOENV = require("./lib/env.js");
/* FPL in the menu: every league the signed-in manager is in, read from FPL
 * through the app's relay and grouped as FPL's own app groups them. The menu
 * offers it between the Premier League and the Game On tournament, with the
 * lion on FPL's colours. The list comes from one request, is kept on the
 * phone and drawn at once on the next visit; FPL being down is said plainly,
 * a kept list stays with its age, and nothing anyone typed as a league name
 * becomes markup. Without a team chosen, the page asks for one. */
const { chromium } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP, PORT = 8894;
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".svg":"image/svg+xml", ".webp":"image/webp", ".png":"image/png" };
const srv = http.createServer((q, r) => { let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  fs.readFile(path.join(APP, u), (e, b) => { if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { "content-type": T[path.extname(u)] || "text/plain", "cache-control": "no-store" }); r.end(b); }); });
let fails = 0;
const chk = (ok, m, x) => { console.log((ok ? "  ok   " : "  FAIL ") + m + (x !== undefined ? "  " + x : "")); if (!ok) fails++; };

const ds = JSON.parse(fs.readFileSync(path.join(APP, "data.json"), "utf8")).dataset;
const ME = 21743, GAMEON = 478139;
const meName = (ds.managers.find((m) => m.id === ME) || {}).entryName;
// FPL's /entry/{id}/ answer, as it shapes leagues; ranks as in the screenshot
const L = (id, name, type, rank, last, extra) => Object.assign({ id, name, short_name: null, league_type: type, scoring: "c",
  rank_count: 1000, entry_rank: rank, entry_last_rank: last, entry_percentile_rank: 10 }, extra || {});
const ENTRY = { id: ME, name: meName, leagues: {
  classic: [L(9, "Sunday league", "x", 13, 13), L(3, "Eternal FPL", "x", 19, 19), L(GAMEON, "FPL Game On V12", "x", 147, 120),
            L(4, "KPMG", "x", 3, 3), L(5, "Aravalli", "x", 21, 18), L(6, "NMIMS", "x", 7, 7),
            L(7, "Nivs Buoys - Classic", "x", 3, 3), L(8, "SAMHI", "x", 1, 1), L(10, "War Of The Titans", "x", 4, 6),
            L(11, "India", "s", 34402, 30000), L(12, "Gameweek 1", "s", 1563449, 1400000), L(13, "Man City", "s", 101254, 99000),
            L(14, "Adobe Express Badge League", "s", 445693, 400000), L(15, "<img src=x onerror=window.__pwned=1>", "x", 2, 0)],
  h2h: [L(21, "UCL Group E (Game On R1)", "x", 1, 1, { scoring: "h" }), L(22, "Nivs Buoys H2H", "x", 6, 6, { scoring: "h" })],
  cup: {}, cup_matches: [] } };

(async () => {
  await new Promise((r) => srv.listen(PORT, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  const open = async (opts) => {
    const ctx = opts.ctx || await b.newContext({ viewport: { width: opts.w || 390, height: 844 }, isMobile: true, hasTouch: true,
      colorScheme: opts.dark ? "dark" : "light", serviceWorkers: "block" });
    if (!opts.ctx) await ctx.addInitScript(({ me }) => { try { if (me) localStorage.setItem("go12.me", String(me)); localStorage.setItem("go12.theo", "off"); } catch (e) {} }, { me: opts.me === undefined ? ME : opts.me });
    const p = await ctx.newPage(); const errs = []; const hits = [];
    p.on("pageerror", (e) => errs.push(e.message));
    await p.route((u) => /fantasy\.premierleague\.com(%2F|\/)api(%2F|\/)entry(%2F|\/)\d+(%2F|\/)?($|[^a-z])/i.test(decodeURIComponent(u.toString())) && !/history|event|transfers/.test(decodeURIComponent(u.toString())), async (route) => {
      hits.push(route.request().url());
      const mode = opts.mode ? opts.mode(hits.length) : "ok";
      if (opts.delay) await new Promise((r) => setTimeout(r, opts.delay));
      if (mode === "down") return route.fulfill({ status: 503, body: "The game is being updated." });
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ENTRY) });
    });
    await p.goto("http://127.0.0.1:" + PORT + "/index.html#" + (opts.hash || "classic"), { waitUntil: "domcontentloaded" });
    await p.waitForFunction(() => document.querySelector("section.view.active"), null, { timeout: 20000 });
    return { ctx, p, errs, hits };
  };
  const readList = (p) => p.evaluate(() => {
    const host = document.querySelector('section.view[data-view="fpl"]');
    return { groups: [...host.querySelectorAll(".section-title h2")].map((h) => h.textContent),
      rows: [...host.querySelectorAll(".flrow")].map((a) => ({ name: a.querySelector(".fln").textContent, rank: a.querySelector(".flr").textContent,
        move: a.querySelector(".flm").className.replace("flm ", ""), href: a.getAttribute("href"), ext: a.target === "_blank" })),
      note: (host.querySelector(".note") || {}).textContent || "", callout: (host.querySelector(".callout") || {}).textContent || "",
      title: (document.querySelector("#barTitle") || {}).textContent, sub: (document.querySelector("#barSub, .topbar .sub") || {}).textContent,
      wide: document.documentElement.scrollWidth > innerWidth + 1, pwned: !!window.__pwned, imgs: host.querySelectorAll("img").length };
  });

  // 1. the menu, and the page from it
  {
    const { ctx, p, errs, hits } = await open({});
    await p.waitForTimeout(3600);                          // the launch warm-up
    chk(hits.length === 1, "the list is fetched once in the background after launch", hits.length);
    await p.click("#barMenu, #menuBtn, header .menubtn, [aria-label='Menu']").catch(() => {});
    await p.waitForTimeout(400);
    const menu = await p.evaluate(() => [...document.querySelectorAll("#menuBody .menuitem")].map((b) => ({ t: b.querySelector(".mi-t").textContent,
      img: (b.querySelector("img.mi-logo") || {}).getAttribute ? b.querySelector("img.mi-logo").getAttribute("src") : null,
      stops: [...b.querySelectorAll("linearGradient stop")].slice(0, 2).map((s) => s.getAttribute("stop-color")).join(">") })));
    chk(menu.map((m) => m.t).join("|") === "Premier League|FPL|Game On tournament|Game On Voluntary",
      "the menu offers FPL between the Premier League and the Game On tournament", menu.map((m) => m.t).join("|"));
    const f = menu.find((m) => m.t === "FPL") || {}, pl = menu.find((m) => m.t === "Premier League") || {};
    chk(f.img === "fpl-tile.webp" && pl.img === "pl-lion.webp", "the FPL tile has its own art, not the Premier League's", f.img + " vs " + pl.img);
    const loaded = await p.evaluate(() => { const i = document.querySelector('#menuBody img.mi-logo[src="fpl-tile.webp"]'); return !!i && i.complete && i.naturalWidth > 0; });
    chk(loaded, "and the FPL art loads");
    await p.evaluate(() => { const b = [...document.querySelectorAll("#menuBody .menuitem")].find((x) => x.querySelector(".mi-t").textContent === "FPL"); b.click(); });
    await p.waitForTimeout(500);
    chk(await p.evaluate(() => location.hash) === "#fpl", "the FPL item opens the FPL page", await p.evaluate(() => location.hash));
    const r = await readList(p);
    chk(r.title === "FPL" && (r.sub || "").indexOf(meName) !== -1, "the bar says FPL, with the team whose leagues these are", r.title + " / " + r.sub);
    chk(hits.length === 1, "opening it inside a few minutes asks FPL nothing more", hits.length);
    chk(r.groups.join("|") === "Invitational Classic Leagues|Invitational H2H Leagues|General Leagues", "grouped as FPL's app groups them", r.groups.join("|"));
    const inv = r.rows.slice(0, 10).map((x) => x.name);
    const sorted = inv.slice().sort((a, b2) => a.toLowerCase() < b2.toLowerCase() ? -1 : 1);
    chk(JSON.stringify(inv) === JSON.stringify(sorted), "each group in alphabetical order", inv.join(", "));
    const row = (n) => r.rows.find((x) => x.name === n) || {};
    chk(row("Aravalli").rank === "21" && row("Aravalli").move === "down", "Aravalli: 21st, down from 18th", JSON.stringify(row("Aravalli")));
    chk(row("War Of The Titans").move === "up" && row("Eternal FPL").move === "same", "up and unchanged marked as such", row("War Of The Titans").move + "/" + row("Eternal FPL").move);
    chk(row("Gameweek 1").rank === "1,563,449", "big ranks read with separators", row("Gameweek 1").rank);
    chk(row("FPL Game On V12").href === "#classic" && !row("FPL Game On V12").ext, "Game On opens inside the app", row("FPL Game On V12").href);
    chk(row("KPMG").href === "https://fantasy.premierleague.com/leagues/4/standings/c" && row("KPMG").ext, "another classic league opens its standings on FPL", row("KPMG").href);
    chk(row("Nivs Buoys H2H").href === "https://fantasy.premierleague.com/leagues/22/standings/h", "a head-to-head league opens its own standings", row("Nivs Buoys H2H").href);
    const hostile = r.rows.find((x) => /onerror/.test(x.name));
    chk(hostile && !r.pwned && r.imgs === 0, "a league name is text, never markup", hostile && hostile.name);
    chk(hostile && hostile.move === "same", "a league joined since the last gameweek reads as unchanged", hostile && hostile.move);
    chk(/From FPL/.test(r.note) && !r.wide, "says where it came from, and fits the phone", r.note);
    // a fresh launch draws the kept list at once, before FPL answers
    const p2 = await ctx.newPage(); const errs2 = [];
    p2.on("pageerror", (e) => errs2.push(e.message));
    await p2.route(/./, (route) => /entry/.test(decodeURIComponent(route.request().url())) && /fantasy/.test(decodeURIComponent(route.request().url())) && !/history|event|transfers/.test(route.request().url())
      ? new Promise((res) => setTimeout(() => res(route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ENTRY) })), 4000))
      : route.continue());
    await p2.goto("http://127.0.0.1:" + PORT + "/index.html#fpl", { waitUntil: "domcontentloaded" });
    await p2.waitForSelector('section.view[data-view="fpl"] .flrow', { timeout: 2500 }).catch(() => {});
    const quick = await p2.evaluate(() => document.querySelectorAll('section.view[data-view="fpl"] .flrow').length);
    chk(quick === r.rows.length, "next time, the kept list is there at once", quick + " rows within 2.5s");
    chk(!errs.length && !errs2.length, "no JS errors", errs.concat(errs2).join(" | "));
    await ctx.close();
  }

  // 2. FPL down on a first visit, then back
  {
    let down = true;
    const { ctx, p, errs } = await open({ hash: "fpl", mode: () => down ? "down" : "ok" });
    await p.waitForFunction(() => /could not be reached/.test((document.querySelector('section.view[data-view="fpl"] .callout') || {}).textContent || ""), null, { timeout: 90000 }).catch(() => {});
    let r = await readList(p);
    chk(/could not be reached/.test(r.callout) && !r.rows.length, "FPL down on a first visit: said plainly, nothing made up", r.callout.slice(0, 60));
    down = false;
    await p.click("#flRetry"); await p.waitForSelector('section.view[data-view="fpl"] .flrow', { timeout: 30000 }).catch(() => {});
    r = await readList(p);
    chk(r.rows.length === ENTRY.leagues.classic.length + ENTRY.leagues.h2h.length, "Try again brings the list once FPL is back", r.rows.length);
    chk(!errs.length, "no JS errors", errs.join(" | "));
    await ctx.close();
  }

  // 3. a kept list that is old, with FPL down: the list stays, with its age
  {
    const ctx = await b.newContext({ viewport: { width: 320, height: 700 }, isMobile: true, colorScheme: "dark", serviceWorkers: "block" });
    await ctx.addInitScript(({ me, entry }) => { try {
      localStorage.setItem("go12.me", String(me)); localStorage.setItem("go12.theo", "off");
      const slim = (l) => l.map((x) => ({ id: x.id, name: x.name, type: x.league_type, rank: x.entry_rank, last: x.entry_last_rank, size: x.rank_count }));
      localStorage.setItem("go12.fplLeagues", JSON.stringify({ id: me, at: Date.now() - 3 * 3600 * 1000, leagues: { classic: slim(entry.leagues.classic), h2h: slim(entry.leagues.h2h) } }));
    } catch (e) {} }, { me: ME, entry: ENTRY });
    const { p, errs } = await open({ ctx, hash: "fpl", mode: () => "down" });
    await p.waitForFunction(() => /could not be reached/.test((document.querySelector('section.view[data-view="fpl"] .note') || {}).textContent || ""), null, { timeout: 90000 }).catch(() => {});
    const r = await readList(p);
    chk(r.rows.length > 0 && /3h ago/.test(r.note) && /could not be reached/.test(r.note), "an old list stays, with its age and why it is not newer", r.note);
    chk(!r.wide, "a 320px phone in the dark: no sideways scroll");
    chk(!errs.length, "no JS errors", errs.join(" | "));
    await ctx.close();
  }

  // 4. nobody chosen yet
  {
    const { ctx, p, errs, hits } = await open({ me: null, hash: "fpl" });
    await p.waitForTimeout(3600);
    const r = await readList(p);
    chk(/Choose your team/.test(r.callout) && !r.rows.length && hits.length === 0, "with no team chosen it asks for one, and asks FPL nothing", r.callout.slice(0, 50));
    await p.click("#flPick"); await p.waitForTimeout(500);
    chk(await p.evaluate(() => document.querySelector("#youBack").classList.contains("show")), "Choose your team opens the profile sheet to pick it");
    chk(!errs.length, "no JS errors", errs.join(" | "));
    await ctx.close();
  }

  await b.close(); srv.close();
  console.log(fails ? "\n" + fails + " FAILURES" : "\nevery league in one place");
  process.exit(fails ? 1 : 0);
})();
