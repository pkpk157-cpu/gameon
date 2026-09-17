const GOENV = require("./lib/env.js");
/* Wherever a photograph is drawn, it must stay inside the thing that holds it
   and off anything else. Checks the pitch, the compare pitch, the match sheet,
   the player card and every table row that carries a face. */
const { chromium, devices } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP, PORT = 8723;
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".svg":"image/svg+xml", ".webp":"image/webp" };
const srv = http.createServer((q, r) => { let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  fs.readFile(path.join(APP, u), (e, b) => { if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { "content-type": T[path.extname(u)] || "text/plain", "cache-control": "no-store" }); r.end(b); }); });
let bad = 0;
const ok = (c, m) => { if (!c) { bad++; console.log("   FAIL " + m); } };
(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  for (const [label, dev] of [["390", devices["iPhone 12"]],
                              ["320", { viewport: { width: 320, height: 760 }, isMobile: true, hasTouch: true }],
                              ["1280", { viewport: { width: 1280, height: 900 } }]]) {
    const ctx = await b.newContext({ ...dev, serviceWorkers: "block" });
    const p = await ctx.newPage();
    const errs = []; p.on("pageerror", e => errs.push(e.message));
    await p.goto("http://localhost:" + PORT + "/index.html#classic", { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(1500);
    await p.evaluate(() => { const r = document.querySelector('[data-view="classic"] tbody tr [data-entry]'); if (r) location.hash = "profile/" + r.getAttribute("data-entry"); });
    await p.waitForTimeout(2000);

    const res = await p.evaluate(() => {
      const out = { cards: 0, escapes: [], onName: [], widerThanCard: [], faces: 0, faceEscapes: [] };
      document.querySelectorAll(".pcard").forEach((card) => {
        const pic = card.querySelector(".facepic");
        if (!pic) return;
        out.cards++;
        const c = card.getBoundingClientRect(), i = pic.getBoundingClientRect();
        const name = card.querySelector(".pname");
        if (i.left < c.left - 0.6 || i.right > c.right + 0.6 || i.top < c.top - 0.6)
          out.escapes.push(Math.round(i.left - c.left) + "/" + Math.round(c.right - i.right));
        if (name) {
          const n = name.getBoundingClientRect();
          if (i.bottom > n.top + 0.6) out.onName.push(Math.round(i.bottom - n.top));
        }
        if (i.width > c.width + 0.6) out.widerThanCard.push(Math.round(i.width) + ">" + Math.round(c.width));
      });
      // circular row faces
      document.querySelectorAll(".face").forEach((f) => {
        const pic = f.querySelector(".facepic"); if (!pic) return;
        out.faces++;
        const a = f.getBoundingClientRect(), i = pic.getBoundingClientRect();
        if (i.left < a.left - 0.6 || i.right > a.right + 0.6 || i.top < a.top - 0.6 || i.bottom > a.bottom + 0.6)
          out.faceEscapes.push("row face out of its circle");
      });
      return out;
    });
    console.log("\n--- " + label + " --- pitch photos: " + res.cards + ", row faces: " + res.faces);
    ok(res.cards > 0, "there are pitch photos to check");
    ok(res.escapes.length === 0, "no photo escapes its card: " + res.escapes.slice(0, 3).join(", "));
    ok(res.onName.length === 0, "no photo covers the name bar (by px): " + res.onName.slice(0, 3).join(", "));
    ok(res.widerThanCard.length === 0, "no photo wider than its card: " + res.widerThanCard.slice(0, 3).join(", "));
    ok(res.faceEscapes.length === 0, "no row face leaves its circle");

    // the player card, which draws its own face
    await p.evaluate(() => { const c = document.querySelector(".pcard[data-el]"); if (c) c.click(); });
    await p.waitForTimeout(900);
    const modal = await p.evaluate(() => {
      const m = document.querySelector(".modal"); if (!m) return null;
      const pic = m.querySelector(".facepic"); if (!pic) return { noPic: true };
      const box = pic.parentElement.getBoundingClientRect(), i = pic.getBoundingClientRect();
      return { escapes: i.left < box.left - 0.6 || i.right > box.right + 0.6 || i.bottom > box.bottom + 0.6 };
    });
    if (modal && !modal.noPic) ok(!modal.escapes, "the player card's face stays in its box");
    ok(errs.length === 0, "no JS errors: " + errs.slice(0, 1).join(""));
    await ctx.close();
  }
  await b.close(); srv.close();
  console.log(bad ? "\n" + bad + " FAILURE(S)" : "\nevery photograph sits inside the box that holds it");
  process.exit(bad ? 1 : 0);
})();
