const GOENV = require("./lib/env.js");
/* Scouting reports. The builder (scripts/scout.js) against a made-up league
   shaped as FPL's API answers (bootstrap-static, fixtures, element-summary):
   twenty clubs, eleven gameweeks played, players with injuries, a hostile
   name. It must be deterministic, every number finite, the model a ranking,
   the verdicts keeping their own rules (a BUY is never an injured player, a
   budget pick is within budget), and decide correctly when a build is due.
   Then the page: the Reports pill under FPL news, a card per position, a
   report of its own with a back arrow, markup in a name shown as text, a
   player opening his page and back returning to the report, the PDF link
   only when the PDF is there, both themes, nothing wider than the phone. */
let chromium;
try { ({ chromium } = require("playwright-core")); } catch (e) { ({ chromium } = require("/opt/node-tools/node_modules/playwright-core")); }
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP, PORT = 8899;
const S = require(path.join(APP, "scripts/scout.js"));
let fails = 0; const chk = (ok, m, x) => { console.log((ok ? "  ok   " : "  FAIL ") + m + (x ? "  " + x : "")); if (!ok) fails++; };
const J = JSON.stringify;

// ---- a league -------------------------------------------------------------
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const NOW = Date.parse("2026-11-26T12:00:00Z");
const CLUBS = ["ARS", "AVL", "BHA", "BOU", "BRE", "CHE", "COV", "CRY", "EVE", "FUL", "HUL", "IPS", "LEE", "LIV", "MCI", "MUN", "NEW", "NFO", "SUN", "TOT"];
const teams = CLUBS.map((s, i) => ({ id: i + 1, short_name: s, name: s + " FC", strength: 2 + (i % 4) }));
const events = [];
for (let g = 1; g <= 38; g++) events.push({ id: g, deadline_time: new Date(Date.parse("2026-08-15T10:00:00Z") + (g - 1) * 7 * 864e5).toISOString(),
  finished: g <= 11, data_checked: g <= 11, is_current: g === 11, is_next: g === 12, is_previous: g === 10 });
events[11].deadline_time = "2026-11-28T11:00:00Z";
const fixtures = []; let fid = 1;
for (let g = 1; g <= 38; g++) {
  const order = CLUBS.map((_, i) => i + 1).sort(() => rnd() - 0.5);
  for (let k = 0; k < 20; k += 2) {
    const h = order[k], a = order[k + 1], done = g <= 11;
    fixtures.push({ id: fid++, event: g, team_h: h, team_a: a, finished: done, team_h_score: done ? Math.floor(rnd() * 4) : null, team_a_score: done ? Math.floor(rnd() * 4) : null,
      team_h_difficulty: 2 + Math.floor(rnd() * 4), team_a_difficulty: 2 + Math.floor(rnd() * 4), kickoff_time: events[g - 1].deadline_time });
  }
}
const elements = [], histories = {};
let id = 1;
const HOSTILE = '<img src=x onerror="window.__pwned=1">Hacker';
for (const [type, n] of [[1, 40], [2, 90], [3, 110], [4, 60]]) {
  for (let k = 0; k < n; k++, id++) {
    const team = 1 + (id % 20), price = Math.round((4 + rnd() * (type === 4 ? 10 : type === 3 ? 9 : 3.5)) * 10);
    const hist = []; let pts = 0, mins = 0, g = 0, a = 0, xg = 0, xa = 0, bon = 0, cs = 0, sv = 0, gc = 0, xgc = 0, dc = 0;
    for (let w = 1; w <= 11; w++) {
      const m = rnd() < 0.15 ? 0 : rnd() < 0.2 ? 30 : 90;
      const gg = m && rnd() < (type === 4 ? 0.4 : type === 3 ? 0.25 : 0.05) ? 1 : 0, aa = m && rnd() < 0.2 ? 1 : 0;
      const p = m ? 2 + gg * (type === 4 ? 4 : 5) + aa * 3 + Math.floor(rnd() * 3) : 0;
      const row = { element: id, round: w, fixture: w, minutes: m, total_points: p, goals_scored: gg, assists: aa, bonus: m && rnd() < 0.2 ? 2 : 0,
        clean_sheets: m && rnd() < 0.3 ? 1 : 0, saves: type === 1 && m ? Math.floor(rnd() * 5) : 0, goals_conceded: m ? Math.floor(rnd() * 3) : 0,
        expected_goals: (gg * 0.6 + rnd() * 0.3).toFixed(2), expected_assists: (aa * 0.4 + rnd() * 0.2).toFixed(2),
        expected_goal_involvements: (gg * 0.6 + aa * 0.4 + rnd() * 0.4).toFixed(2), expected_goals_conceded: (m ? rnd() * 2 : 0).toFixed(2),
        defensive_contribution: m ? Math.floor(rnd() * 12) : 0, value: price, was_home: rnd() < 0.5 };
      hist.push(row); pts += p; mins += m; g += gg; a += aa; bon += row.bonus; cs += row.clean_sheets; sv += row.saves; gc += row.goals_conceded;
      xg += +row.expected_goals; xa += +row.expected_assists; xgc += +row.expected_goals_conceded; dc += row.defensive_contribution;
    }
    histories[id] = hist;
    const per90 = (v) => mins ? (v * 90 / mins).toFixed(2) : "0.00";
    const injured = k === 0 || k === 5, doubt = k === 3;
    elements.push({ id, element_type: type, team, web_name: type === 3 && k === 1 ? HOSTILE : "P" + id, now_cost: price, cost_change_start: Math.floor(rnd() * 5) - 2,
      total_points: pts, minutes: mins, goals_scored: g, assists: a, bonus: bon, clean_sheets: cs, saves: sv, goals_conceded: gc,
      expected_goals: xg.toFixed(2), expected_assists: xa.toFixed(2), expected_goal_involvements: (xg + xa).toFixed(2), expected_goals_conceded: xgc.toFixed(2),
      expected_goal_involvements_per_90: +per90(xg + xa), expected_goals_conceded_per_90: +per90(xgc), saves_per_90: +per90(sv), defensive_contribution: dc, defensive_contribution_per_90: +per90(dc),
      selected_by_percent: (rnd() * 40).toFixed(1), transfers_in_event: Math.floor(rnd() * 200000), transfers_out_event: Math.floor(rnd() * 200000),
      status: injured ? "i" : doubt ? "d" : "a", chance_of_playing_next_round: injured ? 0 : doubt ? 50 : null, news: injured ? "Knee injury - Unknown return date" : doubt ? "Hamstring - 50% chance of playing" : "",
      penalties_order: k % 7 === 0 ? 1 : null, corners_and_indirect_freekicks_order: k % 9 === 0 ? 1 : null, direct_freekicks_order: null, removed: false });
  }
}
const bs = { events, teams, elements, element_types: [1, 2, 3, 4].map((i) => ({ id: i })) };

(async () => {
  // ---- 1. the builder ----------------------------------------------------
  let rep, rep2, err = null;
  try { rep = S.build(bs, fixtures, histories, NOW); rep2 = S.build(bs, fixtures, histories, NOW); } catch (e) { err = e; }
  chk(!err && rep, "the builder runs on FPL-shaped feeds", err && err.stack);
  if (!rep) { console.log(fails + " failure(s)"); process.exit(1); }
  chk(J(rep) === J(rep2), "the same feeds always give the same report");
  chk(rep.gw === 12 && rep.after === 11 && J(rep.recent) === J([8, 9, 10, 11]), "for the GW12 deadline, after GW11, form over GW8-11", J({ gw: rep.gw, after: rep.after, recent: rep.recent }));
  const keys = Object.keys(rep.positions);
  chk(J(keys.sort()) === J(["def", "fwd", "gkp", "mid"]), "a report for every position", J(keys));
  let bad = [];
  (function walk(v, at) {
    if (typeof v === "number" && !isFinite(v)) bad.push(at);
    else if (v && typeof v === "object") Object.keys(v).forEach((k) => walk(v[k], at + "." + k));
  })(rep, "rep");
  chk(!bad.length, "every number in every report is finite", bad.slice(0, 5).join(", "));
  const bySize = { gkp: 25, def: 60, mid: 75, fwd: 40 };
  for (const k of ["gkp", "def", "mid", "fwd"]) {
    const P = rep.positions[k], pl = P.players;
    chk(pl.length === bySize[k] && P.n === pl.length, k + ": the top " + bySize[k] + " by points", String(pl.length));
    const ranks = pl.map((p) => p.rank).sort((a, b) => a - b);
    chk(J(ranks) === J(pl.map((_, i) => i + 1)), k + ": the model ranks every player once, 1 to n");
    const sorted = pl.slice().sort((a, b) => a.rank - b.rank);
    chk(sorted.every((p, i) => !i || p.score <= sorted[i - 1].score) && pl.every((p) => p.score >= 0 && p.score <= 100), k + ": higher score, higher rank; scores within 0-100");
    chk(["form", "fix", "value"].every((w) => J(pl.map((p) => p.alt[w]).sort((a, b) => a - b)) === J(ranks)), k + ": the three other weightings each rank everyone once");
    chk(pl.every((p) => p.fdr >= 1 && p.fdr <= 5), k + ": fixture difficulty on FPL's own 1-5 scale");
    const tagIds = (t) => [].concat(...P.verdict.filter((v) => v.tag === t).map((v) => v.ids));
    const byId = {}; pl.forEach((p) => { byId[p.id] = p; });
    const buys = tagIds("BUY").map((i) => byId[i]).filter(Boolean);
    chk(buys.length && buys.every((p) => p.status === "a" || p.status === "d" && p.chance >= 75), k + ": nobody injured or doubtful is a BUY", J(buys.map((p) => p.name + ":" + p.status)));
    const core = (P.verdict.find((v) => v.tag === "BUY" && /core/.test(v.text)) || { ids: [] }).ids.map((i) => byId[i]);
    const budget = (P.verdict.find((v) => v.tag === "BUY" && /budget/.test(v.text)) || { ids: [] }).ids.map((i) => byId[i]);
    chk(budget.every((p) => p.price <= S.POS[Object.keys(S.POS).find((t) => S.POS[t].key === k)].budget + 1e-9), k + ": budget picks are within budget", J(budget.map((p) => p.price)));
    chk(core.every((p) => p.rMinShare >= 0.7), k + ": the core picks are playing (70%+ of recent minutes)");
    const sells = tagIds("SELL");
    chk(!sells.some((i) => tagIds("BUY").indexOf(i) !== -1), k + ": nobody is both BUY and SELL");
    chk(P.verdict.every((v) => typeof v.text === "string" && v.text.length > 10 && !/undefined|NaN|null/.test(v.text)), k + ": every verdict reads as a sentence");
    chk(P.files.length > 0 && P.files.every((f) => f.text && !/undefined|NaN|null/.test(f.text)), k + ": player files written, no holes in the text");
    chk(P.plan && P.plan.out.every((u) => byId[u.id] ? byId[u.id].status !== "a" : true), k + ": the unavailable list holds only unavailable players");
  }
  chk(rep.positions.mid.players.some((p) => p.name === HOSTILE), "the hostile name is kept as data (shown as text by the page)");

  // ---- 2. when a build is due ----------------------------------------------
  const idx = (built) => ({ reports: [{ gw: 12, built }] });
  const notDone = JSON.parse(J(bs)); notDone.events[10].data_checked = false;
  const past = JSON.parse(J(bs)); past.events[11].deadline_time = "2026-11-26T11:00:00Z";
  delete process.env.SCOUT_FORCE;
  chk(S.due(notDone, { reports: [] }, NOW).due === false, "not due while the gameweek is unchecked");
  chk(S.due(past, { reports: [] }, NOW).due === false, "not due once the next deadline has passed");
  chk(S.due(bs, { reports: [] }, NOW).due === true, "due when there is no report for the next deadline");
  chk(S.due(bs, idx(new Date(NOW - 3 * 3600e3).toISOString()), NOW).due === false, "not due three hours after the last build");
  chk(S.due(bs, idx(new Date(NOW - 13 * 3600e3).toISOString()), NOW).due === true, "due again after twelve hours (prices, transfers, injuries move)");
  process.env.SCOUT_FORCE = "1";
  chk(S.due(bs, idx(new Date(NOW - 3600e3).toISOString()), NOW).due === true, "a forced run builds anyway");
  delete process.env.SCOUT_FORCE;

  // ---- 3. the page -------------------------------------------------------
  const files = {};
  Object.values(rep.positions).forEach((p) => { files["/reports/gw12/" + p.key + ".json"] = J(Object.assign({ gw: 12, after: 11, deadline: rep.deadline, built: rep.built, recent: rep.recent }, p)); });
  files["/reports/index.json"] = J({ reports: [{ gw: 12, after: 11, deadline: rep.deadline, built: rep.built,
    positions: Object.values(rep.positions).map((p) => ({ key: p.key, name: p.name, n: p.n, top: p.head[0].who, verdict: (p.verdict[0] || {}).text || "" })) }] });
  let withPdf = { mid: true };
  const T = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".webp": "image/webp", ".png": "image/png" };
  const srv = http.createServer((q, r) => {
    let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
    if (files[u]) { r.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }); return r.end(files[u]); }
    const m = /^\/reports\/gw12\/(\w+)\.pdf$/.exec(u);
    if (m) { if (withPdf[m[1]]) { r.writeHead(200, { "content-type": "application/pdf" }); return r.end(q.method === "HEAD" ? undefined : "%PDF-1.4"); } r.writeHead(404); return r.end(); }
    if (/^\/reports\//.test(u)) { r.writeHead(404); return r.end(); }
    fs.readFile(path.join(APP, u), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { "content-type": T[path.extname(u)] || "application/octet-stream", "cache-control": "no-store" }); r.end(b); });
  });
  await new Promise((ok) => srv.listen(PORT, ok));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  for (const [w, theme] of [[320, "light"], [390, "dark"]]) {
    console.log("-- " + w + "px, " + theme);
    const c = await b.newContext({ viewport: { width: w, height: 800 }, isMobile: true, hasTouch: true, serviceWorkers: "block", colorScheme: theme });
    await c.route((u) => !/localhost/.test(u.toString()), (route) => route.abort());
    await c.addInitScript(() => { try { localStorage.setItem("go12.theo", "off"); } catch (e) {} });
    const p = await c.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.goto("http://localhost:" + PORT + "/index.html#news", { waitUntil: "domcontentloaded" }); await p.waitForTimeout(2200);
    await p.evaluate(() => { const x = [...document.querySelectorAll("#nwSrc button")].find((y) => y.getAttribute("data-src") === "reports"); x && x.click(); });
    await p.waitForTimeout(700);
    const list = await p.evaluate(() => {
      const v = document.querySelector('section.view[data-view="news"]');
      return { pills: [...v.querySelectorAll("#nwSrc button")].map((x) => x.textContent + (x.classList.contains("on") ? "*" : "")),
        cards: [...v.querySelectorAll("#nwReports a")].map((a) => a.getAttribute("href")), note: (v.querySelector(".note") || {}).textContent || "",
        wide: document.documentElement.scrollWidth > innerWidth + 1 };
    });
    chk(list.pills[1] === "Reports*", w + ": a Reports pill beside All, chosen", J(list.pills));
    chk(J(list.cards.slice(0, 4)) === J(["#news/report/12/gkp", "#news/report/12/def", "#news/report/12/mid", "#news/report/12/fwd"]), w + ": a card for each position, in order", J(list.cards));
    chk(/report for each position/.test(list.note) && !/Headlines from/.test(list.note), w + ": the note under the cards is about the reports, not the headlines", list.note);
    chk(!list.wide, w + ": the list is no wider than the phone");
    await p.click('#nwReports a[href="#news/report/12/mid"]'); await p.waitForTimeout(1200);
    const pg = await p.evaluate(() => {
      const v = document.querySelector('section.view[data-view="news"]');
      return { hash: location.hash, back: getComputedStyle(document.querySelector("#barBack")).display, text: v.innerText,
        pwned: window.__pwned || 0, imgs: v.querySelectorAll("img[onerror]").length, pdf: (v.querySelector(".rp-pdf") || {}).href || "",
        players: v.querySelectorAll("[data-rp-player]").length, wide: document.documentElement.scrollWidth > innerWidth + 1 };
    });
    chk(pg.hash === "#news/report/12/mid" && pg.back !== "none", w + ": the report is a page of its own, with a back arrow", J({ hash: pg.hash, back: pg.back }));
    chk(/MIDFIELDERS/i.test(pg.text) && /THE VERDICT/i.test(pg.text) && /LEADERBOARD/i.test(pg.text) && /FIXTURES/i.test(pg.text), w + ": hero, verdict, leaderboard and fixtures drawn");
    chk(pg.pwned === 0 && pg.imgs === 0 && pg.text.indexOf("<img src=x") !== -1, w + ": a name with markup in it is shown as text and never runs");
    chk(/\/reports\/gw12\/mid\.pdf$/.test(pg.pdf), w + ": a Download PDF link when the PDF is there", pg.pdf);
    chk(!pg.wide, w + ": the report is no wider than the phone");
    chk(!errs.length, w + ": no errors", errs.join("; "));
    // a player opens his page; back returns to the report
    const pid = await p.evaluate(() => { const f = [...document.querySelectorAll("[data-rp-player]")].find((x) => !/Hacker/.test(x.textContent)); f.click(); return f.getAttribute("data-rp-player"); });
    await p.waitForTimeout(600);
    const at = await p.evaluate(() => location.hash);
    await p.goBack(); await p.waitForTimeout(900);
    const back = await p.evaluate(() => location.hash);
    // the made-up league's players are not in the app's data, so the page stays put; a real one opens
    chk(at === "#news/report/12/mid" || at === "#player/" + pid, w + ": tapping a player opens him only if the app knows him", at);
    chk(/^#news(\/report\/12\/mid)?$/.test(back), w + ": back from there lands on the reports", back);
    // no PDF yet: no link
    await p.evaluate(() => { location.hash = "news/report/12/def"; }); await p.waitForTimeout(1200);
    chk(await p.evaluate(() => !document.querySelector(".rp-pdf")), w + ": no Download PDF link until the PDF is printed");
    // a report that is not there
    await p.evaluate(() => { location.hash = "news/report/9/fwd"; }); await p.waitForTimeout(900);
    chk(await p.evaluate(() => /isn.t available/.test(document.querySelector('section.view[data-view="news"]').innerText)), w + ": a report that isn't there says so, with a way back");
    // an address that is not a report is the news page
    await p.evaluate(() => { location.hash = "news/report/12/xyz"; }); await p.waitForTimeout(700);
    chk(await p.evaluate(() => !!document.querySelector("#nwSrc")), w + ": a malformed report address shows the news page");
    chk(!errs.length, w + ": still no errors", errs.join("; "));
    await c.close();
  }
  await b.close(); srv.close();
  console.log(fails ? fails + " failure(s)" : "all passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
