/* What a squad is worth, one answer everywhere. FPL's history value counts the
 * bank in, so a squad is the value less the bank; the newest squad is priced
 * at today's prices, the figure its cards show; an older one as FPL recorded
 * it that week. The profile's headline and league average, the stats page's
 * richest, leanest, average and most-in-the-bank, the export picture and the
 * summary tile must all read the same figures, on the real data and on
 * simulated weeks through to the end of the season. Compute only: no browser. */
const fs = require("fs"), vm = require("vm"), path = require("path");
const GOENV = require("./lib/env.js");
const sim = require("./season/sim.js");
const ROOT = GOENV.APP;
let fails = 0, checks = 0;
const chk = (ok, m, x) => { checks++; if (!ok) { fails++; if (fails < 30) console.log("  FAIL " + m + (x !== undefined ? "  " + String(x).slice(0, 200) : "")); } };

function computeFor(ds) {
  const sandbox = { window: {}, console, Date, Math, JSON, Object, Array, String, Number, isNaN, parseInt, parseFloat, RegExp, Error, TypeError };
  sandbox.window.window = sandbox.window;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "config.js"), "utf8"), sandbox);
  const cfg = sandbox.window.GO_DEFAULT_CONFIG;
  sandbox.window.GO_STORE = { config: () => cfg, overrides: () => ({}), dataset: () => ds };
  vm.runInContext(fs.readFileSync(path.join(ROOT, "compute.js"), "utf8"), sandbox);
  return sandbox.window.GO_COMPUTE;
}

function audit(label, ds, gws, opts) {
  const C = computeFor(ds);
  const els = ds.elements || {};
  gws.forEach((gw) => {
    const L = label + " GW" + gw;
    const lw = C.leagueWorth(ds, gw);
    let vs = 0, bs = 0, n = 0;
    ds.managers.forEach((m) => {
      const h = (ds.history[m.id] || {})[gw];
      const w = C.squadWorth(ds, m.id, gw);
      if (!h || !(h.v > 0)) return;
      chk(!!w, L + " " + m.id + ": a worth for every manager with a history row");
      if (!w) return;
      const sq = ds.picks && ds.picks[gw] && ds.picks[gw][m.id];
      if (+gw === +ds.pitchGw && sq) {
        const now = sq.p.reduce((s, t) => s + els[t[0]][3], 0);
        chk(w.now && w.value === now, L + " " + m.id + ": the newest squad at today's prices", w.value + " vs " + now);
      } else {
        chk(!w.now && w.value === h.v - (h.bk || 0), L + " " + m.id + ": an older squad as FPL recorded it, less the bank", w.value + " vs " + (h.v - (h.bk || 0)));
      }
      chk(w.bank === h.bk, L + " " + m.id + ": the bank is FPL's", w.bank + " vs " + h.bk);
      vs += w.value; bs += w.bank || 0; n++;
      if (opts.pitches) {
        const p = C.managerPitch(ds, m.id, gw);
        if (p) {
          chk(p.squadValue === w.value, L + " " + m.id + ": the profile's squad value is the same", p.squadValue + " vs " + w.value);
          chk(p.leagueAvgValue === lw.average, L + " " + m.id + ": the profile's league average is the same", p.leagueAvgValue + " vs " + lw.average);
          if (p.sellValue != null) chk(+gw === +ds.pitchGw, L + " " + m.id + ": a selling value only on the newest squad");
        }
      }
    });
    if (!n) return;
    chk(lw && lw.count === n && lw.average === Math.round(vs / n) && lw.averageBank === Math.round(bs / n),
      L + ": the league average is the mean of the squads", JSON.stringify(lw) + " n " + n);
    const v = (C.highlights(ds, gw) || {}).value;
    chk(!!v, L + ": the stats page has values");
    if (!v) return;
    chk(v.average === lw.average && v.averageBank === lw.averageBank, L + ": the stats page average is the profile's", v.average + " vs " + lw.average);
    chk(v.now === (+gw === +ds.pitchGw), L + ": the stats page says which prices", v.now);
    [["richest", v.richest], ["leanest", v.poorest], ["most in the bank", v.mostBanked]].concat(v.top.map((t, i) => ["top " + (i + 1), t])).forEach(([k, r]) => {
      const w = C.squadWorth(ds, r.id, gw);
      chk(w && r.value === w.value && r.bank === w.bank, L + " " + k + ": " + r.name + " reads his squad and bank", JSON.stringify({ r: [r.value, r.bank], w: w && [w.value, w.bank] }));
    });
    const all = ds.managers.map((m) => C.squadWorth(ds, m.id, gw)).filter((w) => w && w.value > 0);
    chk(v.richest.value === Math.max(...all.map((w) => w.value)) && v.poorest.value === Math.min(...all.map((w) => w.value)),
      L + ": richest and leanest are the extremes of the squads");
    chk(v.mostBanked.bank === Math.max(...all.map((w) => w.bank || 0)), L + ": most in the bank is the most banked");
  });
  const last = Math.max(...gws);
  const probe = ds.managers.filter((m) => (ds.history[m.id] || {})[last]).slice(0, 25);
  probe.forEach((m) => {
    const s = C.snapshot(ds, m.id), hs = Object.keys(ds.history[m.id]).map(Number).filter((g) => typeof ds.history[m.id][g].p === "number");
    const w = C.squadWorth(ds, m.id, Math.max(...hs));
    chk(s && w && s.value === w.value && s.bank === w.bank, label + " " + m.id + ": the summary tile reads the latest squad", s && s.value + " vs " + (w && w.value));
  });
}

// the real data
const real = JSON.parse(fs.readFileSync(path.join(ROOT, "data.json"), "utf8")).dataset;
const rgws = Object.keys(real.picks || {}).map(Number).filter((g) => g > 0);
audit("real", real, rgws, { pitches: true });
// FPL's own proof that its value counts the bank in: Gameweek 1 is 100.0 for everyone
{
  const C = computeFor(real);
  if (+real.pitchGw !== 1) {
    const g1 = real.managers.map((m) => [(real.history[m.id] || {})[1], C.squadWorth(real, m.id, 1)]).filter((x) => x[0]);
    chk(g1.every((x) => x[0].v === 1000), "real GW1: FPL's value is 100.0 for every squad, bank and all");
    chk(g1.every((x) => x[1].value + x[1].bank === 1000), "real GW1: squad and bank add back to 100.0");
    chk(g1.some((x) => x[1].bank > 0 && x[1].value < 1000), "real GW1: a squad that left money unspent is worth less than 100.0");
  }
}
console.log("  ok   real data, gameweeks " + rgws.join(","));

// simulated weeks: the pitch gameweek moving on, a double and a blank, the end
const base = sim.loadBase(), S = sim.season(base);
for (const [gw, phase] of [[6, "pre"], [6, "live"], [7, "final"], [24, "live"], [29, "final"], [38, "final"]]) {
  const st = sim.stateAt(S, gw, phase);
  const ds = st.dataset;
  const gws = [1, Math.max(1, gw - 2), gw - 1, gw].filter((g, i, a) => g > 0 && a.indexOf(g) === i && ds.picks[g]);
  audit("sim GW" + gw + " " + phase, ds, gws, { pitches: gw === 38 || gw === 6 });
  console.log("  ok   sim GW" + gw + " " + phase);
}
console.log("\n" + checks + " checks, " + fails + " failed");
console.log(fails ? "FAILS: " + fails : "one squad value everywhere");
process.exit(fails ? 1 : 0);
