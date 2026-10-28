const GOENV = require("./lib/env.js");
/* Where the app opens. With a team chosen: FPL, its own page, with no back
   arrow (it is home). Without one: Classic, as it always was. A link to a
   particular page opens that page. A league or a team opened from FPL goes
   back to FPL, and so does anything opened from its card. */
const { chromium } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP, PORT = 8776;
const H = require(path.join(APP, "tests/audit/harness.js")).loadCompute();
const ds = H.ds, me = ds.managers[7].id;
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".svg":"image/svg+xml", ".webp":"image/webp", ".png":"image/png" };
const srv = http.createServer((q, r) => { let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  fs.readFile(path.join(APP, u), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { "content-type": T[path.extname(u)] || "application/octet-stream" }); r.end(b); }); });
let fails = 0; const chk = (ok, m, x) => { console.log((ok ? "  ok   " : "  FAIL ") + m + (x ? "  " + x : "")); if (!ok) fails++; };
const ENTRY = { id: me, player_region_iso_code_short: "GB", leagues: { classic: [{ id: 314, name: "Overall", entry_rank: 9, entry_last_rank: 9, league_type: "s" }], h2h: [] } };
(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  const open = async (withMe, url) => {
    const c = await b.newContext({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
    if (withMe) await c.addInitScript((id) => { try { localStorage.setItem("go12.me", String(id)); localStorage.setItem("go12.theo", "off"); } catch (e) {} }, me);
    const p = await c.newPage(); p.__er = []; p.on("pageerror", (e) => p.__er.push(e.message));
    await p.route((u) => /entry|leagues-classic/.test(decodeURIComponent(u.toString())) && !/localhost/.test(u.toString()), (route) => {
      const d = decodeURIComponent(route.request().url());
      if (/leagues-classic/.test(d)) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ league: { id: 314, name: "Overall" }, standings: { results: [], has_next: false } }) });
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ENTRY) }); });
    await p.goto("http://localhost:" + PORT + url, { waitUntil: "domcontentloaded" }); await p.waitForTimeout(2600);
    return { c, p };
  };
  const where = (p) => p.evaluate(() => ({ hash: location.hash, back: getComputedStyle(document.querySelector("#barBack")).display !== "none",
    card: !!document.querySelector("section.view.active .fplcard"), table: !!document.querySelector("section.view.active table.t tbody tr") }));

  // 1. a team chosen: FPL, no back arrow
  let { c, p } = await open(true, "/");
  let w = await where(p);
  chk(w.hash === "#fpl" && w.card && !w.back, "a team chosen: the app opens on FPL, its card first, no back arrow", JSON.stringify(w));
  // its card opens your team, and back returns to FPL
  await p.click(".fcn.main"); await p.waitForTimeout(700);
  w = await where(p);
  chk(w.hash === "#profile/" + me + "/squad" && w.back, "your points open your squad, with a back arrow", JSON.stringify(w));
  await p.click("#barBack"); await p.waitForTimeout(700);
  w = await where(p);
  chk(w.hash === "#fpl" && w.card && !w.back, "and back returns to FPL", JSON.stringify(w));
  // a league opened from FPL has a back arrow that returns to FPL
  await p.evaluate(() => { location.hash = "fpl/c/314"; }); await p.waitForTimeout(900);
  w = await where(p);
  chk(w.hash === "#fpl/c/314" && w.back, "a league opened from FPL has a back arrow", JSON.stringify(w));
  await p.click("#barBack"); await p.waitForTimeout(700);
  chk((await where(p)).hash === "#fpl", "which returns to FPL");
  // the bottom tabs still work, and their own pages have no back arrow either
  await p.click('.navitem[data-tab="classic"]'); await p.waitForTimeout(700);
  w = await where(p);
  chk(w.hash === "#classic" && w.table && !w.back, "Classic from the bottom bar, as before", JSON.stringify(w));
  // every section's own page is home too: Premier League (fixtures and table) and Voluntary have no
  // back arrow; a match opened inside one has one, and it leads back
  const H = require(path.join(APP, "tests/audit/harness.js")).loadCompute().ds;
  const fx = Object.keys(H.gwFixtures).map(Number).filter((g) => (H.gwFixtures[g] || []).some((f) => f[3])).pop();
  const m0 = H.gwFixtures[fx].find((f) => f[3]);
  for (const hash of ["pl", "pl/table", "vol"]) {
    await p.evaluate((x) => { location.hash = x; }, hash); await p.waitForTimeout(800);
    w = await where(p);
    chk(w.hash === "#" + hash && !w.back, "the " + hash + " page, a section's own, has no back arrow", JSON.stringify(w));
  }
  await p.evaluate((x) => { location.hash = x; }, "pl/" + fx + "/" + m0[0] + "-" + m0[1]); await p.waitForTimeout(900);
  w = await where(p);
  chk(w.back, "a match opened in Premier League has a back arrow", JSON.stringify(w));
  await p.click("#barBack"); await p.waitForTimeout(700);
  chk((await where(p)).hash === "#pl/" + fx, "which returns to that gameweek's fixtures", (await where(p)).hash);
  chk(!p.__er.length, "no JS errors", p.__er.join(" | "));
  await c.close();

  // 2. a link to a page opens that page
  ({ c, p } = await open(true, "/index.html#lms"));
  w = await where(p);
  chk(w.hash === "#lms" && !w.card, "a link to a page opens that page, team chosen or not", JSON.stringify(w));
  await c.close();

  // 3. no team chosen: Classic, as always
  ({ c, p } = await open(false, "/"));
  w = await where(p);
  chk((w.hash === "" || w.hash === "#classic") && w.table && !w.card && !w.back, "no team chosen: the app opens on Classic", JSON.stringify(w));
  chk(!p.__er.length, "no JS errors", p.__er.join(" | "));
  await c.close();
  await b.close(); srv.close(); console.log(fails ? "FAILS: " + fails : "ALL OK"); process.exit(fails ? 1 : 0);
})();
