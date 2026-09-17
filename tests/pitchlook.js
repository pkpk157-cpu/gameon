const GOENV = require("./lib/env.js");
const { chromium } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP;
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".svg":"image/svg+xml" };
const srv = http.createServer((q, r) => { let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  fs.readFile(path.join(APP, u), (e, b) => { if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { "content-type": T[path.extname(u)] || "text/plain", "cache-control": "no-store" }); r.end(b); }); });
const W = Number(process.argv[2] || 390), TAG = process.argv[3] || "now";
(async () => {
  await new Promise((r) => srv.listen(9766, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  const ctx = await b.newContext({ viewport: { width: W, height: 1000 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  const p = await ctx.newPage();
  await p.goto("http://localhost:9766/index.html#profile/1255976", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(2600);
  const m = await p.evaluate(() => {
    const pitch = document.querySelector(".pitch");
    if (!pitch) return { none: true, html: document.body.innerText.slice(0, 200) };
    const r = (el) => { const b = el.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height), t: Math.round(b.top) }; };
    const rows = [...pitch.querySelectorAll(".prow")].map((x) => ({ n: x.children.length, ...r(x) }));
    const card = pitch.querySelector(".pcard");
    const bench = document.querySelector(".pbench");
    return { pitch: r(pitch), rows, card: card ? r(card) : null,
      jsy: r(pitch.querySelector(".jsy")),
      name: getComputedStyle(pitch.querySelector(".pname")).fontSize,
      pts: getComputedStyle(pitch.querySelector(".ppts")).fontSize,
      bench: bench ? r(bench) : null,
      benchCard: bench ? r(bench.querySelector(".pcard")) : null,
      benchLbl: bench ? [...bench.querySelectorAll(".pposlbl")].map((x) => x.textContent) : null };
  });
  console.log(JSON.stringify(m, null, 1));
  const el = await p.$(".pitchcard") || await p.$(".pitch");
  await el.screenshot({ path: __dirname + "/pitch-" + TAG + "-" + W + ".png" });
  await b.close(); srv.close();
})();
