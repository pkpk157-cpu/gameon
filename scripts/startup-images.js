#!/usr/bin/env node
/* node scripts/startup-images.js  (from the repo, with the tests' browser set up)
 */
// Draws the opening screen at every iPhone and iPad size, for iOS to show
// while the app starts. Written as JPEGs: the screen is gradients, which
// PNG holds at many times the size for no visible gain.
const { chromium } = require("playwright-core"); const GOENV = require("../tests/lib/env.js");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP, OUT = path.join(APP, "startup");
const SIZES = [ // CSS width, height, pixel ratio
  [440, 956, 3], [430, 932, 3], [428, 926, 3], [420, 912, 3], [414, 896, 3], [414, 896, 2], [414, 736, 3],
  [402, 874, 3], [393, 852, 3], [390, 844, 3], [375, 812, 3], [375, 667, 2], [320, 568, 2],
  [1024, 1366, 2], [834, 1194, 2], [834, 1112, 2], [820, 1180, 2], [810, 1080, 2], [768, 1024, 2], [744, 1133, 2]];
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".webp":"image/webp", ".png":"image/png" };
const srv = http.createServer((q, r) => { let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  if (u === "/data.json") { r.writeHead(503); r.end(); return; }
  fs.readFile(path.join(APP, u), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { "content-type": T[path.extname(u)] || "text/plain" }); r.end(b); }); });
(async () => {
  await new Promise((r) => srv.listen(8985, r)); fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: GOENV.CHROME }); const links = [];
  for (const [w, h, dpr] of SIZES) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: true, reducedMotion: "reduce", serviceWorkers: "block" });
    await ctx.addInitScript(() => { try { localStorage.setItem("go12.theo", "off"); } catch (e) {} });
    const p = await ctx.newPage(); await p.route(/fantasy|goatcounter/, (r) => r.abort());
    await p.goto("http://127.0.0.1:8985/index.html", { waitUntil: "load" });
    await p.waitForFunction(() => { const i = document.querySelector("#splash img"); return i && i.complete && i.naturalWidth > 0; });
    await p.waitForTimeout(250);
    const f = "ios-" + (w * dpr) + "x" + (h * dpr) + ".jpg";
    await p.screenshot({ path: path.join(OUT, f), type: "jpeg", quality: 86 });
    links.push('<link rel="apple-touch-startup-image" href="startup/' + f + '" media="(device-width: ' + w + 'px) and (device-height: ' + h + 'px) and (-webkit-device-pixel-ratio: ' + dpr + ') and (orientation: portrait)" />');
    await ctx.close();
  }
  // the links index.html carries, one per size
  console.log(links.join("\n"));
  await b.close(); srv.close();
  const tot = fs.readdirSync(OUT).filter((x) => x.endsWith(".jpg")).reduce((t, x) => t + fs.statSync(path.join(OUT, x)).size, 0);
  console.log(links.length + " startup images, " + Math.round(tot / 1024) + " KB in all");
})();
