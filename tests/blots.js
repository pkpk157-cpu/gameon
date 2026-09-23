const GOENV = require("./lib/env.js");
/* Negative badges. Each blot is the mirror of a badge, read from the same
 * finished gameweeks, and each is recomputed here from the raw data so a
 * threshold drifting in compute.js would be caught. Then the profile: a blot
 * draws as a badge in the bad colour, after the honours and the form, and
 * the compare table names it. */
const fs = require("fs"), http = require("http"), path = require("path");
const { chromium, devices } = require("playwright-core");
const APP = GOENV.APP, PORT = 8814;
global.window = global; global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
require(path.join(APP, "config.js"));
const ds = JSON.parse(fs.readFileSync(path.join(APP, "data.json"), "utf8")).dataset;
window.GO_STORE = { config: () => window.GO_DEFAULT_CONFIG, overrides: () => ({}), dataset: () => ds };
require(path.join(APP, "compute.js"));
const C = window.GO_COMPUTE;
let fails = 0;
const chk = (ok, m, x) => { console.log((ok ? "  ok   " : "  FAIL ") + m + (x ? "  " + x : "")); if (!ok) fails++; };

const played = C.finishedGws(ds), cr = C.classicRankByGw(ds);
const all = ds.managers.map((m) => ({ id: +m.id, name: m.entryName, B: C.badges(ds, m.id) }));
const has = (m, k) => m.B.find((b) => b.k === k);
const count = (k) => all.reduce((s, m) => s + (has(m, k) ? has(m, k).count : 0), 0);

// ---- each settled blot, recomputed ----
// net of hits, like every score in the app
const worst = {}; played.forEach((g) => { let w = null; ds.managers.forEach((m) => { const p = C.gwScore(ds, m.id, g); if (p !== null && (w === null || p < w)) w = p; }); worst[g] = w; });
let spoons = 0, blanks = 0, falls = 0, wasted = 0, reckless = 0;
all.forEach((m) => {
  const h = ds.history[m.id] || {};
  played.forEach((g, i) => {
    const r = h[g], p = C.gwScore(ds, m.id, g); if (!r || p === null) return;
    if (p === worst[g]) spoons++;
    if (p < 35) blanks++;
    if (i > 0) { const at = cr[g] && cr[g].rank[m.id], before = cr[played[i - 1]] && cr[played[i - 1]].rank[m.id]; if (at && before && at - before >= 75) falls++; }
    const chip = ((ds.chips || {})[m.id] || []).find((c) => c.gw === g); const isBb = chip ? chip.n === "bboost" : ((ds.picks[g] || {})[m.id] || {}).c === "bboost";
    if (!isBb && (r.b || 0) >= 20) wasted++;
    if ((r.h || 0) >= 8) reckless++;
  });
});
chk(count("spoon") === spoons, "Wooden spoon: the league's lowest score of each gameweek", count("spoon") + " vs " + spoons);
chk(count("blank") === blanks, "Blank: under 35 in a gameweek", count("blank") + " vs " + blanks);
chk(count("freefall") === falls, "Freefall: down 75 places or more in one gameweek", count("freefall") + " vs " + falls);
chk(count("benched") === wasted, "Bench blunder: 20 or more left on the bench, not on Bench Boost", count("benched") + " vs " + wasted);
chk(count("reckless") === reckless, "Reckless: 8 or more paid in hits in one gameweek", count("reckless") + " vs " + reckless);
chk(count("capflop") >= 0 && all.every((m) => !has(m, "capflop") || has(m, "capflop").gws.every((g) => played.indexOf(g) !== -1)), "Captain calamity is read from finished gameweeks only", count("capflop") + " awarded");
// the spoon and the top scorer never land on the same week for the same manager unless everyone tied
all.forEach((m) => { const t = has(m, "top"), s = has(m, "spoon"); if (t && s) t.gws.forEach((g) => { if (s.gws.indexOf(g) !== -1) chk(false, m.name + " is top scorer and wooden spoon in GW" + g); }); });

// ---- form blots ----
const table = C.classic(ds), n = table.length;
const bottom = table.filter((r) => r.computedRank > n - 10).map((r) => +r.id).sort();
const marked = all.filter((m) => has(m, "bottomten")).map((m) => m.id).sort();
chk(JSON.stringify(bottom) === JSON.stringify(marked), "Bottom ten is exactly the last ten of the Classic table", marked.length + " marked");
chk(all.every((m) => !(has(m, "bottomten") && (has(m, "topten") || has(m, "leader")))), "nobody is top ten and bottom ten at once");
let slides = 0; all.forEach((m) => { let s = 0; for (let i = played.length - 1; i >= 1; i--) { const a = cr[played[i]] && cr[played[i]].rank[m.id], b = cr[played[i - 1]] && cr[played[i - 1]].rank[m.id]; if (a && b && a > b) s++; else break; } if (s >= 3) slides++; });
chk(all.filter((m) => has(m, "slide")).length === slides, "Sliding: down the table three gameweeks running", slides + " managers");
chk(all.every((m) => !(has(m, "slide") && has(m, "climb"))), "nobody is climbing and sliding at once");
let idle = 0; all.forEach((m) => { let z = 0; for (let i = played.length - 1; i >= 0; i--) { const r = (ds.history[m.id] || {})[played[i]]; if (played[i] > 1 && r && typeof r.p === "number" && !(r.tr || 0)) z++; else break; } if (z >= 4) idle++; });
chk(all.filter((m) => has(m, "asleep")).length === idle, "Asleep: no transfer four gameweeks running, gameweek 1 never counted", idle + " managers");
console.log("  blots today: " + ["releg","spoon","blank","freefall","capflop","benched","reckless","bottomten","slide","asleep"].map((k) => k + "=" + all.filter((m) => has(m, k)).length).join(" "));

// ---- on the page ----
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".webp":"image/webp", ".png":"image/png" };
const srv = http.createServer((q, r) => { let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  fs.readFile(path.join(APP, u), (e, b) => { if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { "content-type": T[path.extname(u)] || "text/plain", "cache-control": "no-store" }); r.end(b); }); });
(async () => {
  await new Promise((r) => srv.listen(PORT, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  const who = all.filter((m) => m.B.some((x) => x.blot)).sort((a, c) => c.B.length - a.B.length)[0];
  const other = all.find((m) => who && m.id !== who.id);
  const ctx = await b.newContext({ ...devices["iPhone 12"], serviceWorkers: "block" });
  // the compare button on a profile compares him with you, so be someone else
  if (other) await ctx.addInitScript((me) => { try { localStorage.setItem("go12.me", JSON.stringify(me)); } catch (e) {} }, other.id);
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  if (!who) { chk(true, "nobody has a blot yet, nothing to draw"); }
  else {
    await p.goto("http://localhost:" + PORT + "/index.html#profile/" + who.id, { waitUntil: "domcontentloaded" }); await p.waitForTimeout(1500);
    const got = await p.evaluate(() => [...document.querySelectorAll(".badges .badge")].map((e) => ({
      text: e.textContent.trim(), blot: e.classList.contains("blot"), form: e.classList.contains("form"),
      col: getComputedStyle(e.querySelector("svg")).color, why: e.getAttribute("data-why") })));
    const kinds = got.map((g) => g.blot ? (g.form ? 3 : 2) : (g.form ? 1 : 0));
    chk(got.length === who.B.length && got.filter((g) => g.blot).length === who.B.filter((x) => x.blot).length, who.name + ": every badge and blot is drawn", got.length + " chips");
    chk(kinds.every((k, i) => i === 0 || k >= kinds[i - 1]), "honours, form, then blots, in that order", kinds.join(""));
    const good = got.find((g) => !g.blot), bad = got.find((g) => g.blot);
    chk(!good || !bad || good.col !== bad.col, "a blot is not the honours' colour", (good && good.col) + " vs " + (bad && bad.col));
    const rgb = bad && bad.col.match(/\d+/g).map(Number);
    chk(!rgb || rgb[0] > rgb[1] && rgb[0] > rgb[2], "a blot's icon is red", bad && bad.col);
    chk(got.every((g) => g.why && !/NaN|undefined/.test(g.why)), "every chip explains itself");
    // the compare table names it too
    await p.click("#cmpMe"); await p.waitForTimeout(900);
    const row = await p.evaluate(() => { const tr = [...document.querySelectorAll("tr")].find((r) => /Badges/.test(r.textContent)); return tr ? tr.textContent : ""; });
    const label = who.B.find((x) => x.blot).label;
    chk(row.indexOf(label) !== -1, "the compare table names the blot", label);
  }
  chk(errs.length === 0, "no JS errors", errs.slice(0, 2).join(" | "));
  await b.close(); srv.close();
  console.log(fails ? "\nFAILS: " + fails : "\nthe blots add up");
  process.exit(fails ? 1 : 0);
})();
