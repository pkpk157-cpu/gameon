const GOENV = require("./lib/env.js");
/* Independent recount of every badge for every manager, written from the raw
   dataset without touching compute.js's own working. */
const fs = require("fs"), vm = require("vm"), path = require("path");
const ROOT = GOENV.APP;
const ds = JSON.parse(fs.readFileSync(process.argv[2] || path.join(ROOT, "data.json"), "utf8")).dataset;
const cx = { window: {}, console,
             localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
             document: { documentElement: { setAttribute() {} } } };
vm.createContext(cx);
vm.runInContext(fs.readFileSync(path.join(ROOT, "config.js"), "utf8"), cx);
const cfg = cx.window.GO_DEFAULT_CONFIG;
cx.window.GO_STORE = { config: () => cfg, overrides: () => ({}) };
vm.runInContext(fs.readFileSync(path.join(ROOT, "compute.js"), "utf8"), cx);
const C = cx.window.GO_COMPUTE;

const played = C.finishedGws(ds);
const ids = ds.managers.map((m) => +m.id);
let bad = 0;
const fail = (m) => { bad++; console.log("FAIL " + m); };

/* ---- recount, from the raw data only --------------------------------- */
// league high score and best armband per gw, ownership per gw
const high = {}, capHigh = {}, own = {}, squads = {}, capWho = {};
for (const g of played) {
  let best = null;
  for (const m of ds.managers) {
    const p = C.gwScore(ds, m.id, g);   // net of hits
    if (p !== null) best = best === null ? p : Math.max(best, p);
  }
  high[g] = best;
  const pk = (ds.picks || {})[g] || {};
  const lp = (ds.livePoints || {})[g] || {};
  let cb = null, n = 0; const o = {}, c = {};
  for (const mid of Object.keys(pk)) {
    const p = (pk[mid] || {}).p || [];
    if (!p.length) continue;
    n++;
    const seen = new Set();
    let wore = null, mult = 0;
    for (const t of p) {
      if (!seen.has(t[0])) { seen.add(t[0]); o[t[0]] = (o[t[0]] || 0) + 1; }
      if (t[1] >= 2 && t[1] > mult) { mult = t[1]; wore = t[0]; }
    }
    if (wore !== null) {
      c[wore] = (c[wore] || 0) + 1;
      if (typeof lp[wore] === "number") cb = cb === null ? lp[wore] : Math.max(cb, lp[wore]);
    }
  }
  capHigh[g] = cb; own[g] = o; squads[g] = n; capWho[g] = c;
}
// classic rank per finished gw, from running totals
const rankAt = {};
for (const g of played) {
  const rows = ids.map((id) => ({ id, t: ((ds.history[id] || {})[g] || {}).t }))
                  .filter((r) => typeof r.t === "number")
                  .sort((a, b) => b.t - a.t);
  const map = {};
  for (let i = 0; i < rows.length; ) {
    let j = i;
    while (j + 1 < rows.length && rows[j + 1].t === rows[i].t) j++;
    for (let k = i; k <= j; k++) map[rows[k].id] = i + 1;
    i = j + 1;
  }
  rankAt[g] = map;
}

const expect = {};
for (const id of ids) {
  const h = ds.history[id] || {};
  const e = { top: [], dbl: [], century: [], comeback: [], armband: [], capt: [], diff: [], clean: [] };
  const chip = {};
  ((ds.chips || {})[id] || []).forEach((c) => { chip[c.gw] = c.n; });
  played.forEach((g, i) => {
    const r = h[g], pts = C.gwScore(ds, id, g);
    if (!r || pts === null) return;
    if (high[g] !== null && pts === high[g]) e.top.push(g);
    if (pts >= 200) e.dbl.push(g);
    if (pts >= 100) e.century.push(g);
    if (i > 0) {
      const a = rankAt[g][id], b = rankAt[played[i - 1]][id];
      if (a && b && b - a >= 75) e.comeback.push(g);
    }
    const sq = ((ds.picks || {})[g] || {})[id];
    const c = chip[g] || (sq && sq.c) || "";
    if (c !== "bboost" && !(r.h || 0) && !(r.b || 0)) e.clean.push(g);
    const p = sq && sq.p;
    if (!p || !p.length) return;
    const lp = (ds.livePoints || {})[g] || {};
    let cel = null, cm = 0;
    for (const t of p) if (t[1] >= 2 && t[1] > cm) { cm = t[1]; cel = t[0]; }
    if (cel !== null && typeof lp[cel] === "number") {
      if (lp[cel] * cm >= 40) e.capt.push(g);
      if (capHigh[g] !== null && lp[cel] === capHigh[g] && squads[g] &&
          (capWho[g][cel] || 0) / squads[g] < 0.25) e.armband.push(g);
    }
    if (squads[g]) {
      for (const t of p) {
        if (!(t[1] > 0)) continue;
        const pts = lp[t[0]];
        if (typeof pts !== "number" || pts < 15) continue;
        if ((own[g][t[0]] || 0) / squads[g] < 0.1) { e.diff.push(g); break; }
      }
    }
  });
  // months
  e.month = C.monthly(ds).filter((m) => m.complete)
    .filter((m) => (m.rows || []).some((x) => +x.id === id && x.pos === 1))
    .map((m) => m.label || m.name);
  // form
  const row = C.classic(ds).find((r) => +r.id === id);
  e.leader = row && row.computedRank === 1;
  e.topten = !!(row && row.computedRank > 1 && row.computedRank <= 10);
  let overall = null;
  for (let j = played.length - 1; j >= 0; j--) { const rr = h[played[j]]; if (rr && rr.r) { overall = rr.r; break; } }
  e.top10k = !!(overall && overall <= 10000);
  e.overall = overall;
  let st = 0;
  for (let i = played.length - 1; i >= 1; i--) {
    const a = rankAt[played[i]][id], b = rankAt[played[i - 1]][id];
    if (a && b && a < b) st++; else break;
  }
  e.climb = st >= 3 ? st : 0;
  expect[id] = e;
}

/* ---- compare against C.badges ---------------------------------------- */
const tally = {};
for (const id of ids) {
  const got = {};
  C.badges(ds, id).forEach((b) => { got[b.k] = b; tally[b.k] = (tally[b.k] || 0) + 1; });
  const e = expect[id];
  const chk = (k, wantCount, wantGws) => {
    if (!wantCount) { if (got[k]) fail(id + " has " + k + " and should not"); return; }
    if (!got[k]) { return fail(id + " missing " + k); }
    if (got[k].count !== wantCount) fail(id + " " + k + " count " + got[k].count + " want " + wantCount);
    if (wantGws && JSON.stringify(got[k].gws) !== JSON.stringify(wantGws))
      fail(id + " " + k + " gws " + JSON.stringify(got[k].gws) + " want " + JSON.stringify(wantGws));
  };
  ["top","dbl","century","comeback","armband","capt","diff","clean"].forEach((k) => chk(k, e[k].length, e[k]));
  chk("month", e.month.length, e.month);
  chk("leader", e.leader ? 1 : 0);
  chk("topten", e.topten ? (C.classic(ds).find((r) => +r.id === id).computedRank) : 0);
  chk("top10k", e.top10k ? e.overall : 0);
  chk("climb", e.climb);
  // shape checks
  C.badges(ds, id).forEach((b) => {
    if (typeof b.tag !== "string" || !b.tag) fail(id + " " + b.k + " has no tag");
    if (typeof b.why !== "string" || !b.why) fail(id + " " + b.k + " has no why");
    if (typeof b.form !== "boolean") fail(id + " " + b.k + " has no form flag");
    if (!b.label) fail(id + " " + b.k + " has no label");
  });
  // honours, then form, then the blots (settled before form): the rank never falls
  const rank = (b) => b.blot ? (b.form ? 3 : 2) : (b.form ? 1 : 0);
  const seq = C.badges(ds, id).map(rank);
  for (let i = 1; i < seq.length; i++) if (seq[i] < seq[i - 1]) { fail(id + " badges out of order: " + seq.join("")); break; }
}
console.log("managers checked:", ids.length, "| finished GWs:", played.join(","));
console.log("badge counts:", JSON.stringify(tally));
console.log(bad ? bad + " FAILURES" : "recount agrees on every manager");
