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
  chk(man.icons.length === 4 && man.icons.every(i => fs.existsSync(APP + "/" + i.src)), "manifest lists four PNG icons that exist", man.icons.map(i => i.src + " " + i.purpose).join(", "));
  // Android fills its icon shape only from an icon marked maskable; one with
  // a file of its own, at both sizes Chrome asks for, and never the same file
  // listed twice, so Chrome cannot settle on the plain one and sit it in a
  // white circle
  const mk = man.icons.filter(i => i.purpose === "maskable"), any = man.icons.filter(i => i.purpose === "any");
  chk(mk.map(i => i.sizes).sort().join(",") === "192x192,512x512" && any.length === 2 &&
      mk.every(i => any.every(a => a.src !== i.src)) && mk.every(i => pngSize(APP + "/" + i.src) === i.sizes),
      "maskable icons have files of their own, at 192 and 512", mk.map(i => i.src + " " + i.sizes).join(", "));
  chk(pngSize(APP + "/icon-512.png") === "512x512" && pngSize(APP + "/icon-192.png") === "192x192" && pngSize(APP + "/apple-touch-icon.png") === "180x180" && pngSize(APP + "/favicon-64.png") === "64x64", "icons are 512, 192, 180 and 64 square");
  chk(!fs.existsSync(APP + "/icon.svg") && !/icon\.svg/.test(fs.readFileSync(APP + "/index.html", "utf8") + fs.readFileSync(APP + "/sw.js", "utf8") + fs.readFileSync(APP + "/app.js", "utf8")), "the old SVG icon is gone and nothing refers to it");
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  // slow data: the splash shows, then leaves once drawn
  delay = 1500;
  let ctx = await b.newContext({ ...devices["iPhone 12"], serviceWorkers: "block" });
  let p = await ctx.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.goto("http://localhost:" + PORT + "/index.html#classic", { waitUntil: "domcontentloaded" }); await p.waitForTimeout(500);
  const mid = await p.evaluate(() => { const s = document.querySelector("#splash"); const i = s && s.querySelector("img"), t = s && s.querySelector(".splashtxt");
    const r = s && s.getBoundingClientRect(), ir = i.getBoundingClientRect(), tr = t.getBoundingClientRect();
    return { on: !!s && !s.classList.contains("gone"), covers: r && r.width === window.innerWidth && r.height === window.innerHeight,
      img: !!(i && i.complete && i.naturalWidth > 0), src: i.getAttribute("src"), bg: s && getComputedStyle(s).backgroundColor, text: t.innerText.replace(/\s+/g, " ").trim(),
      midX: Math.round(ir.left + ir.width / 2 - innerWidth / 2), midY: Math.round(ir.top + ir.height / 2 - innerHeight / 2),
      below: tr.top >= ir.bottom - 2 && tr.bottom < innerHeight, glow: !!s.querySelector(".spglow") }; });
  chk(mid.on && mid.covers && mid.img && mid.src === "logo-crest.webp" && mid.bg === "rgb(55, 0, 60)" && mid.glow,
      "while loading: the crest on the app's purple, its colours rising from the foot, covers the screen", JSON.stringify(mid));
  chk(mid.text === "The home of the FPL addicts" && mid.below, "and under it: The home of the FPL addicts", mid.text);
  chk(Math.abs(mid.midX) <= 1 && Math.abs(mid.midY) <= 20, "the crest sits in the middle of the screen", mid.midX + "," + mid.midY);
  const man2 = JSON.parse(fs.readFileSync(APP + "/manifest.json", "utf8"));
  chk(man2.background_color === "#37003c", "the phone's own launch screen is on the same purple", man2.background_color);
  await p.screenshot({ path: "splash.png" });
  await p.waitForTimeout(2500);
  chk(await p.evaluate(() => !document.querySelector("#splash") && document.querySelectorAll("section.view.active table.t tbody tr").length > 0), "once the standings are drawn the splash is gone from the page");
  chk(await p.evaluate(() => [...document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]')].map(l => l.getAttribute("href"))).then(a => a.join(",") === "apple-touch-icon.png,favicon-64.png,icon-192.png"), "the page links the PNG icons");
  chk(errs.length === 0, "no JS errors", errs.join(" | "));
  await ctx.close();
  // quick data: the opening screen is still on for a second, and no longer
  delay = 0;
  {
    const c = await b.newContext({ ...devices["Pixel 7"], serviceWorkers: "block" }); const pg = await c.newPage();
    await pg.goto("http://localhost:" + PORT + "/index.html#classic", { waitUntil: "domcontentloaded" });
    const at = await pg.evaluate(() => new Promise((res) => { const t = setInterval(() => { const s = document.querySelector("#splash");
      if (!s || s.classList.contains("gone")) { clearInterval(t); res(Math.round(performance.now())); } }, 15); }));
    chk(at >= 990 && at <= 1700, "with the data quick, the opening screen is on for a second", at + "ms");
    await c.close();
  }
  // a small phone: the crest and its line both fit
  {
    const c = await b.newContext({ viewport: { width: 320, height: 568 }, isMobile: true, serviceWorkers: "block" }); const pg = await c.newPage();
    delay = 1500; await pg.goto("http://localhost:" + PORT + "/index.html#classic", { waitUntil: "domcontentloaded" }); await pg.waitForTimeout(500);
    const f = await pg.evaluate(() => { const s = document.querySelector("#splash"), i = s.querySelector("img").getBoundingClientRect(), t = s.querySelector(".splashtxt").getBoundingClientRect();
      return { fits: i.left >= 0 && i.right <= innerWidth && i.top >= 0 && t.bottom <= innerHeight && t.left >= 0 && t.right <= innerWidth, apart: t.top >= i.bottom - 2 }; });
    chk(f.fits && f.apart, "on a 320px phone the crest and its line fit, apart", JSON.stringify(f));
    await c.close();
  }
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
