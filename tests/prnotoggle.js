const GOENV = require("./lib/env.js");
/* The two player pages are reached from the profile sheet, one each, so neither
   carries a toggle TO THE OTHER any more — and each still opens the right page
   with its own title, and back still leaves. A control that filters the page
   you asked for is a different thing and is allowed: Price changes has one for
   narrowing to your own squad. What is forbidden is a control that navigates. */
const { chromium } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP, PORT = 8783;
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".webp":"image/webp", ".png":"image/png", ".svg":"image/svg+xml" };
const srv = http.createServer((q, r) => { let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  fs.readFile(path.join(APP, u), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { "content-type": T[path.extname(u)] || "text/plain" }); r.end(b); }); });
let fails = 0; const chk = (ok, m, x) => { console.log((ok ? "  ok   " : "  FAIL ") + m + (x ? "  " + x : "")); if (!ok) fails++; };
(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  for (const w of [390, 320, 768]) {
    const ctx = await b.newContext({ viewport: { width: w, height: 880 }, deviceScaleFactor: 2, isMobile: w < 560, hasTouch: true, serviceWorkers: "block", colorScheme: "dark" });
    await ctx.addInitScript(() => { try { localStorage.setItem("go12.me", JSON.stringify(1255976)); } catch (e) {} });
    const p = await ctx.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));

    for (const [item, hash, title, rows] of [["#pfPrices", "#prices", "Price changes", "table.pricetbl tbody tr"],
                                             ["#pfPlayers", "#prices/stats", "Player stats", "#psPanel tbody tr"]]) {
      await p.goto("http://127.0.0.1:" + PORT + "/index.html#classic", { waitUntil: "domcontentloaded" });
      await p.waitForTimeout(1300);
      await p.click("#barYou"); await p.waitForTimeout(400);
      await p.click(item); await p.waitForTimeout(1000);
      const r = await p.evaluate((sel) => {
        const view = document.querySelector("section.view.active");
        const segs = [...view.querySelectorAll(".pseg")];
        return { hash: location.hash, title: document.querySelector("#barTitle").textContent.trim(),
                 crossers: view.querySelectorAll("[data-pr]").length,
                 // any segment bar that is not the prices page's own squad filter
                 strays: segs.filter((x) => x.id !== "prWho").length,
                 rows: view.querySelectorAll(sel).length };
      }, rows);
      const tag = w + " " + title;
      chk(r.hash === hash, tag + ": opens its own page", r.hash);
      chk(r.title === title, tag + ": the bar names it", r.title);
      chk(r.crossers === 0, tag + ": nothing on the page navigates to the other half", String(r.crossers));
      chk(r.strays === 0, tag + ": and no segment bar beyond the page's own filter", String(r.strays));
      chk(r.rows > 0, tag + ": and the content is there", String(r.rows));
      // back leaves rather than crossing to the other half
      await p.click("#barBack"); await p.waitForTimeout(700);
      chk(["#classic", ""].indexOf(await p.evaluate(() => location.hash)) !== -1,
        tag + ": back returns to the league", await p.evaluate(() => location.hash));
    }
    // the Premier League keeps its toggle — that section is one entry, two views
    await p.goto("http://127.0.0.1:" + PORT + "/index.html#pl", { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(1200);
    chk(await p.evaluate(() => document.querySelectorAll('section.view.active [data-pl]').length) === 2,
      w + ": the Premier League still has its Fixtures/Table toggle");
    chk(errs.length === 0, w + ": no JS errors", errs.join(" | "));
    await ctx.close();
  }
  await b.close(); srv.close(); console.log(fails ? "FAILS: " + fails : "ALL OK");
})();
