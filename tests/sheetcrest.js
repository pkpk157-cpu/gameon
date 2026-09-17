const GOENV = require("./lib/env.js");
const { chromium, devices } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP, PORT = 8750;
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".svg":"image/svg+xml", ".webp":"image/webp", ".png":"image/png" };
const srv = http.createServer((q, r) => { let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  fs.readFile(path.join(APP, u), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { "content-type": T[path.extname(u)] || "text/plain" }); r.end(b); }); });
let fails = 0; const chk = (ok, m, x) => { console.log((ok ? "  ok   " : "  FAIL ") + m + (x ? "  " + x : "")); if (!ok) fails++; };
(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  for (const [tag, h, theme] of [["tall", 844, "light"], ["short", 560, "dark"]]) {
    const ctx = await b.newContext({ viewport: { width: 390, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: "block", colorScheme: theme });
    await ctx.addInitScript((t) => { try { localStorage.setItem("go12.theme", JSON.stringify(t)); localStorage.setItem("go12.me", "1255976"); } catch (e) {} }, theme);
    const p = await ctx.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
    await p.goto("http://localhost:" + PORT + "/index.html#classic", { waitUntil: "domcontentloaded" }); await p.waitForTimeout(1500);
    for (const [btn, body] of [["#barMenu", "#menuBody"], ["#barYou", "#youBody"]]) {
      await p.click(btn); await p.waitForTimeout(600);
      const m = await p.evaluate((body) => { const bd = document.querySelector(body); const c = bd.querySelector(".sheetcrest img"); const r = c.getBoundingClientRect(); const br = bd.getBoundingClientRect();
        const last = [...bd.children].filter(x => !x.classList.contains("sheetcrest")).pop(); const lr = last.getBoundingClientRect();
        return { loaded: c.complete && c.naturalWidth > 0, isLast: bd.lastElementChild.classList.contains("sheetcrest"), belowContent: r.top >= lr.bottom, bottomGap: Math.round(br.bottom - r.bottom), scrolls: bd.scrollHeight > bd.clientHeight + 1, centered: Math.abs((r.left + r.right) / 2 - (br.left + br.right) / 2) < 2 }; }, body);
      chk(m.loaded && m.isLast && m.belowContent && m.centered, tag + " " + body + ": the crest is the last thing, below the content, centred", JSON.stringify(m));
      if (!m.scrolls) chk(m.bottomGap >= 0 && m.bottomGap <= 60, tag + " " + body + ": on a short sheet it sits at the bottom", "gap " + m.bottomGap);
      await p.screenshot({ path: "sheetcrest-" + tag + "-" + body.slice(1) + ".png" });
      await p.evaluate(() => history.back()); await p.waitForTimeout(500);
    }
    chk(errs.length === 0, tag + ": no JS errors", errs.join(" | "));
    await ctx.close();
  }
  await b.close(); srv.close(); console.log(fails ? "FAILS: " + fails : "ALL OK");
})();
