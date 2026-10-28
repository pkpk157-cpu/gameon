const GOENV = require("./lib/env.js");
/* Every page tells the same story, read off the screen. agree.js proves the
 * pages ask compute.js for one figure; this reads what each page actually
 * printed, for the same managers, and requires them to match: the Classic
 * table, the LMS table, each manager's profile and Compare.
 *   place:   Classic #, LMS CL, profile "GO", profile prize table, Compare
 *   total:   Classic Total, profile Total points, Compare Season total
 *   week:    Classic GW, profile GW, Compare GW points, LMS GW pts
 *   LMS out: Classic cross, profile prize table, LMS tab's count
 * On the real data, at 390px. */
const { chromium } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP, PORT = 8764;
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".svg":"image/svg+xml", ".webp":"image/webp", ".png":"image/png" };
const srv = http.createServer((q, r) => { let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  fs.readFile(path.join(APP, u), (e, b) => { if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { "content-type": T[path.extname(u)] || "text/plain", "cache-control": "no-store" }); r.end(b); }); });
let fails = 0, checks = 0;
const seen = {};
const chk = (ok, m, x) => { checks++; if (ok) return; fails++; const k = m.replace(/^\S+ /, "");
  if (!seen[k]) { seen[k] = 0; console.log("  FAIL " + m + (x !== undefined ? "  " + x : "")); } seen[k]++; };
const n = (s) => { const t = String(s == null ? "" : s).replace(/[,\s]/g, "").replace(/−/g, "-"); return /^-?\d+$/.test(t) ? +t : null; };
const ds = JSON.parse(fs.readFileSync(path.join(APP, "data.json"), "utf8")).dataset;
const ids = ds.managers.map((m) => m.id);
const ME = ids[0];
const probe = ids.filter((_, i) => i % 12 === 5);

(async () => {
  await new Promise((r) => srv.listen(PORT, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, serviceWorkers: "block" });
  await ctx.addInitScript((me) => { try { localStorage.setItem("go12.me", String(me)); localStorage.setItem("go12.theo", "off"); } catch (e) {} }, ME);
  const p = await ctx.newPage(); const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  await p.route(/fantasy/, (r) => r.abort());
  const go = async (hash, sel) => { await p.evaluate((h) => { location.hash = h; }, hash); await p.waitForSelector(sel, { timeout: 20000 }); await p.waitForTimeout(250); };
  await p.goto("http://127.0.0.1:" + PORT + "/index.html#classic", { waitUntil: "domcontentloaded" });
  await p.waitForSelector("table.classictbl tbody tr", { timeout: 20000 });

  // the Classic table
  const classic = await p.evaluate(() => {
    const out = {};
    document.querySelectorAll("table.classictbl tbody tr").forEach((tr) => {
      const num = [...tr.querySelectorAll("td.num")];
      const id = +tr.querySelector("[data-entry]").getAttribute("data-entry");
      out[id] = { rank: num[0].querySelector(".r").textContent, gw: num[1].textContent, total: num[2].textContent,
                  out: !!tr.querySelector("td.c-lms .lmsx") };
    });
    return out;
  });
  const sub = await p.evaluate(() => (document.querySelector("#barSub") || {}).textContent || "");

  // the LMS table, on the week it opens on
  await go("lms", "table.lmstbl tbody tr");
  const lms = await p.evaluate(() => {
    const out = {}; const sel = document.querySelector("#lmsGwSel");
    document.querySelectorAll("table.lmstbl tbody tr").forEach((tr) => {
      const id = +tr.querySelector("[data-entry]").getAttribute("data-entry");
      out[id] = { cl: tr.querySelector("td.c-cl").textContent, pts: tr.querySelectorAll("td.num")[1].textContent };
    });
    return { rows: out, week: sel ? sel.options[sel.selectedIndex].textContent : "",
      alive: +(document.querySelector(".lmscount b") || {}).textContent };
  });
  const lmsGw = +((/GW\s*(\d+)/.exec(lms.week) || [])[1]);
  const outIds = Object.keys(classic).filter((id) => classic[id].out).map(Number);
  chk(ids.length - outIds.length === lms.alive, "LMS: the alive count is the managers without a cross in the Classic", (ids.length - outIds.length) + " vs " + lms.alive);
  Object.keys(lms.rows).forEach((id) => {
    chk(lms.rows[id].cl === classic[id].rank, id + " LMS: its CL is the Classic place", lms.rows[id].cl + " vs " + classic[id].rank);
  });
  chk(outIds.every((id) => !lms.rows[id] || /Live/.test(lms.week) === false), "LMS: nobody crossed out in the Classic is in this week's live table");

  for (const id of probe) {
    const c = classic[id];
    // the profile
    await go("profile/" + id, ".card.snap .snapstat .v");
    const pf = await p.evaluate(() => {
      const st = [...document.querySelectorAll(".card.snap .snapstat")].map((x) => ({ v: x.querySelector(".v").textContent, l: x.querySelector(".l").textContent }));
      const go = [...document.querySelectorAll(".snaprank")].find((x) => x.querySelector(".k").textContent === "GO");
      const prize = {}; document.querySelectorAll("table.prizetbl tr").forEach((tr) => {
        const k = tr.querySelector(".pcomp b").textContent; prize[k] = { pos: tr.querySelector(".ppos").textContent, where: tr.querySelector(".pcomp .mgr").textContent,
          pill: (tr.querySelector(".pstate .pill") || {}).textContent }; });
      return { total: st[0] && st[0].v, gw: st[1] && st[1].v, gwLabel: st[1] && st[1].l, go: go ? go.querySelector(".n").textContent : null, prize };
    });
    chk(n(pf.total) === n(c.total), id + " profile: its total is the Classic's", pf.total + " vs " + c.total);
    chk(n(String(pf.go).replace(/(st|nd|rd|th)$/, "")) === n(c.rank), id + " profile: its GO place is the Classic's", pf.go + " vs " + c.rank);
    chk(pf.prize.Classic && n(pf.prize.Classic.pos.replace("#", "")) === n(c.rank), id + " profile: the prize table's Classic place is the Classic's", JSON.stringify(pf.prize.Classic) + " vs " + c.rank);
    const pgw = +((/GW(\d+)/.exec(pf.gwLabel || "") || [])[1]);
    chk(n(pf.gw) === n(c.gw), id + " profile: its week's points are the Classic's GW", pf.gw + " (" + pf.gwLabel + ") vs " + c.gw);
    const lp = pf.prize["Last Manager"];
    chk(!!lp && (/eliminated/.test(lp.where) === c.out), id + " profile: out of LMS there exactly when the Classic crosses it", JSON.stringify(lp) + " vs cross " + c.out);
    if (lms.rows[id] && lmsGw === pgw) chk(n(lms.rows[id].pts) === n(c.gw), id + " LMS: its GW pts are the Classic's GW", lms.rows[id].pts + " vs " + c.gw);
    // Compare, you against him
    if (id !== ME) {
      await p.evaluate(() => document.querySelector("#cmpMe").click());
      await p.waitForSelector("#cmpBox .cmphead", { timeout: 20000 }); await p.waitForTimeout(200);
      const cp = await p.evaluate(() => {
        const rows = {}; document.querySelectorAll("#cmpBox table.cmptable:not(.seasons) tbody tr").forEach((tr) => {
          const td = tr.children; rows[td[1].firstChild ? td[1].firstChild.textContent : ""] = [td[0].textContent, td[2].textContent]; });
        const gwSel = document.querySelector("#cmpGwSel");
        return { rows, score: (document.querySelectorAll("#cmpBox .cmphead .sc")[1] || {}).textContent, gw: gwSel ? +gwSel.value : null };
      });
      chk(n((cp.rows["Season total"] || [])[1]) === n(c.total), id + " compare: its season total is the Classic's", JSON.stringify(cp.rows["Season total"]) + " vs " + c.total);
      chk(n((cp.rows["League position"] || [])[1]) === n(c.rank), id + " compare: its league position is the Classic's", JSON.stringify(cp.rows["League position"]) + " vs " + c.rank);
      chk(n((cp.rows["Season total"] || [])[0]) === n(classic[ME].total) && n((cp.rows["League position"] || [])[0]) === n(classic[ME].rank), id + " compare: your side is your Classic row");
      if (cp.gw === pgw) chk(n(cp.score) === n(c.gw), id + " compare: its week's points are the Classic's GW", cp.score + " vs " + c.gw);
    }
  }
  chk(!errs.length, "no JS errors", errs.join(" | "));
  await b.close(); srv.close();
  Object.keys(seen).forEach((k) => console.log("  " + String(seen[k]).padStart(5) + " x " + k));
  console.log("\n" + checks + " checks across " + probe.length + " managers (" + sub + "), " + fails + " failed");
  console.log(fails ? "FAILS: " + fails : "every page shows the same figures");
  process.exit(fails ? 1 : 0);
})();
