const GOENV = require("./lib/env.js");
/* The crest is the icon at every size and the opening screen. */
const { chromium, devices } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP, PORT = 8749;
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".svg":"image/svg+xml", ".webp":"image/webp", ".png":"image/png" };
let delay = 0, failData = false;
const srv = http.createServer((q, r) => { let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  if (u === "/data.json" && failData) { r.writeHead(500); r.end(); return; }
  setTimeout(() => fs.readFile(path.join(APP, u), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { "content-type": T[path.extname(u)] || "text/plain" }); r.end(b); }), u === "/data.json" ? delay : 0); });
let fails = 0; const chk = (ok, m, x) => { console.log((ok ? "  ok   " : "  FAIL ") + m + (x ? "  " + x : "")); if (!ok) fails++; };
const pngSize = f => { const b = fs.readFileSync(f); return b.readUInt32BE(16) + "x" + b.readUInt32BE(20); };
(async () => {
  await new Promise(r => srv.listen(PORT, r));
  // files and manifest
  const man = JSON.parse(fs.readFileSync(APP + "/manifest.json", "utf8"));
  chk(man.icons.length === 3 && man.icons.every(i => fs.existsSync(APP + "/" + i.src)), "manifest lists three PNG icons that exist", man.icons.map(i => i.src + " " + i.purpose).join(", "));
  chk(pngSize(APP + "/icon-512.png") === "512x512" && pngSize(APP + "/icon-192.png") === "192x192" && pngSize(APP + "/apple-touch-icon.png") === "180x180" && pngSize(APP + "/favicon-64.png") === "64x64", "icons are 512, 192, 180 and 64 square");
  chk(!fs.existsSync(APP + "/icon.svg") && !/icon\.svg/.test(fs.readFileSync(APP + "/index.html", "utf8") + fs.readFileSync(APP + "/sw.js", "utf8") + fs.readFileSync(APP + "/app.js", "utf8")), "the old SVG icon is gone and nothing refers to it");
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  // slow data: the splash shows, then leaves once drawn
  delay = 1500;
  let ctx = await b.newContext({ ...devices["iPhone 12"], serviceWorkers: "block" });
  let p = await ctx.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.goto("http://localhost:" + PORT + "/index.html#classic", { waitUntil: "domcontentloaded" }); await p.waitForTimeout(500);
  const mid = await p.evaluate(() => { const s = document.querySelector("#splash"); const i = s && s.querySelector("img"); const r = s && s.getBoundingClientRect(); return { on: !!s && !s.classList.contains("gone"), covers: r && r.width === window.innerWidth && r.height === window.innerHeight, img: !!(i && i.complete && i.naturalWidth > 0), bg: s && getComputedStyle(s).backgroundColor, text: s && s.textContent.trim() }; });
  chk(mid.on && mid.covers && mid.img && mid.bg === "rgb(30, 1, 56)", "while loading: the crest on its purple covers the screen", JSON.stringify(mid));
  await p.screenshot({ path: "splash.png" });
  await p.waitForTimeout(2500);
  chk(await p.evaluate(() => !document.querySelector("#splash") && document.querySelectorAll("section.view.active table.t tbody tr").length > 0), "once the standings are drawn the splash is gone from the page");
  chk(await p.evaluate(() => [...document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]')].map(l => l.getAttribute("href"))).then(a => a.join(",") === "apple-touch-icon.png,favicon-64.png,icon-192.png"), "the page links the PNG icons");
  chk(errs.length === 0, "no JS errors", errs.join(" | "));
  await ctx.close();
  // data fails: the splash still leaves and the empty state shows the crest
  delay = 0; failData = true;
  ctx = await b.newContext({ ...devices["iPhone 12"], serviceWorkers: "block" });
  p = await ctx.newPage();
  await p.goto("http://localhost:" + PORT + "/index.html#classic", { waitUntil: "domcontentloaded" }); await p.waitForTimeout(2500);
  const emp = await p.evaluate(() => ({ splash: !!document.querySelector("#splash"), crest: !!document.querySelector(".empty img.big"), text: (document.querySelector(".empty") || {}).textContent }));
  chk(!emp.splash && emp.crest, "when the data cannot load the splash still leaves and the empty state wears the crest", emp.text && emp.text.trim().slice(0, 60));
  await p.screenshot({ path: "splash-empty.png" });
  await ctx.close();
  await b.close(); srv.close(); console.log(fails ? "FAILS: " + fails : "ALL OK");
})();
