const GOENV = require("./lib/env.js");
// Build datasets for every state a gameweek passes through, plus damaged ones.
const fs = require("fs");
const base = JSON.parse(fs.readFileSync(GOENV.APP + "/data.json", "utf8"));
const clone = (o) => JSON.parse(JSON.stringify(o));
const out = {};

// --- gameweek lifecycle -------------------------------------------------
// 1. Deadline passed, GW2 current, fetcher has NOT yet written picks for it.
{
  const d = clone(base); const ds = d.dataset;
  ds.bootstrap.events.forEach(e => { e.is_current = e.id === 2; e.is_next = e.id === 3;
    // A gameweek is being played when it is current and NOT yet settled.
    // Setting is_current alone was enough while the real GW2 was still in
    // play; once it finished in the base data these states quietly stopped
    // being live, and the suites that need a live gameweek had none to read.
    // Both halves have to be said, so the state means the same thing in
    // January as it did in August.
    if (e.id === 2) { e.finished = false; e.data_checked = false; }
    if (e.id === 1) { e.finished = true; e.data_checked = true; } });
  ds.pitchGw = 2;                       // pitch points at a GW with no squads
  out["gw2-current-no-picks"] = d;
}
// 2. GW2 live: squads in, points moving, some managers missing a history row.
{
  const d = clone(base); const ds = d.dataset;
  ds.bootstrap.events.forEach(e => { e.is_current = e.id === 2; e.is_next = e.id === 3;
    // A gameweek is being played when it is current and NOT yet settled.
    // Setting is_current alone was enough while the real GW2 was still in
    // play; once it finished in the base data these states quietly stopped
    // being live, and the suites that need a live gameweek had none to read.
    // Both halves have to be said, so the state means the same thing in
    // January as it did in August.
    if (e.id === 2) { e.finished = false; e.data_checked = false; }
    if (e.id === 1) { e.finished = true; e.data_checked = true; } });
  ds.picks["2"] = ds.picks["1"]; ds.livePoints["2"] = ds.livePoints["1"]; ds.pitchGw = 2;
  const ids = Object.keys(ds.history);
  ids.slice(0, 20).forEach(id => { delete ds.history[id]["2"]; });   // 20 not yet scored
  ids.slice(20, 60).forEach(id => { ds.history[id]["2"] = { p: 0, h: 0, b: 0, t: ds.history[id]["1"].t, pl: 0, plt: 12 }; });
  ids.slice(60).forEach(id => { const h1 = ds.history[id]["1"];
    ds.history[id]["2"] = { p: 30, h: 0, b: 2, t: h1.t + 30, v: h1.v, bk: h1.bk, tr: 1, r: h1.r, pl: 6, plt: 12 }; });
  out["gw2-live-partial"] = d;
}
// 3. Between gameweeks: nothing current, only next.
{
  const d = clone(base); const ds = d.dataset;
  ds.bootstrap.events.forEach(e => { e.is_current = false; e.is_next = e.id === 2;
    if (e.id === 1) { e.finished = true; e.data_checked = true; } });
  out["between-gws"] = d;
}
// 4. GW finished but data not yet checked (bonus points still pending).
{
  const d = clone(base); const ds = d.dataset;
  ds.bootstrap.events.forEach(e => { if (e.id === 1) { e.finished = true; e.data_checked = false; e.is_current = true; } });
  out["finished-not-checked"] = d;
}
// 5. Season complete: all 38 done.
{
  const d = clone(base); const ds = d.dataset;
  ds.bootstrap.events.forEach(e => { e.finished = true; e.data_checked = true; e.is_current = e.id === 38; e.is_next = false; });
  Object.keys(ds.history).forEach(id => { const h1 = ds.history[id]["1"]; let t = h1.t;
    for (let g = 2; g <= 38; g++) { const p = 30 + ((parseInt(id) + g) % 45);
      const hit = (g % 7 === 0 ? 4 : 0); t += p - hit;
      ds.history[id][g] = { p, h: hit, b: g % 11, t, v: h1.v + g, bk: 3, tr: g % 3, r: 100000 + g * 137 }; } });
  ds.pitchGw = 38; ds.picks["38"] = ds.picks["1"]; ds.livePoints["38"] = ds.livePoints["1"];
  out["season-complete"] = d;
}
// 6. Deep into the season, mid-GW — the realistic heavy case.
{
  const d = clone(out["season-complete"]); const ds = d.dataset;
  ds.bootstrap.events.forEach(e => { e.finished = e.id < 25; e.data_checked = e.id < 25;
    e.is_current = e.id === 25; e.is_next = e.id === 26; });
  for (let g = 1; g <= 25; g++) { ds.picks[g] = ds.picks["1"]; ds.livePoints[g] = ds.livePoints["1"]; }
  Object.keys(ds.history).forEach(id => { for (let g = 26; g <= 38; g++) delete ds.history[id][g]; });
  ds.pitchGw = 25;
  out["gw25-live-full-season"] = d;
}

// --- damaged / hostile --------------------------------------------------
const dmg = {
  "no-elements":      d => { delete d.dataset.elements; },
  "no-picks":         d => { d.dataset.picks = {}; d.dataset.livePoints = {}; },
  "no-chips":         d => { delete d.dataset.chips; },
  "no-past-seasons":  d => { d.dataset.pastSeasons = {}; },
  "empty-h2h":        d => { d.dataset.h2h = {}; },
  "h2h-no-results":   d => { Object.keys(d.dataset.h2h).forEach(k => d.dataset.h2h[k].results = []); },
  "no-history":       d => { d.dataset.history = {}; },
  "one-manager":      d => { const m = d.dataset.managers[0]; d.dataset.managers = [m]; },
  "no-managers":      d => { d.dataset.managers = []; },
  "no-events":        d => { d.dataset.bootstrap.events = []; },
  "nulls-everywhere": d => { d.dataset.managers.forEach(m => { m.rank = null; m.total = null; m.eventTotal = null; m.lastRank = null; });
                             Object.keys(d.dataset.history).forEach(k => Object.keys(d.dataset.history[k]).forEach(g => {
                               const r = d.dataset.history[k][g]; r.v = null; r.bk = null; r.r = null; r.tr = null; })); },
  "picks-truncated":  d => { const g = d.dataset.picks["1"]; Object.keys(g).slice(0, 100).forEach(k => { g[k].p = g[k].p.slice(0, 5); }); },
  "unknown-elements": d => { const g = d.dataset.picks["1"]; Object.keys(g).forEach(k => { g[k].p.forEach(p => { p[0] = p[0] + 900000; }); }); },
  "hostile-names":    d => { d.dataset.managers.slice(0, 5).forEach((m, i) => {
                               m.entryName = '<img src=x onerror="window.__XSS=1">' + i;
                               m.playerName = '"><script>window.__XSS2=1</script>'; }); },
  "no-dataset-key":   d => { delete d.dataset; d.oops = true; },
};
Object.keys(dmg).forEach(k => { const d = clone(base); dmg[k](d); out[k] = d; });

fs.mkdirSync(GOENV.STATES, { recursive: true });
Object.keys(out).forEach(k => fs.writeFileSync(GOENV.STATES + "/" + k + ".json", JSON.stringify(out[k])));
console.log(Object.keys(out).length + " datasets written:", Object.keys(out).join(", "));
