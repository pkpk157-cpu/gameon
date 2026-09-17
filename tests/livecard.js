const GOENV = require("./lib/env.js");
/* While a player's match is in play his points bar lights up, the way the
   official app's does. The fixture stages every state a card can be in —
   in play, full time, bonus done, yet to kick off — in one gameweek. */
const { chromium } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP;
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".svg":"image/svg+xml" };

const raw = JSON.parse(fs.readFileSync(APP + "/data.json", "utf8"));
const ds = raw.dataset;
const gw = 3;
ds.bootstrap.events.forEach((e) => {
  if (e.id === gw) { e.is_current = true; e.finished = false; e.data_checked = false; }
  else if (e.id > gw) { e.is_current = false; e.is_next = e.id === gw + 1; }
  else { e.is_current = false; e.is_next = false; }
});
ds.pitchGw = gw;
Object.keys(ds.picks || {}).forEach((k) => { if (+k > gw) delete ds.picks[k]; });
const fx = ds.gwFixtures[gw];
const set = (h, a, started, finished, prov, mins) => {
  const f = fx.find((x) => x[0] === h && x[1] === a);
  f[2] = started; f[3] = finished; f[8] = prov; f[6] = mins;
};
set("NEW", "BOU", 1, 0, 0, 63);   // in play
set("IPS", "LIV", 1, 0, 1, 90);   // full time, bonus not yet folded in
set("BRE", "SUN", 1, 1, 1, 90);   // finished outright
set("ARS", "CHE", 0, 0, 0, 0);    // yet to kick off
const LIVE = ["NEW", "BOU"], OVER = ["IPS", "LIV", "BRE", "SUN"], SOON = ["ARS", "CHE"];
fs.writeFileSync("/tmp/livecard.json", JSON.stringify(raw));

// a manager whose fifteen span all three states
const club = (el) => (ds.elements[el] || [])[2];
const pk = ds.picks[gw];
const pid = Object.keys(pk).find((id) => {
  const cl = (pk[id].p || []).map((x) => club(x[0]));
  return cl.some((c) => LIVE.includes(c)) && cl.some((c) => OVER.includes(c)) && cl.some((c) => SOON.includes(c));
});
if (!pid) { console.log("no squad spans the three states"); process.exit(1); }
const squad = pk[pid].p.map((x) => ({ el: x[0], club: club(x[0]) }));
console.log("subject " + pid + ": " + squad.filter((s) => LIVE.includes(s.club)).length + " in play, " +
  squad.filter((s) => OVER.includes(s.club)).length + " done, " + squad.filter((s) => SOON.includes(s.club)).length + " to come");

const srv = http.createServer((q, r) => {
  let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  const f = u === "/data.json" ? "/tmp/livecard.json" : path.join(APP, u);
  fs.readFile(f, (e, b) => {
    if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { "content-type": T[path.extname(f)] || "text/plain", "cache-control": "no-store" }); r.end(b);
  });
});
let fails = 0;
const chk = (n, ok, d) => { if (!ok) { fails++; console.log("   FAIL " + n + (d ? " — " + d : "")); } else console.log("   ok   " + n); };

// relative luminance contrast, for the white ink on the lit bar
const lum = (rgb) => { const c = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const contrast = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };

(async () => {
  await new Promise((r) => srv.listen(9963, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  for (const scheme of ["light", "dark"]) {
    console.log("-- " + scheme);
    const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2,
      isMobile: true, hasTouch: true, serviceWorkers: "block", colorScheme: scheme });
    const p = await ctx.newPage();
    const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.goto("http://localhost:9963/index.html#profile/" + pid, { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(1600);
    const read = async () => p.evaluate(() => [...document.querySelectorAll("#pitchBox .pcard[data-el]")].map((c) => {
      const f = c.querySelector(".ppts"), cs = getComputedStyle(f);
      return { el: +c.dataset.el, text: f.textContent, live: f.classList.contains("live"), opp: f.classList.contains("opp"),
               alt: f.classList.contains("alt"), bench: !!c.closest(".pbench"), bgi: cs.backgroundImage, color: cs.color,
               title: f.getAttribute("title") || "" };
    }));
    let cards = await read();
    const byEl = Object.fromEntries(squad.map((s) => [s.el, s.club]));
    chk("all fifteen cards drawn", cards.length === 15, String(cards.length));
    const liveCards = cards.filter((c) => c.live), wantLive = cards.filter((c) => LIVE.includes(byEl[c.el]));
    chk("every in-play player is lit, and only those", liveCards.length === wantLive.length && liveCards.every((c) => LIVE.includes(byEl[c.el])),
        liveCards.map((c) => byEl[c.el]).join(",") + " vs " + wantLive.map((c) => byEl[c.el]).join(","));
    chk("lit cards still show points", liveCards.every((c) => /^-?\d+$/.test(c.text)), liveCards.map((c) => c.text).join(","));
    chk("lit bar is the gradient", liveCards.every((c) => /linear-gradient/.test(c.bgi)), liveCards[0] && liveCards[0].bgi);
    chk("lit bar says why", liveCards.every((c) => c.title === "In play"));
    chk("bench lights up too when its man is playing",
        !cards.some((c) => c.bench && LIVE.includes(byEl[c.el])) || cards.some((c) => c.bench && c.live));
    const overCards = cards.filter((c) => OVER.includes(byEl[c.el]));
    chk("full time and finished are plain points", overCards.every((c) => !c.live && !c.opp && /^-?\d+$/.test(c.text)),
        overCards.map((c) => byEl[c.el] + ":" + c.text + (c.live ? "!" : "")).join(","));
    const soonCards = cards.filter((c) => SOON.includes(byEl[c.el]));
    chk("yet to kick off still names the opponent", soonCards.every((c) => c.opp && !c.live && /\((H|A)\)/.test(c.text)),
        soonCards.map((c) => c.text).join(","));
    // the ink has to read on the bright bar: sample both ends of the gradient
    const ends = (liveCards[0] ? liveCards[0].bgi : "").match(/rgb\((\d+), (\d+), (\d+)\)/g) || [];
    const ink = (liveCards[0] ? liveCards[0].color : "").match(/\d+/g).slice(0, 3).map(Number);
    const ratios = ends.map((e) => contrast(ink, e.match(/\d+/g).map(Number)));
    chk("white ink clears 3:1 at both ends of the bar", ratios.length === 2 && ratios.every((r) => r >= 3), ratios.map((r) => r.toFixed(2)).join(" / "));

    // the value and ownership views do not light up — the bar there is a price
    for (const m of ["val", "eo"]) {
      await p.evaluate((k) => document.querySelector('#pitchBox [data-metric="' + k + '"], [data-view="profile"] [data-metric="' + k + '"]').click(), m);
      await p.waitForTimeout(400);
      cards = await read();
      chk(m + " view: nothing lit", cards.every((c) => !c.live && c.alt), cards.filter((c) => c.live).length + " lit");
    }
    await p.evaluate(() => document.querySelector('[data-view="profile"] [data-metric="pts"]').click());
    await p.waitForTimeout(400);
    if (scheme === "light") { await p.evaluate(() => document.querySelector("#pitchBox").scrollIntoView()); await p.waitForTimeout(300); await p.screenshot({ path: "livecard.png", fullPage: false }); }
    chk("no JS errors", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  await b.close(); srv.close();
  console.log(fails ? "FAILS: " + fails : "ALL OK");
  process.exit(fails ? 1 : 0);
})();
