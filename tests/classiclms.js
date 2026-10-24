const GOENV = require("./lib/env.js");
/* The Classic table's LMS column: a red cross for every manager out of Last
 * Manager Standing, from the LMS tab's own reckoning, and nothing for anyone
 * still in. It survives a search, says which gameweek on a long press, and
 * the table still fits a phone without scrolling sideways. */
const { chromium } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP, PORT = 8895;
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".svg":"image/svg+xml", ".webp":"image/webp", ".png":"image/png" };
const srv = http.createServer((q, r) => { let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  fs.readFile(path.join(APP, u), (e, b) => { if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { "content-type": T[path.extname(u)] || "text/plain", "cache-control": "no-store" }); r.end(b); }); });
let fails = 0;
const chk = (ok, m, x) => { console.log((ok ? "  ok   " : "  FAIL ") + m + (x !== undefined ? "  " + x : "")); if (!ok) fails++; };
const H = require(APP + "/tests/audit/harness.js").loadCompute();
const out = H.C.lms(H.ds).eliminatedAt;
const outIds = Object.keys(out).map(Number).sort((a, b) => a - b);

(async () => {
  await new Promise((r) => srv.listen(PORT, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  for (const w of [320, 360, 390, 430, 768]) {
    const ctx = await b.newContext({ viewport: { width: w, height: 800 }, isMobile: w < 700, serviceWorkers: "block" });
    await ctx.addInitScript(() => { try { localStorage.setItem("go12.theo", "off"); } catch (e) {} });
    const p = await ctx.newPage(); const errs = [];
    p.on("pageerror", (e) => errs.push(e.message));
    await p.route(/fantasy/, (r) => r.abort());
    await p.goto("http://127.0.0.1:" + PORT + "/index.html#classic", { waitUntil: "domcontentloaded" });
    await p.waitForSelector("table.classictbl tbody tr", { timeout: 20000 });
    const m = await p.evaluate(() => {
      const t = document.querySelector("table.classictbl"), f = t.closest(".freeze");
      const heads = [...t.querySelectorAll("thead th")].filter((x) => getComputedStyle(x).display !== "none").map((x) => x.textContent);
      const rows = [...t.querySelectorAll("tbody tr")].map((tr) => { const x = tr.querySelector("td.c-lms .lmsx");
        return { id: +tr.querySelector("[data-entry]").getAttribute("data-entry"), out: !!x, label: x ? x.getAttribute("aria-label") : "" }; });
      return { heads, rows, fits: t.scrollWidth <= f.clientWidth + 1, page: document.documentElement.scrollWidth <= innerWidth + 1 };
    });
    const shown = m.rows.filter((r) => r.out).map((r) => r.id).sort((a, b2) => a - b2);
    chk(m.heads.indexOf("LMS") === m.heads.indexOf("GW") - 1 && m.heads.indexOf("LMS") === m.heads.indexOf("Team") + 1, w + "px: LMS sits between the team and GW", m.heads.join(","));
    chk(JSON.stringify(shown) === JSON.stringify(outIds) && m.rows.length === H.ds.managers.length, w + "px: a cross for exactly the managers out of LMS, nothing for the rest", shown.length + " of " + outIds.length);
    chk(m.rows.filter((r) => r.out).every((r) => r.label === "Out of Last Manager Standing in GW" + out[r.id]), w + "px: each cross says the gameweek it happened");
    chk(m.fits && m.page, w + "px: the table fits without scrolling sideways");
    if (w === 390 && outIds.length) {
      const one = H.ds.managers.find((x) => x.id === outIds[0]);
      await p.fill("#classicSearch", one.entryName); await p.waitForTimeout(200);
      const s = await p.evaluate(() => [...document.querySelectorAll("table.classictbl tbody tr")].map((tr) => !!tr.querySelector(".lmsx")));
      chk(s.length >= 1 && s[0] === true, "a search keeps the cross", JSON.stringify(s));
    }
    chk(!errs.length, w + "px: no JS errors", errs.join(" | "));
    await ctx.close();
  }
  await b.close(); srv.close();
  console.log(fails ? "\n" + fails + " FAILURES" : "\nthe Classic says who is out of LMS");
  process.exit(fails ? 1 : 0);
})();
