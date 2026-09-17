const GOENV = require("./lib/env.js");
/* A photograph must stay inside the shirt slot it replaces, on every pitch the
   app draws. The compare pitch shrinks the shirt to 24px and the face was
   still 42px, so it hung down over the player's name. Measured, not eyeballed,
   and measured everywhere rather than only where it was noticed. */
const { chromium } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP;
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css",
            ".json":"application/json", ".svg":"image/svg+xml", ".webp":"image/webp" };
const srv = http.createServer((q, r) => {
  let u = decodeURIComponent(q.url.split("?")[0]); if (u === "/") u = "/index.html";
  fs.readFile(path.join(APP, u), (e, b) => { if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { "content-type": T[path.extname(u)] || "text/plain", "cache-control": "no-store" }); r.end(b); });
});
const ds = JSON.parse(fs.readFileSync(APP + "/data.json", "utf8")).dataset;
const have = new Set(fs.readdirSync(APP + "/photos").map((f) => +f.slice(1, -5)));
// two managers whose squads are well covered by photographs
const ranked = Object.keys(ds.picks[ds.pitchGw]).map((mid) => ({
  mid: mid, n: ds.picks[ds.pitchGw][mid].p.filter((x) => have.has(ds.elements[x[0]][7])).length
})).sort((a, b) => b.n - a.n);

let fails = 0;
const chk = (n, ok, d) => { console.log((ok ? "   ok   " : "   FAIL ") + n + (ok || !d ? "" : " — " + d)); if (!ok) fails++; };

// every face, against the shirt it stands in and the name under it
const MEASURE = `(() => {
  const out = [];
  // Only the view on screen: the others are still in the document with
  // display:none, and a card nobody can see measures zero.
  const root = document.querySelector("section.view.active") || document;
  root.querySelectorAll(".pcard").forEach((card) => {
    const img = card.querySelector("img.facepic");
    if (!img || !img.complete || !img.naturalWidth) return;
    const slot = card.querySelector(".pshirt");
    const name = card.querySelector(".pname");
    const i = img.getBoundingClientRect(), s = slot.getBoundingClientRect();
    const n = name ? name.getBoundingClientRect() : null;
    out.push({
      w: Math.round(i.width), h: Math.round(i.height),
      slotH: Math.round(s.height),
      spillBottom: Math.round(i.bottom - s.bottom),
      spillSide: Math.round(Math.max(s.left - i.left, i.right - s.right)),
      overName: n ? Math.round(i.bottom - n.top) : -999,
      outOfCard: Math.round(i.bottom - card.getBoundingClientRect().bottom)
    });
  });
  return out;
})()`;

(async () => {
  await new Promise((r) => srv.listen(8626, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  for (const w of [320, 390, 430]) {
    console.log("\n" + w + "px");
    const ctx = await b.newContext({ viewport: { width: w, height: 900 }, serviceWorkers: "block" });
    const p = await ctx.newPage();
    const errs = [];
    p.on("pageerror", (e) => errs.push("pageerror: " + e.message));

    const views = [
      ["one squad", "#profile/" + ranked[0].mid],
      ["two squads side by side", "#compare"]
    ];
    for (const [label, hash] of views) {
      await p.goto("http://127.0.0.1:8626/" + hash, { waitUntil: "networkidle" });
      await p.waitForTimeout(1500);
      if (hash === "#compare") {
        // put two well-covered squads against each other
        await p.evaluate((ids) => {
          const a = document.querySelector("#cmpA"), c = document.querySelector("#cmpB");
          if (a && c) {
            a.value = ids[0]; a.dispatchEvent(new Event("change", { bubbles: true }));
            c.value = ids[1]; c.dispatchEvent(new Event("change", { bubbles: true }));
          }
        }, [ranked[0].mid, ranked[1].mid]).catch(() => {});
        await p.waitForTimeout(1200);
      }
      await p.evaluate(() => {
        const e = document.querySelector(".pcard");
        if (e) e.scrollIntoView({ block: "center" });
      });
      await p.waitForTimeout(900);
      const m = await p.evaluate(MEASURE);
      chk(label + ": there are faces to measure", m.length > 0, m.length + " faces");
      if (!m.length) continue;
      chk(label + ": none hangs below its shirt slot",
          m.every((f) => f.spillBottom <= 1),
          JSON.stringify(m.filter((f) => f.spillBottom > 1).slice(0, 3)));
      chk(label + ": none spills out the sides",
          m.every((f) => f.spillSide <= 1),
          JSON.stringify(m.filter((f) => f.spillSide > 1).slice(0, 3)));
      chk(label + ": none covers the player's name",
          m.every((f) => f.overName <= 0),
          JSON.stringify(m.filter((f) => f.overName > 0).slice(0, 3)));
      chk(label + ": none escapes its card",
          m.every((f) => f.outOfCard <= 1),
          JSON.stringify(m.filter((f) => f.outOfCard > 1).slice(0, 3)));
      const heights = [...new Set(m.map((f) => f.h))];
      chk(label + ": every face is the same size as the rest",
          heights.length === 1, JSON.stringify(heights));
    }
    chk("no script errors", errs.length === 0, errs.slice(0, 3).join(" || "));
    await ctx.close();
  }
  await b.close(); srv.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})();
