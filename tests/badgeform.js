const GOENV = require("./lib/env.js");
/* Honours are filled and permanent, form badges are outlined and say "right
   now". They sit in that order, they fit the card at every phone width, and
   they read in both themes. */
const { chromium } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP, PORT = 8762;
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".svg":"image/svg+xml", ".webp":"image/webp", ".png":"image/png" };
const srv = http.createServer((q, r) => { let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  fs.readFile(path.join(APP, u), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { "content-type": T[path.extname(u)] || "text/plain" }); r.end(b); }); });
let fails = 0; const chk = (ok, m, x) => { console.log((ok ? "  ok   " : "  FAIL ") + m + (x ? "  " + x : "")); if (!ok) fails++; };
const WHO = [2128096, 7207605, 1255976];   // six badges, a climber, the leader
(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  for (const theme of ["dark", "light"]) {
    for (const w of [430, 390, 360, 320]) {
      const ctx = await b.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: "block", colorScheme: theme });
      await ctx.addInitScript((t) => { try { localStorage.setItem("go12.me", JSON.stringify(1255976)); localStorage.setItem("go12.theme", JSON.stringify(t)); } catch (e) {} }, theme);
      const p = await ctx.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
      for (const id of WHO) {
        await p.goto("http://localhost:" + PORT + "/index.html#profile/" + id, { waitUntil: "domcontentloaded" });
        await p.waitForSelector(".badge", { timeout: 8000 });
        const info = await p.evaluate(() => {
          const row = document.querySelector(".badges");
          const card = row.closest(".card") || row.parentElement;
          const cr = card.getBoundingClientRect();
          return [...row.querySelectorAll(".badge")].map((x, i) => {
            const r = x.getBoundingClientRect(), cs = getComputedStyle(x);
            return { i, text: x.textContent, form: x.classList.contains("form"), blot: x.classList.contains("blot"),
                     style: cs.borderStyle, over: r.left < cr.left - 0.5 || r.right > cr.right + 0.5,
                     why: x.getAttribute("data-why") || "", h: Math.round(r.height) };
          });
        });
        const tag = theme + " " + w + " #" + id;
        chk(await p.evaluate(() => document.documentElement.getAttribute("data-theme")) === theme, tag + ": the theme is on");
        chk(info.length > 0, tag + ": badges render", info.map(x => x.text).join(" | "));
        // honours, then form, then the blots (settled before form): rank never falls
        const rank = (x) => x.blot ? (x.form ? 3 : 2) : (x.form ? 1 : 0);
        const ranks = info.map(rank), firstForm = info.findIndex(x => x.form);
        chk(ranks.every((k, i) => i === 0 || k >= ranks[i - 1]), tag + ": honours, form, then blots",
          info.map(x => (x.blot ? (x.form ? "B" : "b") : (x.form ? "f" : "h"))).join(""));
        chk(info.filter(x => x.form).every(x => x.style === "dashed"), tag + ": form badges are outlined");
        chk(info.filter(x => !x.form).every(x => x.style === "solid"), tag + ": honours stay filled");
        chk(info.every(x => !x.over), tag + ": no badge spills out of the card",
          info.filter(x => x.over).map(x => x.text).join(","));
        chk(info.filter(x => x.form).every(x => /^Right now: /.test(x.why)), tag + ": form badges read in the present tense",
          info.filter(x => x.form).map(x => x.why).join(" | "));
        chk(info.filter(x => !x.form).every(x => !/^Right now/.test(x.why)), tag + ": honours do not");
        chk(info.every(x => x.h >= 20 && x.h <= 34), tag + ": every chip is one line high",
          info.map(x => x.h).join(","));
        // the bubble on a form badge
        if (firstForm !== -1) {
          await p.click(".badge.form"); await p.waitForTimeout(220);
          const bub = await p.evaluate(() => { const bb = document.querySelector(".bbubble");
            const wr = document.querySelector(".badges").getBoundingClientRect(); const r = bb && bb.getBoundingClientRect();
            return bb ? { t: bb.textContent, inside: r.left >= wr.left - 1 && r.right <= wr.right + 1 } : null; });
          chk(bub && /^Right now: /.test(bub.t) && bub.inside, tag + ": a form badge explains itself in place", bub && bub.t);
          await p.mouse.click(w / 2, 750); await p.waitForTimeout(120);
        }
        if (w === 390 && id === 2128096) await p.screenshot({ path: "badgeform-" + theme + ".png", clip: { x: 0, y: 60, width: 390, height: 200 } });
      }
      chk(errs.length === 0, theme + " " + w + ": no JS errors", errs.join(" | "));
      await ctx.close();
    }
  }
  await b.close(); srv.close(); console.log(fails ? "FAILS: " + fails : "ALL OK");
})();
