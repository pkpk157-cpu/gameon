const GOENV = require("./lib/env.js");
/* The profile's section chips: one per section, sticky under the bar, jump
   on tap, follow the scroll; the three reference tables fold closed. */
const { chromium, devices } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP, PORT = 8748;
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".svg":"image/svg+xml", ".webp":"image/webp" };
const srv = http.createServer((q, r) => { let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  fs.readFile(path.join(APP, u), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { "content-type": T[path.extname(u)] || "text/plain" }); r.end(b); }); });
let fails = 0; const chk = (ok, m, x) => { console.log((ok ? "  ok   " : "  FAIL ") + m + (x ? "  " + x : "")); if (!ok) fails++; };
(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  for (const w of [390, 320]) {
    const ctx = await b.newContext({ viewport: { width: w, height: 760 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: "block", reducedMotion: "reduce" });
    await ctx.addInitScript(() => { try { localStorage.setItem("go12.me", "1255976"); localStorage.removeItem("go12.rivals"); } catch (e) {} });
    const p = await ctx.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
    await p.goto("http://localhost:" + PORT + "/index.html#profile/1255976", { waitUntil: "domcontentloaded" }); await p.waitForTimeout(1500);
    const chips = await p.evaluate(() => [...document.querySelectorAll("#profChips .tabbtn")].map(b => b.textContent));
    const secs = await p.evaluate(() => [...document.querySelectorAll("[data-ps]")].map(e => e.getAttribute("data-ps")));
    chk(chips.length === secs.length && chips.length >= 6, w + ": one chip per section", chips.join(" | "));
    chk(JSON.stringify(secs) === JSON.stringify(["XP", "Chips", "Form", "Squad", "Manager of the Month", "Head-to-head", "Past seasons (FPL)"]), w + ": sections in order, no Rivals without a pin", secs.join(" | "));
    chk(await p.evaluate(() => [...document.querySelectorAll("details.pfold")].map(d => d.open)).then(a => a.length === 3 && a.every(x => !x)), w + ": the three reference tables are folded closed");
    chk(await p.evaluate(() => document.querySelector("#profChips .tabbtn.on") && document.querySelector("#profChips .tabbtn.on").textContent) === "XP", w + ": at the top the XP chip is lit");
    const fits = await p.evaluate(() => { const r = document.querySelector("#profChips"); return r.getBoundingClientRect().width <= window.innerWidth && r.scrollWidth <= window.innerWidth + 1; });
    chk(fits, w + ": the chip bar does not widen the page");
    // it must rest exactly where it sticks, or it jumps the moment it catches
    const rest = await p.evaluate(() => { const b = document.querySelector("#profChips").getBoundingClientRect(); const t = document.querySelector("header.topbar").getBoundingClientRect(); return { gap: Math.round(b.top - t.bottom), chipY: Math.round(document.querySelector("#profChips .tabbtn").getBoundingClientRect().top) }; });
    await p.evaluate(() => window.scrollTo(0, 300)); await p.waitForTimeout(300);
    const stuck = await p.evaluate(() => { const b = document.querySelector("#profChips").getBoundingClientRect(); const t = document.querySelector("header.topbar").getBoundingClientRect(); return { gap: Math.round(b.top - t.bottom), chipY: Math.round(document.querySelector("#profChips .tabbtn").getBoundingClientRect().top) }; });
    chk(rest.gap === 0 && stuck.gap === 0 && rest.chipY === stuck.chipY, w + ": the bar rests exactly where it sticks — no jump, no gap", JSON.stringify({ rest, stuck }));
    // and it does not drift over a long scroll
    const walk = [];
    for (const y of [600, 1200, 2000, 3000]) { await p.evaluate((y) => window.scrollTo(0, y), y); await p.waitForTimeout(160); walk.push(await p.evaluate(() => Math.round(document.querySelector("#profChips").getBoundingClientRect().top))); }
    chk(new Set(walk).size === 1, w + ": it holds one position all the way down", walk.join(","));
    await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(250);
    // a closed section still shows its latest row
    const peeks = await p.evaluate(() => [...document.querySelectorAll("details.pfold")].map(d => { const pk = d.nextElementSibling && d.nextElementSibling.classList.contains("pfoldpeek") ? d.nextElementSibling : null; return { id: d.id, has: !!pk, shown: !!pk && !!pk.offsetParent, rows: pk ? pk.querySelectorAll("tbody tr").length + pk.querySelectorAll(".fx").length : 0 }; }));
    chk(peeks.every(x => x.has && x.shown && x.rows === 1), w + ": each closed section shows exactly one latest row", JSON.stringify(peeks));
    const openRows = await p.evaluate(() => { const d = document.querySelector("#ps-past"); d.open = true; const all = d.querySelector(".pfoldbody").querySelectorAll("tbody tr").length; const peekShown = !!d.nextElementSibling.offsetParent; d.open = false; return { all, peekShown }; });
    chk(openRows.all > 1 && !openRows.peekShown, w + ": open shows every row and the preview steps aside", JSON.stringify(openRows));
    // tapping the preview opens the section
    await p.evaluate(() => document.querySelector("#ps-month").scrollIntoView({ block: "center" })); await p.waitForTimeout(200);
    await p.click('[data-for="ps-month"] table'); await p.waitForTimeout(250);
    chk(await p.evaluate(() => document.querySelector("#ps-month").open), w + ": tapping the preview opens the section");
    await p.evaluate(() => { document.querySelector("#ps-month").open = false; window.scrollTo(0, 0); }); await p.waitForTimeout(200);
    // tap Squad: the section title sits just under the chip bar and the chip lights
    await p.click('#profChips [data-go="ps-squad"]'); await p.waitForTimeout(500);
    const sq = await p.evaluate(() => { const t = document.querySelector("#ps-squad").getBoundingClientRect().top; const bar = document.querySelector("#profChips").getBoundingClientRect().bottom; return { gap: Math.round(t - bar), on: document.querySelector("#profChips .tabbtn.on").textContent, barTop: Math.round(document.querySelector("#profChips").getBoundingClientRect().top), topbar: Math.round(document.querySelector("header.topbar").getBoundingClientRect().bottom) }; });
    chk(sq.gap >= 0 && sq.gap <= 40 && sq.on === "Squad", w + ": Squad chip lands the title just under the bar and lights", JSON.stringify(sq));
    chk(sq.barTop === sq.topbar, w + ": the chip bar is stuck to the top bar while scrolled", sq.barTop + " vs " + sq.topbar);
    if (w === 390) await p.screenshot({ path: "profnav-squad.png" });
    // tap Past: it opens and shows the table
    await p.click('#profChips [data-go="ps-past"]'); await p.waitForTimeout(500);
    chk(await p.evaluate(() => document.querySelector("#ps-past").open && !!document.querySelector("#ps-past table")), w + ": the Past chip opens the fold and its table");
    chk(await p.evaluate(() => document.querySelector("#profChips .tabbtn.on").textContent) === "Past", w + ": ...and the Past chip is lit at the bottom");
    // fold by hand: tap H2H summary, then Show all still works inside
    await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(200);
    await p.click('#profChips [data-go="ps-h2h"]'); await p.waitForTimeout(400);
    chk(await p.evaluate(() => document.querySelector("#ps-h2h").open), w + ": H2H opens from its chip");
    const before = await p.evaluate(() => document.querySelector("#h2hRest").hidden);
    await p.click("#h2hAll"); await p.waitForTimeout(200);
    chk(before === true && (await p.evaluate(() => document.querySelector("#h2hRest").hidden)) === false, w + ": Show all fixtures still works inside the fold");
    await p.click("#ps-h2h summary"); await p.waitForTimeout(200);
    chk(!(await p.evaluate(() => document.querySelector("#ps-h2h").open)), w + ": tapping the summary closes it again");
    chk(await p.evaluate(() => location.hash) === "#profile/1255976", w + ": chips never change the address");
    // another page has no chip bar, and scrolling there is harmless
    await p.evaluate(() => location.hash = "#classic"); await p.waitForTimeout(600); await p.evaluate(() => window.scrollTo(0, 400)); await p.waitForTimeout(200);
    chk(await p.evaluate(() => { const r = document.querySelector("#profChips"); return !r || !r.offsetParent; }), w + ": no chip bar showing on other pages");
    chk(errs.length === 0, w + ": no JS errors", errs.join(" | "));
    if (w === 390) { await p.evaluate(() => location.hash = "#profile/1255976"); await p.waitForTimeout(1200); await p.screenshot({ path: "profnav-top.png" }); }
    await ctx.close();
  }
  await b.close(); srv.close(); console.log(fails ? "FAILS: " + fails : "ALL OK");
})();
