const GOENV = require("./lib/env.js");
const { chromium } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP;
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".svg":"image/svg+xml" };
const srv = http.createServer((q, r) => { let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  fs.readFile(path.join(APP, u), (e, b) => { if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { "content-type": T[path.extname(u)] || "text/plain", "cache-control": "no-store" }); r.end(b); }); });
const ds = JSON.parse(fs.readFileSync(APP + "/data.json", "utf8")).dataset;
const me = ds.managers[0], them = ds.managers[1];
(async () => {
  await new Promise((r) => srv.listen(9775, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  const ctx = await b.newContext({ viewport: { width: 390, height: 1200 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await ctx.addInitScript((id) => localStorage.setItem("go12.me", JSON.stringify(id)), me.id);
  const p = await ctx.newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto("http://localhost:9775/index.html#profile/" + them.id, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(1800);
  await p.click("#cmpMe"); await p.waitForTimeout(1400);
  const m = await p.evaluate(() => {
    const w = document.querySelector(".cmppitch"); if (!w) return { none: true };
    const pit = [...w.querySelectorAll(".pitch")];
    return { pitches: pit.length,
      box: pit.map((x) => { const r = x.getBoundingClientRect(); return Math.round(r.width) + "x" + Math.round(r.height); }),
      cards: [...w.querySelectorAll(".pcard")].slice(0, 4).map((c) => Math.round(c.getBoundingClientRect().width)),
      over: pit.some((x) => [...x.querySelectorAll(".prow")].some((r) => {
        const rb = x.getBoundingClientRect();
        return [...r.children].some((c) => c.getBoundingClientRect().left < rb.left - 1 || c.getBoundingClientRect().right > rb.right + 1);
      })),
      pageScrolls: document.documentElement.scrollWidth > window.innerWidth + 1 };
  });
  console.log(JSON.stringify(m), "errors:", errs.length ? errs : "none");
  const el = await p.$(".cmppitch");
  if (el) await el.screenshot({ path: __dirname + "/cmppitch.png" });
  await b.close(); srv.close();
})();
