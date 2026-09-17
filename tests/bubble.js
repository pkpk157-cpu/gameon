const GOENV = require("./lib/env.js");
/* Badges open a bubble that explains them; the giant killer is gone. */
const { chromium, devices } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP, PORT = 8747;
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".svg":"image/svg+xml", ".webp":"image/webp" };
const srv = http.createServer((q, r) => { let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  fs.readFile(path.join(APP, u), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { "content-type": T[path.extname(u)] || "text/plain" }); r.end(b); }); });
let fails = 0; const chk = (ok, m, x) => { console.log((ok ? "  ok   " : "  FAIL ") + m + (x ? "  " + x : "")); if (!ok) fails++; };
(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  for (const w of [390, 320]) {
    const ctx = await b.newContext({ viewport: { width: w, height: 800 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: "block" });
    await ctx.addInitScript(() => { try { localStorage.setItem("go12.me", "1255976"); } catch (e) {} });
    const p = await ctx.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
    await p.goto("http://localhost:" + PORT + "/index.html#profile/1255976", { waitUntil: "domcontentloaded" }); await p.waitForTimeout(1500);
    const labels = await p.evaluate(() => [...document.querySelectorAll(".badge")].map(x => x.textContent));
    chk(labels.length > 0 && !labels.some(l => /Giant/.test(l)), w + ": badges present, none a giant killer", labels.join(" | "));
    chk(await p.evaluate(() => [...document.querySelectorAll(".badge")].every(x => x.tagName === "BUTTON" && x.getAttribute("aria-expanded") === "false" && !x.title)), w + ": each badge is a button, closed, with no hover title");
    await p.click(".badge"); await p.waitForTimeout(250);
    const bub = await p.evaluate(() => { const bb = document.querySelector(".bbubble"); const wr = document.querySelector(".badges").getBoundingClientRect(); const r = bb && bb.getBoundingClientRect(); const btn = document.querySelector(".badge");
      return bb ? { text: bb.textContent, inside: r.left >= wr.left - 1 && r.right <= wr.right + 1, below: r.top > btn.getBoundingClientRect().bottom, expanded: btn.getAttribute("aria-expanded"), vw: r.right <= window.innerWidth } : null; });
    chk(bub && bub.text.length > 10 && bub.inside && bub.below && bub.expanded === "true" && bub.vw, w + ": tapping opens a bubble under the badge, inside the row, on screen", bub && bub.text);
    if (w === 390) await p.screenshot({ path: "bubble.png", clip: { x: 0, y: 60, width: 390, height: 220 } });
    await p.click(".badge"); await p.waitForTimeout(150);
    chk(!(await p.$(".bbubble")), w + ": tapping the same badge again closes it");
    const n = await p.evaluate(() => document.querySelectorAll(".badge").length);
    if (n > 1) {
      await p.click(".badge"); await p.waitForTimeout(150); await p.click(".badge:nth-child(2)"); await p.waitForTimeout(150);
      const two = await p.evaluate(() => ({ bubbles: document.querySelectorAll(".bbubble").length, open: [...document.querySelectorAll(".badge")].map(x => x.getAttribute("aria-expanded")) }));
      chk(two.bubbles === 1 && two.open[0] === "false" && two.open[1] === "true", w + ": a second badge takes the bubble over", JSON.stringify(two));
    }
    await p.mouse.click(w / 2, 600); await p.waitForTimeout(150);
    chk(!(await p.$(".bbubble")), w + ": tapping elsewhere closes it");
    chk(errs.length === 0, w + ": no JS errors", errs.join(" | "));
    await ctx.close();
  }
  await b.close(); srv.close(); console.log(fails ? "FAILS: " + fails : "ALL OK");
})();
