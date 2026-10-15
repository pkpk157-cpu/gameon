const GOENV = require("./lib/env.js");
/* A profile shows one week at a time. The squad's points and the
 * head-to-head beside them are the same week's: the profile opens on the
 * squad's gameweek and its match, picking another gameweek moves both, and
 * "Show all" still lists every fixture once. A week with no fixture falls
 * back to the next match still to settle. */
const { chromium } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP, PORT = 8896;
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".svg":"image/svg+xml", ".webp":"image/webp", ".png":"image/png" };
const srv = http.createServer((q, r) => { let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  fs.readFile(path.join(APP, u), (e, b) => { if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { "content-type": T[path.extname(u)] || "text/plain", "cache-control": "no-store" }); r.end(b); }); });
let fails = 0;
const chk = (ok, m, x) => { console.log((ok ? "  ok   " : "  FAIL ") + m + (x !== undefined ? "  " + x : "")); if (!ok) fails++; };

(async () => {
  await new Promise((r) => srv.listen(PORT, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  const ds = JSON.parse(fs.readFileSync(path.join(APP, "data.json"), "utf8")).dataset;
  // managers in a head-to-head group: the first few with fixtures
  const inH2h = ds.managers.map((m) => m.id).filter((id) => Object.values(ds.h2hFixtures || {}).some((L) => (L.ents || []).indexOf(id) !== -1)).slice(0, 3);
  chk(inH2h.length > 0, "there are managers with head-to-head fixtures", inH2h.length);
  for (const id of inH2h) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
    await ctx.addInitScript(() => { try { localStorage.setItem("go12.theo", "off"); } catch (e) {} });
    const p = await ctx.newPage(); const errs = [];
    p.on("pageerror", (e) => errs.push(e.message));
    await p.goto("http://127.0.0.1:" + PORT + "/index.html#profile/" + id, { waitUntil: "domcontentloaded" });
    await p.waitForSelector("#pitchGwSel", { timeout: 20000 }).catch(() => {});
    await p.waitForTimeout(400);
    const read = () => p.evaluate(() => {
      const sel = document.querySelector("#pitchGwSel");
      const cur = [...document.querySelectorAll("[data-h2hcur] .fxw")].map((x) => (x.textContent.match(/Gameweek (\d+)/) || [])[1]);
      const rest = [...document.querySelectorAll("#h2hRest .fxw")].map((x) => (x.textContent.match(/Gameweek (\d+)/) || [])[1]);
      const opts = sel ? [...sel.options].map((o) => o.value) : [];
      return { squad: sel && sel.value, cur, rest, opts };
    });
    const r0 = await read();
    if (!r0.cur.length) { console.log("  --   " + id + ": no head-to-head on this profile"); await ctx.close(); continue; }
    const all = r0.cur.slice(0, 1).concat(r0.rest);
    const has = (g) => all.indexOf(String(g)) !== -1;
    chk(r0.cur.every((g) => g === r0.cur[0]), id + ": the open and folded rows show the same match", r0.cur.join(","));
    if (has(r0.squad)) chk(r0.cur[0] === r0.squad, id + ": opens on the squad's gameweek, GW" + r0.squad, "h2h GW" + r0.cur[0]);
    chk(new Set(all).size === all.length, id + ": every fixture listed once", all.length);
    for (const g of r0.opts.slice().reverse().slice(0, 4)) {
      await p.selectOption("#pitchGwSel", g); await p.waitForTimeout(300);
      const r = await read();
      const all2 = r.cur.slice(0, 1).concat(r.rest);
      if (has(g)) chk(r.cur[0] === g, id + ": GW" + g + " picked, the head-to-head shows GW" + g, "h2h GW" + r.cur[0]);
      else chk(!!r.cur[0], id + ": GW" + g + " has no fixture, a match is still shown", "h2h GW" + r.cur[0]);
      chk(all2.length === all.length && new Set(all2).size === all.length, id + ": GW" + g + ", still every fixture once", all2.length + " of " + all.length);
    }
    // the opponent is still a door to his profile
    const opp = await p.$("[data-h2hcur] .fxs.r[data-entry]");
    if (opp) {
      const want = await opp.getAttribute("data-entry");
      await p.evaluate(() => { const d = document.querySelector("details#pf-h2h, details[id*=h2h]"); if (d) d.open = true; });
      await p.evaluate(() => { const el = document.querySelector("[data-h2hcur] .fxs.r[data-entry]"); el.click(); });
      await p.waitForTimeout(500);
      chk(await p.evaluate(() => location.hash) === "#profile/" + want, id + ": the opponent still opens his profile", await p.evaluate(() => location.hash));
    }
    chk(!errs.length, id + ": no JS errors", errs.join(" | "));
    await ctx.close();
  }
  await b.close(); srv.close();
  console.log(fails ? "\n" + fails + " FAILURES" : "\nthe squad and the head-to-head read the same week");
  process.exit(fails ? 1 : 0);
})();
