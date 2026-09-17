const GOENV = require("./lib/env.js");
/* The five voluntary leagues. Money is the point of them, so the checks are
   mostly about money: every pot fully allocated, every shared place splitting
   exactly what the places it covers pay, and nobody quietly dropped. */
const { chromium } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP;
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css",
            ".json":"application/json", ".svg":"image/svg+xml", ".webp":"image/webp" };
const srv = http.createServer((q, r) => {
  let u = decodeURIComponent(q.url.split("?")[0]); if (u === "/") u = "/index.html";
  const f = u === "/data.json"
    ? GOENV.FIXTURES + "/vol.json"
    : path.join(APP, u);
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { "content-type": T[path.extname(f)] || "text/plain", "cache-control": "no-store" }); r.end(b); });
});

// the sheet, read straight from the PDF, independent of config.js
const SHEET = {
  "League 1":      { n: 15, fee: 1500, pot: 22500,  prizes: [9000, 6000, 4500, 3000] },
  "League 2":      { n: 16, fee: 1000, pot: 16000,  prizes: [6500, 4500, 3000, 2000] },
  "League 3":      { n: 9,  fee: 500,  pot: 4500,   prizes: [3000, 1500] },
  "Premier League":{ n: 33, fee: 2000, pot: 66000,  prizes: [17000, 12000, 10000, 8000, 6500, 5000, 4000, 3500] },
  "Elite PL":      { n: 34, fee: 5000, pot: 170000, prizes: [43000, 31000, 26000, 21000, 17000, 13500, 10500, 8000] }
};
const KEYS = ["v1", "v2", "v3", "vpl", "vel"];
const NAME_OF = { v1: "League 1", v2: "League 2", v3: "League 3",
                  vpl: "Premier League", vel: "Elite PL" };
// on the published sheet but not in the FPL league, so unscoreable
const AWAITING = { "Premier League": ["Aman Arora"], "Elite PL": ["Aman Arora", "Ismail Faizi"] };
// in the FPL league but not on the sheet, so not playing for the money
const NOT_PAID = {
  "League 1": ["LASIL DIAS"], "League 2": ["LASIL DIAS"], "League 3": ["LASIL DIAS"],
  "Premier League": ["LASIL DIAS", "Aman Kiza"], "Elite PL": ["Aman Kiza", "Big Slick"]
};

let fails = 0;
const chk = (n, ok, d) => { console.log((ok ? "   ok   " : "   FAIL ") + n + (ok || !d ? "" : " — " + d)); if (!ok) fails++; };
const money = (s) => parseInt(String(s).replace(/[^0-9]/g, ""), 10) || 0;

(async () => {
  // ---- the numbers, before any of it is drawn ----------------------------
  console.log("the sheet against the config");
  {
    global.window = {};
    require(APP + "/config.js");
    const V = global.window.GO_DEFAULT_CONFIG.voluntaryPrizes;
    const order = global.window.GO_DEFAULT_CONFIG.voluntaryOrder;
    chk("five leagues, in a set order", Object.keys(V).length === 5 && order.length === 5,
        JSON.stringify(order));
    order.forEach((k) => {
      const l = V[k], s = SHEET[l.name];
      chk(l.name + ": entries, fee and pot match the sheet",
          !!s && l.entries === s.n && l.fee === s.fee && l.pot === s.pot,
          JSON.stringify({ n: l.entries, fee: l.fee, pot: l.pot }));
      const prizes = Object.keys(l.prizes).sort((a, b) => a - b).map((x) => l.prizes[x]);
      chk(l.name + ": prize list matches the sheet",
          JSON.stringify(prizes) === JSON.stringify(s.prizes), JSON.stringify(prizes));
      chk(l.name + ": fee x entries is the pot", l.entries * l.fee === l.pot);
      chk(l.name + ": the prizes add back to the pot",
          prizes.reduce((a, b) => a + b, 0) === l.pot);
    });
    // the ids the sheet gave, which is where the tables actually come from
    const fd = fs.readFileSync(APP + "/scripts/fetch-data.js", "utf8");
    [1021712, 1021716, 1021717, 503430, 503428].forEach((id) => {
      chk("the updater fetches league " + id, fd.indexOf(String(id)) !== -1);
    });
  }

  await new Promise((r) => srv.listen(8631, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  for (const w of [320, 390]) {
    console.log("\n" + w + "px");
    const ctx = await b.newContext({ viewport: { width: w, height: 1000 }, serviceWorkers: "block" });
    const p = await ctx.newPage();
    const errs = [];
    p.on("pageerror", (e) => errs.push("pageerror: " + e.message));
    // A photograph the league never published answers 404 and the jersey shows
    // instead; that is the designed path, not an error. Anything else is.
    const missingPhoto = new Set();
    p.on("response", (r) => { if (r.status() === 404 && /\/photos\//.test(r.url())) missingPhoto.add(r.url()); });
    p.on("console", (m) => {
      if (m.type() !== "error" || /ERR_TUNNEL|ERR_NAME/.test(m.text())) return;
      if (/404/.test(m.text()) && missingPhoto.size) return;
      errs.push(m.text());
    });

    await p.goto("http://127.0.0.1:8631/#vol", { waitUntil: "networkidle" });
    await p.waitForTimeout(1200);
    chk("the section opens", await p.evaluate(() =>
      (document.querySelector("section.view.active") || {}).dataset?.view === "vol"));
    const tabs = await p.evaluate(() => {
      const t = [...document.querySelectorAll("[data-vol]")];
      const row = document.querySelector(".volhead").getBoundingClientRect();
      return { n: t.length, labels: t.map((x) => x.textContent.trim()),
               fits: t.every((x) => x.getBoundingClientRect().right <= row.right + 1),
               dropdown: !!document.querySelector("#volPick") };
    });
    chk("the five leagues are tabs, not a dropdown",
        tabs.n === 5 && !tabs.dropdown, JSON.stringify(tabs));
    chk("and every tab fits the row", tabs.fits, JSON.stringify(tabs.labels));

    for (const key of KEYS) {
      await p.click('[data-vol="' + key + '"]');
      await p.waitForTimeout(500);
      const t = await p.evaluate((NAME_OF) => {
        const rows = [...document.querySelectorAll("#volBody tr")].map((r) => {
          const td = [...r.children].map((c) => c.textContent.trim());
          return { rank: td[0].replace(/[^0-9]/g, ""), joint: /=/.test(td[0]),
                   team: r.children[1].innerText, total: +td[3], won: td[4] };
        });
        return {
          name: NAME_OF[document.querySelector("[data-vol].on").dataset.vol],
          rows: rows,
          facts: [...document.querySelectorAll(".volfact")].length ? ["x"] : [],
          prizeCards: [...document.querySelectorAll(".volpz")].length ? ["x"] : [],
          none: [...document.querySelectorAll(".volnone span")].map((e) => e.textContent.trim()),
          over: document.documentElement.scrollWidth - document.documentElement.clientWidth
        };
      }, NAME_OF);
      chk(t.name + ": the page is the table and nothing else",
          t.facts.length === 0 && t.prizeCards.length === 0 && t.none.length === 0,
          JSON.stringify({ facts: t.facts.length, prizes: t.prizeCards.length, none: t.none.length }));
      const s = SHEET[t.name];
      const playing = s.n - (AWAITING[t.name] || []).length;
      // the table is the people who bought in: the sheet's count, less anyone
      // on it who has not joined the FPL league
      const expect = s.n - (AWAITING[t.name] || []).length;
      chk(t.name + ": only the people who bought in, all with a score",
          t.rows.length === expect && t.rows.every((r) => r.total > 0),
          t.rows.length + " rows vs " + expect);
      chk(t.name + ": ranked highest first",
          t.rows.every((r, i, a) => !i || a[i - 1].total >= r.total),
          t.rows.map((r) => r.total).join(","));
      const paid = t.rows.reduce((sum, r) => sum + money(r.won), 0);
      chk(t.name + ": the whole pot is paid out", paid === s.pot, paid + " of " + s.pot);
      // a shared place must split exactly what the places it covers pay
      const groups = {};
      t.rows.forEach((r) => { (groups[r.rank] = groups[r.rank] || []).push(r); });
      let tieOk = true, tieNote = "";
      Object.keys(groups).forEach((rank) => {
        const g = groups[rank];
        if (g.length < 2) return;
        const from = +rank, covers = s.prizes.slice(from - 1, from - 1 + g.length);
        const due = covers.reduce((a, b) => a + b, 0);
        const got = g.reduce((sum, r) => sum + money(r.won), 0);
        if (got !== due) { tieOk = false; tieNote += " rank " + rank + ": " + got + " vs " + due; }
        if (!g.every((r) => r.joint)) { tieOk = false; tieNote += " rank " + rank + " unmarked"; }
      });
      chk(t.name + ": shared places split exactly what they cover", tieOk, tieNote);
      const names = t.rows.map((r) => r.team).join(" | ");
      chk(t.name + ": nobody outside the league list is named on the page",
          (NOT_PAID[t.name] || []).every((n) => t.none.indexOf(n) === -1),
          JSON.stringify(t.none));
      chk(t.name + ": nobody outside the sheet is in the table",
          (NOT_PAID[t.name] || []).every((n) => names.indexOf(n) === -1),
          (NOT_PAID[t.name] || []).filter((n) => names.indexOf(n) !== -1).join(", "));
      const reach = await p.evaluate(() => {
        const fz = document.querySelector(".freeze");
        const rows = [...document.querySelectorAll("#volBody tr")];
        const last = rows[rows.length - 1];
        fz.scrollTop = fz.scrollHeight;
        const lr = last.getBoundingClientRect(), fr = fz.getBoundingClientRect();
        return { tall: fz.scrollHeight > fz.clientHeight + 1,
                 lastSeen: lr.bottom <= fr.bottom + 2 && lr.bottom > fr.top,
                 boxInView: fr.bottom <= innerHeight + 2 };
      });
      chk(t.name + ": the last row can be reached", reach.lastSeen, JSON.stringify(reach));
      chk(t.name + ": the table stays inside the screen", reach.boxInView, JSON.stringify(reach));
      chk(t.name + ": no sideways scroll", t.over <= 1, String(t.over));
    }

    // The leagues' creator is in all five on FPL but on only one sheet. He must
    // win the one he bought into and appear in none of the others' tables.
    await p.click('[data-vol="vel"]');
    await p.waitForTimeout(500);
    const elite = await p.evaluate(() =>
      [...document.querySelectorAll("#volBody tr")].map((r) => r.children[1].innerText));
    chk("the creator wins the one league he is on the sheet for",
        /LASIL DIAS/i.test(elite[0] || ""), (elite[0] || "").replace(/\n/g, " "));
    for (const other of ["v1", "v2", "v3", "vpl"]) {
      await p.click('[data-vol="' + other + '"]');
      await p.waitForTimeout(400);
      const names = await p.evaluate(() =>
        [...document.querySelectorAll("#volBody tr")].map((r) => r.children[1].innerText).join(" | "));
      chk("and is not in the table of " + other, !/LASIL DIAS/i.test(names));
    }
    await p.click('[data-vol="vel"]');
    await p.waitForTimeout(400);

    // The information button is the bar's, as on every main competition, and
    // it opens a rules page in the same format rather than a sheet.
    const bar = await p.evaluate(() => {
      const i = document.querySelector("#barInfo");
      return { shown: i && getComputedStyle(i).display !== "none", topic: i && i.getAttribute("data-rules"),
               inPage: !!document.querySelector("#volWhat") };
    });
    chk("the bar carries the information button", bar.shown && bar.topic === "voluntary" && !bar.inPage,
        JSON.stringify(bar));
    await p.click("#barInfo");
    await p.waitForTimeout(600);
    const rules = await p.evaluate(() => {
      const v = document.querySelector("section.view.active");
      return {
        hash: location.hash, view: v && v.dataset.view,
        title: (v.querySelector(".section-title h2") || {}).textContent,
        chip: (v.querySelector(".section-title .chip") || {}).textContent,
        lede: !!v.querySelector(".rulelede"),
        blocks: v.querySelectorAll(".rulelist, .chain, .rulechain").length,
        leagueCards: [...v.querySelectorAll(".card .hd h3")].map((h) => h.textContent),
        prizeRows: v.querySelectorAll(".prizetable tr").length,
        everywhere: /Applies to every competition/.test(v.innerText)
      };
    });
    chk("it opens the rules page", rules.hash === "#rules/voluntary" && rules.view === "rules", rules.hash);
    chk("in the same format as the other competitions",
        rules.title === "Game On Voluntary" && rules.chip === "Rules" && rules.lede && rules.everywhere,
        JSON.stringify({ t: rules.title, chip: rules.chip, lede: rules.lede, ev: rules.everywhere }));
    chk("with a prize card for each of the five leagues",
        ["League 1", "League 2", "League 3", "Premier League", "Elite PL"]
          .every((n) => rules.leagueCards.indexOf(n) !== -1),
        JSON.stringify(rules.leagueCards));
    chk("listing every place that wins", rules.prizeRows === 4 + 4 + 2 + 8 + 8, String(rules.prizeRows));
    await p.click("#barBack");
    await p.waitForTimeout(500);
    chk("and back returns to the voluntary page",
        (await p.evaluate(() => location.hash)) === "#vol",
        await p.evaluate(() => location.hash));

    // A manager in a voluntary league sees it on his profile, in the XP table,
    // beside the classic league and the rest.
    await p.click('[data-vol="vel"]');
    await p.waitForTimeout(400);
    const who = await p.evaluate(() => {
      const r = document.querySelector("#volBody tr[data-entry]");
      return { id: r.dataset.entry, name: r.children[1].innerText.split("\n")[1] };
    });
    await p.goto("http://127.0.0.1:8631/#profile/" + who.id, { waitUntil: "networkidle" });
    await p.waitForTimeout(900);
    const prof = await p.evaluate(() => {
      const rows = [...document.querySelectorAll(".prizetbl tr")].map((tr) => ({
        comp: (tr.querySelector(".pcomp b") || {}).textContent,
        where: (tr.querySelector(".pcomp .mgr") || {}).textContent,
        pos: (tr.querySelector(".ppos") || {}).textContent,
        prize: (tr.querySelector(".prize") || {}).textContent || ""
      }));
      return { rows: rows, onTrack: (document.querySelectorAll(".pcards .pc .pcv")[1] || {}).textContent };
    });
    const vrows = prof.rows.filter((r) => r.comp === "Voluntary");
    chk("the profile lists the voluntary league in the XP table",
        vrows.some((r) => r.where === "Elite PL"), JSON.stringify(prof.rows.map((r) => r.comp + "/" + r.where)));
    chk("with a position and, for the leader, the XP",
        vrows.every((r) => /^#\d+$/.test(r.pos)) && vrows.some((r) => /\d/.test(r.prize)),
        JSON.stringify(vrows));
    chk("and that XP counts towards what he is on track for",
        parseInt(String(prof.onTrack).replace(/[^0-9]/g, ""), 10) >= 43000, String(prof.onTrack));
    await p.goto("http://127.0.0.1:8631/#vol", { waitUntil: "networkidle" });
    await p.waitForTimeout(800);

    // the drawer: a fourth section, and every subtitle on one line
    await p.click("#barMenu");
    await p.waitForTimeout(600);
    const menu = await p.evaluate(() => {
      const out = { titles: [], wrapped: [], wrappedNew: [] };
      document.querySelectorAll(".menulist *").forEach((el) => {
        if (el.children.length) return;
        const t = el.textContent.trim();
        const cs = getComputedStyle(el);
        const lines = Math.round(el.getBoundingClientRect().height / parseFloat(cs.lineHeight || 16));
        if (/^(Premier League|Game On tournament|Game On Voluntary|Player stats)$/.test(t)) out.titles.push(t);
        if (/Prices|side leagues|Live scores|Classic, MoM/.test(t) && lines > 1) out.wrapped.push(t);
        if (/Prices, ownership|side leagues/.test(t) && lines > 1) out.wrappedNew.push(t);
      });
      return out;
    });
    chk("the drawer offers Game On Voluntary",
        menu.titles.indexOf("Game On Voluntary") !== -1, JSON.stringify(menu.titles));
    chk("Player stats and the new section fit one line at any width",
        menu.wrappedNew.length === 0, JSON.stringify(menu.wrappedNew));
    if (w >= 390) {
      chk("and at 390 every section subtitle fits one line",
          menu.wrapped.length === 0, JSON.stringify(menu.wrapped));
    } else if (menu.wrapped.length) {
      console.log("   note   at 320 these older subtitles still wrap: " +
        JSON.stringify(menu.wrapped));
    }

    const page = await p.evaluate(() =>
      (document.querySelector("section.view.active") || {}).innerText || "");
    chk("the page says nothing about entry fees, pots or paying",
        !/\b(entry|pot|paid|pays|fee)\b/i.test(page),
        (page.match(/\b(entry|pot|paid|pays|fee)\b/i) || [""])[0]);
    chk("the prize column is XP, as everywhere else",
        /\bXP\b/.test(await p.evaluate(() =>
          [...document.querySelectorAll(".voltbl thead th")].map((t) => t.textContent).join(" "))));

    chk("no script errors", errs.length === 0, errs.slice(0, 3).join(" || "));
    await ctx.close();
  }
  await b.close(); srv.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})();
