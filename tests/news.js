const GOENV = require("./lib/env.js");
/* FPL news. The reader (scripts/news.js) against feeds shaped as each source
   answered from GitHub's runners on 5 Nov 2026: the Premier League's content
   API, Fantasy Football Scout's RSS, Google News's RSS. Headlines only, each
   link https and to its own site, every headline once, nothing stale, a
   source that fails keeps what it had, read at most every 15 minutes, and
   never an exception into the data run. Then the page: in the menu under
   Voluntary, each row where it is from and when, links that open outside
   the app, markup in a headline shown as text, the source pills, the empty
   state, and nothing wider than the phone. */
const { chromium } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP, PORT = 8786;
const N = require(path.join(APP, "scripts/news.js"));
let fails = 0; const chk = (ok, m, x) => { console.log((ok ? "  ok   " : "  FAIL ") + m + (x ? "  " + x : "")); if (!ok) fails++; };
const J = JSON.stringify;
const NOW = Date.parse("2026-11-05T18:00:00Z");
const rfc = (iso) => new Date(iso).toUTCString();

// ---- feeds as the sources send them -------------------------------------
const PL = { pageInfo: { page: 0, numPages: 1, pageSize: 20, numEntries: 3 }, content: [
  { id: 4756626, title: "Scout Selection: Best Fantasy team for Gameweek 10", date: "2026-11-05T10:00:00Z", hotlinkUrl: null,
    titleUrlSegment: "scout-selection-best-fantasy-team-for-gameweek-10", summary: "See the dream FPL line-up for this weekend's matches, featuring FOUR double-ups", description: "x" },
  { id: 4756801, title: "Is Maguire the man for your FPL team?", date: "2026-11-05T14:00:00Z",
    hotlinkUrl: "https://www.manutd.com/en/news/is-harry-maguire-the-man-for-your-fpl-team", titleUrlSegment: "is-maguire-the-man-for-your-fpl-team", summary: "" },
  { id: 4756031, title: "It’s time to go BIG in defence in FPL – see the best picks", date: "2026-11-03T16:00:00Z", hotlinkUrl: null,
    titleUrlSegment: "its-time-to-go-big-in-defence-in-fpl-see-the-best-picks", summary: "The Scout analyses the data" },
  { id: "x1", title: "No address", date: "2026-11-05T10:00:00Z", hotlinkUrl: null, titleUrlSegment: "bad segment!" },
  { id: 99, title: "Undated", date: "soon", titleUrlSegment: "undated" }
] };
const FFS = '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Fantasy Football Scout</title>' +
  '<item> <title>FPL notes: 90 mins for Cherki + Szoboszlai, Isak rest and goal</title> <link>https://www.fantasyfootballscout.co.uk/2026/11/05/fpl-notes-90-mins-for-cherki-szoboszlai-isak-rest-and-goal</link> ' +
  '<dc:creator><![CDATA[FPL Scoop]]></dc:creator> <pubDate>Thu, 05 Nov 2026 17:00:00 +0000</pubDate> <category><![CDATA[Scout Notes]]></category> ' +
  '<description><![CDATA[<p>Takeaways from the Champions League trips for Man City and Liverpool </p> <p>The post <a href="https://www.fantasyfootballscout.co.uk/x">FPL notes</a> appeared first on <a href="https://www.fantasyfootballscout.co.uk">Fantasy Football Scout</a>.</p>]]></description></item>' +
  '<item> <title>Spurs &amp; Arsenal: who&#8217;s fit?</title> <link>https://www.fantasyfootballscout.co.uk/2026/11/05/spurs</link> <pubDate>Thu, 05 Nov 2026 12:10:00 +0000</pubDate>' +
  '<description><![CDATA[<p>Both &amp; more</p>]]></description></item>' +
  '<item><title><![CDATA[<script>alert(1)</script>Hostile]]></title><link>javascript:alert(1)</link><pubDate>Thu, 05 Nov 2026 12:00:00 +0000</pubDate></item>' +
  '<item><title>Plain http</title><link>http://example.com/a</link><pubDate>Thu, 05 Nov 2026 12:00:00 +0000</pubDate></item>' +
  '<item><title>Last month</title><link>https://www.fantasyfootballscout.co.uk/old</link><pubDate>' + rfc("2026-09-30T10:00:00Z") + '</pubDate></item>' +
  '</channel></rss>';
const gnItem = (title, outlet, url, iso) => '<item><title>' + title + ' - ' + outlet + '</title><link>' + url + '</link><guid isPermaLink="false">g</guid><pubDate>' + rfc(iso) + '</pubDate>' +
  '<description>&lt;a href="' + url + '" target="_blank"&gt;' + title + '&lt;/a&gt;&amp;nbsp;&amp;nbsp;&lt;font color="#6f6f6f"&gt;' + outlet + '&lt;/font&gt;</description><source url="https://x.example">' + outlet + '</source></item>';
const GN = '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel>' +
  gnItem("The Fantasy Premier League assets turning defence into the best form of attack", "The New York Times", "https://news.google.com/rss/articles/CBMimgFBVV?oc=5", "2026-11-05T05:28:00Z") +
  gnItem("Best FPL Captain for Gameweek 10: Top 3 Picks", "Fantasy Football Fix", "https://news.google.com/rss/articles/CBMigwFB?oc=5", "2026-11-05T09:06:35Z") +
  // the same story the Premier League published: shown once, as FPL's
  gnItem("Scout Selection: Best Fantasy team for Gameweek 10", "Premier League", "https://news.google.com/rss/articles/dup?oc=5", "2026-11-05T10:30:00Z") +
  gnItem("Saliba, Konsa &amp;amp; João Pedro: Latest FPL injury news", "3 Added Minutes", "https://news.google.com/rss/articles/s3?oc=5", "2026-11-05T12:15:00Z") +
  '</channel></rss>';

// ---- 1. each source read as it is sent -----------------------------------
const pl = N.parsePl(PL);
chk(pl.length === 3 && pl[0].u === "https://www.premierleague.com/en/news/4756626/scout-selection-best-fantasy-team-for-gameweek-10" && pl[0].o === "Premier League" &&
    pl[0].x === "See the dream FPL line-up for this weekend's matches, featuring FOUR double-ups",
    "FPL: its own articles link to premierleague.com under their id, with their standfirst", J(pl[0]));
chk(pl[1].u === "https://www.manutd.com/en/news/is-harry-maguire-the-man-for-your-fpl-team" && pl[1].o === "manutd.com",
    "FPL: a club's article it lists opens on the club's site, and says whose", J(pl[1]));
chk(!pl.some((x) => /No address|Undated/.test(x.t)), "FPL: an article with no safe address or no date is left out");
const ffs = N.parseRss(FFS, "ffs");
chk(ffs[0].t === "FPL notes: 90 mins for Cherki + Szoboszlai, Isak rest and goal" && ffs[0].o === "Fantasy Football Scout" &&
    ffs[0].x === "Takeaways from the Champions League trips for Man City and Liverpool" && ffs[0].d === "2026-11-05T17:00:00.000Z",
    "Scout: headline, its first paragraph without WordPress's 'The post ... appeared first', and the time", J(ffs[0]));
chk(ffs[1].t === "Spurs & Arsenal: who’s fit?" && ffs[1].x === "Both & more", "Scout: entities read as the characters they are", J(ffs[1]));
chk(!ffs.some((x) => /Hostile|Plain http/.test(x.t)), "a javascript: or plain-http link is never a headline", J(ffs.map((x) => x.t)));
const gn = N.parseRss(GN, "gn");
chk(gn[0].t === "The Fantasy Premier League assets turning defence into the best form of attack" && gn[0].o === "The New York Times" && gn[0].x === "",
    "Google: the outlet is named once, not repeated on the end of the headline", J(gn[0]));
chk(gn[3].t === "Saliba, Konsa & João Pedro: Latest FPL injury news", "Google: a doubly escaped & reads as &", gn[3].t);
chk(!N.parseRss(GN.replace("</channel>", gnItem("Matchweek 10 VAR decisions explained", "Premier League", "https://news.google.com/rss/articles/var?oc=5", "2026-11-05T11:00:00Z") + "</channel>"), "gn").some((x) => /VAR/.test(x.t)),
    "Google: a story whose headline is not about FPL is left out");

// ---- 2. one list ---------------------------------------------------------
const merged = N.merge({ fpl: pl, ffs, gn }, NOW);
const titles = merged.map((x) => x.t);
chk(titles.filter((t) => /^Scout Selection/.test(t)).length === 1 && merged.find((x) => /^Scout Selection/.test(x.t)).s === "fpl",
    "a story both FPL and Google carry is shown once, as FPL's", J(titles));
chk(!titles.includes("Last month"), "nothing older than three weeks");
chk(merged.every((x, i) => i === 0 || merged[i - 1].d >= x.d), "newest first", J(merged.map((x) => x.d)));
chk(merged.every((x) => /^https:\/\//.test(x.u)), "every link https");

// ---- 3. reading: cadence, failures, never a throw ------------------------
(async () => {
  const feeds = { fpl: J(PL), ffs: FFS, gn: GN };
  const srcOf = (u) => (u === N.SOURCES.fpl ? "fpl" : u === N.SOURCES.ffs ? "ffs" : "gn");
  let calls = 0;
  const ok = async (u) => { calls++; return feeds[srcOf(u)]; };
  let n1 = await N.newsOf(null, { now: NOW, fetchText: ok });
  chk(calls === 3 && n1.items.length === merged.length && n1.sources.fpl.ok && n1.sources.ffs.ok && n1.sources.gn.ok && n1.at === new Date(NOW).toISOString(),
      "a first read: every source, one list", J(n1.sources));
  calls = 0;
  const n2 = await N.newsOf(n1, { now: NOW + 10 * 6e4, fetchText: ok });
  chk(calls === 0 && n2 === n1, "ten minutes later nothing is asked: the last read stands", calls + " calls");
  // Google down, the Scout answering junk: theirs from last time, FPL's fresh
  const part = async (u) => { const s = srcOf(u); if (s === "gn") throw new Error("HTTP 503"); if (s === "ffs") return "<html>maintenance</html>"; return feeds.fpl; };
  const n3 = await N.newsOf(n1, { now: NOW + 20 * 6e4, fetchText: part });
  const fromGn = (n) => n.items.filter((x) => x.s === "gn").map((x) => x.u).sort();
  chk(!n3.sources.gn.ok && !n3.sources.ffs.ok && n3.sources.fpl.ok && J(fromGn(n3)) === J(fromGn(n1)) &&
      n3.items.filter((x) => x.s === "ffs").length === n1.items.filter((x) => x.s === "ffs").length,
      "a source that fails or sends nothing readable keeps last time's headlines", J(n3.sources));
  const dead = async () => { throw new Error("offline"); };
  const n4 = await N.newsOf(null, { now: NOW, fetchText: dead });
  chk(n4 && Array.isArray(n4.items) && n4.items.length === 0 && !n4.sources.fpl.ok, "everything down and nothing before: an empty list, no exception", J(n4.sources));
  let threw = false;
  try { await N.newsOf({ items: "garbage", at: 7 }, { now: NOW, fetchText: async () => { throw new TypeError("x"); } });
        await N.newsOf("junk", { now: NOW, fetchText: async () => "{" }); } catch (e) { threw = true; }
  chk(!threw, "a broken last read or broken answers never throw into the data run");
  {
    const Hh = require(path.join(APP, "tests/audit/harness.js")).loadCompute(), Kc = Hh.C, E = Hh.ds.elements;
    const byWeb = {}; Object.keys(E).forEach((el) => { (byWeb[E[el][0]] = byWeb[E[el][0]] || []).push(+el); });
    const shared = Object.keys(byWeb).find((n) => byWeb[n].length > 1 && /^[A-Z][a-z]+$/.test(n));
    if (shared) {
      const two = byWeb[shared];
      chk(Kc.newsNames(Hh.ds, { t: "FPL: " + shared + " back in training" }, two).length === 0,
          "a name two players share (" + shared + ") points at neither", J(two.map((x) => E[x][5])));
      chk(J(Kc.newsNames(Hh.ds, { t: "FPL: " + E[two[0]][5] + " back in training" }, two)) === J([two[0]]),
          "his full name points at him alone", E[two[0]][5]);
    }
    const one = Object.keys(E).map(Number).find((el) => /^[A-Z][a-z]{3,}$/.test(E[el][0]) && byWeb[E[el][0]].length === 1 &&
      Kc.newsNames(Hh.ds, { t: "Why " + E[el][0] + " matters in FPL" }, [el]).length === 1);
    chk(Kc.newsNames(Hh.ds, { t: "why " + E[one][0].toLowerCase() + " matters" }, [one]).length === 0, "a one-word name only counts written as a name (" + E[one][0] + ", not " + E[one][0].toLowerCase() + ")");
    const acc = Object.keys(E).map(Number).find((el) => /[\u00C0-\u017F]/.test(E[el][5]) && Kc.newsNames(Hh.ds, { t: E[el][5] }, [el]).length === 1);
    if (acc) chk(Kc.newsNames(Hh.ds, { t: "FPL: " + E[acc][5].normalize("NFD").replace(/[\u0300-\u036f]/g, "") + " to start" }, [acc]).length === 1,
        "accents aside: " + E[acc][5] + " written without them is still him");
    chk(J(Kc.newsTopics({ t: "Leeds v Spurs team news: Calvert-Lewin starts", x: "" })) === J(["team"]) && Kc.newsTopics({ t: "Best FPL captain picks", x: "" }).indexOf("tips") !== -1 &&
        J(Kc.newsTopics({ t: "FPL price changes: risers and fallers", x: "" })) === J(["price"]),
        "topics read off the headline: team news, tips, prices");
    chk(!Kc.newsOnTopic({ s: "gn", t: "Matchweek 10 VAR decisions explained" }) && Kc.newsOnTopic({ s: "gn", t: "FPL GW11 Transfers" }) && Kc.newsOnTopic({ s: "fpl", t: "Matchweek preview" }),
        "a web story is FPL news only when its headline says so; FPL's own always are");
  }
  // the updater wires it in without letting it decide anything else
  const fd = fs.readFileSync(path.join(APP, "scripts/fetch-data.js"), "utf8");
  chk(/try \{ news = await require\("\.\/news\.js"\)\.newsOf\(prev\.news\); \} catch \(e\) \{ news = prev\.news \|\| null; \}/.test(fd) && /faceHide, pending, news/.test(fd),
      "the updater reads news inside its own try, and publishes it with the dataset");

  // ---- 4. the page -------------------------------------------------------
  const raw = JSON.parse(fs.readFileSync(path.join(APP, "data.json"), "utf8"));
  const recent = (mins) => new Date(Date.now() - mins * 6e4).toISOString();
  // a reader and one of his players, named in full in a headline
  const H = require(path.join(APP, "tests/audit/harness.js")).loadCompute(), K = H.C;
  const pgw = Math.max.apply(null, Object.keys(raw.dataset.picks).map(Number).filter((g) => Object.keys(raw.dataset.picks[g] || {}).length));
  const ME = +Object.keys(raw.dataset.picks[pgw])[0];
  const squad = raw.dataset.picks[pgw][ME].p.map((x) => +x[0]);
  const els = raw.dataset.elements;
  const mineEl = squad.find((el) => K.newsNames(H.ds, { t: "FPL: " + els[el][5] + " backed for a big week" }, [el]).length === 1);
  const mineName = els[mineEl][5];
  const items = [
    { s: "fpl", t: "Scout Selection: Best Fantasy team for Gameweek 10", u: "https://www.premierleague.com/en/news/4756626/scout-selection-best-fantasy-team-for-gameweek-10", o: "Premier League", d: recent(90),
      x: "See the dream FPL line-up for this weekend's matches, featuring FOUR double-ups, a goalkeeper rotation and three Liverpool assets for the run ahead" },
    { s: "ffs", t: "FPL notes: 90 mins for Cherki + Szoboszlai", u: "https://www.fantasyfootballscout.co.uk/2026/11/05/fpl-notes", o: "Fantasy Football Scout", d: recent(30), x: "Takeaways from the Champions League" },
    { s: "gn", t: '<img src=x onerror="window.__pwned=1">The FPL assets turning defence into attack', u: "https://news.google.com/rss/articles/abc?oc=5", o: "The New York Times", d: recent(60 * 30), x: "" },
    { s: "gn", t: "Bad link", u: "javascript:window.__pwned=2", o: "X", d: recent(10), x: "" },
    { s: "gn", t: "An old FPL story", u: "https://example.com/old", o: "Somewhere", d: recent(60 * 24 * 9), x: "" },
    // found by the search but not about FPL: never shown
    { s: "gn", t: "Matchweek 10 VAR decisions explained", u: "https://news.google.com/rss/articles/var?oc=5", o: "Premier League", d: recent(20), x: "" },
    { s: "gn", t: "FPL: " + mineName + " backed for a big week", u: "https://news.google.com/rss/articles/mine?oc=5", o: "Sky Sports", d: recent(45), x: "" },
    { s: "fpl", t: "FPL player price changes - risers, fallers and top transfers", u: "https://www.premierleague.com/en/news/1/fpl-price", o: "Premier League", d: recent(120), x: "Find out which picks have changed in price overnight" },
    { s: "ffs", t: "Everton v Coventry team news: Branthwaite fit, no Thomas", u: "https://www.fantasyfootballscout.co.uk/2026/11/05/eve-cov", o: "Fantasy Football Scout", d: recent(200), x: "One change for Everton" },
    // the Premier League found through Google: the same colour as its own
    { s: "gn", t: "FPL Challenge: Expert reveals their Gameweek 10 team", u: "https://news.google.com/rss/articles/chal?oc=5", o: "Premier League", d: recent(300), x: "" }
  ];
  const withNews = JSON.parse(J(raw)); withNews.dataset.news = { at: recent(4), items, sources: { fpl: { ok: true, n: 1 }, ffs: { ok: true, n: 1 }, gn: { ok: true, n: 3 } } };
  const noNews = JSON.parse(J(raw)); delete noNews.dataset.news;
  let serve = withNews;
  const T = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".webp": "image/webp", ".png": "image/png", ".mjs": "application/javascript" };
  const srv = http.createServer((q, r) => { let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
    if (u === "/data.json") { r.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }); r.end(J(serve)); return; }
    fs.readFile(path.join(APP, u), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { "content-type": T[path.extname(u)] || "application/octet-stream", "cache-control": "no-store" }); r.end(b); }); });
  await new Promise((r) => srv.listen(PORT, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  for (const w of [320, 390]) {
    console.log("-- " + w + "px");
    serve = withNews;
    const c = await b.newContext({ viewport: { width: w, height: 800 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
    await c.route((u) => !/localhost/.test(u.toString()), (route) => route.abort());
    await c.addInitScript((me) => { try { localStorage.setItem("go12.me", String(me)); localStorage.setItem("go12.theo", "off"); } catch (e) {} }, ME);
    const p = await c.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.goto("http://localhost:" + PORT + "/index.html#classic", { waitUntil: "domcontentloaded" }); await p.waitForTimeout(2500);
    await p.click("#barMenu"); await p.waitForTimeout(500);
    const menu = await p.evaluate(() => [...document.querySelectorAll("#menuBack .menuitem")].map((x) => ({ go: x.getAttribute("data-go"), t: (x.querySelector(".mi-t") || {}).textContent })));
    const vi = menu.findIndex((x) => x.go === "vol"), ni = menu.findIndex((x) => x.go === "news");
    chk(vi !== -1 && ni === vi + 1 && menu[ni].t === "FPL news", w + ": FPL news sits right under Game On Voluntary in the menu", J(menu.map((x) => x.t)));
    await p.click('#menuBack .menuitem[data-go="news"]'); await p.waitForTimeout(700);
    const pg = await p.evaluate(() => {
      const v = document.querySelector('section.view[data-view="news"]');
      const rows = [...v.querySelectorAll("a.nwrow")].map((a) => ({ href: a.getAttribute("href"), target: a.getAttribute("target"), rel: a.getAttribute("rel"),
        src: a.querySelector(".nwsrc").textContent, cls: a.querySelector(".nwsrc").className, xl: a.querySelector(".nwx") ? a.querySelector(".nwx").getClientRects().length : 0, when: (a.querySelector(".nwwhen") || {}).textContent || "", t: a.querySelector(".nwt").textContent, x: (a.querySelector(".nwx") || {}).textContent || "" }));
      return { hash: location.hash, title: document.querySelector("#barTitle").textContent, back: getComputedStyle(document.querySelector("#barBack")).display,
        rows, pills: [...v.querySelectorAll("#nwSrc button")].map((x) => x.textContent + (x.classList.contains("on") ? "*" : "")),
        note: (v.querySelector(".note") || {}).textContent || "", pwned: window.__pwned || 0, imgs: v.querySelectorAll("img").length,
        wide: document.documentElement.scrollWidth > innerWidth + 1, cut: [...v.querySelectorAll(".nwt")].some((x) => x.scrollWidth > x.clientWidth + 1) };
    });
    chk(pg.hash === "#news" && pg.title === "FPL news" && pg.back === "none", w + ": its own page, named in the bar, a section with no back arrow", J({ hash: pg.hash, title: pg.title, back: pg.back }));
    const row = (t) => pg.rows.find((r) => r.t.indexOf(t) === 0) || {};
    chk(pg.rows.length === 8 && pg.rows.every((r) => /^https:\/\//.test(r.href) && r.target === "_blank" && /noopener/.test(r.rel) && /noreferrer/.test(r.rel)),
        w + ": every headline opens its own site outside the app; the javascript: one is not drawn", J(pg.rows.map((r) => r.href)));
    chk(!pg.rows.some((r) => /VAR decisions/.test(r.t)), w + ": a web story whose headline is not about FPL is not shown");
    chk(J(pg.rows.map((r) => r.src)) === J(["Fantasy Football Scout", "Sky Sports", "Premier League", "Premier League", "Fantasy Football Scout", "Premier League", "The New York Times", "Somewhere"]),
        w + ": newest first, each saying where it is from", J(pg.rows.map((r) => r.src)));
    chk(pg.rows[0].when === "30m ago" && pg.rows[1].when === "45m ago" && pg.rows[2].when === "1h ago" && pg.rows[6].when === "1d ago" && /^\d{1,2} [A-Z][a-z]{2}$/.test(pg.rows[7].when),
        w + ": when: how long ago within the week, the day before that", J(pg.rows.map((r) => r.when)));
    chk(row("<img").t && pg.pwned === 0 && pg.imgs === 0, w + ": markup in a headline is shown as text and never runs", (row("<img").t || "").slice(0, 40));
    chk(row("Scout Selection").x === items[0].x && row("Scout Selection").xl === 1, w + ": the standfirst under the headline, on one line however long", J({ lines: row("Scout Selection").xl }));
    chk(pg.rows.filter((r) => r.src === "Premier League").every((r) => /nw-pl/.test(r.cls)) && /nw-ffs/.test(row("FPL notes").cls) && /nw-web/.test(row("<img").cls),
        w + ": the Premier League in one colour however it reached us; the Scout in its own; the rest plain", J(pg.rows.map((r) => r.src + ":" + r.cls.replace("nwsrc ", ""))));
    chk(J(pg.pills) === J(["All*", "My team", "Team news", "Tips", "Prices"]) && /FPL \(premierleague\.com\), Fantasy Football Scout and Google News/.test(pg.note) && /last checked 4m ago/.test(pg.note),
        w + ": topic pills, and a note saying where these come from and when they were checked", pg.note);
    chk(!pg.wide && !pg.cut, w + ": nothing wider than the phone, no headline cut");
    const pillsFit = await p.evaluate(() => [...document.querySelectorAll("#nwSrc button")].every((x) => x.getClientRects().length === 1 && x.getBoundingClientRect().height < 34));
    chk(pillsFit, w + ": every topic pill on one line");
    const shown = async (k) => { await p.click('#nwSrc [data-src="' + k + '"]'); await p.waitForTimeout(250);
      return p.evaluate(() => [...document.querySelectorAll('section.view[data-view="news"] .nwt')].map((x) => x.textContent)); };
    let only = await shown("mine");
    chk(J(only) === J(["FPL: " + mineName + " backed for a big week"]), w + ": My team: the headline naming one of your players, " + mineName, J(only));
    only = await shown("team");
    chk(J(only) === J(["Everton v Coventry team news: Branthwaite fit, no Thomas"]), w + ": Team news", J(only));
    only = await shown("tips");
    chk(J(only) === J(["Scout Selection: Best Fantasy team for Gameweek 10", "FPL Challenge: Expert reveals their Gameweek 10 team"]), w + ": Tips", J(only));
    only = await shown("price");
    chk(J(only) === J(["FPL player price changes - risers, fallers and top transfers"]), w + ": Prices", J(only));
    if (w === 390) { await p.click('#nwSrc [data-src="all"]'); await p.waitForTimeout(250); await p.screenshot({ path: path.join(__dirname, "news.png") }); }
    chk(errs.length === 0, w + ": no JS errors", errs.slice(0, 3).join(" | "));
    await c.close();
    // no news published yet (a phone with nothing kept from before): says so,
    // and the rest of the app carries on
    serve = noNews;
    const c2 = await b.newContext({ viewport: { width: w, height: 800 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
    await c2.route((u) => !/localhost/.test(u.toString()), (route) => route.abort());
    const p2 = await c2.newPage(); const errs2 = []; p2.on("pageerror", (e) => errs2.push(e.message));
    await p2.goto("http://localhost:" + PORT + "/index.html#news", { waitUntil: "domcontentloaded" }); await p2.waitForTimeout(2500);
    const empty = await p2.evaluate(() => (document.querySelector('section.view[data-view="news"] .callout') || {}).textContent || "");
    chk(/No news yet/.test(empty), w + ": no news published yet says so", empty);
    await p2.evaluate(() => { location.hash = "#classic"; }); await p2.waitForTimeout(600);
    chk(await p2.evaluate(() => document.querySelectorAll('section.view[data-view="classic"] table.t tbody tr').length > 100), w + ": and the league is untouched");
    chk(errs2.length === 0, w + ": no JS errors with no news", errs2.slice(0, 3).join(" | "));
    await c2.close();
  }
  await b.close(); srv.close();
  console.log(fails ? "\nFAILS: " + fails : "\nthe news reads right and opens where it came from");
  process.exit(fails ? 1 : 0);
})();
