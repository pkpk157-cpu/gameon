const GOENV = require("./lib/env.js");
/* Player stats: the renamed section, the Prices/Stats toggle, and the ten
   leaderboards. The numbers are recounted here from the raw dataset by a
   second, independent path — if compute.js and a plain loop over livePoints
   and breakdown disagree, one of them is wrong and the page is not shippable. */
const { chromium } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP;
const SCRATCH = GOENV.OUT;
const DATA = GOENV.FIXTURES + "/now6.json";
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".svg":"image/svg+xml" };
const ds = JSON.parse(fs.readFileSync(DATA, "utf8")).dataset;

const srv = http.createServer((q, r) => {
  let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  const f = u === "/data.json" ? DATA : path.join(APP, u);
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { "content-type": T[path.extname(f)] || "text/plain", "cache-control": "no-store" }); r.end(b); });
});

let fails = 0;
const chk = (n, ok, d) => { console.log((ok ? "   ok   " : "   FAIL ") + n + (ok || !d ? "" : " — " + d)); if (!ok) fails++; };

// ---- the second opinion ----------------------------------------------------
// Deliberately written the long way round: no shared helpers with compute.js.
function recount() {
  const gws = Object.keys(ds.livePoints).map(Number).sort((a, b) => a - b);
  const out = {};
  for (const key of Object.keys(ds.elements)) {
    const id = +key;
    let pts = 0, goals = 0, assists = 0, mins = 0, bonus = 0, best = null;
    for (const g of gws) {
      const p = (ds.livePoints[g] || {})[id];
      if (p == null) continue;
      pts += p;
      if (best === null || p > best.pts) best = { gw: g, pts: p };
      for (const ln of ((ds.breakdown[g] || {})[id] || [])) {
        if (ln[0] === "goals_scored") goals += ln[1];
        if (ln[0] === "assists") assists += ln[1];
        if (ln[0] === "minutes") mins += ln[1];
        if (ln[0] === "bonus") bonus += ln[2];
      }
    }
    // captaincies, counted straight off the squads
    let caps = 0, capRet = 0;
    for (const g of gws) {
      for (const mid of Object.keys(ds.picks[g] || {})) {
        const sq = (ds.picks[g][mid] || {}).p || [];
        const cap = sq.find((x) => x[2]);
        if (cap && cap[0] === id) { caps++; capRet += ((ds.livePoints[g] || {})[id]) || 0; }
      }
    }
    out[id] = { pts, goals, assists, mins, bonus, best, caps,
                capAvg: caps ? Math.round((capRet / caps) * 10) / 10 : null };
  }
  return { out, gws };
}

(async () => {
  console.log("A. compute.js against a second count of the same data");
  {
    global.window = {};
    require(APP + "/compute.js");
    const st = global.window.GO_COMPUTE.playerStats(JSON.parse(JSON.stringify(ds)));
    const { out, gws } = recount();
    chk("the same gameweeks", JSON.stringify(st.gws) === JSON.stringify(gws), st.gws + " vs " + gws);
    chk("the same number of players", st.rows.length === Object.keys(ds.elements).length);
    const bad = [];
    for (const r of st.rows) {
      const m = out[r.id];
      if (r.pts !== m.pts) bad.push(r.name + " pts " + r.pts + "/" + m.pts);
      if (r.goals !== m.goals) bad.push(r.name + " G " + r.goals + "/" + m.goals);
      if (r.assists !== m.assists) bad.push(r.name + " A " + r.assists + "/" + m.assists);
      if (r.mins !== m.mins) bad.push(r.name + " mins " + r.mins + "/" + m.mins);
      if (r.bonus !== m.bonus) bad.push(r.name + " bonus " + r.bonus + "/" + m.bonus);
      if (r.caps !== m.caps) bad.push(r.name + " caps " + r.caps + "/" + m.caps);
      if (r.capAvg !== m.capAvg) bad.push(r.name + " capAvg " + r.capAvg + "/" + m.capAvg);
      if ((r.best && r.best.pts) !== (m.best && m.best.pts)) bad.push(r.name + " best");
    }
    chk("every player's season agrees, line by line", bad.length === 0,
        bad.length + " disagreements, first: " + bad.slice(0, 4).join("; "));
    // the derived figures must follow from the counted ones
    const derived = st.rows.filter((r) => r.price > 0 &&
      Math.abs(r.ppm - Math.round((r.pts / r.price) * 10) / 10) > 0.001);
    chk("points per £m is points over price", derived.length === 0,
        derived.slice(0, 3).map((r) => r.name + " " + r.ppm).join("; "));
    const ga = st.rows.filter((r) => r.ga !== r.goals + r.assists);
    chk("goal involvements are goals plus assists", ga.length === 0);
    const capTotal = st.rows.reduce((s, r) => s + r.caps, 0);
    chk("every squad's armband is counted once", capTotal === gws.length * st.managers,
        capTotal + " armbands vs " + gws.length + " gameweeks x " + st.managers + " squads");
  }

  await new Promise((r) => srv.listen(8615, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  const errs = [];

  for (const w of [320, 390, 768]) {
    console.log("\n" + w + "px");
    const ctx = await b.newContext({ viewport: { width: w, height: 900 }, serviceWorkers: "block" });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errs.push(w + "px pageerror: " + e.message));
    page.on("console", (m) => { if (m.type() === "error" && !/ERR_TUNNEL|ERR_NAME/.test(m.text()) && !/\/photos\//.test((m.location() || {}).url || "")) errs.push(w + "px " + m.text()); });

    // the section is reached from the drawer, and is called what it now holds
    await page.goto("http://127.0.0.1:8615/#classic", { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    await page.click("#barMenu");
    await page.waitForTimeout(400);
    const menu = await page.evaluate(() => {
      const it = [...document.querySelectorAll(".menulist .who, .menulist b, .menulist .mt, .menulist div")]
        .map((x) => x.textContent.trim());
      return { text: document.querySelector(".menu") ? document.querySelector(".menu").innerText : "" };
    });
    // The player pages left the sections drawer for the profile sheet, split
    // into the two errands they always were.
    chk("the sections drawer no longer carries the player pages",
        !/Player stats|Price changes/.test(menu.text),
        menu.text.replace(/\n/g, " | ").slice(0, 220));
    await page.evaluate(() => {
      const w = window.innerWidth, h = window.innerHeight;
      document.elementFromPoint(w - 6, h / 2).click();
    });
    await page.waitForTimeout(400);
    await page.click("#barYou");
    await page.waitForTimeout(450);
    const you = await page.evaluate(() => {
      const grp = [...document.querySelectorAll("#youBody .menu")]
        .find((m) => (m.querySelector(".lab-sm") || {}).textContent === "Players");
      return grp ? [...grp.querySelectorAll("button")].map((x) => x.textContent.trim()) : [];
    });
    chk("the profile sheet offers Price changes and Player stats",
        you.join("|") === "Price changes|Player stats", you.join(","));
    await page.evaluate(() => {
      const h = window.innerHeight;
      document.elementFromPoint(6, h / 2).click();
    });
    await page.waitForTimeout(400);

    // prices tab still works and still carries the whole list
    await page.goto("http://127.0.0.1:8615/#prices", { waitUntil: "networkidle" });
    await page.waitForTimeout(700);
    const pr = await page.evaluate(() => {
      const s = document.querySelector("section.view.active");
      return { view: s && s.dataset.view, tabs: s.querySelectorAll("[data-pr]").length,
               on: (s.querySelector("[data-pr].on") || {}).getAttribute ? s.querySelector("[data-pr].on").getAttribute("data-pr") : null,
               priceRows: s.querySelectorAll("table.pricetbl tbody tr").length,
               title: (document.querySelector("#barTitle") || {}).textContent };
    });
    chk("prices is still the prices table", pr.view === "prices" && pr.priceRows > 50, JSON.stringify(pr));
    chk("with a toggle, on Prices", pr.tabs === 2 && pr.on === "prices", JSON.stringify(pr));
    chk("the bar says Price changes on the prices half", pr.title === "Price changes", pr.title);

    // cross to the boards by tapping, not by URL
    await page.click('[data-pr="stats"]');
    await page.waitForTimeout(800);
    const ps = await page.evaluate(() => {
      const s = document.querySelector("section.view.active");
      return { hash: location.hash, boards: s.querySelectorAll("table.psbtbl").length,
               titles: [...s.querySelectorAll(".section-title h2")].map((x) => x.textContent),
               notes: s.querySelectorAll(".psnote").length,
               lead: (s.querySelector(".statlead") || {}).textContent,
               over: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    chk("tapping Stats crosses over", ps.hash === "#prices/stats", ps.hash);
    chk("ten boards, each with its rule underneath", ps.boards === 10 && ps.notes === 10,
        ps.boards + " boards, " + ps.notes + " notes");
    chk("the page says how much season it is reading", /4 gameweeks played/.test(ps.lead || ""), ps.lead);
    chk("no sideways scroll", ps.over <= 1, "overflow " + ps.over);

    // the two filtered boards must actually hold to what they claim
    const claims = await page.evaluate(() => {
      const cards = [...document.querySelectorAll("section.view.active .card")];
      const titles = [...document.querySelectorAll("section.view.active .section-title h2")].map((x) => x.textContent);
      const grab = (name) => {
        const i = titles.indexOf(name);
        if (i < 0) return null;
        return [...cards[i].querySelectorAll("tbody tr")].map((tr) => {
          const td = [...tr.querySelectorAll("td")].map((x) => x.textContent.trim());
          return td;
        });
      };
      return { dear: grab("Not paying off"), diff: grab("Differentials"),
               rise: grab("Biggest risers"), fall: grab("Biggest fallers"),
               pts: grab("Most points") };
    });
    const pctOf = (s) => parseFloat(String(s).replace("%", ""));
    const moneyOf = (s) => parseFloat(String(s).replace(/[^0-9.]/g, ""));
    chk("every 'not paying off' row really is owned by 10%+ and costs £6.5m+",
        claims.dear.every((r) => pctOf(r[3]) >= 10 && moneyOf(r[4]) >= 6.5),
        JSON.stringify(claims.dear.slice(0, 2)));
    chk("and they run from fewest points up",
        claims.dear.every((r, i, a) => !i || +a[i - 1][2] <= +r[2]),
        claims.dear.map((r) => r[2]).join(","));
    chk("every differential really is at 5% or under",
        claims.diff.every((r) => pctOf(r[3]) <= 5), JSON.stringify(claims.diff.slice(0, 2)));
    chk("and they run from most points down",
        claims.diff.every((r, i, a) => !i || +a[i - 1][2] >= +r[2]),
        claims.diff.map((r) => r[2]).join(","));
    chk("risers all rose and fallers all fell",
        claims.rise.every((r) => /▲/.test(r[2])) && claims.fall.every((r) => /▼/.test(r[2])),
        JSON.stringify([claims.rise[0], claims.fall[0]]));
    chk("most points runs highest first",
        claims.pts.every((r, i, a) => !i || +a[i - 1][2] >= +r[2]), claims.pts.map((r) => r[2]).join(","));

    // the position filter has to reach every board, not just the first
    await page.selectOption("#psPos", "1");
    await page.waitForTimeout(500);
    const gk = await page.evaluate(() => {
      const rows = [...document.querySelectorAll("section.view.active table.psbtbl tbody tr")];
      const named = rows.filter((tr) => tr.querySelector(".mgr"));
      return { total: rows.length, named: named.length,
               offPos: named.filter((tr) => !/^GK/.test(tr.querySelector(".mgr").textContent)).length,
               boards: document.querySelectorAll("section.view.active table.psbtbl").length };
    });
    chk("filtering to goalkeepers leaves goalkeepers everywhere",
        gk.named > 0 && gk.offPos === 0, gk.offPos + " non-GK rows of " + gk.named);
    chk("and every board is still on the page", gk.boards === 10, String(gk.boards));
    await page.selectOption("#psPos", "all");
    await page.waitForTimeout(400);

    // a row opens the same breakdown the pitch cards use
    await page.click("section.view.active table.psbtbl tbody tr");
    await page.waitForTimeout(450);
    const md = await page.evaluate(() => ({
      open: !!document.querySelector("#modalBack.show"),
      title: (document.querySelector("#modalTitle") || {}).textContent }));
    chk("a player opens his breakdown", md.open && !!md.title, JSON.stringify(md));
    await page.click("#modalClose");
    await page.waitForTimeout(350);
    chk("and it closes again",
        await page.evaluate(() => !document.querySelector("#modalBack.show")));

    // and back again
    await page.click('[data-pr="prices"]');
    await page.waitForTimeout(700);
    const back = await page.evaluate(() => ({ hash: location.hash,
      priceRows: document.querySelectorAll("table.pricetbl tbody tr").length }));
    chk("and back to prices", back.hash === "#prices" && back.priceRows > 50, JSON.stringify(back));
    await ctx.close();
  }

  console.log("\nscript errors");
  chk("clean console", errs.length === 0, errs.slice(0, 5).join(" || "));

  await b.close(); srv.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})();
