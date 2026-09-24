/* Every page tells the same story. A figure that appears in more than one
 * place (a manager's total, rank, gameweek points, bench points, hits, a
 * player's points) is computed once and read everywhere, so no two pages can
 * show different numbers for the same thing. Checked on the real data and on
 * simulated moments across the season: before the bonus is in, at full time,
 * with provisional bonus, settled, a double and a blank gameweek, the end.
 * Compute only: no browser. The squad value has its own suite, worth. */
const fs = require("fs"), vm = require("vm"), path = require("path");
const GOENV = require("./lib/env.js");
const sim = require("./season/sim.js");
const ROOT = GOENV.APP;
let fails = 0, checks = 0;
// one line per kind of disagreement, with how often it happened
const seen = {};
const chk = (ok, m, x) => { checks++; if (ok) return; fails++;
  const k = m.replace(/^.*?: /, "");
  if (!seen[k]) { seen[k] = 0; console.log("  FAIL " + m + (x !== undefined ? "  " + String(x).slice(0, 200) : "")); }
  seen[k]++; };

function computeFor(ds, now) {
  const sb = { window: {}, console, Date, Math, JSON, Object, Array, String, Number, isNaN, parseInt, parseFloat, RegExp, Error, TypeError };
  if (now) {
    const Real = Date;
    function D() { if (!(this instanceof D)) return Real(); if (!arguments.length) return new Real(now);
      return new (Function.prototype.bind.apply(Real, [null].concat([].slice.call(arguments))))(); }
    D.prototype = Real.prototype; D.now = () => now; D.parse = Real.parse; D.UTC = Real.UTC; sb.Date = D;
  }
  sb.window.window = sb.window; vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "config.js"), "utf8"), sb);
  const cfg = sb.window.GO_DEFAULT_CONFIG;
  sb.window.GO_STORE = { config: () => cfg, overrides: () => ({}), dataset: () => ds };
  vm.runInContext(fs.readFileSync(path.join(ROOT, "compute.js"), "utf8"), sb);
  return sb.window.GO_COMPUTE;
}

function audit(L, ds, now) {
  const C = computeFor(ds, now);
  const cl = C.classic(ds), row = {};
  cl.forEach((r) => { row[r.id] = r; });
  const cur = C.currentGw(ds), live = C.liveGwId(ds);
  const gws = [...new Set([...C.finishedGws(ds), cur, live].filter(Boolean))].filter((g) => (ds.picks || {})[g]);
  const ids = ds.managers.map((m) => m.id);
  const probe = ids.filter((_, i) => i % 3 === 0);
  const H = {}; gws.forEach((g) => { H[g] = C.highlights(ds, g); });
  const pp = (g, el) => C.playerPts(ds, g, el);

  probe.forEach((id, i) => {
    const s = C.snapshot(ds, id), r = row[id];
    const cp = C.compare(ds, id, ids[(i * 7 + 1) % ids.length] === id ? ids[0] : ids[(i * 7 + 1) % ids.length], cur);
    const a = cp && cp.a;
    if (!s || !r) return;
    chk(s.total === r.total, L + " " + id + ": the profile's total is the table's", s.total + " vs " + r.total);
    chk(s.rank === r.computedRank, L + " " + id + ": the profile's rank is the table's", s.rank + " vs " + r.computedRank);
    if (a) {
      chk(a.total === r.total, L + " " + id + ": the compare page's total is the table's", a.total + " vs " + r.total);
      chk(a.rank === r.computedRank, L + " " + id + ": the compare page's rank is the table's");
      chk(a.gwPts === C.gwScore(ds, id, cur), L + " " + id + ": the compare page's gameweek points are the score");
      chk(a.gwBench === ((ds.history[id] || {})[cur] ? C.gwBench(ds, id, cur) : 0), L + " " + id + ": the compare page's gameweek bench is the bench", a.gwBench + " vs " + C.gwBench(ds, id, cur));
    }
    if (cur) chk(s.gwPoints === C.gwScore(ds, id, cur), L + " " + id + ": the profile's gameweek points are the score", s.gwPoints + " vs " + C.gwScore(ds, id, cur));
    const hs = Object.keys(ds.history[id] || {}).map(Number).filter((g) => typeof ds.history[id][g].p === "number");
    const bench = hs.reduce((t, g) => t + C.gwBench(ds, id, g), 0);
    chk(s.bench === bench, L + " " + id + ": the profile's season bench counts every week as the tables do", s.bench + " vs " + bench);
    if (a) {
      const played = [...new Set([...C.finishedGws(ds), cur])].filter((g) => (ds.history[id] || {})[g]);
      const cb = played.reduce((t, g) => t + C.gwBench(ds, id, g), 0);
      chk(a.bench === cb, L + " " + id + ": the compare page's season bench is the same weeks' bench", a.bench + " vs " + cb);
    }
    gws.forEach((g) => {
      const p = C.managerPitch(ds, id, g), sc = C.gwScore(ds, id, g), hr = (ds.history[id] || {})[g];
      if (!p || !hr) return;
      chk(p.net === sc, L + " GW" + g + " " + id + ": the pitch's points are the score", p.net + " vs " + sc);
      chk(p.hits === (hr.h || 0), L + " GW" + g + " " + id + ": the pitch's hits are FPL's");
      const cards = [];
      p.lines.forEach((l) => l.players.forEach((x) => cards.push(x)));
      p.bench.forEach((x) => cards.push(x));
      cards.forEach((x) => {
        const v = pp(g, x.el);
        chk(v === null ? !x.base : x.base === v, L + " GW" + g + " " + id + ": a card's points are the player's points", x.name + " " + x.base + " vs " + v);
      });
      if (p.chip !== "bboost") {
        const pb = p.bench.reduce((t, x) => t + (x.pts || 0), 0);
        chk(pb === C.gwBench(ds, id, g), L + " GW" + g + " " + id + ": the pitch's bench adds up to the bench points", pb + " vs " + C.gwBench(ds, id, g));
      }
    });
  });

  gws.forEach((g) => {
    const h = H[g]; if (!h) return;
    const gs = h.gwStats;
    if (gs) {
      if (gs.top) chk(gs.top.p === C.gwScore(ds, gs.top.id, g), L + " GW" + g + ": the stats page's top score is his score");
      if (gs.low) chk(gs.low.p === C.gwScore(ds, gs.low.id, g), L + " GW" + g + ": the stats page's low score is his score");
      if (gs.mostBench) chk(gs.mostBench.bench === C.gwBench(ds, gs.mostBench.id, g), L + " GW" + g + ": the stats page's bench is the bench", gs.mostBench.bench + " vs " + C.gwBench(ds, gs.mostBench.id, g));
    }
    const sq = h.squads;
    if (sq) {
      const pl = [].concat(sq.topScorers || [], sq.differentials || [], sq.bestValue || [], sq.mostOwned || []);
      if (sq.teamOfWeek) sq.teamOfWeek.lines.forEach((l) => l.players.forEach((x) => pl.push(x)));
      if (sq.templateXi) sq.templateXi.forEach((l) => (l.players || []).forEach((x) => pl.push(x)));
      if (sq.bestCaptain) pl.push(sq.bestCaptain);
      if (sq.worstCaptain) pl.push(sq.worstCaptain);
      pl.forEach((x) => {
        const el = x.el != null ? x.el : x.id;
        if (el == null || x.pts == null) return;
        chk(x.pts === (pp(g, el) || 0), L + " GW" + g + ": the stats page's " + x.name + " scores what the pitch says", x.pts + " vs " + pp(g, el));
      });
    }
  });

  // a player's own page and the players tab, against the same rule
  const els = Object.keys(ds.elements || {}).filter((_, i) => i % 9 === 0);
  const ps = C.playerStats(ds), byEl = {};
  ((ps && ps.rows) || []).forEach((r) => { byEl[r.id] = r; });
  const lpg = Object.keys(ds.livePoints || {}).map(Number).filter((g) => g > 0);
  els.forEach((el) => {
    const ph = C.playerHistory(ds, +el);
    const tot = lpg.reduce((t, g) => { const v = pp(g, +el); return t + (typeof v === "number" ? v : 0); }, 0);
    if (ph && ph.rows) ph.rows.forEach((r) => {
      if (r.pts == null) return;
      chk(r.pts === pp(r.gw, +el), L + " " + el + " GW" + r.gw + ": the player page's week is the player's points", r.pts + " vs " + pp(r.gw, +el));
    });
    if (ph && ph.total != null) chk(ph.total === tot, L + " " + el + ": the player page's season is the sum of his weeks", ph.total + " vs " + tot);
    const pf = C.playerProfile(ds, +el);
    if (pf && pf.points != null) chk(pf.points === tot, L + " " + el + ": the player page's header is the sum of his weeks", pf.points + " vs " + tot);
    const r = byEl[+el];
    if (r) chk(r.pts === tot, L + " " + el + ": the players tab's season is the sum of his weeks", r.pts + " vs " + tot);
  });
}

const real = JSON.parse(fs.readFileSync(path.join(ROOT, "data.json"), "utf8")).dataset;
audit("real", real);
console.log("  ok   real data" + (fails ? " (with failures above)" : ""));
const S = sim.season(sim.loadBase());
for (const [gw, phase] of [[6, "live"], [6, "ft"], [6, "bonus"], [6, "final"], [13, "live"], [24, "live"], [24, "bonus"], [29, "live"], [38, "live"], [38, "bonus"], [38, "final"]]) {
  const before = fails;
  const st = sim.stateAt(S, gw, phase);
  audit("sim GW" + gw + " " + phase, st.dataset, st.now);
  console.log((fails === before ? "  ok   " : "  --   ") + "sim GW" + gw + " " + phase);
}
Object.keys(seen).forEach((k) => console.log("  " + String(seen[k]).padStart(6) + " x " + k));
console.log("\n" + checks + " checks, " + fails + " failed");
console.log(fails ? "FAILS: " + fails : "every page tells the same story");
process.exit(fails ? 1 : 0);
