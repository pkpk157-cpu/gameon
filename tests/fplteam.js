/* A team from FPL, opened from one of your leagues, is laid over the data by
 * C.fplOverlay so its figures come from the same functions as a Game On
 * manager's. Proved here by laying a Game On manager over the data as if he
 * were an outsider (his history, chips, past seasons and squads, under a new
 * id): every figure the FPL team page and Compare show for him must come out
 * exactly as it does for the real one, on the real data and at simulated
 * moments across the season, live weeks included. And nothing of Game On's
 * may move: the table, the managers, the league's averages, whichever order
 * the pages are opened in. Compute only: no browser. */
const fs = require("fs"), vm = require("vm"), path = require("path");
const GOENV = require("./lib/env.js");
const sim = require("./season/sim.js");
const ROOT = GOENV.APP;
let fails = 0, checks = 0;
const seen = {};
const chk = (ok, m, x) => { checks++; if (ok) return; fails++;
  const k = m.replace(/^.*?: /, "");
  if (!seen[k]) { seen[k] = 0; console.log("  FAIL " + m + (x !== undefined ? "  " + String(x).slice(0, 240) : "")); }
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
const J = (x) => JSON.stringify(x);
// what a card shows, without what only Game On's own records can give (the
// transfer log behind a turned card, the purchase prices behind "sells for")
function cards(p) {
  if (!p) return null;
  const one = (x) => [x.el, x.pts, x.base, x.prov, x.mult, x.cap, x.vice, x.benched, x.eo, x.price, x.star || false, x.live, x.waiting, x.opp, J(x.flag || null), J(x.move || null)];
  return J([p.lines.map((l) => [l.pos, l.players.map(one)]), p.bench.map(one)]);
}
const PIT = ["gw", "live", "provisional", "chip", "total", "hits", "net", "average", "avgEo", "topEo", "squadValue", "topPrice", "bank", "leagueAvgEo", "leagueAvgValue"];
const SIDE = ["gwPts", "gwHits", "gwBench", "total", "hits", "bench", "seasonCount", "career", "avgSeason"];

function outsider(ds, id, X) {
  const sq = {};
  Object.keys(ds.picks || {}).forEach((g) => { if (ds.picks[g] && ds.picks[g][id]) sq[g] = ds.picks[g][id]; });
  const m = ds.managers.find((x) => x.id === id);
  return { id: X, name: m.entryName, player: m.playerName, at: 1, hist: ds.history[id] || {},
    past: (ds.pastSeasons || {})[id] || [], chips: (ds.chips || {})[id] || [], squads: sq };
}

function audit(L, ds0, now) {
  // order one: the league's pages first, then the team
  const ds = JSON.parse(J(ds0)), C = computeFor(ds, now);
  const tableBefore = J(C.classic(ds).map((r) => [r.id, r.total, r.computedRank, r.eventTotal]));
  const mgrBefore = J(ds.managers);
  const cur = C.currentGw(ds), live = C.liveGwId(ds);
  const gws = [...new Set([...C.finishedGws(ds), cur, live].filter(Boolean))].filter((g) => (ds.picks || {})[g]);
  const ids = ds.managers.map((m) => m.id);
  const probe = ids.filter((_, i) => i % 21 === 0);
  const me = ids[ids.length >> 1];
  const row = {}; C.classic(ds).forEach((r) => { row[r.id] = r; });
  probe.forEach((id, i) => {
    if (id === me) return;
    const X = 900000000 + i;
    const ov = C.fplOverlay(ds, outsider(ds, id, X));
    chk(ov !== ds && C.isExt(ov, X), L + " " + id + ": the team is laid over a copy");
    // the FPL team page: its pitch at every week, its total and its rank
    gws.forEach((g) => {
      const a = C.managerPitch(ds, id, g), b = C.managerPitch(ov, X, g);
      if (!a || !b) { chk(!a && !b, L + " " + id + " GW" + g + ": a squad on both or on neither", !!a + " vs " + !!b); return; }
      PIT.forEach((k) => chk(J(a[k]) === J(b[k]), L + " " + id + " GW" + g + ": the pitch's " + k + " is the Game On profile's", J(a[k]) + " vs " + J(b[k])));
      chk(J(a.highest) === J(b.highest), L + " " + id + " GW" + g + ": the league's highest is unmoved");
      chk(cards(a) === cards(b), L + " " + id + " GW" + g + ": every card is the Game On profile's");
      chk(b.swaps === 0 && b.sellValue === null, L + " " + id + " GW" + g + ": nothing claimed that needs Game On's records");
    });
    const sm = C.extSummary(ov, X);
    chk(sm.total === row[id].total, L + " " + id + ": the team page's total is the table's", sm.total + " vs " + row[id].total);
    // Compare: you against him, as an outsider and as himself
    const g = cur || ds.pitchGw;
    const r1 = C.compare(ds, me, id, g), r2 = C.compare(ov, me, X, g);
    SIDE.forEach((k) => chk(J(r1.b[k]) === J(r2.b[k]), L + " " + id + ": compare's " + k + " is the Game On manager's", J(r1.b[k]) + " vs " + J(r2.b[k])));
    SIDE.concat(["rank"]).forEach((k) => chk(J(r1.a[k]) === J(r2.a[k]), L + " " + id + ": your own " + k + " is unmoved", J(r1.a[k]) + " vs " + J(r2.a[k])));
    chk(J(r1.b.best) === J(r2.b.best) && J(r1.b.worst) === J(r2.b.worst), L + " " + id + ": best and worst weeks agree");
    chk(J(r1.b.chips) === J(r2.b.chips), L + " " + id + ": the chips FPL lists are the ones his squads carried", J(r1.b.chips) + " vs " + J(r2.b.chips));
    chk(J(r1.record) === J(r2.record), L + " " + id + ": the week-by-week record agrees");
    chk(J(r1.seasonRows) === J(r2.seasonRows), L + " " + id + ": past seasons agree");
    chk(cards(r1.b.pitch) === cards(r2.b.pitch) && J(r1.squadRows.map((x) => [x.shared, x.a && x.a.el, x.b && x.b.el])) === J(r2.squadRows.map((x) => [x.shared, x.a && x.a.el, x.b && x.b.el])), L + " " + id + ": the squads side by side agree");
    chk(r2.b.ext === true && r2.b.name === r1.b.name && r2.a.ext === false, L + " " + id + ": the outsider is named and marked");
    chk(r2.b.overallRank === r1.b.overallRank, L + " " + id + ": the overall rank agrees");
    chk(J(C.form(ds, id).map((p) => [p.gw, p.p])) === J(C.form(ov, X).map((p) => [p.gw, p.p])), L + " " + id + ": the form chart's points agree");
  });
  // Game On untouched
  chk(J(C.classic(ds).map((r) => [r.id, r.total, r.computedRank, r.eventTotal])) === tableBefore, L + ": the table is unmoved");
  chk(J(ds.managers) === mgrBefore, L + ": the managers are unmoved");
  chk(!ds._extSquads && !ds._ext, L + ": the league's own data carries no outsider");

  // order two: a team opened first, before any league page has been drawn
  const dsB = JSON.parse(J(ds0)), CB = computeFor(dsB, now);
  const ovB = CB.fplOverlay(dsB, outsider(dsB, probe[1], 900000999));
  CB.compare(ovB, me, 900000999, cur || dsB.pitchGw);
  chk(J(CB.classic(dsB).map((r) => [r.id, r.total, r.computedRank, r.eventTotal])) === tableBefore, L + ": the table is the same when a team is opened first");
  // a Game On manager is never laid over
  chk(CB.fplOverlay(dsB, outsider(dsB, probe[1], probe[1])) === dsB, L + ": a Game On manager is never treated as an outsider");
}

const real = JSON.parse(fs.readFileSync(path.join(ROOT, "data.json"), "utf8")).dataset;
audit("real", real);
console.log("  ok   real data" + (fails ? " (with failures above)" : ""));
const BASE = sim.loadBase(), S = sim.season(BASE), F = sim.firstGw(BASE);
const moments = [[F, "live"], [F, "ft"], [F, "bonus"], [F, "final"], [19, "final"], [20, "pre"], [20, "live"], [24, "bonus"], [38, "live"], [38, "final"]]
  .filter(([g]) => g >= F && g <= sim.LAST);
if (process.argv[2] === "all") { moments.length = 0; for (let g = F; g <= sim.LAST; g++) ["live", "bonus", "final"].forEach((ph) => moments.push([g, ph])); }
for (const [gw, phase] of moments) {
  const before = fails;
  const st = sim.stateAt(S, gw, phase);
  audit("sim GW" + gw + " " + phase, st.dataset, st.now);
  console.log((fails === before ? "  ok   " : "  --   ") + "sim GW" + gw + " " + phase);
}
Object.keys(seen).forEach((k) => console.log("  " + String(seen[k]).padStart(6) + " x " + k));
console.log("\n" + checks + " checks, " + fails + " failed");
console.log(fails ? "FAILS: " + fails : "a team from FPL is counted exactly as a Game On manager is");
process.exit(fails ? 1 : 0);
