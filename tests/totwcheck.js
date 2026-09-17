const GOENV = require("./lib/env.js");
const { loadCompute, ROOT } = require("./audit/harness.js");
const fs = require("fs"), vm = require("vm"), path = require("path");
let fails = 0; const chk = (ok, m, x) => { console.log((ok ? "  ok   " : "  FAIL ") + m + (x ? "  " + x : "")); if (!ok) fails++; };
const { C, ds } = loadCompute();
for (const gw of C.squadGws(ds)) {
  const H = C.highlights(ds, gw); const sq = H && H.squads; if (!sq) { chk(false, "GW" + gw + " has squads"); continue; }
  const tw = sq.teamOfWeek; chk(!!tw, "GW" + gw + " has a team of the week");
  if (!tw) continue;
  const all = tw.lines.reduce((a, l) => a.concat(l.players), []);
  chk(all.length === 11, "GW" + gw + " eleven players", all.length);
  const n = t => all.filter(p => p.type === t).length;
  chk(n(1) === 1 && n(2) >= 3 && n(2) <= 5 && n(3) >= 2 && n(3) <= 5 && n(4) >= 1 && n(4) <= 3, "GW" + gw + " legal shape " + tw.shape);
  chk(all.reduce((s, p) => s + p.pts, 0) === tw.total, "GW" + gw + " total adds up", tw.total);
  chk(new Set(all.map(p => p.el)).size === 11, "GW" + gw + " no player twice");
  // owned by someone, and brute-force best: every legal combination of counts against top-N per line
  const pk = ds.picks[gw]; const owned = new Set(); Object.values(pk).forEach(s => (s.p || []).forEach(t => owned.add(+t[0])));
  chk(all.every(p => owned.has(+p.el)), "GW" + gw + " every player is held by someone in the league");
  const lp = ds.livePoints[gw] || {}; const els = ds.elements;
  const byT = { 1: [], 2: [], 3: [], 4: [] }; owned.forEach(el => { const e = els[el]; if (e) byT[e[1]].push(lp[el] || 0); });
  Object.values(byT).forEach(a => a.sort((x, y) => y - x));
  let best = -1; for (let d = 3; d <= 5; d++) for (let m = 2; m <= 5; m++) { const f = 10 - d - m; if (f < 1 || f > 3) continue; const s = byT[1][0] + byT[2].slice(0, d).reduce((a, b) => a + b, 0) + byT[3].slice(0, m).reduce((a, b) => a + b, 0) + byT[4].slice(0, f).reduce((a, b) => a + b, 0); if (s > best) best = s; }
  chk(tw.total === best, "GW" + gw + " is the brute-force maximum", tw.total + " vs " + best);
  if (gw === C.squadGws(ds).slice(-1)[0]) console.log("  GW" + gw + " " + tw.shape + " " + tw.total + ": " + all.map(p => p.name + " " + p.pts).join(", "));
}
// hostile datasets never throw
for (const f of fs.readdirSync(GOENV.STATES)) {
  try {
    const raw = JSON.parse(fs.readFileSync(GOENV.STATES + "/" + f, "utf8")); const d = raw.dataset || raw;
    const sandbox = { window: {}, console, Date, Math, JSON, Object, Array, String, Number, isNaN, parseInt, parseFloat, RegExp, Error, TypeError };
    sandbox.window.window = sandbox.window; vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(ROOT, "config.js"), "utf8"), sandbox); const cfg = sandbox.window.GO_DEFAULT_CONFIG;
    sandbox.window.GO_STORE = { config: () => cfg, overrides: () => ({}), dataset: () => d };
    vm.runInContext(fs.readFileSync(path.join(ROOT, "compute.js"), "utf8"), sandbox);
    const K = sandbox.window.GO_COMPUTE; let n = 0;
    (K.squadGws(d) || []).concat([null]).forEach(gw => { const H = K.highlights(d, gw); if (H && H.squads && H.squads.teamOfWeek) n++; });
    chk(true, "highlights on " + f + " (" + n + " teams of the week)");
  } catch (e) { chk(false, "highlights on " + f + " threw", e.message); }
}
console.log(fails ? "FAILS: " + fails : "ALL OK");
