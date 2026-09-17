const GOENV = require("./lib/env.js");
/* Live movement: when the live poll changes scores, rows slide to their new
   place, changed numbers roll and glow, and the final text is exactly what the
   render wrote. Under reduced motion nothing slides or rolls. */
const { chromium, devices } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP, PORT = 8741;
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".svg":"image/svg+xml", ".webp":"image/webp" };
const live = fs.readFileSync(GOENV.STATES + "/gw2-live-partial.json", "utf8");
const srv = http.createServer((q, r) => { let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  if (u === "/data.json") { r.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }); r.end(live); return; }
  fs.readFile(path.join(APP, u), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { "content-type": T[path.extname(u)] || "text/plain" }); r.end(b); }); });
let fails = 0; const chk = (ok, m, x) => { console.log((ok ? "  ok   " : "  FAIL ") + m + (x ? "  " + x : "")); if (!ok) fails++; };
(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  for (const reduced of [false, true]) {
    const ctx = await b.newContext({ ...devices["iPhone 12"], serviceWorkers: "block", reducedMotion: reduced ? "reduce" : "no-preference" });
    await ctx.addInitScript(() => { window.__LIVE_MS = 400; try { localStorage.clear(); } catch (e) {} });
    const p = await ctx.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
    await p.goto("http://localhost:" + PORT + "/index.html#classic", { waitUntil: "domcontentloaded" }); await p.waitForTimeout(1500);
    const gw = await p.evaluate(() => window.GO_COMPUTE.liveGwId(window.GO_STORE.dataset()));
    chk(!!gw, "the state is a live gameweek", "GW" + gw);
    const before = await p.evaluate(() => [...document.querySelectorAll("section.view.active table.t tbody tr")].slice(0, 12).map(tr => tr.querySelector("[data-entry]").getAttribute("data-entry") + ":" + [...tr.querySelectorAll("td.num")].map(td => td.textContent).join("/")));
    // Patch the poll: hand a player of the 6th-placed manager 60 points, so
    // liveAdjust recomputes totals and the order changes.
    await p.evaluate((gw) => {
      const S = window.GO_STORE, ds = S.dataset();
      const rows = window.GO_COMPUTE.classic(ds); const m = rows[5];
      const sq = ds.picks[gw] && ds.picks[gw][m.id]; const el = sq.p[0][0];
      window.__bumped = { id: m.id, el, name: m.entryName };
      // The real overlay builds a fresh dataset and hands it to the store, so
      // liveAdjust (memoised per object) runs again on the new numbers.
      S.liveOverlay = () => {
        // one change, then quiet: a poll every 400ms would keep the numbers
        // rolling faster than they can settle, which is not how a two-minute
        // poll behaves
        if (window.__done) return Promise.resolve(false);
        window.__done = 1;
        const cur = S.dataset(); const nd = Object.assign({}, cur);
        nd.livePoints = JSON.parse(JSON.stringify(cur.livePoints)); nd.livePoints[gw][el] = (nd.livePoints[gw][el] || 0) + 60;
        nd.managers = cur.managers.map(m => Object.assign({}, m));
        S.setDataset(nd); return Promise.resolve(true);
      };
    }, gw);
    // Wait for the poll to land rather than guessing when: the tick is on a
    // timer, so a fixed sleep caught the motion on one run and missed it on
    // the next. Watch until the classes appear, then read them.
    await p.waitForFunction(() => document.querySelectorAll("tr.livetick").length > 0, null, { timeout: 8000 }).catch(() => {});
    const mid = await p.evaluate(() => ({
      moving: document.querySelectorAll("tr.livemove").length,
      ticked: document.querySelectorAll("tr.livetick").length,
      bumped: document.querySelectorAll("td.livebump").length,
      transforms: [...document.querySelectorAll("tr.livemove")].filter(tr => tr.style.transform || getComputedStyle(tr).transform !== "none").length
    }));
    await p.waitForTimeout(1200);
    const after = await p.evaluate(() => {
      const ds = window.GO_STORE.dataset(); const rows = window.GO_COMPUTE.classic(ds);
      const dom = [...document.querySelectorAll("section.view.active table.t tbody tr")].map(tr => tr.querySelector("[data-entry]").getAttribute("data-entry") + ":" + [...tr.querySelectorAll("td.num")].slice(0, 3).map(td => { const m = td.querySelector(".mvu"); if (!m) return td.textContent; const c = td.cloneNode(true); c.querySelector(".mvu").textContent = (m.classList.contains("up") ? "+" : "-") + m.textContent; return c.textContent; }).join("/"));
      const exp = rows.map(r => r.id + ":" + (r.tiedWith > 1 ? "=" : "") + r.computedRank + (r.move > 0 ? "+" + r.move : r.move < 0 ? "-" + (-r.move) : "") + "/" + Number(r.eventTotal).toLocaleString("en-US") + "/" + Number(r.total).toLocaleString("en-US"));
      return { same: JSON.stringify(dom) === JSON.stringify(exp), n: dom.length, dom: dom.slice(0, 8), exp: exp.slice(0, 8),
        leftover: [...document.querySelectorAll("tr.livemove")].filter(tr => tr.style.transform).length,
        bumpedName: (document.querySelector('[data-entry="' + window.__bumped.id + '"]') || {}).textContent };
    });
    console.log((reduced ? "reduced" : "normal") + ": mid-flight moving=" + mid.moving + " ticked=" + mid.ticked + " bumped=" + mid.bumped + " transforms=" + mid.transforms);
    if (!reduced) {
      chk(mid.ticked > 0 && mid.bumped > 0, "changed rows glow and their numbers bump");
      chk(mid.moving > 0, "rows that changed place were set sliding");
    } else {
      chk(mid.moving === 0 && mid.transforms === 0, "reduced motion: nothing slides");
      chk(mid.ticked > 0, "reduced motion: the glow still marks what changed");
    }
    chk(after.same, "after the motion every cell reads exactly what the render computed (" + after.n + " rows)", after.same ? "" : JSON.stringify(after.dom) + " vs " + JSON.stringify(after.exp));
    chk(after.leftover === 0, "no row is left with a transform");
    chk(JSON.stringify(before) !== JSON.stringify(after.dom.slice(0, 12)), "the table did change", "bumped " + after.bumpedName);
    chk(errs.length === 0, "no JS errors", errs.join(" | "));
    await ctx.close();
  }
  await b.close(); srv.close(); console.log(fails ? "FAILS: " + fails : "ALL OK");
})();
