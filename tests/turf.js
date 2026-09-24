const GOENV = require("./lib/env.js");
/* The pitch as the official app draws it. The turf is one drawing stretched
   over the pitch, so its lines are checked where they land on screen against
   the proportions measured off that app: the far touchline 7.3% down, the
   18-yard box 8.5% deep from it, halfway at 60%, the circle 40% of the width.
   The hoarding carries two crests that keep their shape, and every pitch in
   the app — profile, both compare pitches, the team of the week — gets it. */
const { chromium, devices } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP, PORT = 8805;
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".webp":"image/webp", ".png":"image/png" };
const srv = http.createServer((q, r) => { let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  fs.readFile(path.join(APP, u), (e, b) => { if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { "content-type": T[path.extname(u)] || "text/plain", "cache-control": "no-store" }); r.end(b); }); });
const ds = JSON.parse(fs.readFileSync(APP + "/data.json", "utf8")).dataset;
let fails = 0;
const chk = (ok, m, x) => { console.log((ok ? "  ok   " : "  FAIL ") + m + (x ? "  " + x : "")); if (!ok) fails++; };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

const measure = (p) => p.evaluate(() => [...document.querySelectorAll("section.view.active .pitch")].map((pitch) => {
  const P = pitch.getBoundingClientRect(), W = P.width, H = P.height;
  const svg = pitch.querySelector("svg.pturf"), S = svg && svg.getBoundingClientRect();
  const box = (sel) => { const e = pitch.querySelector(sel); return e ? e.getBoundingClientRect() : null; };
  const b18 = box(".box18"), half = box(".halfway"), circ = box(".circle"), goal = box(".pgoal");
  const imgs = [...pitch.querySelectorAll(".phoard img")].map((i) => ({ ok: i.complete && i.naturalWidth > 0, r: i.getBoundingClientRect() }));
  const hoard = box(".phoard");
  return { W, H, svgFits: S && near(S.width, W, 1) && near(S.height, H, 1) && near(S.top, P.top, 1),
    touch: b18 ? (b18.top - P.top) / H : null, box18: b18 ? (b18.bottom - P.top) / H : null, box18w: b18 ? b18.width / W : null,
    halfway: half ? (half.top - P.top) / H : null, circw: circ ? circ.width / W : null, circh: circ ? circ.height / H : null,
    goalw: goal ? goal.width / W : null, goalTop: goal ? (goal.top - P.top) / H : null,
    hoardw: hoard ? hoard.width / W : null, imgs: imgs.map((i) => ({ ok: i.ok, ratio: i.r.width / i.r.height })),
    oldSpans: pitch.querySelectorAll(".pmark span").length, rows: pitch.querySelectorAll(".prow").length };
  function near(a, b, t) { return Math.abs(a - b) <= t; }
}));

(async () => {
  await new Promise((r) => srv.listen(PORT, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  const ctx = await b.newContext({ ...devices["iPhone 12"], serviceWorkers: "block" });
  const p = await ctx.newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto("http://localhost:" + PORT + "/index.html#classic", { waitUntil: "domcontentloaded" });
  await p.waitForFunction(() => document.querySelector("section.view.active table.t tbody tr"), null, { timeout: 15000 });
  const two = ds.managers.slice(0, 2).map((m) => m.id);
  const views = [["profile/" + two[0], 1], ["compare", 2], ["stats", 1]];
  for (const [v, want] of views) {
    await p.evaluate((x) => { location.hash = "#" + x; }, v); await p.waitForTimeout(900);
    if (v === "stats") { await p.evaluate(() => { location.hash = "#stats/picks"; }); await p.waitForTimeout(800); }
    await p.evaluate(() => { const el = document.querySelector("section.view.active .pitch"); if (el) el.scrollIntoView({ block: "center" }); });
    await p.waitForLoadState("networkidle").catch(() => {}); await p.waitForTimeout(300);
    const ms = await measure(p);
    console.log("-- " + v + ": " + ms.length + " pitch(es)");
    chk(ms.length >= want, v + ": the pitch is drawn", String(ms.length));
    ms.forEach((m, i) => {
      const tag = v + " #" + (i + 1);
      chk(m.svgFits, tag + ": the turf covers the pitch exactly");
      chk(m.oldSpans === 0, tag + ": no leftover markings", String(m.oldSpans));
      chk(near(m.touch, 0.073, 0.006), tag + ": far touchline 7.3% down", (m.touch * 100).toFixed(1) + "%");
      chk(near(m.box18 - m.touch, 0.085, 0.006), tag + ": 18-yard box 8.5% deep", ((m.box18 - m.touch) * 100).toFixed(1) + "%");
      chk(near(m.box18w, 0.66 * 0.858, 0.02), tag + ": 18-yard box 66% of the pitch at its mouth", (m.box18w * 100).toFixed(1) + "% of the width");
      chk(near(m.halfway, 0.603, 0.006), tag + ": halfway 60% down", (m.halfway * 100).toFixed(1) + "%");
      chk(near(m.circw, 0.396, 0.01) && near(m.circh, 0.194, 0.01), tag + ": circle 40% wide, 19% tall", (m.circw * 100).toFixed(1) + " x " + (m.circh * 100).toFixed(1));
      chk(near(m.goalw, 0.174, 0.01) && near(m.goalTop, 0.022, 0.006), tag + ": goal a sixth of the width, standing above the line", (m.goalw * 100).toFixed(1) + "% from " + (m.goalTop * 100).toFixed(1) + "%");
      chk(near(m.hoardw, 0.81, 0.02), tag + ": hoarding along the far end", (m.hoardw * 100).toFixed(1) + "%");
      chk(m.imgs.length === 2 && m.imgs.every((x) => x.ok && near(x.ratio, 1, 0.05)), tag + ": two crests, loaded and square", JSON.stringify(m.imgs));
    });
  }
  chk(errs.length === 0, "no JS errors", errs.slice(0, 2).join(" | "));
  await b.close(); srv.close();
  console.log(fails ? "\nFAILS: " + fails : "\nthe pitch is drawn to measure");
  process.exit(fails ? 1 : 0);
})();
