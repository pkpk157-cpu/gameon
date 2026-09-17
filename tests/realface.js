const GOENV = require("./lib/env.js");
/* The real thing: the published data.json with the league's own photo codes,
   and the photographs actually in the repo. No fixture, no stand-ins. */
const { chromium } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP;
const S = GOENV.OUT;
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css",
            ".json":"application/json", ".svg":"image/svg+xml", ".webp":"image/webp" };
const srv = http.createServer((q, r) => {
  let u = decodeURIComponent(q.url.split("?")[0]); if (u === "/") u = "/index.html";
  fs.readFile(path.join(APP, u), (e, b) => { if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { "content-type": T[path.extname(u)] || "text/plain", "cache-control": "no-store" }); r.end(b); });
});
const ds = JSON.parse(fs.readFileSync(APP + "/data.json", "utf8")).dataset;
const have = new Set(fs.readdirSync(APP + "/photos").map((f) => +f.slice(1, -5)));
// a manager whose starting eleven is well covered, so the pitch shows the point
let best = null, bestN = -1;
for (const mid of Object.keys(ds.picks[ds.pitchGw])) {
  const n = ds.picks[ds.pitchGw][mid].p.filter((x) => have.has(ds.elements[x[0]][7])).length;
  if (n > bestN) { bestN = n; best = mid; }
}
(async () => {
  await new Promise((r) => srv.listen(8622, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  const ctx = await b.newContext({ viewport: { width: 390, height: 880 }, serviceWorkers: "block" });
  const p = await ctx.newPage();
  const errs = [], bad = [];
  p.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  p.on("response", (r) => { if (r.url().includes("/photos/") && r.status() !== 200) bad.push(r.status() + " " + r.url().split("/").pop()); });

  await p.goto("http://127.0.0.1:8622/#profile/" + best, { waitUntil: "networkidle" });
  await p.waitForTimeout(1200);
  await p.evaluate(() => { const e = document.querySelector(".pcard"); if (e) e.scrollIntoView({ block: "center" }); });
  await p.waitForTimeout(1200);
  await p.screenshot({ path: S + "/real-pitch.png" });
  const pitch = await p.evaluate(() => ({
    cards: document.querySelectorAll(".pcard").length,
    imgs: document.querySelectorAll(".pcard img.facepic").length,
    drawn: [...document.querySelectorAll(".pcard img.facepic")].filter((i) => i.complete && i.naturalWidth > 0).length
  }));
  console.log("pitch (entry " + best + "):", JSON.stringify(pitch));

  await p.goto("http://127.0.0.1:8622/#prices/stats", { waitUntil: "networkidle" });
  await p.waitForTimeout(1500);
  await p.screenshot({ path: S + "/real-boards.png" });
  const boards = await p.evaluate(() => ({
    rows: document.querySelectorAll("table.psbtbl tbody tr[data-el]").length,
    faces: document.querySelectorAll("table.psbtbl .face").length,
    drawn: [...document.querySelectorAll("table.psbtbl img.facepic")].filter((i) => i.complete && i.naturalWidth > 0).length
  }));
  console.log("boards:", JSON.stringify(boards));
  console.log("photo requests that did not return 200:", bad.length ? bad.slice(0, 5) : "none");
  console.log("script errors:", errs.length ? errs : "none");
  await b.close(); srv.close();
})();
