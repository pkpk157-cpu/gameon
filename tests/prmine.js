const GOENV = require("./lib/env.js");
/* Price changes narrows to the reader's own fifteen. The toggle filters the
   table rather than navigating, the other controls still apply on top of it,
   and a reader who has not said who he is gets asked rather than ignored. */
const { chromium } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP, PORT = 8785, ME = 1255976;
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".webp":"image/webp", ".png":"image/png", ".svg":"image/svg+xml" };
const srv = http.createServer((q, r) => { let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  fs.readFile(path.join(APP, u), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { "content-type": T[path.extname(u)] || "text/plain" }); r.end(b); }); });
let fails = 0; const chk = (ok, m, x) => { console.log((ok ? "  ok   " : "  FAIL ") + m + (x ? "  " + x : "")); if (!ok) fails++; };

// what the squad actually is, worked out independently of the page
const { loadCompute } = require("./audit/harness.js");
const { C, ds } = loadCompute();
const SQUAD = C.mySquadIds(ds, ME);
const NAMES = SQUAD.map((e) => (ds.elements[e] || [])[0]).filter(Boolean).sort();

const open = (p) => p.evaluate(() => ({
  rows: [...document.querySelectorAll("table.pricetbl tbody tr")].length,
  names: [...document.querySelectorAll("table.pricetbl tbody tr td.name .who")].map((x) => x.textContent.trim()),
  on: (document.querySelector("#prWho .on") || {}).textContent,
  tabs: document.querySelectorAll("#prWho button").length,
  empty: (document.querySelector(".nohits") || {}).textContent || ""
}));

(async () => {
  await new Promise((r) => srv.listen(PORT, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  console.log("  squad of " + SQUAD.length + ": " + NAMES.join(", "));

  for (const w of [390, 320, 768]) {
    const ctx = await b.newContext({ viewport: { width: w, height: 880 }, deviceScaleFactor: 2, isMobile: w < 560, hasTouch: true, serviceWorkers: "block", colorScheme: "dark" });
    await ctx.addInitScript((me) => { try { localStorage.setItem("go12.me", JSON.stringify(me)); } catch (e) {} }, ME);
    const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.goto("http://127.0.0.1:" + PORT + "/index.html#prices", { waitUntil: "domcontentloaded" });
    await p.waitForSelector("table.pricetbl tbody tr", { timeout: 9000 });
    await p.waitForTimeout(700);

    let r = await open(p);
    chk(r.tabs === 2 && /All players/.test(r.on), w + ": opens on All players", r.on + " / " + r.tabs + " tabs");
    const all = r.rows;
    chk(all > 100, w + ": the whole list is there to begin with", String(all));

    await p.click('#prWho [data-mine="1"]'); await p.waitForTimeout(600);
    r = await open(p);
    chk(/My team/.test(r.on), w + ": the toggle moves", r.on);
    chk(r.rows === SQUAD.length, w + ": exactly the fifteen he owns", r.rows + " of " + SQUAD.length);
    chk(r.names.slice().sort().join("|") === NAMES.join("|"), w + ": and they are the right fifteen",
      r.names.slice().sort().join(", "));
    chk(await p.evaluate(() => location.hash) === "#prices", w + ": it filtered rather than navigated");

    // the position filter still applies on top
    await p.selectOption("#prPos", "1"); await p.waitForTimeout(500);
    r = await open(p);
    const gks = SQUAD.filter((e) => (ds.elements[e] || [])[1] === 1).length;
    chk(r.rows === gks, w + ": position narrows his fifteen further", r.rows + " of " + gks + " keepers");
    await p.selectOption("#prPos", "all"); await p.waitForTimeout(500);

    // and search
    await p.fill("#prSearch", NAMES[0]); await p.waitForTimeout(500);
    r = await open(p);
    chk(r.rows >= 1 && r.names.indexOf(NAMES[0]) !== -1, w + ": search applies within his team too", r.names.join(","));
    await p.fill("#prSearch", "zzzznobody"); await p.waitForTimeout(500);
    r = await open(p);
    chk(r.rows === 0 && /your team/.test(r.empty), w + ": an empty result says why it is empty", r.empty);
    await p.fill("#prSearch", ""); await p.waitForTimeout(500);

    // back to all
    await p.click('#prWho [data-mine="0"]'); await p.waitForTimeout(600);
    r = await open(p);
    chk(r.rows === all && /All players/.test(r.on), w + ": and back to the whole list", r.rows + " vs " + all);
    chk(errs.length === 0, w + ": no JS errors", errs.join(" | "));
    await ctx.close();
  }

  // a reader who has not said who he is
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 880 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
    const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.goto("http://127.0.0.1:" + PORT + "/index.html#prices", { waitUntil: "domcontentloaded" });
    await p.waitForSelector("table.pricetbl tbody tr", { timeout: 9000 });
    await p.waitForTimeout(600);
    const before = (await open(p)).rows;
    await p.click('#prWho [data-mine="1"]'); await p.waitForTimeout(700);
    const r = await p.evaluate(() => ({
      sheet: document.querySelector("#youBack").classList.contains("show"),
      toast: (document.querySelector("#toast") || {}).textContent || "",
      toastShown: !!(document.querySelector("#toast") || {}).classList &&
                  document.querySelector("#toast").classList.contains("show"),
      on: (document.querySelector("#prWho .on") || {}).textContent,
      rows: document.querySelectorAll("table.pricetbl tbody tr").length
    }));
    chk(/Pick your team/i.test(r.toast) && r.toastShown, "unset: it says to pick a team first", r.toast);
    chk(r.sheet, "unset: and opens the place to do it");
    chk(/All players/.test(r.on) && r.rows === before, "unset: the table is left alone", r.on + " / " + r.rows);
    chk(errs.length === 0, "unset: no JS errors", errs.join(" | "));
    await ctx.close();
  }
  await b.close(); srv.close(); console.log(fails ? "FAILS: " + fails : "ALL OK");
})();
