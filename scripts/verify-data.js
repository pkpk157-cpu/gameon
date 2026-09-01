// Every fetch, prove the freshly written data.json still agrees with FPL's
// own numbers before it is published: rebuild every h2h record from the
// fixtures and scores the app will show and compare it with FPL's standings,
// and reconcile every classic total against FPL's running total. Finished
// gameweeks only — a live one moves by design.
//
// Exit code 0 either way (fresh data beats stale data even when a check
// trips); a disagreement is shouted into the Action log as a warning.
const fs = require("fs"), vm = require("vm"), path = require("path");
const ROOT = path.join(__dirname, "..");
const ds = JSON.parse(fs.readFileSync(path.join(ROOT, "data.json"), "utf8")).dataset;
const cx = { window: {}, console,
             localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
             document: { documentElement: { setAttribute() {} } } };
vm.createContext(cx);
vm.runInContext(fs.readFileSync(path.join(ROOT, "config.js"), "utf8"), cx);
const cfg = cx.window.GO_DEFAULT_CONFIG;
cx.window.GO_STORE = { config: () => cfg, overrides: () => ({}) };
vm.runInContext(fs.readFileSync(path.join(ROOT, "compute.js"), "utf8"), cx);
const C = cx.window.GO_COMPUTE;

let bad = 0;
const flag = (m) => { bad++; console.log("::warning::data vs FPL: " + m); };

const done = new Set(C.finishedGws(ds));
const gws = C.fixtureGws(ds);
const played = gws.filter((g) => done.has(g));
const letters = "ABCDEFGHIJKLMNOP".split("");
let mgrChecked = 0, fxTotal = 0;

(cfg.h2hGroupLeagueIds || []).forEach((lid, gi) => {
  const standings = ((ds.h2h || {})[lid] || {}).results || [];
  const real = standings.filter((r) => r.entry);
  if (!real.length) return;
  const half = Math.ceil((real.length + (real.length % 2)) / 2);
  for (const g of gws) {
    const fx = C.fixtures(ds, g, gi);
    fxTotal += fx.length;
    if (fx.length && fx.length !== half)
      flag("Group " + letters[gi] + " GW" + g + ": " + fx.length + " fixtures, expected " + half);
    const seen = {};
    fx.forEach((f) => [f.a, f.b].forEach((s) => { if (!s.average) seen[s.id] = (seen[s.id] || 0) + 1; }));
    if (fx.length) real.forEach((r) => {
      if (seen[r.entry] !== 1) flag("Group " + letters[gi] + " GW" + g + ": " + r.player_name +
        " plays " + (seen[r.entry] || 0) + " times");
    });
  }
  const rec = {};
  real.forEach((r) => rec[r.entry] = { w: 0, d: 0, l: 0, pf: 0 });
  for (const g of played) {
    C.fixtures(ds, g, gi).forEach((f) => {
      if (!f.played) { flag("Group " + letters[gi] + " GW" + g + ": no score for " + f.a.name + " v " + f.b.name); return; }
      [[f.a, f.b], [f.b, f.a]].forEach((pair) => {
        const me = pair[0], op = pair[1];
        if (me.average || !rec[me.id]) return;
        rec[me.id].pf += me.score;
        if (me.score > op.score) rec[me.id].w++;
        else if (me.score < op.score) rec[me.id].l++;
        else rec[me.id].d++;
      });
    });
  }
  const h = cfg.h2h;
  real.forEach((r) => {
    mgrChecked++;
    const m = rec[r.entry];
    const pts = m.w * h.pointsWin + m.d * h.pointsDraw + m.l * h.pointsLoss;
    if (m.w !== r.matches_won || m.d !== r.matches_drawn || m.l !== r.matches_lost ||
        pts !== r.total || m.pf !== r.points_for)
      flag("Group " + letters[gi] + " " + r.player_name + ": rebuilt " + m.w + "W " + m.d + "D " +
        m.l + "L " + pts + "pts " + m.pf + "for, FPL has " + r.matches_won + "W " +
        r.matches_drawn + "D " + r.matches_lost + "L " + r.total + "pts " + r.points_for + "for");
  });
});

let cChecked = 0;
const fin = Array.from(done).sort((a, b) => a - b);
if (fin.length) (ds.managers || []).forEach((m) => {
  const h = ds.history[m.id]; if (!h) { flag("no history for " + m.playerName); return; }
  let sum = 0;
  fin.forEach((g) => { if (h[g]) sum += (h[g].p || 0) - (h[g].h || 0); });
  const last = h[fin[fin.length - 1]];
  cChecked++;
  if (last && typeof last.t === "number" && last.t !== sum)
    flag("classic " + m.playerName + ": FPL total " + last.t + ", gw sum " + sum);
});

played.forEach((g) => {
  const ev = (ds.bootstrap.events || []).find((e) => e.id === g);
  if (!ev || !(ev.average > 0)) flag("no average_entry_score for finished GW" + g);
});

// Selling values: for every squad with purchase prices, the fifteen selling
// prices must reproduce FPL's own figure (history value minus bank) exactly.
// The odd mismatch is expected — a Free Hit muddies the transfer log, and the
// app hides the per-player detail for exactly those squads — but if most
// squads disagree, the purchase prices themselves are wrong.
if (ds.buys && ds.buysGw && (ds.picks || {})[ds.buysGw]) {
  let sellOk = 0, sellOff = 0;
  const pk = ds.picks[ds.buysGw];
  Object.keys(ds.buys).forEach((id) => {
    const squad = pk[id], h = (ds.history[id] || {})[ds.buysGw];
    if (!squad || !h || !(h.v > 0) || h.bk == null) return;
    let sum = 0, all = true;
    (squad.p || []).forEach((p) => {
      const buy = ds.buys[id][p[0]], now = (ds.elements[p[0]] || [])[3];
      if (buy == null || now == null) { all = false; return; }
      sum += now > buy ? buy + Math.floor((now - buy) / 2) : now;
    });
    if (!all) return;
    if (sum === h.v - h.bk) sellOk++; else sellOff++;
  });
  if (sellOff > sellOk) flag("selling values: only " + sellOk + " of " +
    (sellOk + sellOff) + " squads reconcile with FPL's value minus bank");
  console.log("selling values reconcile for " + sellOk + " squad(s), " +
    sellOff + " hidden (Free Hit or unmatched log)");
}

console.log("verified: " + mgrChecked + " h2h records across " +
  (cfg.h2hGroupLeagueIds || []).length + " groups from " + fxTotal + " fixtures, " +
  cChecked + " classic totals, " + played.length + " finished gameweek(s)");
console.log(bad ? bad + " disagreement(s) with FPL — see warnings above"
                : "everything agrees with FPL exactly");
