const GOENV = require("./lib/env.js");
/* Sorting by tapping a column header, and the theme control sitting last in
   the drawer. Every sort state has to keep all five columns on a 320px screen,
   because the arrow moves between columns as you tap. */
const { chromium, devices } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const F = require("./fixture.js");
const N = F.count();
F.write("/tmp/drawer-rich.json");

const APP = GOENV.APP;
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".svg":"image/svg+xml" };
const DATA = "/tmp/drawer-rich.json";   // has movement, so all five columns show
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
// The name cell carries the club and position on a second line; the app sorts
// on the name alone, so read that rather than the whole cell.
const cells = (p, i) => p.evaluate((i) =>
  [...document.querySelectorAll('[data-view="prices"] tbody tr')]
    .map((r) => {
      const td = r.querySelectorAll("td")[i];
      if (!td) return "";
      const who = td.querySelector(".who");
      return (who ? who.textContent : td.innerText).trim();
    }), i);

(async () => {
  await new Promise((r) => srv.listen(9907, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });

  // --- the drawer: theme last -------------------------------------------
  {
    const ctx = await b.newContext({ ...devices["iPhone 12"], serviceWorkers: "block" });
    const p = await ctx.newPage();
    await p.goto("http://localhost:9907/index.html#classic", { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(1500);
    await p.click("#barMenu"); await p.waitForTimeout(500);
    const g = await p.evaluate(() => {
      const back = document.querySelector("#menuBack");
      const groups = [...back.querySelectorAll(".lab-sm")].map((x) => x.textContent);
      // The burger is Sections, then Appearance, then Gameweek status — the
      // two settings under the navigation, the status last because it is
      // looked up when a score seems wrong, not every visit. The footer
      // ("Updated …") lives in the You sheet now, with everything else about
      // you and the league.
      const theme = back.querySelector("#pfTheme").getBoundingClientRect();
      const menus = [...back.querySelectorAll(".menu")];
      const sections = menus.find((m) => m.querySelector(".menuitem"));
      const gw = menus.find((m) => m.querySelector("#pfGwStatus"));
      return { groups, noFooter: !back.querySelector(".pffoot"),
               belowSections: !!sections && sections.getBoundingClientRect().bottom <= theme.top + 1,
               aboveGw: !!gw && theme.bottom <= gw.getBoundingClientRect().top + 1 };
    });
    console.log("drawer groups: " + g.groups.join(" | "));
    chk("the burger is Sections, then Appearance, with Gameweek status unheaded beneath",
        g.groups.join("|") === "Sections|Appearance", g.groups.join(","));
    chk("the theme control sits below the sections", g.belowSections);
    chk("and above Gameweek status", g.aboveGw);
    chk("the footer is not here — it moved to the You sheet", g.noFooter);
    await ctx.close();
  }

  // --- sorting by header --------------------------------------------------
  const ctx = await b.newContext({ ...devices["iPhone 12"], serviceWorkers: "block" });
  ctx.setDefaultTimeout(4000);
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push("JS: " + e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|net::ERR_|ERR_TUNNEL/i.test(m.text())) errs.push("CON: " + m.text()); });
  await p.goto("http://localhost:9907/index.html#prices", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(1600);

  const gone = await p.evaluate(() => !!document.querySelector("#prSort"));
  chk("the sort dropdown is gone", !gone);
  const kept = await p.evaluate(() => !!document.querySelector("#prPos") && !!document.querySelector("#prSearch"));
  chk("the position filter and search stay", kept);

  const heads = await p.evaluate(() =>
    [...document.querySelectorAll('[data-view="prices"] th.sortable')].map((x) => x.getAttribute("data-sort")));
  console.log("\nsortable columns: " + heads.join(", "));
  chk("every column sorts", heads.length === 5, heads.join(","));

  const num = (v) => parseFloat(String(v).replace(/[^\d.\-]/g, "")) || 0;
  const asc = (a) => a.every((v, i) => i === 0 || a[i - 1] <= v);
  const desc = (a) => a.every((v, i) => i === 0 || a[i - 1] >= v);

  const plan = [
    ["name",  0, "Player",  "text"],
    ["price", 1, "Price",   "num"],
    ["owned", 2, "FPL",     "num"],
    ["go",    3, "Game On", "num"],
    ["move",  4, "Progress",  "skip"]
  ];
  for (const [key, idx, label, kind] of plan) {
    await p.click('th[data-sort="' + key + '"]'); await p.waitForTimeout(450);
    const first = await cells(p, idx);
    const st1 = await p.evaluate((k) => {
      const th = document.querySelector('th[data-sort="' + k + '"]');
      const all = [...document.querySelectorAll('[data-view="prices"] th.sortable')];
      const table = document.querySelector('[data-view="prices"] table.t');
      return { arrow: th.querySelector(".sarrow").textContent,
               aria: th.getAttribute("aria-sort"),
               marked: all.filter((x) => x.classList.contains("sorted")).map((x) => x.getAttribute("data-sort")),
               right: Math.round(table.getBoundingClientRect().right), vw: window.innerWidth };
    }, key);
    await p.click('th[data-sort="' + key + '"]'); await p.waitForTimeout(450);
    const second = await cells(p, idx);
    const st2 = await p.evaluate((k) => {
      const th = document.querySelector('th[data-sort="' + k + '"]');
      return { arrow: th.querySelector(".sarrow").textContent, aria: th.getAttribute("aria-sort") };
    }, key);

    const one = kind === "text" ? first.slice() : first.map(num);
    const two = kind === "text" ? second.slice() : second.map(num);
    const coll = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });
    const cmp = kind === "text"
      ? { a: one.every((v, i) => i === 0 || coll.compare(one[i - 1], v) <= 0),
          d: two.every((v, i) => i === 0 || coll.compare(two[i - 1], v) >= 0) }
      : { a: asc(one), d: desc(one) };

    console.log("\n" + label.padEnd(8) + " 1st tap " + st1.arrow + " (" + st1.aria + ")  top: " +
      JSON.stringify(first.slice(0, 3)));
    console.log("         2nd tap " + st2.arrow + " (" + st2.aria + ")  top: " +
      JSON.stringify(second.slice(0, 3)));

    chk(label + ": only this column is marked", st1.marked.length === 1 && st1.marked[0] === key, st1.marked.join(","));
    chk(label + ": the arrow flips on the second tap", st1.arrow !== st2.arrow && st1.arrow && st2.arrow,
        st1.arrow + " -> " + st2.arrow);
    chk(label + ": aria-sort flips too", st1.aria !== st2.aria && /ending$/.test(st1.aria) && /ending$/.test(st2.aria),
        st1.aria + " -> " + st2.aria);
    chk(label + ": the order actually reverses", JSON.stringify(first) !== JSON.stringify(second));
    if (kind === "text") {
      chk(label + ": names run A to Z first", cmp.a, JSON.stringify(first.slice(0, 2)));
      chk(label + ": then Z to A", cmp.d, JSON.stringify(second.slice(0, 2)));
    } else if (kind === "num") {
      chk(label + ": biggest first", cmp.d, JSON.stringify(one.slice(0, 3)));
      chk(label + ": then smallest first", asc(two), JSON.stringify(two.slice(0, 3)));
    }
    chk(label + ": still fits a 390px screen", st1.right <= st1.vw + 1, st1.right + "/" + st1.vw);
  }

  // --- and the same on the narrowest phone -------------------------------
  const ctx2 = await b.newContext({ viewport: { width: 320, height: 568 }, deviceScaleFactor: 2,
    isMobile: true, hasTouch: true, serviceWorkers: "block" });
  const p2 = await ctx2.newPage();
  p2.on("pageerror", (e) => errs.push("JS(320): " + e.message));
  await p2.goto("http://localhost:9907/index.html#prices", { waitUntil: "domcontentloaded" });
  await p2.waitForTimeout(1600);
  console.log("\nat 320px, in each sort state:");
  for (const [key, , label] of plan) {
    for (const pass of [1, 2]) {
      await p2.click('th[data-sort="' + key + '"]'); await p2.waitForTimeout(350);
      const fit = await p2.evaluate(() => {
        const t = document.querySelector('[data-view="prices"] table.t');
        const th = [...t.querySelectorAll("th")];
        return { right: Math.round(t.getBoundingClientRect().right), vw: window.innerWidth,
                 cols: th.length, page: document.documentElement.scrollWidth > window.innerWidth + 1 };
      });
      if (pass === 2) console.log("   " + label.padEnd(8) + " last column ends at " + fit.right + "/" + fit.vw +
        ", " + fit.cols + " columns, page overflow " + fit.page);
      chk("320px " + label + " tap " + pass + ": all columns on screen", fit.right <= fit.vw + 1,
          fit.right + "/" + fit.vw);
      chk("320px " + label + " tap " + pass + ": no page overflow", !fit.page);
    }
  }
  await p2.screenshot({ path: GOENV.OUT + "/sorted-320.png" });

  // two players sharing a surname must land the same way round every time
  await p.fill("#prSearch", ""); await p.waitForTimeout(300);
  const orderOf = async () => {
    await p.click('th[data-sort="name"]'); await p.waitForTimeout(400);
    return p.evaluate(() => [...document.querySelectorAll('[data-view="prices"] tbody tr')]
      .map((r) => r.querySelectorAll("td")[0].innerText.replace(/\s+/g, " ").trim()));
  };
  const viaName = await orderOf();
  await p.click('th[data-sort="go"]'); await p.waitForTimeout(400);
  await p.click('th[data-sort="price"]'); await p.waitForTimeout(400);
  const viaOthers = await orderOf();
  const dupes = viaName.filter((v, i) => i && v.split(" ")[0] === viaName[i - 1].split(" ")[0]);
  console.log("\nshared surnames on screen: " + (dupes.length ? dupes.join(", ") : "none"));
  chk("the same-name order does not depend on how you got here",
      JSON.stringify(viaName) === JSON.stringify(viaOthers));

  // A player past the rendered cap must still be findable, under any sort —
  // this is what filtering the rendered rows used to get wrong.
  const shown = () => p.evaluate(() =>
    [...document.querySelectorAll('[data-view="prices"] tbody tr')]
      .filter((r) => r.style.display !== "none")
      .map((r) => r.querySelector(".who").textContent));
  console.log("");
  // Pick a real player the current sort has pushed off the end of the table,
  // rather than naming one and hoping he is in this season's list.
  // Tap until the name column is sorted the way we want, rather than counting
  // taps and hoping the parity is right.
  const sortName = async (want) => {
    for (let i = 0; i < 3; i++) {
      const now = await p.evaluate(() =>
        document.querySelector('th[data-sort="name"]').getAttribute("aria-sort"));
      if (now === want) return;
      await p.click('th[data-sort="name"]'); await p.waitForTimeout(400);
    }
    throw new Error("could not reach " + want);
  };
  await p.fill("#prSearch", ""); await p.waitForTimeout(300);
  await sortName("ascending");
  const azTop = await shown();
  console.log("A to Z renders " + azTop.length + " rows, starting " + JSON.stringify(azTop[0]));
  chk("the whole list is rendered, not a first page", azTop.length === N, String(azTop.length));

  // whoever leads A-to-Z is at the far end Z-to-A: a player search has to reach
  // however the table happens to be sorted
  const last = azTop[0];
  await sortName("descending");
  const zaTop = await shown();
  console.log("Z to A starts " + JSON.stringify(zaTop[0]) + "; " + JSON.stringify(last) +
              " now sits at row " + (zaTop.indexOf(last) + 1) + " of " + zaTop.length);
  chk("he is at the far end of the other order", zaTop.indexOf(last) > zaTop.length - 5,
      String(zaTop.indexOf(last)));

  for (const sortBy of ["name", "price", "go"]) {
    await p.fill("#prSearch", ""); await p.waitForTimeout(300);
    await p.click('th[data-sort="' + sortBy + '"]'); await p.waitForTimeout(400);
    await p.fill("#prSearch", last); await p.waitForTimeout(400);
    const hits = await shown();
    console.log("sorted by " + sortBy.padEnd(6) + " search " + JSON.stringify(last) + " -> " + JSON.stringify(hits));
    chk("a player at the far end is findable when sorted by " + sortBy,
        hits.indexOf(last) !== -1, JSON.stringify(hits));
  }
  // and a search with no match says so rather than showing a blank table
  await p.fill("#prSearch", "zzzznobody"); await p.waitForTimeout(400);
  const none = await p.evaluate(() => ({
    rows: document.querySelectorAll('[data-view="prices"] tbody tr').length,
    note: (document.querySelector('[data-view="prices"] .nohits') || {}).innerText || ""
  }));
  console.log("search with no match: " + none.rows + " rows, note " + JSON.stringify(none.note));
  chk("a search with no match says so", none.rows === 0 && /No player/i.test(none.note), none.note);
  await p.fill("#prSearch", ""); await p.waitForTimeout(400);
  const back = await p.evaluate(() => document.querySelectorAll('[data-view="prices"] tbody tr').length);
  console.log("clearing the search brings back " + back + " rows");
  chk("clearing the search restores every player", back === N, String(back));

  console.log("\nJS errors: " + (errs.length ? JSON.stringify(errs.slice(0, 3)) : "none"));
  chk("no errors", errs.length === 0);
  await b.close(); srv.close();
  console.log("\n" + (fails ? fails + " FAILURES" : "headers sort both ways and fit; the theme sits last"));
})();
