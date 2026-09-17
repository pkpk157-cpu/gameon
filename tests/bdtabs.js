const GOENV = require("./lib/env.js");
/* The breakdown opens on the gameweek you tapped and keeps the season behind
   it. Tapping a gameweek in that list must open it on the first tab, and the
   captain multiplier must not follow you there. */
const { chromium } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP;
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css",
            ".json":"application/json", ".svg":"image/svg+xml", ".webp":"image/webp" };
const srv = http.createServer((q, r) => {
  let u = decodeURIComponent(q.url.split("?")[0]); if (u === "/") u = "/index.html";
  fs.readFile(path.join(APP, u), (e, b) => { if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { "content-type": T[path.extname(u)] || "text/plain", "cache-control": "no-store" }); r.end(b); });
});
const ds = JSON.parse(fs.readFileSync(APP + "/data.json", "utf8")).dataset;
const gws = Object.keys(ds.livePoints).map(Number).sort((a, b) => a - b);
let fails = 0;
const chk = (n, ok, d) => { console.log((ok ? "   ok   " : "   FAIL ") + n + (ok || !d ? "" : " — " + d)); if (!ok) fails++; };

(async () => {
  await new Promise((r) => srv.listen(8623, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  for (const w of [320, 390]) {
    console.log("\n" + w + "px");
    const ctx = await b.newContext({ viewport: { width: w, height: 880 }, serviceWorkers: "block" });
    const p = await ctx.newPage();
    const errs = [];
    p.on("pageerror", (e) => errs.push("pageerror: " + e.message));
    p.on("console", (m) => { if (m.type() === "error" && !/ERR_TUNNEL|ERR_NAME/.test(m.text()) && !/\/photos\//.test((m.location() || {}).url || "")) errs.push(m.text()); });

    await p.goto("http://127.0.0.1:8623/#prices/stats", { waitUntil: "networkidle" });
    await p.waitForTimeout(1200);
    await p.click("table.psbtbl tbody tr[data-el]");
    await p.waitForTimeout(500);

    const open = await p.evaluate(() => ({
      shown: !!document.querySelector("#modalBack.show"),
      title: (document.querySelector("#modalTitle") || {}).textContent,
      tabs: [...document.querySelectorAll("[data-bdtab]")].map((b) => b.textContent),
      on: (document.querySelector("[data-bdtab].on") || {}).getAttribute("data-bdtab"),
      rows: document.querySelectorAll("#bdPanel .bdtbl tbody tr").length,
      face: !!document.querySelector(".bdwho .face")
    }));
    chk("it opens on the gameweek", open.shown && open.on === "gw", JSON.stringify(open));
    chk("two tabs, the first naming its gameweek",
        open.tabs.length === 2 && /^Gameweek \d+$/.test(open.tabs[0]) && open.tabs[1] === "Season",
        JSON.stringify(open.tabs));
    chk("the title no longer repeats the gameweek", !/GW\d/.test(open.title || ""), open.title);
    chk("the breakdown is there", open.rows > 0, String(open.rows));
    chk("and the man himself", open.face);

    // the three figures he carries today, on both tabs and never cut off
    const facts = await p.evaluate(() => [...document.querySelectorAll(".bdfact")].map((f) => {
      const k = f.querySelector(".k");
      return { label: k.textContent, value: f.querySelector(".v").textContent,
               sub: f.querySelector(".s").textContent,
               cut: k.scrollWidth > k.clientWidth + 1 };
    }));
    chk("price and both ownerships are there", facts.length === 3 &&
        facts[0].label === "Price" && facts[1].label === "FPL" && facts[2].label === "Game On",
        JSON.stringify(facts.map((f) => f.label)));
    chk("each carries a figure", facts.every((f) => /[0-9]/.test(f.value)),
        JSON.stringify(facts.map((f) => f.value)));
    chk("and each says what it is a figure of", facts.every((f) => f.sub.length > 4),
        JSON.stringify(facts.map((f) => f.sub)));
    chk("no label is cut off", facts.every((f) => !f.cut),
        JSON.stringify(facts.filter((f) => f.cut).map((f) => f.label)));

    await p.click('[data-bdtab="all"]');
    await p.waitForTimeout(350);
    const season = await p.evaluate(() => {
      const rows = [...document.querySelectorAll("#bdPanel .bdhist tbody tr[data-bdgw]")];
      return {
        gws: rows.map((r) => +r.dataset.bdgw),
        marked: rows.filter((r) => r.classList.contains("on")).length,
        total: (document.querySelector("#bdPanel .bdtotal td:last-child") || {}).textContent,
        over: document.querySelector("#modalBody").scrollWidth - document.querySelector("#modalBody").clientWidth
      };
    });
    // Game On ownership is the one figure here that really is per gameweek,
    // counted from each week's own squads, so it earns a column.
    const go = await p.evaluate(() => {
      const head = [...document.querySelectorAll("#bdPanel .bdhist thead th")].map((t) => t.textContent);
      const cells = [...document.querySelectorAll("#bdPanel .bdhist tbody tr[data-bdgw]")]
        .map((r) => r.children[2].textContent);
      return { head: head, cells: cells };
    });
    chk("Game On ownership is a column", go.head.indexOf("GO") === 2, JSON.stringify(go.head));
    chk("and it carries a figure for every gameweek",
        go.cells.length > 0 && go.cells.every((c) => /%$/.test(c) || /\u2013/.test(c)),
        JSON.stringify(go.cells));
    chk("the figures are not all the same, so it is really history",
        new Set(go.cells).size > 1 || go.cells.length === 1, JSON.stringify(go.cells));

    chk("nothing explains itself in small print under the table any more",
        !(await p.evaluate(() => !!document.querySelector("#bdPanel .bdnote"))));

    chk("every gameweek is listed, in order",
        JSON.stringify(season.gws) === JSON.stringify(gws), JSON.stringify(season.gws));
    chk("the one you came from is marked", season.marked === 1, String(season.marked));
    chk("it totals the season", /\d/.test(season.total || ""), season.total);
    chk("the sheet does not scroll sideways", season.over <= 1, String(season.over));

    // walking to another gameweek
    const target = gws[0];
    await p.click('tr[data-bdgw="' + target + '"]');
    await p.waitForTimeout(400);
    const walked = await p.evaluate(() => ({
      on: (document.querySelector("[data-bdtab].on") || {}).getAttribute("data-bdtab"),
      label: (document.querySelector('[data-bdtab="gw"]') || {}).textContent,
      body: (document.querySelector("#bdPanel") || {}).innerText
    }));
    chk("a gameweek in the list opens that gameweek",
        walked.on === "gw" && walked.label === "Gameweek " + target, JSON.stringify(walked.label));
    chk("no captain multiplier follows you there",
        !/Captain/.test(walked.body || ""), (walked.body || "").slice(0, 120).replace(/\n/g, " | "));

    // the information button, which now carries what that note used to say
    await p.click("#bdWhat");
    await p.waitForTimeout(400);
    const help = await p.evaluate(() => ({
      lit: document.querySelector("#bdWhat").classList.contains("on"),
      heads: [...document.querySelectorAll("#bdPanel .gwh4")].map((h) => h.textContent),
      terms: [...document.querySelectorAll("#bdPanel dt")].map((d) => d.textContent),
      text: document.querySelector("#bdPanel").innerText,
      stillOne: document.querySelectorAll("#modalBack.show").length
    }));
    chk("the button opens an explanation", help.heads.length === 2 && help.terms.length >= 7,
        JSON.stringify(help.heads) + " " + help.terms.length + " terms");
    chk("it does not open a second sheet over this one", help.stillOne === 1, String(help.stillOne));
    chk("the button shows it is on", help.lit);
    chk("it explains price and both ownerships",
        ["Price", "FPL", "Game On"].every((k) => help.terms.indexOf(k) !== -1),
        JSON.stringify(help.terms));
    chk("and every column of the season table",
        ["GO", "Opponent", "Min", "Pts"].every((k) => help.terms.indexOf(k) !== -1),
        JSON.stringify(help.terms));
    chk("including that Game On ownership is per gameweek",
        /that week/i.test(help.text), help.text.slice(0, 100));
    chk("the explanation does not scroll sideways",
        (await p.evaluate(() => { const e = document.querySelector("#modalBody"); return e.scrollWidth - e.clientWidth; })) <= 1);
    // and a tab brings you back
    await p.click('[data-bdtab="gw"]');
    await p.waitForTimeout(350);
    const back = await p.evaluate(() => ({
      lit: document.querySelector("#bdWhat").classList.contains("on"),
      rows: document.querySelectorAll("#bdPanel .bdtbl tbody tr").length
    }));
    chk("a tab brings you back to the breakdown", !back.lit && back.rows > 0, JSON.stringify(back));

    chk("no script errors", errs.length === 0, errs.slice(0, 3).join(" || "));
    await ctx.close();
  }
  await b.close(); srv.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})();
