const GOENV = require("./lib/env.js");
/* The PL table with crests back: every club named in full, nothing running
   under the next column, no table wider than its card, in both themes. */
const { chromium } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP, PORT = 8778;
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".webp":"image/webp", ".png":"image/png", ".svg":"image/svg+xml" };
const srv = http.createServer((q, r) => { let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  fs.readFile(path.join(APP, u), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { "content-type": T[path.extname(u)] || "text/plain" }); r.end(b); }); });
let fails = 0; const chk = (ok, m, x) => { console.log((ok ? "  ok   " : "  FAIL ") + m + (x ? "  " + x : "")); if (!ok) fails++; };
(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  for (const theme of ["dark", "light"]) {
    for (const w of [320, 360, 390, 412, 430, 520, 560, 768, 1024]) {
      const ctx = await b.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 2, isMobile: w < 560, hasTouch: true, serviceWorkers: "block", colorScheme: theme });
      await ctx.addInitScript((t) => { try { localStorage.setItem("go12.theme", JSON.stringify(t)); } catch (e) {} }, theme);
      const p = await ctx.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
      await p.goto("http://127.0.0.1:" + PORT + "/index.html#pl/table", { waitUntil: "domcontentloaded" });
      await p.waitForSelector("table.t.pltbl td.name", { timeout: 8000 });
      await p.waitForTimeout(500);
      const r = await p.evaluate(() => {
        const tbl = document.querySelector("table.t.pltbl");
        const rows = [...tbl.querySelectorAll("tbody tr")];
        let clash = 0, noCrest = 0, tiny = 0, cut = 0; const bad = [], short = [];
        rows.forEach(tr => {
          const td = tr.querySelector("td.name"); if (!td) return;
          const img = td.querySelector(".crest");
          const box = img && img.getBoundingClientRect();
          if (!img || getComputedStyle(img).display === "none" || !box || box.width < 10) { noCrest++; return; }
          if (box.width < 14 || box.height < 14) tiny++;
          const rng = document.createRange(); rng.selectNodeContents(td);
          const nx = td.nextElementSibling;
          if (nx && Math.round(rng.getBoundingClientRect().right) > Math.round(nx.getBoundingClientRect().left) + 1) { clash++; bad.push(td.textContent.trim()); }
          // a capped cell trails the name off instead of overrunning, which the
          // clash test above cannot see
          const who = td.querySelector(".who") || td;
          if (who.scrollWidth > who.clientWidth + 0.5) { cut++; short.push(td.textContent.trim()); }
        });
        const card = tbl.closest(".card"), cr = card && card.getBoundingClientRect();
        return { rows: rows.length, clash, bad: bad.slice(0,4), noCrest, tiny, cut, short: short.slice(0,4),
                 over: cr ? Math.round(tbl.getBoundingClientRect().right - cr.right) : 0,
                 hscroll: Math.round(document.documentElement.scrollWidth - window.innerWidth),
                 rowH: rows.length ? Math.round(rows[0].getBoundingClientRect().height) : 0,
                 cols: [...tbl.querySelectorAll("thead th")].filter(t => t.getBoundingClientRect().width > 0).map(t => t.textContent.trim()).join(" ") };
      });
      const tag = theme + " " + w;
      chk(r.rows === 20, tag + ": twenty clubs", r.rows + " rows");
      chk(r.noCrest === 0, tag + ": every club shows its crest", r.noCrest + " missing");
      chk(r.clash === 0, tag + ": no club name runs under the next column", r.bad.join(", "));
      chk(r.cut === 0, tag + ": no club name is trimmed to fit", r.short.join(", "));
      chk(r.over <= 0 && r.hscroll <= 0, tag + ": table stays inside its card, page does not scroll sideways",
        "card " + r.over + "px, page " + r.hscroll + "px");
      chk(errs.length === 0, tag + ": no JS errors", errs.join(" | "));
      if (theme === "dark" && (w === 320 || w === 390 || w === 560)) {
        console.log("        cols: " + r.cols + "   rowH " + r.rowH);
        await p.screenshot({ path: "pltfix-" + w + ".png", clip: { x: 0, y: 125, width: w, height: 300 } });
      }
      await ctx.close();
    }
  }
  await b.close(); srv.close(); console.log(fails ? "FAILS: " + fails : "ALL OK");
})();
