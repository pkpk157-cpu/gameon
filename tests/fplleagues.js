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
    chk(row("KPMG").href === "#fpl/c/4" && !row("KPMG").ext, "another classic league opens inside the app, not on FPL's site", row("KPMG").href);
    chk(row("Nivs Buoys H2H").href === "#fpl/h/22" && !row("Nivs Buoys H2H").ext, "a head-to-head league opens inside the app too", row("Nivs Buoys H2H").href);
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

  // 5. a league, inside the app
  {
    const gameOnMate = ds.managers.find((m) => m.id !== ME).id;
    const mk = (n, start, meAt, h2h, total) => Array.from({ length: n }, (_, i) => {
      const rank = start + i, isMe = rank === meAt;
      const e = isMe ? ME : (rank === start + 1 && start === 1 ? gameOnMate : 9000000 + rank);
      const o = { entry: e, entry_name: isMe ? meName : (rank === 3 ? "<b onclick=alert(1)>Bold FC</b>" : "Team " + rank), player_name: "Manager " + rank,
        rank, last_rank: rank + (rank % 3 === 0 ? 2 : rank % 3 === 1 ? -1 : 0), total: total - rank * 3, event_total: 40 + (rank % 17) };
      if (h2h) Object.assign(o, { matches_won: 5, matches_drawn: 1, matches_lost: 2, points_for: 500 - rank });
      return o;
    });
    const standings = (u) => {
      const m = decodeURIComponent(u).match(/leagues-(classic|h2h)\/(\d+)\/standings\/\?page_standings=(\d+)/);
      if (!m) return null;
      const kind = m[1], id = +m[2], page = +m[3];
      if (id === 5) return { league: { id, name: "Aravalli" }, standings: { has_next: false, page, results: mk(33, 1, 21, false, 600) } };
      if (id === 11) {
        if (page === 1 || page === 2) return { league: { id, name: "India" }, standings: { has_next: true, page, results: mk(50, (page - 1) * 50 + 1, 0, false, 900) } };
        if (page === 689) return { league: { id, name: "India" }, standings: { has_next: true, page, results: mk(50, 34401, 34402, false, 600) } };
      }
      if (id === 22) return { league: { id, name: "Nivs Buoys H2H" }, standings: { has_next: false, page, results: mk(8, 1, 6, true, 24) } };
      return { league: { id, name: "?" }, standings: { has_next: false, page, results: [] } };
    };
    let standDown = false;
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
    await ctx.addInitScript(({ me }) => { try { localStorage.setItem("go12.me", String(me)); localStorage.setItem("go12.theo", "off"); } catch (e) {} }, { me: ME });
    const p = await ctx.newPage(); const errs = [], sreq = [];
    p.on("pageerror", (e) => errs.push(e.message));
    await p.route((u) => /leagues-(classic|h2h)/.test(decodeURIComponent(u.toString())) || (/fantasy\.premierleague\.com(%2F|\/)api(%2F|\/)entry(%2F|\/)\d+(%2F|\/)?($|[^a-z])/i.test(decodeURIComponent(u.toString())) && !/history|event|transfers/.test(decodeURIComponent(u.toString()))), (route) => {
      const u = route.request().url(), d = decodeURIComponent(u);
      if (/leagues-/.test(d)) {
        sreq.push(d.replace(/^.*leagues-/, "leagues-"));
        if (standDown) return route.fulfill({ status: 503, body: "down" });
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(standings(u)) });
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ENTRY) });
    });
    await p.goto("http://127.0.0.1:" + PORT + "/index.html#fpl", { waitUntil: "domcontentloaded" });
    await p.waitForSelector('section.view[data-view="fpl"] .flrow', { timeout: 20000 });
    const readStand = () => p.evaluate(() => {
      const host = document.querySelector('section.view[data-view="fpl"]');
      const tables = [...host.querySelectorAll("table.flstand")];
      const rows = (t) => t ? [...t.querySelectorAll("tbody tr")].map((tr) => ({ me: tr.classList.contains("me"), entry: tr.getAttribute("data-entry"),
        cells: [...tr.children].map((td) => td.innerText.replace(/\s+/g, " ").trim()), move: (tr.querySelector(".flm") || {}).className })) : [];
      return { hash: location.hash, title: document.querySelector("#barTitle").textContent, sub: document.querySelector("#barSub").textContent,
        heads: tables[0] ? [...tables[0].querySelectorAll("th")].map((x) => x.textContent) : [], tables: tables.map(rows),
        labels: [...host.querySelectorAll(".lab-sm")].map((x) => x.textContent), more: !!host.querySelector("#flsMore"),
        callout: (host.querySelector(".callout") || {}).textContent || "", note: (host.querySelector(".note") || {}).textContent || "",
        bold: !!host.querySelector("table.flstand b[onclick]"), wide: document.documentElement.scrollWidth > innerWidth + 1 };
    });
    await p.evaluate(() => { [...document.querySelectorAll(".flrow")].find((a) => a.querySelector(".fln").textContent === "Aravalli").click(); });
    await p.waitForSelector("table.flstand tbody tr", { timeout: 15000 }).catch(() => {});
    let r = await readStand();
    chk(r.hash === "#fpl/c/5", "tapping a league opens it inside the app", r.hash);
    chk(r.title === "Aravalli" && /^You're 21st/.test(r.sub), "the bar names the league and your place", r.title + " / " + r.sub);
    chk(r.heads.join("|") === "#|Team|GW|Total", "a classic league: rank, team, gameweek points, total", r.heads.join("|"));
    chk(r.tables.length === 1 && r.tables[0].length === 33, "everyone in the league is listed", r.tables[0] && r.tables[0].length);
    const meRow = (r.tables[0] || []).find((x) => x.me);
    chk(meRow && meRow.cells[0].indexOf("21") === 0 && meRow.cells[1].indexOf(meName) !== -1, "your row is lit, at your rank", meRow && meRow.cells.join(" | "));
    chk(/up|down|same/.test((r.tables[0][2] || {}).move || ""), "each rank carries its movement", (r.tables[0][2] || {}).move);
    chk(!r.bold && (r.tables[0][2] || {}).cells[1].indexOf("<b onclick") !== -1, "a team name is text, never markup", (r.tables[0][2] || {}).cells[1]);
    chk(!r.wide, "fits the phone");
    const mate = (r.tables[0] || []).find((x) => x.entry);
    chk(!!mate && +mate.entry === gameOnMate && (r.tables[0] || []).filter((x) => x.entry).length <= 2, "a Game On manager's row opens their profile", mate && mate.entry);
    const teamRows = await p.evaluate(() => [...document.querySelectorAll("table.flstand tr[data-team]")].length);
    chk(teamRows === 33 - (r.tables[0] || []).filter((x) => x.entry).length, "every other row opens that team", teamRows);
    await p.evaluate((e) => document.querySelector('table.flstand tr[data-entry="' + e + '"] td.num').click(), gameOnMate);
    await p.waitForTimeout(500);
    chk(await p.evaluate(() => location.hash) === "#profile/" + gameOnMate, "and tapping it does", await p.evaluate(() => location.hash));
    await p.goBack(); await p.waitForTimeout(600);
    await p.evaluate(() => document.querySelector("#barBack").click()); await p.waitForTimeout(500);
    chk(await p.evaluate(() => location.hash) === "#fpl", "back from a league is the list of leagues", await p.evaluate(() => location.hash));
    // a huge league: the top fifty, and your own place above them
    const before = sreq.length;
    await p.evaluate(() => { [...document.querySelectorAll(".flrow")].find((a) => a.querySelector(".fln").textContent === "India").click(); });
    await p.waitForSelector("table.flstand tbody tr", { timeout: 15000 }).catch(() => {});
    await p.waitForTimeout(300);
    r = await readStand();
    const asked = sreq.slice(before).map((x) => +(x.match(/page_standings=(\d+)/) || [])[1]).sort((a, b) => a - b);
    chk(JSON.stringify(asked) === "[1,689]", "a huge league asks for page one and your page, nothing else", JSON.stringify(asked));
    chk(r.labels.join("|") === "Your place|From the top" && r.tables.length === 2 && r.tables[0].length === 1 && r.tables[0][0].me && r.tables[0][0].cells[0].indexOf("34,402") === 0,
      "your place shows above the top of the table", JSON.stringify(r.tables[0] && r.tables[0][0]));
    chk(r.tables[1].length === 50 && r.more, "the top fifty, with more to come", r.tables[1].length);
    chk(/^You're 34,402nd/.test(r.sub), "the bar reads your rank in full", r.sub);
    await p.click("#flsMore"); await p.waitForFunction(() => document.querySelectorAll("table.flstand")[1] && document.querySelectorAll("table.flstand")[1].querySelectorAll("tbody tr").length === 100, null, { timeout: 15000 }).catch(() => {});
    r = await readStand();
    chk(r.tables[1] && r.tables[1].length === 100 && r.tables[1][99].cells[0].indexOf("100") === 0, "Show the next 50 adds the next fifty, in order", r.tables[1] && r.tables[1].length);
    await p.evaluate(() => { location.hash = "#fpl"; }); await p.waitForTimeout(400);
    // a head-to-head league
    await p.evaluate(() => { [...document.querySelectorAll(".flrow")].find((a) => a.querySelector(".fln").textContent === "Nivs Buoys H2H").click(); });
    await p.waitForSelector("table.flstand tbody tr", { timeout: 15000 }).catch(() => {});
    r = await readStand();
    chk(r.heads.join("|") === "#|Team|W-D-L|Score|Pts" && r.tables[0].length === 8, "a head-to-head league: the record, points scored and league points", r.heads.join("|"));
    chk((r.tables[0].find((x) => x.me) || { cells: [] }).cells[2] === "5-1-2", "with your record on your row", JSON.stringify(r.tables[0].find((x) => x.me)));
    // a team from outside Game On, opened from a league
    await p.evaluate(() => { location.hash = "#fpl/c/5"; }); await p.waitForTimeout(400);
    const teamReq = [];
    const H = require(GOENV.APP + "/tests/audit/harness.js").loadCompute();
    const gwNow = H.ds.pitchGw, donor = H.ds.managers.find((m) => H.ds.picks[gwNow] && H.ds.picks[gwNow][m.id]).id;
    const dsq = H.ds.picks[gwNow][donor], dh = H.ds.history[donor][gwNow];
    const ENTRY4 = { id: 9000004, name: "Team 4", player_first_name: "Manager", player_last_name: "Four" };
    // the donor's own season, as FPL's history would give it, with a hit and
    // an overall rank of its own in the newest week
    const hrows = Object.keys(H.ds.history[donor]).map(Number).filter((g) => g <= gwNow).sort((x, y) => x - y);
    const HIST = { current: hrows.map((g) => { const r = H.ds.history[donor][g];
        return { event: g, points: r.p, total_points: r.t, rank: 1, overall_rank: g === gwNow ? 123456 : (r.r || 1), bank: r.bk, value: r.v,
          event_transfers: r.tr || 0, event_transfers_cost: g === gwNow ? 4 : (r.h || 0), points_on_bench: r.b }; }),
      past: [{ season_name: "2019/20", total_points: 2100, rank: 54321 }], chips: (H.ds.chips[donor] || []).map((c) => ({ name: c.n, event: c.gw })) };
    const picksFor = (g) => { const q = (H.ds.picks[g] || {})[donor] || dsq;
      return { active_chip: q.c || null, automatic_subs: [], entry_history: { event: g },
        picks: q.p.map((t, i) => ({ element: t[0], position: i + 1, multiplier: t[1], is_captain: !!t[2], is_vice_captain: !!t[3] })) }; };
    let teamDown = false;
    await p.route((u) => /entry(%2F|\/)900000[0-9](%2F|\/)/.test(u.toString()) || /entry\/900000[0-9]\//.test(decodeURIComponent(u.toString())), (route) => {
      const d = decodeURIComponent(route.request().url()); teamReq.push(d.replace(/^.*\/api/, ""));
      if (teamDown) return route.fulfill({ status: 503, body: "down" });
      const pm = /\/event\/(\d+)\/picks\//.exec(d);
      if (pm) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(picksFor(+pm[1])) });
      if (/\/history\//.test(d)) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(HIST) });
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ENTRY4) });
    });
    await p.evaluate(() => document.querySelector('table.flstand tr[data-team="9000004"]').click());
    await p.waitForSelector('section.view[data-view="fpl"] .pitchcard .pcard', { timeout: 20000 }).catch(() => {});
    const readTeam = () => p.evaluate(() => {
      const host = document.querySelector('section.view[data-view="fpl"]');
      const tiles = {}; host.querySelectorAll(".snapgrid .pc").forEach((pc) => { tiles[pc.querySelector(".pcl").textContent] = { v: pc.querySelector(".pcv").textContent, s: (pc.querySelector(".pcs") || {}).textContent || "" }; });
      const st = [...host.querySelectorAll(".pstats .pstat")].map((x) => ({ v: x.querySelector(".v").textContent, l: x.querySelector(".l").textContent.replace(/\s+/g, " ").trim(),
        team: x.getAttribute("data-team"), entry: x.getAttribute("data-entry") }));
      const sel = host.querySelector("#fltGwSel");
      return { hash: location.hash, title: document.querySelector("#barTitle").textContent, sub: document.querySelector("#barSub").textContent,
        cards: host.querySelectorAll(".pitchcard .pcard[data-el]").length, tiles, st, bgw: (host.querySelector("[data-bgw]") || { getAttribute: () => null }).getAttribute("data-bgw"),
        gws: sel ? [...sel.options].map((o) => +o.value) : [], gw: sel ? +sel.value : null,
        metric: (host.querySelector(".pseg button.on") || {}).textContent || "",
        cmp: getComputedStyle(document.querySelector("#cmpMe")).display !== "none" && getComputedStyle(document.querySelector("#barPills")).display !== "none",
        rival: getComputedStyle(document.querySelector("#rvToggle")).display !== "none",
        wide: document.documentElement.scrollWidth > innerWidth + 1 };
    });
    let tm = await readTeam();
    chk(tm.hash === "#fpl/team/9000004", "tapping someone in a league opens their team in the app", tm.hash);
    chk(tm.title === "Team 4" && tm.sub === "Manager Four", "the bar names the team and its manager", tm.title + " / " + tm.sub);
    chk(tm.cards === 15 && +tm.bgw === gwNow && tm.gw === gwNow, "all fifteen on the pitch, newest gameweek first", tm.cards + " / GW" + tm.gw);
    chk(JSON.stringify(tm.gws) === JSON.stringify(hrows), "the gameweek picker offers every week the team has played", tm.gws.join(","));
    // the figures, by the app's own functions over the same overlay
    const toHist = {}; HIST.current.forEach((c) => { toHist[c.event] = { p: c.points, h: c.event_transfers_cost || 0, b: c.points_on_bench || 0, t: c.total_points, v: c.value || 0, bk: c.bank || 0, tr: c.event_transfers || 0, r: c.overall_rank || 0 }; });
    const sqOf = (g) => { const q = picksFor(g); return { c: q.active_chip || "", p: q.picks.map((x) => [x.element, x.multiplier, x.is_captain ? 1 : 0, x.is_vice_captain ? 1 : 0]) }; };
    const ovOf = (gs) => { const sq = {}; gs.forEach((g) => { sq[g] = sqOf(g); }); return H.C.fplOverlay(H.ds, { id: 9000004, name: "Team 4", player: "Manager Four", at: 1, hist: toHist, past: [], chips: [], squads: sq }); };
    let ov = ovOf([gwNow]);
    const pit = H.C.managerPitch(ov, 9000004, gwNow), sum = H.C.extSummary(ov, 9000004), fg = H.C.fplGwFigures(H.ds, gwNow);
    const nf = (v) => v == null ? "—" : v.toLocaleString("en-GB");
    chk(tm.st.length === 3 && tm.st[0].l === "FPL average" && tm.st[0].v === nf(fg.average), "beside the points: FPL's average for the week", JSON.stringify(tm.st[0]) + " vs " + fg.average);
    chk(tm.st[1].v === nf(pit.net) && /^Total Pts\s*−4$/.test(tm.st[1].l), "the week's points net of the hit, the hit shown", JSON.stringify(tm.st[1]) + " vs " + pit.net);
    chk(/^FPL highest/.test(tm.st[2].l) && tm.st[2].v === nf(fg.highest), "and FPL's highest", JSON.stringify(tm.st[2]));
    chk((tm.tiles.Total || {}).v === nf(sum.total), "the season total, by the rule Compare uses", JSON.stringify(tm.tiles.Total) + " vs " + sum.total);
    chk((tm.tiles["Overall rank"] || {}).v === "123,456" && (tm.tiles["Overall rank"] || {}).s === "after GW" + gwNow && !tm.wide, "overall rank, and it fits the phone", JSON.stringify(tm.tiles["Overall rank"]));
    chk(tm.cmp && !tm.rival, "the bar offers Compare, as a profile does", tm.cmp + "/" + tm.rival);
    chk(teamReq.length === 3, "three small requests: the team, its season and the week's squad", JSON.stringify(teamReq));
    // Ownership and Value, as on a profile
    await p.evaluate(() => [...document.querySelectorAll('section.view[data-view="fpl"] .pseg button')].find((x) => x.getAttribute("data-metric") === "eo").click());
    tm = await readTeam();
    chk(tm.metric === "Ownership" && tm.st[0].l === "Game On avg" && tm.st[0].v === pit.leagueAvgEo + "%" && tm.st[1].v === pit.avgEo + "%", "Ownership: Game On's, and labelled so", JSON.stringify(tm.st));
    await p.evaluate(() => [...document.querySelectorAll('section.view[data-view="fpl"] .pseg button')].find((x) => x.getAttribute("data-metric") === "pts").click());
    // an earlier week: one more request, and its own squad
    const gPrev = hrows.length > 1 ? hrows[hrows.length - 2] : null;
    if (gPrev) {
      const n0 = teamReq.length;
      await p.selectOption("#fltGwSel", String(gPrev));
      await p.waitForFunction((g) => { const b2 = document.querySelector('section.view[data-view="fpl"] [data-bgw]'); return b2 && +b2.getAttribute("data-bgw") === g; }, gPrev, { timeout: 15000 }).catch(() => {});
      tm = await readTeam();
      ov = ovOf([gwNow, gPrev]);
      const pp = H.C.managerPitch(ov, 9000004, gPrev), fp = H.C.fplGwFigures(H.ds, gPrev);
      chk(tm.cards === 15 && tm.gw === gPrev && teamReq.length === n0 + 1 && /\/event\/\d+\/picks\//.test(teamReq[teamReq.length - 1]), "an earlier week: one request, and that week's squad", tm.gw + " / " + (teamReq.length - n0));
      chk(tm.st[1].v === nf(pp.net) && tm.st[0].v === nf(fp.average), "with that week's points and FPL's average for it", JSON.stringify(tm.st) + " vs " + pp.net + "/" + fp.average);
      await p.selectOption("#fltGwSel", String(gwNow)); await p.waitForTimeout(300);
      chk(teamReq.length === n0 + 1, "going back to a week already read asks nothing", teamReq.length - n0);
    }
    // Compare with you
    await p.evaluate(() => document.querySelector("#cmpMe").click());
    await p.waitForSelector("#cmpBox .cmphead", { timeout: 15000 }).catch(() => {});
    await p.waitForFunction(() => document.querySelectorAll("#cmpBox .cmppitch .col")[1] && document.querySelectorAll("#cmpBox .cmppitch .col")[1].querySelectorAll(".pcard[data-el]").length === 15, null, { timeout: 15000 }).catch(() => {});
    const cmp = await p.evaluate(() => ({ hash: location.hash, a: document.querySelector("#cmpA").value, b: document.querySelector("#cmpB").value,
      names: [...document.querySelectorAll("#cmpBox .cmphead .nm")].map((n) => ({ t: n.textContent, team: n.getAttribute("data-team"), entry: n.getAttribute("data-entry") })),
      scores: [...document.querySelectorAll("#cmpBox .cmphead .sc")].map((n) => n.textContent),
      rows: [...document.querySelectorAll("#cmpBox table.cmptable:not(.seasons) tbody tr")].map((r) => [...r.children].map((c) => c.firstChild ? c.firstChild.textContent : "")),
      bcards: document.querySelectorAll("#cmpBox .cmppitch .col")[1] ? document.querySelectorAll("#cmpBox .cmppitch .col")[1].querySelectorAll(".pcard[data-el]").length : 0,
      wide: document.documentElement.scrollWidth > innerWidth + 1 }));
    const R = H.C.compare(ovOf(gPrev ? [gwNow, gPrev] : [gwNow]), ME, 9000004, gwNow);
    const label = (n) => (cmp.rows.find((r) => r[1] === n) || []);
    chk(cmp.hash === "#compare" && cmp.b === "Team 4 — Manager Four" && cmp.a.indexOf(meName) === 0, "Compare opens with you against the team", cmp.a + " vs " + cmp.b);
    chk(cmp.names[1] && cmp.names[1].team === "9000004" && !cmp.names[1].entry, "its name opens it from FPL, not as a Game On profile", JSON.stringify(cmp.names[1]));
    chk(cmp.scores[1] === nf(R.b.gwPts) && cmp.scores[0] === nf(R.a.gwPts), "the week's points on both sides, by the same rule", cmp.scores.join(" v ") + " vs " + R.a.gwPts + " v " + R.b.gwPts);
    chk(cmp.bcards === 15, "its squad on the pitch beside yours", cmp.bcards);
    chk(label("Season total")[2] === nf(R.b.total) && R.b.total === sum.total, "its season total is the team page's", JSON.stringify(label("Season total")) + " vs " + R.b.total);
    chk(label("Overall rank")[2] === "123,456" && !label("League position").length, "FPL's overall rank in place of a Game On position it does not have", JSON.stringify(label("Overall rank")));
    chk(!label("Badges").length && !cmp.wide, "no Game On badges claimed for it, and it fits the phone");
    await p.evaluate(() => document.querySelector("#barBack").click()); await p.waitForTimeout(500);
    chk(await p.evaluate(() => location.hash) === "#fpl/team/9000004", "back from Compare is the team it was opened from", await p.evaluate(() => location.hash));
    await p.waitForSelector('section.view[data-view="fpl"] .pitchcard .pcard', { timeout: 5000 }).catch(() => {});
    await p.evaluate(() => document.querySelector('section.view[data-view="fpl"] .pitchcard .pcard[data-el]').click()); await p.waitForTimeout(500);
    chk(/^#player\/\d+\/\d+$/.test(await p.evaluate(() => location.hash)), "a player on the pitch opens his page", await p.evaluate(() => location.hash));
    await p.goBack(); await p.waitForTimeout(500);
    await p.evaluate(() => document.querySelector("#barBack").click()); await p.waitForTimeout(500);
    chk(await p.evaluate(() => location.hash) === "#fpl/c/5", "back from a team is the league it was opened from", await p.evaluate(() => location.hash));
    const tr0 = teamReq.length;
    await p.evaluate(() => document.querySelector('table.flstand tr[data-team="9000004"]').click());
    await p.waitForSelector('section.view[data-view="fpl"] .pitchcard .pcard', { timeout: 5000 }).catch(() => {});
    chk(teamReq.length === tr0, "opening it again inside a few minutes asks FPL nothing", (teamReq.length - tr0) + " requests");
    teamDown = true;
    await p.evaluate(() => { location.hash = "#fpl/c/5"; }); await p.waitForTimeout(300);
    await p.evaluate(() => document.querySelector('table.flstand tr[data-team="9000007"]').click());
    await p.waitForFunction(() => /could not be read/.test((document.querySelector('section.view[data-view="fpl"] .callout') || {}).textContent || ""), null, { timeout: 90000 }).catch(() => {});
    chk(await p.evaluate(() => /could not be read/.test((document.querySelector('section.view[data-view="fpl"] .callout') || {}).textContent || "") && !!document.querySelector("#fltRetry")),
      "a team FPL cannot give: said plainly, with Try again");
    await p.evaluate(() => { location.hash = "#fpl/h/22"; }); await p.waitForTimeout(400);
    // the second visit is drawn at once, without asking FPL again
    const n1 = sreq.length;
    await p.evaluate(() => { location.hash = "#fpl"; }); await p.waitForTimeout(300);
    await p.evaluate(() => { location.hash = "#fpl/c/5"; }); await p.waitForTimeout(400);
    r = await readStand();
    chk(r.tables[0] && r.tables[0].length === 33 && sreq.length === n1, "opening it again inside a few minutes is instant and asks FPL nothing", (sreq.length - n1) + " requests");
    // FPL down on a league never opened
    standDown = true;
    await p.evaluate(() => { location.hash = "#fpl/c/4"; });
    await p.waitForFunction(() => /could not be reached/.test((document.querySelector('section.view[data-view="fpl"] .callout') || {}).textContent || ""), null, { timeout: 90000 }).catch(() => {});
    r = await readStand();
    chk(/could not be reached/.test(r.callout) && !r.tables.length, "FPL down on a league never opened: said plainly, with Try again", r.callout.slice(0, 40));
    chk(!errs.length, "no JS errors", errs.join(" | "));
    await ctx.close();
    // opened straight from a saved link, before the list of leagues is in:
    // your rank is learnt from it, and your place still shows
    standDown = false;
    const ctx2 = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, serviceWorkers: "block" });
    await ctx2.addInitScript(({ me }) => { try { localStorage.setItem("go12.me", String(me)); localStorage.setItem("go12.theo", "off"); } catch (e) {} }, { me: ME });
    const p2 = await ctx2.newPage(); const errs2 = [];
    p2.on("pageerror", (e) => errs2.push(e.message));
    await p2.route((u) => /fantasy/.test(decodeURIComponent(u.toString())), (route) => {
      const d = decodeURIComponent(route.request().url());
      if (/leagues-/.test(d)) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(standings(route.request().url())) });
      if (/entry\/\d+\/$/.test(d)) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ENTRY) });
      return route.abort();
    });
    await p2.goto("http://127.0.0.1:" + PORT + "/index.html#fpl/c/11", { waitUntil: "domcontentloaded" });
    await p2.waitForFunction(() => [...document.querySelectorAll(".lab-sm")].some((x) => x.textContent === "Your place"), null, { timeout: 20000 }).catch(() => {});
    const d2 = await p2.evaluate(() => ({ labels: [...document.querySelectorAll('section.view[data-view="fpl"] .lab-sm')].map((x) => x.textContent), sub: document.querySelector("#barSub").textContent }));
    chk(d2.labels.indexOf("Your place") !== -1 && /34,402nd/.test(d2.sub), "a league opened straight from a link still finds your place", JSON.stringify(d2));
    chk(!errs2.length, "no JS errors", errs2.join(" | "));
    await ctx2.close();
  }

  // 5. FPL's highest scorer of a finished week opens: an outside team from
  // FPL, a Game On manager as his profile; and back returns to the team
  {
    const H = require(GOENV.APP + "/tests/audit/harness.js").loadCompute();
    const done = H.ds.bootstrap.events.filter((e) => e.finished && e.id <= H.ds.pitchGw).map((e) => e.id);
    const gA = done[done.length - 1], gB = done[done.length - 2];
    const ours = H.ds.managers[3].id;
    const raw = JSON.parse(fs.readFileSync(path.join(APP, "data.json"), "utf8"));
    raw.dataset.bootstrap.events.forEach((e) => {
      if (e.id === gA) { e.highest = 131; e.highestEntry = 9000005; }
      if (e.id === gB) { e.highest = 127; e.highestEntry = ours; }
      if (!e.finished) { e.highest = 77; e.highestEntry = 9000006; }   // a week still on: not shown
    });
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, serviceWorkers: "block" });
    await ctx.addInitScript(({ me }) => { try { localStorage.setItem("go12.me", String(me)); localStorage.setItem("go12.theo", "off"); } catch (e) {} }, { me: ME });
    const p = await ctx.newPage(); const errs = [];
    p.on("pageerror", (e) => errs.push(e.message));
    await p.route(/data\.json/, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(raw) }));
    const donor = H.ds.managers.find((m) => H.ds.picks[gA] && H.ds.picks[gA][m.id] && H.ds.history[m.id][gB]).id;
    await p.route((u) => /fantasy/.test(decodeURIComponent(u.toString())), (route) => {
      const d = decodeURIComponent(route.request().url()), id = +((/entry\/(\d+)\//.exec(d) || [])[1]);
      const pm = /\/event\/(\d+)\/picks\//.exec(d);
      if (pm) { const q = (H.ds.picks[+pm[1]] || {})[donor] || H.ds.picks[gA][donor];
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ active_chip: q.c || null, picks: q.p.map((t, i) => ({ element: t[0], position: i + 1, multiplier: t[1], is_captain: !!t[2], is_vice_captain: !!t[3] })) }) }); }
      if (/\/history\//.test(d)) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ current: Object.keys(H.ds.history[donor]).map(Number).filter((g) => g <= H.ds.pitchGw).map((g) => { const r = H.ds.history[donor][g];
        return { event: g, points: r.p, total_points: r.t, overall_rank: r.r || 1, bank: r.bk, value: r.v, event_transfers: r.tr || 0, event_transfers_cost: r.h || 0, points_on_bench: r.b }; }), past: [], chips: [] }) });
      if (/entry\/\d+\/$/.test(d)) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(id === ME ? ENTRY : { id, name: "Team " + (id % 10), player_first_name: "Manager", player_last_name: String(id % 10) }) });
      return route.abort();
    });
    await p.goto("http://127.0.0.1:" + PORT + "/index.html#fpl/team/9000004", { waitUntil: "domcontentloaded" });
    const hi = async (g) => {
      if (g) { await p.waitForSelector("#fltGwSel", { timeout: 20000 }).catch(() => {}); await p.selectOption("#fltGwSel", String(g));
        await p.waitForFunction((x) => { const b2 = document.querySelector('section.view[data-view="fpl"] [data-bgw]'); return b2 && +b2.getAttribute("data-bgw") === x; }, g, { timeout: 15000 }).catch(() => {}); }
      else await p.waitForSelector('section.view[data-view="fpl"] .pstats', { timeout: 20000 }).catch(() => {});
      return p.evaluate(() => { const x = [...document.querySelectorAll('section.view[data-view="fpl"] .pstats .pstat')][2];
        return x ? { v: x.querySelector(".v").textContent, l: x.querySelector(".l").textContent, team: x.getAttribute("data-team"), entry: x.getAttribute("data-entry") } : null; });
    };
    let x = await hi(null);
    // the week the page opens on: one still being played has no highest yet;
    // between a finalised week and the next deadline it is that finished week
    if (!(H.ds.bootstrap.events.find((e) => e.id === H.ds.pitchGw) || {}).finished)
      chk(x && x.v === "—" && !x.team && !x.entry, "a week still being played shows no FPL highest, and links nowhere", JSON.stringify(x));
    else
      chk(x && x.v === "131" && x.team === "9000005" && !x.entry, "the latest week, finalised, shows FPL's highest and opens that team", JSON.stringify(x));
    x = await hi(gA);
    chk(x && x.v === "131" && x.team === "9000005" && /›/.test(x.l), "a finished week: FPL's highest, linked to that team", JSON.stringify(x));
    await p.evaluate(() => [...document.querySelectorAll('section.view[data-view="fpl"] .pstats .pstat')][2].click());
    await p.waitForFunction(() => location.hash === "#fpl/team/9000005", null, { timeout: 5000 }).catch(() => {});
    chk(await p.evaluate(() => location.hash) === "#fpl/team/9000005", "tapping it opens that team", await p.evaluate(() => location.hash));
    await p.waitForSelector('section.view[data-view="fpl"] .pitchcard .pcard', { timeout: 20000 }).catch(() => {});
    await p.evaluate(() => document.querySelector("#barBack").click()); await p.waitForTimeout(500);
    chk(await p.evaluate(() => location.hash) === "#fpl/team/9000004", "and back is the team it was tapped on", await p.evaluate(() => location.hash));
    x = await hi(gB);
    chk(x && x.v === "127" && x.entry === String(ours) && !x.team, "a Game On manager at the top opens as his profile", JSON.stringify(x));
    chk(!errs.length, "no JS errors", errs.join(" | "));
    await ctx.close();
  }

  await b.close(); srv.close();
  console.log(fails ? "\n" + fails + " FAILURES" : "\nevery league in one place");
  process.exit(fails ? 1 : 0);
})();
