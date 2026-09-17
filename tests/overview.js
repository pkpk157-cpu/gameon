const GOENV = require("./lib/env.js");
/* The Game rules page in the menu: does it give the whole picture, does the
   pot add up to what the tables actually pay, and does it lead into each
   competition's own rules? */
const { chromium } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path"), vm = require("vm");
const APP = GOENV.APP;
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".svg":"image/svg+xml" };
const srv = http.createServer((q, r) => {
  let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  fs.readFile(path.join(APP, u), (e, b) => {
    if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { "content-type": T[path.extname(u)] || "text/plain", "cache-control": "no-store" }); r.end(b);
  });
});
let fails = 0;
const chk = (n, ok, d) => { if (!ok) { fails++; console.log("   FAIL " + n + (d ? " — " + d : "")); } };

// what the prize tables actually pay, worked out here independently
const cx = { window: {}, console };
vm.createContext(cx);
vm.runInContext(fs.readFileSync(APP + "/config.js", "utf8"), cx);
const cfg = cx.window.GO_DEFAULT_CONFIG;
const sum = (o) => Object.values(o || {}).reduce((a, b) => a + (+b || 0), 0);
let classic = sum(cfg.classicPrizes.exact);
cfg.classicPrizes.ranges.forEach((r) => { classic += (r.to - r.from + 1) * r.amount; });
const monthly = cfg.months.reduce((t, m) => t + sum(m.prizes), 0);
const lms = sum(cfg.lms.prizes);
const perSeason = cfg.pyramid.divisions.reduce((t, d) => t + sum(d.prizes), 0);
const pyramid = perSeason * cfg.pyramid.seasons.length;
const hp = cfg.h2h.prizes;
const h2h = hp.ucl.winner + hp.ucl.runnerUp + hp.uel.winner + hp.uel.runnerUp;
const TOTAL = classic + monthly + lms + pyramid + h2h;
const inr = (n) => n.toLocaleString("en-US");
console.log("the prize tables pay: classic " + inr(classic) + ", monthly " + inr(monthly) +
  ", LMS " + inr(lms) + ", pyramid " + inr(pyramid) + ", UCL " + inr(h2h));
console.log("so the pot is " + inr(TOTAL) + "\n");

(async () => {
  await new Promise((r) => srv.listen(9971, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  for (const [theme, scheme] of [["light", "light"], ["dark", "dark"]]) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 820 }, deviceScaleFactor: 2,
      isMobile: true, hasTouch: true, colorScheme: scheme, serviceWorkers: "block" });
    const p = await ctx.newPage();
    const errs = [];
    p.on("pageerror", (e) => errs.push(e.message));
    p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|net::ERR_|ERR_TUNNEL/i.test(m.text())) errs.push(m.text()); });
    await p.goto("http://localhost:9971/index.html#rules", { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(1500);

    const r = await p.evaluate(() => {
      const v = document.querySelector(".view.active");
      const txt = v.innerText;
      return {
        heads: [...v.querySelectorAll(".section-title h2")].map((x) => x.textContent),
        stats: [...v.querySelectorAll(".stat")].map((x) =>
          x.querySelector(".l").textContent + " = " + x.querySelector(".k").textContent),
        potRows: [...v.querySelectorAll(".potrow")].map((x) =>
          x.querySelector(".pr-n").textContent + " " + x.querySelector(".pr-a").textContent),
        comps: [...v.querySelectorAll(".compcard")].map((x) => x.querySelector(".cc-n").textContent),
        shared: v.querySelectorAll(".rulelist li").length,
        verbatim: v.querySelectorAll("ol.verbatim li").length,
        tables: v.querySelectorAll("table").length,
        rot: (txt.match(/\b(undefined|NaN|\[object Object\])\b/g) || []).length,
        overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        text: txt
      };
    });

    console.log("=== " + theme + " ===");
    console.log("  sections : " + r.heads.join(" · "));
    console.log("  headline : " + r.stats.join("  |  "));
    console.log("  pot rows : " + r.potRows.join("  |  "));
    console.log("  cards    : " + r.comps.join(", "));
    console.log("  " + r.shared + " shared rules, " + r.verbatim + " verbatim rules, " + r.tables + " tables");

    chk(theme + ": the pot is stated", r.text.indexOf(TOTAL.toLocaleString("en-US")) !== -1,
        "looking for " + inr(TOTAL));
    chk(theme + ": every competition's pot is shown", r.potRows.length === 5, String(r.potRows.length));
    [["Classic League", classic], ["Manager of the Month", monthly], ["Last Manager", lms],
     ["The Pyramid Battle", pyramid], ["Game On UCL", h2h]].forEach(([name, amt]) => {
      const row = r.potRows.find((x) => x.indexOf(name) === 0);
      chk(theme + ": " + name + " shows " + inr(amt), !!row && row.indexOf(inr(amt)) !== -1, row);
    });
    // Five competitions, plus Game On Voluntary under its own heading. The
    // voluntary pots are deliberately kept out of the pot list above — they
    // are entered separately and are not part of the tournament's total — so
    // potRows stays at five while the cards are six.
    chk(theme + ": all five have a card, and voluntary has its own",
        r.comps.length === 6 && r.comps.filter((x) => /Voluntary/i.test(x)).length === 1,
        r.comps.join(", "));
    chk(theme + ": the shared rules are here", r.shared === 4, String(r.shared));
    chk(theme + ": the league's own wording is kept", r.verbatim === cfg.rules.length, String(r.verbatim));
    chk(theme + ": monthly and pyramid tables are here", r.tables >= 2, String(r.tables));
    chk(theme + ": nothing computed to undefined", r.rot === 0, String(r.rot));
    chk(theme + ": no sideways overflow", !r.overflow);

    // the two credits, kept apart
    const cr = await p.evaluate(() => [...document.querySelectorAll(".view.active .credit")]
      .map((x) => x.querySelector(".cr-l").textContent + ": " + x.querySelector(".cr-b").textContent));
    console.log("  credits  : " + cr.join("   |   "));
    chk(theme + ": the league and the app are credited separately", cr.length === 2, String(cr.length));
    chk(theme + ": the league is Lasil Dias\u2019", /Lasil Dias/.test(cr[0] || ""), cr[0]);
    // "paid" was the original wording, dropped when the money vocabulary was
    // removed. The league is still credited; it is just not called a paid one.
    chk(theme + ": it names the league system",
        /Fantasy Premier League league system/.test(cr[0] || ""), cr[0]);
    chk(theme + ": and does not call it paid", !/\bpaid\b/i.test(cr[0] || ""), cr[0]);
    chk(theme + ": the app is PK\u2019s", /PK/.test(cr[1] || ""), cr[1]);
    chk(theme + ": the app credit does not claim the league",
        !/Lasil/.test(cr[1] || ""), cr[1]);
    chk(theme + ": the FPL disclaimer is still there",
        /Not affiliated with, endorsed by/.test(r.text));

    // tapping a competition opens its own rules
    if (theme === "light") {
      for (const [i, expect] of [[0, "Classic League"], [2, "Last Manager Standing"]]) {
        await p.goto("http://localhost:9971/index.html#rules", { waitUntil: "domcontentloaded" });
        await p.waitForTimeout(1200);
        await p.evaluate((i) => document.querySelectorAll(".view.active .compcard")[i].click(), i);
        await p.waitForTimeout(900);
        const landed = await p.evaluate(() =>
          (document.querySelector(".view.active h2") || {}).textContent);
        console.log("  tapping card " + (i + 1) + " opens: " + landed);
        chk("a card opens its own rules", landed === expect, landed + " vs " + expect);
      }
      await p.goto("http://localhost:9971/index.html#rules", { waitUntil: "domcontentloaded" });
      await p.waitForTimeout(1200);
      await p.evaluate(() => document.querySelector(".view.active .potrow").click());
      await p.waitForTimeout(900);
      const viaPot = await p.evaluate(() => (document.querySelector(".view.active h2") || {}).textContent);
      console.log("  tapping a money row opens: " + viaPot);
      chk("a money row opens its rules too", viaPot === "Classic League", viaPot);
      await p.goto("http://localhost:9971/index.html#rules", { waitUntil: "domcontentloaded" });
      await p.waitForTimeout(1300);
      await p.screenshot({ path: "rules-overview.png" });
    }
    chk(theme + ": no errors", errs.length === 0, errs.slice(0, 2).join(" | "));
    await ctx.close();
  }
  await b.close(); srv.close();
  console.log("\n" + (fails ? fails + " FAILURES" : "the menu's rules page gives the whole picture and leads into each part"));
})();
