const GOENV = require("./lib/env.js");
/* A photograph whose player has changed club is held back, and the club jersey
   is drawn instead. Without the list, nothing changes. */
const { chromium, devices } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP, PORT = 8775;
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".webp":"image/webp", ".png":"image/png" };
const base = JSON.parse(fs.readFileSync(APP + "/data.json", "utf8"));
const KONSA = "199798";
let hide = [];
const srv = http.createServer((q, r) => { let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  if (u === "/data.json") { const d = JSON.parse(JSON.stringify(base)); d.dataset.faceHide = hide;
    r.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }); r.end(JSON.stringify(d)); return; }
  fs.readFile(path.join(APP, u), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { "content-type": T[path.extname(u)] || "text/plain" }); r.end(b); }); });
let fails = 0; const chk = (ok, m, x) => { console.log((ok ? "  ok   " : "  FAIL ") + m + (x ? "  " + x : "")); if (!ok) fails++; };
// which element id is the player we are holding back?
const el = Object.entries(base.dataset.elements).find(([, e]) => String(e[7]) === KONSA);
const konsaId = el ? +el[0] : null;
const owner = Object.entries(base.dataset.picks[base.dataset.pitchGw] || {})
  .find(([, sq]) => (sq.p || []).some((t) => +t[0] === konsaId));
(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  chk(!!konsaId && !!owner, "the player is in somebody's squad to look at", "element " + konsaId + ", manager " + (owner && owner[0]));
  for (const on of [false, true]) {
    hide = on ? [KONSA] : [];
    const ctx = await b.newContext({ ...devices["iPhone 12"], serviceWorkers: "block" });
    const p = await ctx.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
    await p.goto("http://localhost:" + PORT + "/index.html#profile/" + owner[0], { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(2000);
    const r = await p.evaluate((id) => {
      const card = document.querySelector('.pcard[data-el="' + id + '"]');
      if (!card) return null;
      const img = card.querySelector("img.facepic"), jsy = card.querySelector("svg.jsy");
      return { card: true, photo: !!img, photoLoaded: !!(img && img.complete && img.naturalWidth > 0),
        jersey: !!jsy, jerseyShown: !!(jsy && jsy.getBoundingClientRect().width > 4),
        name: card.querySelector(".pname") && card.querySelector(".pname").textContent };
    }, konsaId);
    chk(!!r && r.card, (on ? "held back" : "as normal") + ": his card is on the pitch", r && r.name);
    if (on) {
      chk(!r.photo, "held back: no photograph is drawn");
      chk(r.jerseyShown, "held back: the club jersey is drawn instead");
    } else {
      chk(r.photo && r.photoLoaded, "as normal: the photograph is drawn");
    }
    // the same player in a table row and on the player card
    await p.evaluate(() => location.hash = "#prices"); await p.waitForTimeout(1200);
    const row = await p.evaluate((code) => {
      const im = [...document.querySelectorAll("img.facepic")].filter(i => i.getAttribute("src").indexOf("p" + code + ".webp") !== -1);
      return im.length;
    }, KONSA);
    chk(on ? row === 0 : true, (on ? "held back" : "as normal") + ": the price table does not ask for it either", String(row));
    chk(errs.length === 0, (on ? "held back" : "as normal") + ": no JS errors", errs.join(" | "));
    await ctx.close();
  }
  // data with no list at all behaves as it always did
  hide = undefined;
  const ctx = await b.newContext({ ...devices["iPhone 12"], serviceWorkers: "block" });
  const p = await ctx.newPage();
  await p.goto("http://localhost:" + PORT + "/index.html#profile/" + owner[0], { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(1800);
  chk(await p.evaluate((id) => { const c = document.querySelector('.pcard[data-el="' + id + '"]'); return !!(c && c.querySelector("img.facepic")); }, konsaId),
    "data published before this existed: photographs show as before");
  await ctx.close();
  await b.close(); srv.close(); console.log(fails ? "FAILS: " + fails : "ALL OK");
})();
