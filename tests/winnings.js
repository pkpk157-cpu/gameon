const GOENV = require("./lib/env.js");
/* The winnings page: only what is actually won, biggest first, and reachable
   from the drawer. Checked against the same figures a profile shows. */
const { chromium } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP;
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".svg":"image/svg+xml" };
let DATA = APP + "/data.json";
const srv = http.createServer((q, r) => { let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  const f = u === "/data.json" ? DATA : path.join(APP, u);
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { "content-type": T[path.extname(f)] || "text/plain", "cache-control": "no-store" }); r.end(b); }); });
let fails = 0;
const chk = (n, ok, d) => { if (!ok) { fails++; console.log("   FAIL " + n + (d ? " — " + d : "")); } };

// the truth, computed here rather than read off the page
global.window = {};
eval(fs.readFileSync(APP + "/config.js", "utf8"));
global.window.GO_STORE = { config: () => global.window.GO_DEFAULT_CONFIG, overrides: () => ({}) };
eval(fs.readFileSync(APP + "/compute.js", "utf8"));
const C = global.window.GO_COMPUTE;
const ds = JSON.parse(fs.readFileSync(APP + "/data.json", "utf8")).dataset;
const want = ds.managers.map((m) => ({ id: m.id, name: m.entryName, amount: C.winnings(ds, m.id).settled }))
  .filter((x) => x.amount > 0).sort((a, b) => (b.amount - a.amount) || (a.name < b.name ? -1 : 1));
console.log("confirmed winners: " + want.length + "  " +
  want.map((w) => w.name + " " + w.amount).join(" | "));

// and a league where nothing has been settled at all
const bare = JSON.parse(JSON.stringify(JSON.parse(fs.readFileSync(APP + "/data.json", "utf8"))));
{
  // undo the completed month by hiding every finished gameweek's totals
  const d2 = bare.dataset;
  Object.keys(d2.history).forEach((id) => { d2.history[id] = { 1: d2.history[id][1] }; });
  d2.bootstrap.events.forEach((e) => { if (e.id > 1) { e.finished = false; e.data_checked = false; } });
  fs.writeFileSync("/tmp/win-bare.json", JSON.stringify(bare));
}

(async () => {
  await new Promise((r) => srv.listen(9840, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  for (const w of [320, 390, 430, 768]) {
    const ctx = await b.newContext({ viewport: { width: w, height: 1000 }, deviceScaleFactor: 2, isMobile: w < 700, hasTouch: true, serviceWorkers: "block" });
    const p = await ctx.newPage();
    const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.goto("http://localhost:9840/index.html#classic", { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(2400);

    if (w === 390) {
      // it lives in the League group, straight under the stats — in the sheet
      // under the control on the right of the bar, not the burger, which now
      // carries only the sections and the two settings
      await p.click("#barYou"); await p.waitForTimeout(600);
      const league = await p.evaluate(() => {
        const groups = [...document.querySelectorAll("#youBody .menu")];
        const g = groups.filter((x) => (x.querySelector(".lab-sm") || {}).textContent === "League")[0];
        return g ? [...g.querySelectorAll("button")].map((b) => b.textContent.trim()) : null;
      });
      console.log("\ndrawer, League group: " + (league || []).join(" | "));
      chk("there is a League group", !!league);
      chk("Winnings heads the League group", league && league[0] === "Winnings", (league || []).join(","));
      // the stats sit in a group of their own above it, one entry per tab
      const stats = await p.evaluate(() => {
        const groups = [...document.querySelectorAll("#youBody .menu")];
        const g = groups.filter((x) => /Stats & highlights/.test((x.querySelector(".lab-sm") || {}).textContent || ""))[0];
        return g ? [...g.querySelectorAll("button")].map((b) => b.querySelector(".mtx").firstChild.textContent.trim()) : null;
      });
      chk("a Stats & highlights group with five entries, returns and selections named",
          !!stats && stats.length === 5 && stats[0] === "Gameweek returns" && stats[1] === "Gameweek selections",
          (stats || []).join(","));
      // and it is not doubled up in the section tiles
      // the section tiles live in the burger; open it to read them
      await p.evaluate(() => document.querySelector("#youBack").click());
      await p.waitForTimeout(400);
      await p.click("#barMenu"); await p.waitForTimeout(500);
      const tiles = await p.evaluate(() => [...document.querySelectorAll(".menuitem .mi-t")].map((x) => x.textContent.trim()));
      console.log("   section tiles: " + tiles.join(" | "));
      chk("and is not also a section tile", tiles.indexOf("Winnings") === -1, tiles.join(","));

      // The page used to rebuild every competition table once per manager —
      // four seconds on a laptop, half a minute on a phone. Time it, because a
      // suite that only waits will pass a hang.
      await p.evaluate(() => document.querySelector("#menuBack").click());
      await p.waitForTimeout(400);
      await p.click("#barYou"); await p.waitForTimeout(500);
      const took = await p.evaluate(async () => {
        const t0 = performance.now();
        document.querySelector("#pfWinnings").click();
        await new Promise((r) => setTimeout(r, 0));
        return Math.round(performance.now() - t0);
      });
      await p.waitForTimeout(800);
      const where = await p.evaluate(() => ({ hash: location.hash,
        title: document.querySelector("#barTitle").textContent.trim(),
        back: getComputedStyle(document.querySelector("#barBack")).display !== "none" }));
      console.log("   opened " + where.hash + " in " + took + "ms, titled " +
        JSON.stringify(where.title) + ", back arrow " + where.back);
      chk("the drawer opens the page", where.hash === "#winnings" && where.title === "Winnings", JSON.stringify(where));
      chk("and it has a way back", where.back);
      chk("it draws without locking the page up", took < 400, took + "ms of blocked main thread");
    } else {
      await p.evaluate(() => { location.hash = "#winnings"; });
      await p.waitForTimeout(900);
    }

    const m = await p.evaluate(() => {
      const host = document.querySelector('[data-view="winnings"]');
      const rows = [...host.querySelectorAll("table.wintbl tbody tr")].map((tr) => ({
        pos: tr.querySelector("td.pos").textContent.trim(),
        name: tr.querySelector("td.name .who").textContent.trim(),
        who: (tr.querySelector("td.name .mgr") || {}).textContent || "",
        won: tr.querySelector("td.num .prize").textContent.trim(),
        tags: [...tr.querySelectorAll(".wtag")].map((x) => x.textContent.replace(/\s+/g, " ").trim()),
        entry: tr.getAttribute("data-entry")
      }));
      const tbl = host.querySelector("table.wintbl");
      const wrap = tbl && tbl.closest(".freeze");
      return { rows, cards: [...host.querySelectorAll(".pcard .big, .pcards .big")].map((x) => x.textContent.trim()),
        scrolls: wrap ? wrap.scrollWidth > wrap.clientWidth + 1 : false,
        pageScrolls: document.documentElement.scrollWidth > window.innerWidth + 1,
        clipped: tbl ? [...tbl.querySelectorAll("td, th")].filter((c) =>
          c.offsetParent !== null && c.scrollWidth > c.clientWidth + 0.5).length : 0 };
    });
    console.log("\n" + w + "px — " + m.rows.length + " rows");
    m.rows.forEach((r) => console.log("   " + r.pos + " " + r.name.padEnd(20) + r.won + "   " + JSON.stringify(r.tags)));
    chk(w + ": only the managers who have actually been paid",
        m.rows.length === want.length, m.rows.length + " vs " + want.length);
    chk(w + ": biggest first", JSON.stringify(m.rows.map((r) => r.name)) === JSON.stringify(want.map((r) => r.name)),
        JSON.stringify(m.rows.map((r) => r.name)));
    chk(w + ": the amounts are the settled ones",
        m.rows.every((r, i) => r.won.replace(/[^\d]/g, "") === String(want[i].amount)),
        JSON.stringify(m.rows.map((r) => r.won)));
    chk(w + ": every row says what it was won for", m.rows.every((r) => r.tags.length > 0));
    chk(w + ": and names the person behind the team",
        m.rows.every((r) => r.who.trim().length > 1), JSON.stringify(m.rows.map((r) => r.who)));
    chk(w + ": every row opens a profile", m.rows.every((r) => /^\d+$/.test(r.entry || "")));
    chk(w + ": nothing scrolls sideways", !m.scrolls && !m.pageScrolls);
    chk(w + ": nothing is cut off", m.clipped === 0, String(m.clipped));
    chk(w + ": no errors", errs.length === 0, JSON.stringify(errs.slice(0, 2)));
    if (w === 390) await p.screenshot({ path: __dirname + "/winnings.png" });
    await ctx.close();
  }

  // and the state before anyone has won anything
  DATA = "/tmp/win-bare.json";
  const ctx2 = await b.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  const p2 = await ctx2.newPage();
  const errs2 = []; p2.on("pageerror", (e) => errs2.push(e.message));
  await p2.goto("http://localhost:9840/index.html#winnings", { waitUntil: "domcontentloaded" });
  await p2.waitForTimeout(2400);
  const none = await p2.evaluate(() => {
    const host = document.querySelector('[data-view="winnings"]');
    return { rows: host.querySelectorAll("table.wintbl tbody tr").length,
             text: (host.querySelector(".wnone") || {}).innerText || "" };
  });
  console.log("\nwith nothing settled: " + none.rows + " rows");
  console.log("   " + JSON.stringify(none.text.replace(/\s+/g, " ").trim().slice(0, 120)));
  chk("an unsettled league lists nobody", none.rows === 0, String(none.rows));
  chk("and says so rather than showing an empty page", /Nothing is settled yet/.test(none.text), none.text.slice(0, 60));
  chk("no errors on the empty state", errs2.length === 0, JSON.stringify(errs2.slice(0, 2)));
  await p2.screenshot({ path: __dirname + "/winnings-none.png" });
  await b.close(); srv.close();
  // the same figures, whichever way they are asked for
  {
    const one = C.winnings(ds, want[0].id), bulk = C.winningsAll(ds)[want[0].id];
    chk("one manager and the whole league agree",
        JSON.stringify(one) === JSON.stringify(bulk), JSON.stringify(one));
    const t0 = Date.now(); const every = C.winningsAll(ds);
    const ms = Date.now() - t0;
    console.log("\nthe whole league in one pass: " + ms + "ms for " + Object.keys(every).length + " managers");
    chk("one pass covers every manager", Object.keys(every).length === ds.managers.length,
        Object.keys(every).length + " of " + ds.managers.length);
    chk("and it is quick enough to draw on a phone", ms < 250, ms + "ms");
  }

  console.log("\n" + (fails ? fails + " FAILURES" : "only what is won, biggest first, quick to draw, and a straight answer when nothing is"));
})();
