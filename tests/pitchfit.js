const GOENV = require("./lib/env.js");
/* The pitch: every card the same size whatever the formation, real grass
   between them, and nothing over the touchline — at every width, including a
   Bench Boost eleven and the two half-size pitches of a head-to-head. */
const { chromium } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP;
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".svg":"image/svg+xml" };
let DATA = APP + "/data.json";
const srv = http.createServer((q, r) => {
  let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  const f = u === "/data.json" ? DATA : path.join(APP, u);
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { "content-type": T[path.extname(f)] || "text/plain", "cache-control": "no-store" }); r.end(b); });
});
let fails = 0;
const chk = (n, ok, d) => { if (!ok) { fails++; console.log("   FAIL " + n + (d ? " — " + d : "")); } };

// A 3-5-2: five across is the widest row this pitch ever draws, and the one
// that decides whether a card can keep its size.
const raw = JSON.parse(fs.readFileSync(APP + "/data.json", "utf8"));
const wide = JSON.parse(JSON.stringify(raw));
let WIDE_ID = null;
{
  const ds = wide.dataset, gw = String(ds.pitchGw);
  const type = (el) => (ds.elements[el] || [])[1];
  WIDE_ID = Object.keys(ds.picks[gw]).find((id) => {
    const p = ds.picks[gw][id].p || [];
    const xi = p.slice(0, 11).map((r) => type(r[0]));
    return xi.filter((t) => t === 2).length >= 3 && xi.filter((t) => t === 3).length >= 4;
  });
  if (WIDE_ID) {
    const p = ds.picks[gw][WIDE_ID].p;
    // promote a fifth midfielder off the bench in place of a third forward
    const xi = p.slice(0, 11);
    const mids = xi.filter((r) => type(r[0]) === 3).length;
    const benchMid = p.slice(11).find((r) => type(r[0]) === 3);
    const spare = xi.slice().reverse().find((r) => type(r[0]) === 4);
    if (mids < 5 && benchMid && spare) {
      const a = p.indexOf(spare), b2 = p.indexOf(benchMid);
      const t = p[a]; p[a] = p[b2]; p[b2] = t;
      p[a][1] = 1; p[b2][1] = 0;
    }
  }
  fs.writeFileSync("/tmp/pitch-wide.json", JSON.stringify(wide));
}

const measure = () => ({
  pitches: [...document.querySelectorAll(".pitch")].map((pitch) => {
    const box = pitch.getBoundingClientRect();
    const rows = [...pitch.querySelectorAll(".prow")].map((row) => {
      const cells = [...row.children].map((c) => c.getBoundingClientRect());
      return { n: cells.length,
        w: cells.map((c) => Math.round(c.width)),
        left: Math.round(Math.min(...cells.map((c) => c.left))),
        right: Math.round(Math.max(...cells.map((c) => c.right))),
        top: Math.round(cells[0].top),
        gap: cells.length > 1 ? Math.round(cells[1].left - cells[0].right) : null };
    });
    return { w: Math.round(box.width), h: Math.round(box.height),
             left: Math.round(box.left), right: Math.round(box.right), rows };
  }),
  clipped: [...document.querySelectorAll(".pitch .pname, .pbench .pname")]
    .filter((el) => el.scrollWidth > el.clientWidth + 0.5).map((el) => el.textContent.trim()),
  cardH: [...document.querySelectorAll(".pitch .pcard")].map((c) => Math.round(c.getBoundingClientRect().height)),
  bench: (function () {
    const b = document.querySelector(".pbench"); if (!b) return null;
    const cells = [...b.querySelectorAll(".pcell")].map((c) => c.getBoundingClientRect());
    return { n: cells.length, w: cells.map((c) => Math.round(c.width)),
             left: Math.round(Math.min(...cells.map((c) => c.left))),
             right: Math.round(Math.max(...cells.map((c) => c.right))),
             box: [Math.round(b.getBoundingClientRect().left), Math.round(b.getBoundingClientRect().right)] };
  })()
});

const CASES = [
  ["profile 320", 320, "#profile/1255976", null],
  ["profile 390", 390, "#profile/1255976", null],
  ["profile 430", 430, "#profile/1255976", null],
  ["profile 768", 768, "#profile/1255976", null],
  ["five across 320", 320, "#profile/WIDE", "/tmp/pitch-wide.json"],
  ["five across 390", 390, "#profile/WIDE", "/tmp/pitch-wide.json"]
];

(async () => {
  await new Promise((r) => srv.listen(9770, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  for (const [label, w, hash, data] of CASES) {
    DATA = data || (APP + "/data.json");
    const ctx = await b.newContext({ viewport: { width: w, height: 1000 }, deviceScaleFactor: 2,
      isMobile: w < 700, hasTouch: true, serviceWorkers: "block" });
    const p = await ctx.newPage();
    const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.goto("http://localhost:9770/index.html" + hash.replace("WIDE", WIDE_ID || "1255976"),
      { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(2600);
    const m = await p.evaluate(measure);
    if (!m.pitches.length) { console.log("\n" + label + ": no pitch on screen"); continue; }
    console.log("\n" + label);
    m.pitches.forEach((pi, i) => {
      console.log("   pitch " + (i + 1) + " " + pi.w + "x" + pi.h + "  rows: " +
        pi.rows.map((r) => r.n + "@" + r.w[0] + (r.gap != null ? " gap" + r.gap : "")).join(", "));
      const all = pi.rows.flatMap((r) => r.w);
      chk(label + ": every card on a pitch is the same width",
          Math.max(...all) - Math.min(...all) <= 1, JSON.stringify(all));
      pi.rows.forEach((r) => {
        chk(label + ": a row of " + r.n + " stays inside the touchline",
            r.left >= pi.left - 1 && r.right <= pi.right + 1,
            r.left + ".." + r.right + " in " + pi.left + ".." + pi.right);
        if (r.gap != null) chk(label + ": a row of " + r.n + " has grass between the cards",
            r.gap >= 4, String(r.gap));
      });
      // rows evenly spread down the pitch, not bunched at one end
      const tops = pi.rows.map((r) => r.top);
      const steps = tops.slice(1).map((t, i2) => t - tops[i2]);
      if (steps.length > 1) chk(label + ": the rows are evenly spread",
          Math.max(...steps) - Math.min(...steps) <= 4, JSON.stringify(steps));
    });
    if (m.bench) {
      console.log("   bench " + m.bench.n + "@" + m.bench.w[0] + "  " + m.bench.left + ".." + m.bench.right +
        " in " + m.bench.box.join(".."));
      chk(label + ": the bench sits inside its panel",
          m.bench.left >= m.bench.box[0] - 1 && m.bench.right <= m.bench.box[1] + 1);
    }
    const h = m.cardH;
    if (h.length) {
      console.log("   card height " + Math.min(...h) + "-" + Math.max(...h) + ", names cut: " +
        (m.clipped.length ? JSON.stringify(m.clipped) : "none"));
      chk(label + ": cards stand taller than they are wide",
          Math.min(...h) > Math.max(...m.pitches[0].rows.flatMap((r) => r.w)),
          Math.min(...h) + " tall vs " + Math.max(...m.pitches[0].rows.flatMap((r) => r.w)) + " wide");
    }
    chk(label + ": no errors", errs.length === 0, JSON.stringify(errs.slice(0, 2)));
    await p.screenshot({ path: __dirname + "/pitchfit-" + label.replace(/ /g, "-") + ".png", fullPage: true });
    await ctx.close();
  }
  await b.close(); srv.close();
  console.log("\n" + (fails ? fails + " FAILURES" : "one card size, grass between them, and nothing over the line"));
})();
