const GOENV = require("./lib/env.js");
/* The season in one card at the top of a profile. Every figure on it is
   recomputed here from the dataset and must match; ranks are never written
   with an "="; the leader reads "Leading"; on your own page the rivals block
   follows the card, and only when rivals are pinned; and with no history the
   card still stands on the figures it has. */
const { chromium, devices } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP, PORT = 8800;
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".webp":"image/webp", ".png":"image/png" };
const srv = http.createServer((q, r) => { let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  fs.readFile(path.join(APP, u), (e, b) => { if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { "content-type": T[path.extname(u)] || "text/plain", "cache-control": "no-store" }); r.end(b); }); });
let fails = 0;
const chk = (ok, m, x) => { console.log((ok ? "  ok   " : "  FAIL ") + m + (x ? "  " + x : "")); if (!ok) fails++; };
const num = (n) => Number(n).toLocaleString("en-US");
const ord = (n) => { const s = ["th","st","nd","rd"], v = n % 100; return n + (s[(v-20)%10] || s[v] || s[0]); };

// what the card shows, read back as text
const read = (p) => p.evaluate(() => {
  const c = document.querySelector('[data-view="profile"] .snap'); if (!c) return null;
  const t = (s, root) => { const e = (root || c).querySelector(s); return e ? e.textContent.replace(/\s+/g, " ").trim() : null; };
  const tiles = {}; c.querySelectorAll(".snapgrid .pc").forEach((pc) => { tiles[t(".pcl", pc)] = { v: t(".pcv", pc), s: t(".pcs", pc) }; });
  // the two rank lines: Overall first, then GO
  const pills = [...c.querySelectorAll(".snapranks .snaprank")].map((x) => ({ text: x.textContent.replace(/\s+/g, " ").trim(),
    k: x.querySelector(".k").textContent, n: x.querySelector(".n").textContent,
    up: !!x.querySelector(".move.up"), down: !!x.querySelector(".move.down") }));
  const view = document.querySelector('[data-view="profile"]');
  return { total: t(".snapstat:nth-child(1) .v"), gw: t(".snapstat:nth-child(2) .v"), gwl: t(".snapstat:nth-child(2) .l"),
    pills, tiles, // the sticky section strip is the view's first node by design; the card comes right after it
    first: (() => { const kids = [...view.children].filter((e) => !e.classList.contains("pchipsbar")); return !!kids[0] && kids[0].classList.contains("snap"); })(),
    order: [...view.children].filter((e) => !e.classList.contains("pchipsbar")).map((e) => e.className.split(" ")[0] + (e.id ? "#" + e.id : "")).slice(0, 4) };
});
// the same figures, from the data
const expect = (p, id) => p.evaluate((id) => {
  const ds = window.GO_STORE.dataset(), C = window.GO_COMPUTE;
  const rows = C.classic(ds), me = rows.find((r) => +r.id === +id), i = rows.indexOf(me);
  const H = ds.history[id] || {}; const gws = Object.keys(H).map(Number).sort((a, b) => a - b);
  const sum = (k) => gws.reduce((s, g) => s + (H[g][k] || 0), 0);
  const cnt = rows.filter((r) => typeof r.eventTotal === "number");
  const avg = Math.round(cnt.reduce((s, r) => s + r.eventTotal, 0) / cnt.length);
  let above = null; for (let k = i - 1; k >= 0; k--) if (rows[k].total > me.total) { above = rows[k]; break; }
  let below = null; for (let k = i + 1; k < rows.length; k++) if (rows[k].total < me.total) { below = rows[k]; break; }
  // the gameweek figure is net of hits everywhere: FPL's event_total less the week's cost
  const net = (g) => C.gwScore(ds, id, g);
  const best = gws.reduce((b, g) => net(g) > net(b) ? g : b, gws[0]);
  const last = H[gws[gws.length - 1]], prev = H[gws[gws.length - 2]];
  const chips = C.managerChips(ds, id).filter((c) => c.used);
  const evGw = C.currentGw(ds), row = H[evGw];
  return { total: me.total, ev: me.eventTotal, gw: evGw, avg, rank: me.computedRank, tied: me.tiedWith > 1, move: me.move,
    // the roster's gameweek figure is the net score, and the hit really came off it
    evNet: !row || C.liveGwId(ds) === evGw ? true : me.eventTotal === net(evGw) && me.eventTotal === row.p - (row.h || 0),
    hit: row ? row.h || 0 : 0,
    overall: last.r, omove: prev ? prev.r - last.r : 0, hits: sum("h"), tr: sum("tr"), bench: sum("b"), best: { gw: best, p: net(best) },
    leading: !above, lead: !above && below ? me.total - below.total : null, behind: rows[0].total - me.total,
    above: above ? { rank: above.computedRank, gap: above.total - me.total } : null,
    plays: chips.reduce((s, c) => s + c.gws.length, 0), names: chips.map((c) => c.label).join(", "), v: last.v, bk: last.bk };
}, id);

(async () => {
  await new Promise((r) => srv.listen(PORT, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  const ctx = await b.newContext({ ...devices["iPhone 12"], serviceWorkers: "block" });
  const p = await ctx.newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto("http://localhost:" + PORT + "/index.html#classic", { waitUntil: "domcontentloaded" });
  await p.waitForFunction(() => document.querySelector("section.view.active table.t tbody tr"), null, { timeout: 15000 });
  const ids = await p.evaluate(() => { const ds = window.GO_STORE.dataset(), C = window.GO_COMPUTE, r = C.classic(ds), g = C.currentGw(ds);
    const hit = r.find((x) => { const h = (ds.history[x.id] || {})[g]; return h && h.h > 0; });
    return { leader: r[0].id, mid: r[Math.floor(r.length / 2)].id, tied: (r.find((x) => x.tiedWith > 1) || {}).id, last: r[r.length - 1].id, hit: hit ? hit.id : null }; });

  const open = async (id) => { await p.evaluate((x) => { location.hash = "#profile/" + x; }, id); await p.waitForTimeout(700); return [await read(p), await expect(p, id)]; };

  for (const who of ["mid", "last", "leader", "hit"]) {
    if (!ids[who]) { console.log("  (nobody took a hit this gameweek, the net check runs on the others)"); continue; }
    const [got, exp] = await open(ids[who]);
    console.log("-- " + who + " " + ids[who]);
    chk(got && got.first, who + ": the card is the first thing on the page", got && JSON.stringify(got.order));
    chk(got.total === num(exp.total), who + ": total points", got.total + " vs " + exp.total);
    chk(got.gw === num(exp.ev) && got.gwl === "GW" + exp.gw + " · avg " + num(exp.avg), who + ": this gameweek and the league average", got.gw + " " + got.gwl);
    chk(exp.evNet, who + ": the gameweek figure is net of hits (" + exp.hit + " off)", got.gw);
    chk(got.pills.length === 2 && got.pills[0].k === "Overall" && got.pills[1].k === "GO", who + ": Overall first, then GO", JSON.stringify(got.pills.map((x) => x.k)));
    chk(got.pills[1].n === ord(exp.rank) && got.pills[1].text.indexOf("=") < 0, who + ": GO rank in words, never with an =", got.pills[1].text);
    chk(got.pills[1].up === exp.move > 0 && got.pills[1].down === exp.move < 0, who + ": GO movement direction", JSON.stringify(got.pills[1]) + " move " + exp.move);
    chk(got.pills[0].n === num(exp.overall) && got.pills[0].up === exp.omove > 0 && got.pills[0].down === exp.omove < 0 &&
        (exp.omove ? got.pills[0].text.indexOf(num(Math.abs(exp.omove))) > 0 : true),
        who + ": overall rank and its movement", got.pills[0].text + " vs " + exp.overall + " / " + exp.omove);
    chk(got.tiles["Hits"].v === (exp.hits ? "−" + num(exp.hits) : "0") && got.tiles["Hits"].s === (exp.tr === 1 ? "1 transfer" : num(exp.tr) + " transfers"),
        who + ": hits and transfers to date", JSON.stringify(got.tiles["Hits"]) + " vs " + exp.hits + "/" + exp.tr);
    chk(got.tiles["On the bench"].v === num(exp.bench), who + ": bench points to date", got.tiles["On the bench"].v + " vs " + exp.bench);
    chk(got.tiles["Best week"].v === num(exp.best.p) && got.tiles["Best week"].s === "GW" + exp.best.gw, who + ": best week", JSON.stringify(got.tiles["Best week"]));
    const top = got.tiles["Off the top"];
    if (exp.leading) chk(top.v === "Leading" && (exp.tied ? top.s === "shared 1st" : top.s === "by " + num(exp.lead)), who + ": the leader leads", JSON.stringify(top));
    else chk(top.v === num(exp.behind) && (exp.tied ? top.s === "shared " + ord(exp.rank) : (exp.above.rank > 1 ? top.s === num(exp.above.gap) + " off " + ord(exp.above.rank) : top.s === ord(exp.rank) + " place")),
             who + ": off the top, and the place above", JSON.stringify(top) + " vs " + JSON.stringify(exp.above));
    chk(got.tiles["Chips"].v === (exp.plays ? num(exp.plays) + " played" : "None yet") && got.tiles["Chips"].s === (exp.plays ? exp.names : "all in hand"), who + ": chips", JSON.stringify(got.tiles["Chips"]));
    chk(got.tiles["Squad"].v === "£" + (exp.v / 10).toFixed(1) + "m" && got.tiles["Squad"].s === "£" + (exp.bk / 10).toFixed(1) + "m in the bank", who + ": squad value and bank", JSON.stringify(got.tiles["Squad"]));
  }
  if (ids.tied) {
    const [got, exp] = await open(ids.tied);
    chk(got.pills[1].text.indexOf("=") < 0 && /shared/.test(got.tiles["Off the top"].s), "a shared place says so in words, without an =", got.pills[1].text + " / " + got.tiles["Off the top"].s);
  } else console.log("  (no tie in the table today, shared-place wording not exercised)");

  // your own page: the card, then rivals when pinned, then the rest
  await p.evaluate((id) => { localStorage.setItem("go12.me", JSON.stringify(id)); localStorage.removeItem("go12.rivals"); }, ids.mid);
  await p.reload({ waitUntil: "domcontentloaded" }); await p.waitForTimeout(1200);
  await p.evaluate((x) => { location.hash = "#profile/" + x; }, ids.mid); await p.waitForTimeout(700);
  let own = await read(p);
  chk(own.first && own.order.indexOf("section#ps-rivals") < 0, "own page, no rivals pinned: card first, no rivals block", JSON.stringify(own.order));
  await p.evaluate((id) => { localStorage.setItem("go12.rivals", JSON.stringify([id])); }, ids.leader);
  await p.evaluate(() => { location.hash = "#classic"; }); await p.waitForTimeout(300);
  await p.evaluate((x) => { location.hash = "#profile/" + x; }, ids.mid); await p.waitForTimeout(700);
  own = await read(p);
  chk(own.first && own.order[1] === "section-title#ps-rivals", "own page, a rival pinned: card first, rivals second", JSON.stringify(own.order));

  // no history at all: the card keeps the figures it has and drops the rest
  await p.evaluate(() => { window.GO_STORE.dataset().history = {}; location.hash = "#classic"; }); await p.waitForTimeout(300);
  await p.evaluate((x) => { location.hash = "#profile/" + x; }, ids.mid); await p.waitForTimeout(700);
  const bare = await read(p);
  chk(bare && bare.first && bare.total && bare.pills.length === 1 && !bare.tiles["Hits"] && !!bare.tiles["Off the top"] && !!bare.tiles["Chips"],
      "without history: points, league position and the table-derived tiles only", bare && JSON.stringify(Object.keys(bare.tiles)) + " pills " + bare.pills.length);
  chk(errs.length === 0, "no JS errors", errs.slice(0, 2).join(" | "));
  await b.close(); srv.close();
  console.log(fails ? "\nFAILS: " + fails : "\nthe snapshot adds up");
  process.exit(fails ? 1 : 0);
})();
