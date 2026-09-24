const GOENV = require("./lib/env.js");
/* One menu, sliding from the left, holding the sections and everything the
   gear used to; and one price section with the four columns. */
const { chromium, devices } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP;
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".svg":"image/svg+xml" };

const F = require("./fixture.js");
const N = F.count();
// the dataset as the updater now writes it, and one with no price record at all
F.write("/tmp/drawer-rich.json");
F.write("/tmp/drawer-bare.json", { bare: true });

let DATA = "/tmp/drawer-rich.json";
const srv = http.createServer((q, r) => {
  let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  const f = u === "/data.json" ? DATA : path.join(APP, u);
  fs.readFile(f, (e, b) => {
    if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { "content-type": T[path.extname(f)] || "text/plain", "cache-control": "no-store" }); r.end(b);
  });
});

let fails = 0;
const chk = (n, ok, d) => { if (!ok) { fails++; console.log("   FAIL " + n + (d ? " — " + d : "")); } };

(async () => {
  await new Promise((r) => srv.listen(9900, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  const ctx = await b.newContext({ ...devices["iPhone 12"], serviceWorkers: "block" });
  ctx.setDefaultTimeout(4000);
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push("JS: " + e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|net::ERR_|ERR_TUNNEL/i.test(m.text())) errs.push("CON: " + m.text()); });

  await p.goto("http://localhost:9900/index.html#classic", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(1600);

  const bar = await p.evaluate(() => ({
    menu: !!document.querySelector("#barMenu"),
    gear: !!document.querySelector("#btnProfile"),
    sync: !!document.querySelector("#btnSync")   // expected false now
  }));
  console.log("bar: burger " + bar.menu + ", gear " + bar.gear + ", sync " + bar.sync);
  chk("the burger is there", bar.menu);
  chk("the gear is gone — one menu, not two", !bar.gear);
  chk("the refresh button is gone from the bar", !bar.sync);

  // closed, the drawer sits off the left edge
  const shut = await p.evaluate(() => {
    const m = document.querySelector("#menuBack .modal").getBoundingClientRect();
    return { right: Math.round(m.right), open: document.querySelector("#menuBack").classList.contains("show") };
  });
  chk("it starts off-screen to the left", shut.right <= 1, "right edge at " + shut.right);

  await p.click("#barMenu"); await p.waitForTimeout(600);
  const open = await p.evaluate(() => {
    const back = document.querySelector("#menuBack");
    const m = back.querySelector(".modal").getBoundingClientRect();
    const labels = [...back.querySelectorAll(".lab-sm")].map((x) => x.textContent);
    return {
      left: Math.round(m.left), width: Math.round(m.width),
      full: Math.round(m.height) >= window.innerHeight - 2,
      sections: [...back.querySelectorAll(".menuitem .mi-t")].map((x) => x.textContent),
      icons: [...back.querySelectorAll(".menuitem .mi-i svg.tile")].length,
      groups: labels,
      hasTheme: !!back.querySelector("#pfTheme"),
      hasIdentity: !!back.querySelector(".profile-hd"),
      text: back.innerText,
      hasCredit: /Created by PK/i.test(back.innerText)
    };
  });
  console.log("\nopen: x=" + open.left + " w=" + open.width + " full-height=" + open.full);
  console.log("  sections : " + open.sections.join(" | "));
  console.log("  groups   : " + open.groups.join(" | "));
  chk("it slides in from the left edge", open.left === 0, String(open.left));
  chk("it is full height", open.full);
  chk("the sections are offered, Premier League first",
    open.sections.join("|") === "Premier League|Game On tournament|Game On Voluntary",
    open.sections.join(","));
  // Prices and player stats are reference about footballers, not a section of
  // the league; they moved to the profile sheet with the other lookups.
  chk("the player pages are NOT here — they have moved to the profile sheet",
    !/Player stats|Price changes/.test(open.text), open.sections.join(","));
  chk("every section carries an icon tile", open.icons === open.sections.length,
      open.icons + " of " + open.sections.length);
  chk("Sections sits above the rest", open.groups[0] === "Sections", open.groups.join(","));
  chk("the settings groups came with it", open.groups.length >= 2, open.groups.join(","));
  chk("the theme control is here", open.hasTheme);
  // Who you are, and the league's own pages, moved out to their own sheet under
  // the control on the right of the bar. The burger is navigation and the two
  // settings now, and must not carry any of it.
  chk("who-you-are is NOT here — it has its own sheet", !open.hasIdentity);
  chk("nor is anything of the league", !/League insights|Winnings|Head to head|Game rules/.test(open.text),
      open.groups.join(","));
  chk("and no credit line, which was removed by request", !open.hasCredit);

  await p.screenshot({ path: GOENV.OUT + "/drawer.png" });

  // into prices from the profile sheet, which is where it lives now
  await p.mouse.click(380, 500); await p.waitForTimeout(400);
  await p.click("#barYou"); await p.waitForTimeout(450);
  await p.click("#pfPrices"); await p.waitForTimeout(900);
  const pr = await p.evaluate(() => ({
    shut: !document.querySelector("#youBack").classList.contains("show") &&
          !document.querySelector("#menuBack").classList.contains("show"),
    title: document.querySelector("#barTitle").textContent,
    headers: [...document.querySelectorAll('[data-view="prices"] thead th')].map((x) => x.textContent),
    sortable: [...document.querySelectorAll('[data-view="prices"] th.sortable')].map((x) => x.getAttribute("data-sort")),
    dropdown: !!document.querySelector("#prSort"),
    rows: document.querySelectorAll('[data-view="prices"] tbody tr').length,
    top: (document.querySelector('[data-view="prices"] tbody tr') || {}).innerText,
    overflow: document.documentElement.scrollWidth > window.innerWidth + 1
  }));
  console.log("\nprices: '" + pr.title + "', " + pr.rows + " rows, overflow " + pr.overflow);
  console.log("  columns : " + pr.headers.join(" | "));
  console.log("  sorting : by header — " + pr.sortable.join(", ") + " (dropdown: " + pr.dropdown + ")");
  console.log("  top row : " + JSON.stringify((pr.top || "").replace(/\s+/g, " ").trim().slice(0, 56)));
  chk("choosing it closes the sheet behind you", pr.shut);
  chk("the five columns are there", pr.headers.length === 5, pr.headers.join(","));
  chk("Game On ownership is one of them", pr.headers.some((h) => /Game On/i.test(h)));
  chk("no overflow with five columns", !pr.overflow);
  chk("sorting is by column header, not a dropdown", !pr.dropdown && pr.sortable.length === 5,
      pr.sortable.join(","));

  // Game On ownership must be a real number from our own squads
  const go = await p.evaluate(() => {
    const rows = [...document.querySelectorAll('[data-view="prices"] tbody tr')];
    const vals = rows.map((r) => r.querySelectorAll("td")[3].innerText.trim());
    return { sample: vals.slice(0, 4), nonZero: vals.filter((v) => parseFloat(v) > 0).length };
  });
  console.log("  Game On owned, top rows: " + go.sample.join(", ") + "  (" + go.nonZero + " non-zero on screen)");
  chk("league ownership is populated", go.nonZero > 0);

  await p.click('th[data-sort="go"]'); await p.waitForTimeout(500);
  const byGo = await p.evaluate(() => {
    const r = document.querySelector('[data-view="prices"] tbody tr');
    return r ? r.innerText.replace(/\s+/g, " ").trim() : "";
  });
  console.log("  most owned in Game On: " + JSON.stringify(byGo.slice(0, 56)));
  chk("tapping Game On sorts by it", byGo.length > 0);

  // one section only — the old price-change route must be gone
  await p.evaluate(() => { location.hash = "#pricechange"; }); await p.waitForTimeout(700);
  const gone = await p.evaluate(() => ({ hash: location.hash,
    classicRows: document.querySelectorAll('[data-view="classic"] tbody tr').length }));
  console.log("\nold #pricechange route now lands on: " + gone.hash);
  chk("the second price section is gone", !/pricechange/.test(gone.hash) || gone.classicRows > 0);

  // and with no price record, the moving column stays out of the way
  DATA = "/tmp/drawer-bare.json";
  const ctx2 = await b.newContext({ ...devices["iPhone 12"], serviceWorkers: "block" });
  const p2 = await ctx2.newPage();
  p2.on("pageerror", (e) => errs.push("JS(bare): " + e.message));
  await p2.goto("http://localhost:9900/index.html#prices", { waitUntil: "domcontentloaded" });
  await p2.waitForTimeout(1300);
  const bare = await p2.evaluate(() => ({
    headers: [...document.querySelectorAll('[data-view="prices"] thead th')].map((x) => x.textContent),
    sortable: document.querySelectorAll('[data-view="prices"] th.sortable').length,
    rows: document.querySelectorAll('[data-view="prices"] tbody tr').length,
    top: (document.querySelector('[data-view="prices"] tbody tr') || {}).innerText
  }));
  console.log("\nwith no price record: " + bare.rows + " rows, columns " + bare.headers.join(" | "));
  console.log("  top row : " + JSON.stringify((bare.top || "").replace(/\s+/g, " ").trim().slice(0, 46)));
  chk("prices and both ownerships still show", bare.rows > 100 && bare.headers.length === 4,
      bare.headers.join(","));
  chk("the four remaining columns all sort", bare.sortable === 4, String(bare.sortable));

  console.log("\nJS errors: " + (errs.length ? JSON.stringify(errs.slice(0, 3)) : "none"));
  chk("no errors", errs.length === 0);
  await b.close(); srv.close();
  console.log("\n" + (fails ? fails + " FAILURES" : "one drawer from the left, one price section"));
})();
