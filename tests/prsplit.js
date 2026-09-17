const GOENV = require("./lib/env.js");
/* Prices and player stats have left the burger for the profile sheet, as two
   separate errands. Each one opens its own page and the bar agrees with it. */
const { chromium } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP, PORT = 8781;
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".webp":"image/webp", ".png":"image/png", ".svg":"image/svg+xml" };
const srv = http.createServer((q, r) => { let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  fs.readFile(path.join(APP, u), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { "content-type": T[path.extname(u)] || "text/plain" }); r.end(b); }); });
let fails = 0; const chk = (ok, m, x) => { console.log((ok ? "  ok   " : "  FAIL ") + m + (x ? "  " + x : "")); if (!ok) fails++; };
(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  for (const w of [390, 320, 768]) {
    const ctx = await b.newContext({ viewport: { width: w, height: 880 }, deviceScaleFactor: 2, isMobile: w < 560, hasTouch: true, serviceWorkers: "block", colorScheme: "dark" });
    await ctx.addInitScript(() => { try { localStorage.setItem("go12.me", JSON.stringify(1255976)); } catch (e) {} });
    const p = await ctx.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
    await p.goto("http://127.0.0.1:" + PORT + "/index.html#classic", { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(1400);

    // the burger no longer carries it
    await p.click("#barMenu"); await p.waitForTimeout(450);
    const menu = await p.evaluate(() => ({
      items: [...document.querySelectorAll("#menuBody .menuitem")].map(x => x.querySelector(".mi-t").textContent.trim()),
      gos: [...document.querySelectorAll("#menuBody .menuitem")].map(x => x.getAttribute("data-go"))
    }));
    chk(!menu.items.some(t => /player stats|price/i.test(t)), w + ": the sections menu no longer lists the player pages", menu.items.join(" | "));
    chk(menu.gos.indexOf("prices") === -1, w + ": nothing in it still routes to prices", menu.gos.join(","));
    chk(menu.items.length === 3, w + ": three sections left", String(menu.items.length));
    await p.mouse.click(w - 8, 500); await p.waitForTimeout(400);
    chk(!(await p.evaluate(() => document.querySelector("#menuBack").classList.contains("show"))),
      w + ": the sections drawer closes again");

    // the profile sheet carries both
    await p.click("#barYou"); await p.waitForTimeout(450);
    const you = await p.evaluate(() => {
      const labs = [...document.querySelectorAll("#youBody .lab-sm")].map(x => x.textContent.trim());
      const grp = [...document.querySelectorAll("#youBody .menu")].find(m => (m.querySelector(".lab-sm") || {}).textContent === "Players");
      const btns = grp ? [...grp.querySelectorAll("button")].map(x => ({ id: x.id, t: x.textContent.trim(), svg: !!x.querySelector("svg path,svg circle") })) : [];
      return { labs, btns };
    });
    chk(you.labs.includes("Players"), w + ": the profile sheet has a Players group", you.labs.join(" | "));
    chk(you.btns.length === 2 && you.btns[0].t === "Price changes" && you.btns[1].t === "Player stats",
      w + ": it lists Price changes then Player stats", JSON.stringify(you.btns.map(x => x.t)));
    chk(you.btns.every(x => x.svg), w + ": each has an icon that actually drew", JSON.stringify(you.btns.map(x => x.svg)));

    // Price changes
    await p.click("#pfPrices"); await p.waitForTimeout(900);
    let r = await p.evaluate(() => ({ hash: location.hash, title: document.querySelector("#barTitle").textContent.trim(),
      tab: (document.querySelector('[data-pr].on') || {}).textContent, sheet: document.querySelector("#youBack").classList.contains("show"),
      rows: document.querySelectorAll('.view.active table.t tbody tr').length }));
    chk(r.hash === "#prices" && !r.sheet, w + ": Price changes opens the prices page and shuts the sheet", JSON.stringify(r));
    chk(r.title === "Price changes", w + ": the bar says Price changes", r.title);
    chk(r.tab === "Prices" && r.rows > 0, w + ": the Prices tab is the one showing, with rows", r.tab + " / " + r.rows);

    // Player stats
    await p.click("#barYou"); await p.waitForTimeout(450);
    await p.click("#pfPlayers"); await p.waitForTimeout(900);
    r = await p.evaluate(() => ({ hash: location.hash, title: document.querySelector("#barTitle").textContent.trim(),
      tab: (document.querySelector('[data-pr].on') || {}).textContent, sheet: document.querySelector("#youBack").classList.contains("show"),
      rows: document.querySelectorAll('.view.active table.t tbody tr').length }));
    chk(r.hash === "#prices/stats" && !r.sheet, w + ": Player stats opens the stats page and shuts the sheet", JSON.stringify(r));
    chk(r.title === "Player stats", w + ": the bar says Player stats", r.title);
    chk(r.tab === "Stats" && r.rows > 0, w + ": the Stats tab is the one showing, with rows", r.tab + " / " + r.rows);

    // the toggle between them still works, and still renames the bar
    await p.click('[data-pr="prices"]'); await p.waitForTimeout(700);
    r = await p.evaluate(() => ({ hash: location.hash, title: document.querySelector("#barTitle").textContent.trim() }));
    chk(r.hash === "#prices" && r.title === "Price changes", w + ": the on-page toggle still crosses between them", JSON.stringify(r));

    // back from either lands where the reader was
    await p.click("#barBack"); await p.waitForTimeout(700);
    r = await p.evaluate(() => location.hash);
    chk(r === "#classic" || r === "", w + ": back returns to the league", r);

    chk(errs.length === 0, w + ": no JS errors", errs.join(" | "));
    await ctx.close();
  }
  await b.close(); srv.close(); console.log(fails ? "FAILS: " + fails : "ALL OK");
})();
