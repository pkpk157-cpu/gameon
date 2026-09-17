const GOENV = require("./lib/env.js");
const { chromium, devices } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP, PORT = 8731;
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".svg":"image/svg+xml", ".webp":"image/webp" };
const srv = http.createServer((q, r) => { let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  fs.readFile(path.join(APP, u), (e, b) => { if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { "content-type": T[path.extname(u)] || "text/plain", "cache-control": "no-store" }); r.end(b); }); });
(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  for (const w of [480, 460, 430, 412, 400, 390, 375, 360, 340, 320]) {
    const ctx = await b.newContext({ viewport: { width: w, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
    const p = await ctx.newPage();
    await p.goto("http://localhost:" + PORT + "/index.html#classic", { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(1200);
    console.log("\n--- " + w + "px ---");
    for (const v of ["classic", "monthly", "lms", "pyramid", "h2h", "vol", "prices", "pl/table"]) {
      await p.evaluate(h => { location.hash = h; }, "#" + v);
      await p.waitForTimeout(600);
      if (v === "h2h") { await p.selectOption("#stageSel", { index: 1 }).catch(() => {}); await p.waitForTimeout(400); }
      const r = await p.evaluate(() => {
        const t = document.querySelector("section.view.active table.t");
        if (!t) return null;
        let el = t, scroller = null, over = 0;
        while (el && el !== document.body) { const cs = getComputedStyle(el); if (/(auto|scroll|hidden)/.test(cs.overflowX) || el.classList.contains("freeze") || el.classList.contains("card")) { over = Math.max(over, el.scrollWidth - el.clientWidth); if (el.scrollWidth > el.clientWidth + 1 && !scroller) scroller = el; } el = el.parentElement; }
        const heads = [...t.querySelectorAll("thead th")].map(x => x.textContent.trim());
        const last = t.querySelector("thead th:last-child");
        const lr = last ? last.getBoundingClientRect() : null;
        const row = t.querySelector("tbody tr");
        return { cols: heads.length, heads: heads.join("|"), tableW: Math.round(t.getBoundingClientRect().width),
                 lastColRight: lr ? Math.round(lr.right) : null, vw: window.innerWidth,
                 scrolls: !!scroller, over, rowH: row ? Math.round(row.getBoundingClientRect().height) : null };
      });
      if (!r) { console.log("  " + v.padEnd(9) + " (no table)"); continue; }
      const cut = r.over > 1 || r.lastColRight > r.vw;
      console.log("  " + v.padEnd(9) + " cols=" + r.cols + " rowH=" + r.rowH + " over=" + r.over + "px lastColRight=" + r.lastColRight + "/" + r.vw +
        (cut ? "  *** FAIL: overflows its card by " + r.over + "px ***" : "  fits") + "   [" + r.heads + "]");
    }
    await ctx.close();
  }
  await b.close(); srv.close();
})();
