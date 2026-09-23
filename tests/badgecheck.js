const GOENV = require("./lib/env.js");
const { loadCompute, ROOT } = require("./audit/harness.js");
const fs = require("fs"), vm = require("vm"), path = require("path");
let fails = 0; const chk = (ok, msg, extra) => { console.log((ok ? "  ok   " : "  FAIL ") + msg + (extra ? "  " + extra : "")); if (!ok) fails++; };
const { C, ds } = loadCompute();
const played = C.finishedGws(ds);
const all = ds.managers.map(m => ({ id: m.id, name: m.entryName, B: C.badges(ds, m.id) }));
const count = k => all.reduce((s, m) => s + (m.B.find(b => b.k === k) ? m.B.find(b => b.k === k).count : 0), 0);
// top scorer: per finished GW the number sharing the max
let expTop = 0, expCent = 0;
// net of hits, like every score in the app
played.forEach(g => { let best = null; ds.managers.forEach(m => { const p = C.gwScore(ds, m.id, g); if (p !== null && (best === null || p > best)) best = p; });
  ds.managers.forEach(m => { const p = C.gwScore(ds, m.id, g); if (p === null) return; if (p === best) expTop++; if (p >= 100) expCent++; }); });
chk(count("top") === expTop, "top-scorer badges across the league = managers sharing each GW's max", count("top") + " vs " + expTop);
chk(count("century") === expCent, "century badges = 100+ gameweeks in history", count("century") + " vs " + expCent);
const doneMonths = C.monthly(ds).filter(m => m.complete).length;
chk(count("month") === doneMonths, "one Manager of the Month badge per finished month", count("month") + " vs " + doneMonths);
// giant killer independently
const cr = C.classicRankByGw(ds); let expGiant = 0;
ds.managers.forEach(m => { const R = C.h2hRecord(ds, m.id); if (!R) return; R.rows.forEach(r => { if (r.result !== "W" || !r.opp || !r.opp.known || r.opp.average) return; const gi = played.indexOf(+r.gw); if (gi < 1) return; const band = cr[played[gi - 1]]; if (band && band.rank[m.id] && band.rank[+r.opp.id] && band.rank[+r.opp.id] < band.rank[m.id]) expGiant++; }); });
chk(count("giant") === 0 && expGiant >= 0, "no giant-killer badge is issued any more");
// survivor: none while under a quarter are out
const lms = C.lms(ds); const gone = ds.managers.length - lms.survivors.length;
const surv = all.filter(m => m.B.find(b => b.k === "survivor")).length;
chk(gone * 4 >= ds.managers.length ? surv === lms.survivors.length : surv === 0, "survivor badge only once a quarter are out", gone + " out, " + surv + " badges");
// climbing: verify against form ranks
let expClimb = 0; all.forEach(m => { const f = C.form(ds, m.id).filter(x => played.indexOf(x.gw) !== -1); let s = 0; for (let i = f.length - 1; i >= 1; i--) { if (f[i].r && f[i - 1].r && f[i].r < f[i - 1].r) s++; else break; } if (s >= 3) expClimb++; });
chk(all.filter(m => m.B.find(b => b.k === "climb")).length === expClimb, "climbing badges match the form chart's positions", expClimb + " managers");
// the leader's badges, for the eye
const me = all.find(m => m.id === 1255976); console.log("  Roo - United:", JSON.stringify(me.B.map(b => b.label + " " + b.count + " " + JSON.stringify(b.gws))));
const top = all.filter(m => m.B.length).sort((a, b) => b.B.length - a.B.length).slice(0, 3); console.log("  most badges:", top.map(m => m.name + " (" + m.B.map(b => b.k).join(",") + ")").join("; "));
console.log("  managers with any badge:", all.filter(m => m.B.length).length + "/" + all.length);
// ---- honours vs form: shape, order and wording -------------------------
const HONOUR = ["month","group","promo","top","dbl","century","comeback","armband","capt","diff","clean"];
const FORM = ["leader","topten","top10k","climb","survivor"];
const BLOT = ["releg","spoon","blank","freefall","capflop","benched","reckless"];
const FORMBLOT = ["bottomten","slide","asleep"];
let shapeBad = 0, orderBad = 0, kindBad = 0, wordBad = 0;
// the order on a profile: honours, form, then the blots, settled before form
const rank = (b) => b.blot ? (b.form ? 3 : 2) : (b.form ? 1 : 0);
all.forEach(m => {
  const seq = m.B.map(rank);
  for (let i = 1; i < seq.length; i++) if (seq[i] < seq[i - 1]) { orderBad++; break; }
  m.B.forEach(b => {
    if (!b.label || typeof b.tag !== "string" || !b.tag || typeof b.why !== "string" || !b.why ||
        typeof b.form !== "boolean" || typeof b.blot !== "boolean" || !Array.isArray(b.gws)) shapeBad++;
    const want = b.blot ? (b.form ? FORMBLOT : BLOT) : (b.form ? FORM : HONOUR);
    if (want.indexOf(b.k) === -1) kindBad++;
    if (/NaN|undefined|null/.test(b.tag + " " + b.why)) wordBad++;
  });
});
chk(shapeBad === 0, "every badge carries a label, tag, reason, gws list, form and blot flags", shapeBad + " bad");
chk(orderBad === 0, "honours, then form, then blots settled before form", orderBad + " out of order");
chk(kindBad === 0, "every badge is a known kind, flagged on the right side", kindBad + " wrong");
chk(wordBad === 0, "no badge text leaks NaN, undefined or null", wordBad + " bad");
// A manager can hold Leader or Top ten, never both.
chk(all.every(m => !(m.B.find(b => b.k === "leader") && m.B.find(b => b.k === "topten"))),
  "Leader and Top ten never appear together");
// Leader is the Classic table's first place, and only him.
const first = C.classic(ds).filter(r => r.computedRank === 1).map(r => +r.id).sort();
const leaders = all.filter(m => m.B.find(b => b.k === "leader")).map(m => +m.id).sort();
chk(JSON.stringify(first) === JSON.stringify(leaders), "Leader is exactly the top of the Classic table",
  JSON.stringify(leaders) + " vs " + JSON.stringify(first));
// Top ten is places two to ten, nobody else.
const twoToTen = C.classic(ds).filter(r => r.computedRank > 1 && r.computedRank <= 10).map(r => +r.id).sort();
const tens = all.filter(m => m.B.find(b => b.k === "topten")).map(m => +m.id).sort();
chk(JSON.stringify(twoToTen) === JSON.stringify(tens), "Top ten is exactly places 2 to 10",
  tens.length + " vs " + twoToTen.length);
// Double ton implies Century; the 200 is also a hundred.
chk(all.every(m => !m.B.find(b => b.k === "dbl") || !!m.B.find(b => b.k === "century")),
  "a double ton always carries its century too");
// Clean sheet never lands on a Bench Boost week, which cannot waste a bench.
let bbClean = 0;
all.forEach(m => {
  const b = m.B.find(x => x.k === "clean"); if (!b) return;
  const chip = {}; ((ds.chips || {})[m.id] || []).forEach(c => { chip[c.gw] = c.n; });
  b.gws.forEach(g => { if (chip[g] === "bboost") bbClean++; });
});
chk(bbClean === 0, "no clean sheet is claimed for a Bench Boost week", bbClean + " wrong");
// Best armband is never given where a quarter of the league or more wore it.
let herd = 0;
all.forEach(m => {
  const b = m.B.find(x => x.k === "armband"); if (!b) return;
  b.gws.forEach(g => {
    const pk = (ds.picks || {})[g] || {}, lp = (ds.livePoints || {})[g] || {};
    let n = 0; const cnt = {};
    Object.keys(pk).forEach(mid => {
      const p = (pk[mid] || {}).p || []; if (!p.length) return; n++;
      let el = null, mm = 0; p.forEach(t => { if (t[1] >= 2 && t[1] > mm) { mm = t[1]; el = t[0]; } });
      if (el !== null) cnt[el] = (cnt[el] || 0) + 1;
    });
    const sq = pk[m.id]; if (!sq) return;
    let el = null, mm = 0; (sq.p || []).forEach(t => { if (t[1] >= 2 && t[1] > mm) { mm = t[1]; el = t[0]; } });
    if (el !== null && n && (cnt[el] || 0) / n >= 0.25) herd++;
  });
});
chk(herd === 0, "Best armband is never given for the obvious captain", herd + " wrong");
const kinds = {}; all.forEach(m => m.B.forEach(b => { kinds[b.k] = (kinds[b.k] || 0) + 1; }));
console.log("  holders by kind:", JSON.stringify(kinds));
// hostile datasets: never throws
const sb = require("./audit/harness.js");
for (const f of fs.readdirSync(GOENV.STATES)) {
  try {
    const raw = JSON.parse(fs.readFileSync(GOENV.STATES + "/" + f, "utf8")); const d = raw.dataset || raw;
    const sandbox = { window: {}, console, Date, Math, JSON, Object, Array, String, Number, isNaN, parseInt, parseFloat, RegExp, Error, TypeError };
    sandbox.window.window = sandbox.window; vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(ROOT, "config.js"), "utf8"), sandbox); const cfg = sandbox.window.GO_DEFAULT_CONFIG;
    sandbox.window.GO_STORE = { config: () => cfg, overrides: () => ({}), dataset: () => d };
    vm.runInContext(fs.readFileSync(path.join(ROOT, "compute.js"), "utf8"), sandbox);
    const K = sandbox.window.GO_COMPUTE; const ids = (d && d.managers || []).slice(0, 5).map(m => m && m.id).concat([1255976, null, "x"]);
    let n = 0; ids.forEach(id => { const b = K.badges(d, id); n += (b || []).length; });
    chk(true, "badges on " + f + " (" + n + " across sample)");
  } catch (e) { chk(false, "badges on " + f + " threw", e.message); }
}
console.log(fails ? "FAILS: " + fails : "ALL OK");
