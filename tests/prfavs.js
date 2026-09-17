const GOENV = require("./lib/env.js");
/* Starring players in Price changes: the star marks and unmarks, it survives a
   reload, the Starred tab holds exactly what was starred, and the faces on the
   left do not cost the name more letters than it lost before they arrived. */
const { chromium } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP, PORT = 8790, ME = 1255976;
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".webp":"image/webp", ".png":"image/png", ".svg":"image/svg+xml" };
const srv = http.createServer((q, r) => { let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  fs.readFile(path.join(APP, u), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { "content-type": T[path.extname(u)] || "text/plain" }); r.end(b); }); });
let fails = 0; const chk = (ok, m, x) => { console.log((ok ? "  ok   " : "  FAIL ") + m + (x ? "  " + x : "")); if (!ok) fails++; };

const look = (p) => p.evaluate(() => {
  const trs = [...document.querySelectorAll("table.pricetbl tbody tr")];
  return {
    rows: trs.length,
    names: trs.map(t => (t.querySelector(".who") || {}).textContent),
    starred: trs.filter(t => (t.querySelector(".favstar") || {}).classList && t.querySelector(".favstar").classList.contains("on"))
               .map(t => t.querySelector(".who").textContent),
    faces: trs.filter(t => t.querySelector(".face")).length,
    stars: trs.filter(t => t.querySelector(".favstar")).length,
    on: (document.querySelector("#prWho .on") || {}).getAttribute ? document.querySelector("#prWho .on").getAttribute("data-who") : null,
    tabs: document.querySelectorAll("#prWho button").length,
    empty: (document.querySelector(".nohits") || {}).textContent || "",
    store: (() => { try { return JSON.parse(localStorage.getItem("go12.favs") || "[]"); } catch (e) { return "unreadable"; } })()
  };
});

// The prices table fills in across frames — a screenful, then the rest a
// hundred at a time — so a fixed pause after a redraw is a guess about how busy
// the machine is. Wait for the row count to stop moving instead.
async function filled(pg) {
  // The table itself says when it is still arriving, so this waits on the app
  // rather than on a stopwatch. Guessing at it with a fixed pause is what made
  // three suites go red on a loaded machine and green on a quiet one.
  await pg.waitForFunction(
    () => { const el = document.querySelector("#prPanel"); return !!el && !el.hasAttribute("data-filling"); },
    null, { timeout: 60000 });
  return pg.evaluate(() => document.querySelectorAll("table.pricetbl tbody tr").length);
}

(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });

  for (const w of [390, 320, 768]) {
    const ctx = await b.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 2, isMobile: w < 560, hasTouch: true, serviceWorkers: "block", colorScheme: "dark" });
    await ctx.addInitScript((me) => { try { localStorage.setItem("go12.me", JSON.stringify(me)); } catch (e) {} }, ME);
    const p = await ctx.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
    await p.goto("http://127.0.0.1:" + PORT + "/index.html#prices", { waitUntil: "domcontentloaded" });
    await p.waitForSelector("table.pricetbl tbody tr", { timeout: 9000 }); await filled(p);

    let r = await look(p);
    chk(r.tabs === 3 && r.on === "all", w + ": three tabs, opening on all players", r.tabs + " / " + r.on);
    chk(r.stars === r.rows, w + ": a star on every row", r.stars + " of " + r.rows);
    chk(r.faces === r.rows, w + ": and a face on every row", r.faces + " of " + r.rows);
    chk(r.starred.length === 0, w + ": none lit to begin with", r.starred.join(","));

    // the empty Starred tab explains itself
    await p.click('#prWho [data-who="favs"]'); await filled(p);
    r = await look(p);
    chk(r.rows === 0 && /star beside a name/i.test(r.empty), w + ": empty Starred says how to fill it", r.empty);
    await p.click('#prWho [data-who="all"]'); await filled(p);

    // star three
    const want = [];
    for (const n of [1, 3, 5]) {
      want.push(await p.evaluate((i) => document.querySelector(`table.pricetbl tbody tr:nth-child(${i}) .who`).textContent, n));
      await p.click(`table.pricetbl tbody tr:nth-child(${n}) .favstar`);
      await p.waitForTimeout(160);
    }
    r = await look(p);
    chk(r.starred.slice().sort().join("|") === want.slice().sort().join("|"), w + ": exactly those three light up", r.starred.join(","));
    chk(r.store.length === 3, w + ": and three are remembered on the device", JSON.stringify(r.store));
    chk(await p.evaluate(() => [...document.querySelectorAll(".favstar.on")].every(x => x.getAttribute("aria-pressed") === "true")),
      w + ": a lit star says so to a screen reader");

    // the Starred tab holds exactly them
    await p.click('#prWho [data-who="favs"]'); await filled(p);
    r = await look(p);
    chk(r.rows === 3 && r.names.slice().sort().join("|") === want.slice().sort().join("|"),
      w + ": the Starred tab holds exactly those three", r.names.join(","));
    chk(r.starred.length === 3, w + ": all lit there too");

    // unstarring in the Starred tab drops the row
    await p.click("table.pricetbl tbody tr:nth-child(1) .favstar"); await p.waitForTimeout(600);
    r = await look(p);
    chk(r.rows === 2 && r.store.length === 2, w + ": unstarring there removes the row", r.rows + " rows, " + r.store.length + " kept");

    // it survives a reload
    await p.reload({ waitUntil: "domcontentloaded" });
    await p.waitForSelector("table.pricetbl tbody tr", { timeout: 9000 }); await filled(p);
    r = await look(p);
    chk(r.on === "all", w + ": a reload opens on all players again", r.on);
    chk(r.starred.length === 2, w + ": with the two stars still lit", r.starred.join(","));

    // position and search still narrow the starred list
    await p.click('#prWho [data-who="favs"]'); await filled(p);
    await p.fill("#prSearch", "zzzznobody"); await p.waitForTimeout(500);
    r = await look(p);
    chk(r.rows === 0 && /starred/i.test(r.empty), w + ": a search inside Starred says so when empty", r.empty);
    await p.fill("#prSearch", ""); await p.waitForTimeout(400);

    // nothing spills out of the card at any tab
    for (const who of ["all", "mine", "favs"]) {
      await p.click(`#prWho [data-who="${who}"]`); await filled(p);
      const fit = await p.evaluate(() => {
        const t = document.querySelector("table.pricetbl"); if (!t) return { ok: true };
        const sc = t.closest(".freeze");
        return { ok: sc.scrollWidth <= sc.clientWidth + 1 && document.documentElement.scrollWidth <= window.innerWidth + 1,
                 over: sc.scrollWidth - sc.clientWidth };
      });
      chk(fit.ok, w + " " + who + ": the table fits its card", "over " + fit.over);
    }
    chk(errs.length === 0, w + ": no JS errors", errs.join(" | "));
    await ctx.close();
  }

  // the faces must not cost the name more than it was already losing
  {
    const BUDGET = { 320: 205, 360: 100, 390: 41 };   // measured on the build before faces arrived
    for (const w of [320, 360, 390]) {
      const ctx = await b.newContext({ viewport: { width: w, height: 900 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
      const p = await ctx.newPage();
      await p.goto("http://127.0.0.1:" + PORT + "/index.html#prices", { waitUntil: "domcontentloaded" });
      await p.waitForSelector("table.pricetbl tbody tr"); await p.waitForTimeout(1300);
      const cut = await p.evaluate(() => [...document.querySelectorAll("table.pricetbl tbody td.name .who")]
        .filter(x => x.scrollWidth > x.clientWidth + 0.5).length);
      chk(cut <= BUDGET[w], w + ": no more names trimmed than before the faces (" + cut + " vs " + BUDGET[w] + ")");
      await ctx.close();
    }
  }
  await b.close(); srv.close(); console.log(fails ? "FAILS: " + fails : "ALL OK");
})();
