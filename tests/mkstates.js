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

// 22. After the draw: the group stage over (GW1-29 settled) and GW30 being
// played, which is the only state in which the knockout bracket is actually
// drawn. It used to be built by a second script that never got committed, so
// the seven suites that sweep this directory quietly stopped covering the one
// state that matters from GW30 to the end of the season — and passed while
// doing it. One generator, one count.
{
  const d = clone(base); const ds = d.dataset;
  ds.bootstrap.events.forEach((e) => {
    if (e.id <= 29) { e.finished = true; e.data_checked = true; e.is_current = false; e.is_next = false; }
    else if (e.id === 30) { e.finished = false; e.data_checked = false; e.is_current = true; }
    else { e.finished = false; e.data_checked = false; e.is_current = false; }
    if (e.id <= 29 && !(e.average > 0)) e.average = 50;
  });
  // A history row for every gameweek to 30, by repeating what the real data has.
  ds.managers.forEach((m) => {
    const h = ds.history[m.id] || {};
    const seed = h[4] || h[3] || h[2] || h[1];
    if (!seed) return;
    let total = 0;
    for (let g = 1; g <= 30; g++) {
      if (!h[g]) h[g] = Object.assign({}, seed, { p: seed.p, h: 0 });
      total += (h[g].p || 0) - (h[g].h || 0);
      h[g].t = total;
    }
    ds.history[m.id] = h; m.total = total; m.eventTotal = h[30].p;
  });
  ds.managers.slice().sort((a, b) => b.total - a.total).forEach((m, i) => { m.rank = i + 1; });
  ds.pitchGw = 30; ds.buysGw = 30;
  ds.picks[30] = ds.picks["4"] || ds.picks["1"];
  ds.livePoints[30] = ds.livePoints["4"] || ds.livePoints["1"];
  if (ds.liveStats) ds.liveStats[30] = ds.liveStats["4"] || ds.liveStats["1"];
  if (ds.breakdown) ds.breakdown[30] = ds.breakdown["4"] || ds.breakdown["1"];
  ds.updatedAt = new Date().toISOString();
  out["gw30-knockout-drawn"] = d;
}

// --- match events -------------------------------------------------------
// The base data predates gwEvents, and every other state here is therefore
// also a test that the match page is fine without it. This one has them, and
// each scoring fixture is given a different shape to answer for: bookings and
// both kinds of penalty, an own goal on the side it counted for, a brace, and
// one finished match deliberately left a goal short so the "these do not add
// up" line has something to appear over. Everywhere else the names under a
// score add up to it, which is what the suite checks.
{
  const d = clone(base); const ds = d.dataset;
  const clubOf = (el) => (ds.elements[el] || [])[2];
  // whoever actually played for a club that week, best first, so the names are
  // real players rather than whoever sits first in the element list
  const squadOf = (gw, club) => Object.keys(ds.elements)
    .filter(el => clubOf(el) === club)
    .sort((a, b) => ((ds.livePoints[gw] || {})[b] || 0) - ((ds.livePoints[gw] || {})[a] || 0))
    .map(Number);
  const gws = Object.keys(ds.gwFixtures || {})
    .filter(gw => (ds.gwFixtures[gw] || []).some(f => f[3] && f[4] != null))
    .sort((a, b) => +a - +b);
  if (!gws.length) { console.error("no finished gameweek to hang match events on"); process.exit(1); }
  ds.gwEvents = {};
  let k = -1;                                   // which scoring fixture this is
  gws.forEach((gw) => {
    ds.gwEvents[gw] = (ds.gwFixtures[gw] || []).map((f) => {
      const hs = f[4], as = f[5];
      if (!f[2] || hs == null || as == null || (!hs && !as)) return 0;
      const home = squadOf(gw, f[0]), away = squadOf(gw, f[1]);
      if (home.length < 3 || away.length < 3) return 0;
      k++;
      const ev = [], done = !!(f[3] || f[8]);
      const brace = k === 3 && hs >= 2;
      const og = k === 1 && hs >= 1;
      const short = k === 2 && done && hs >= 1;  // one home goal withheld
      let want = hs - (short ? 1 : 0);
      if (brace) {
        ev.push([0, "g", home[0], want]);        // one man, the lot
      } else {
        for (let g = 0; g < want; g++) {
          // an own goal is stored against the man who put it in, who plays for
          // the other side; it still counts for the home score here
          if (og && g === 0) ev.push([1, "o", away[away.length - 1], 1]);
          else ev.push([0, "g", home[g % home.length], 1]);
        }
      }
      for (let g = 0; g < as; g++) ev.push([1, "g", away[g % away.length], 1]);
      if (hs > 1 && !brace) ev.push([0, "a", home[home.length - 1], 1]);
      if (k === 0) {
        ev.push([0, "y", home[1], 1]);
        ev.push([1, "r", away[1], 1]);
        ev.push([1, "pm", away[2], 1]);
        ev.push([0, "ps", home[2], 1]);
      }
      return ev.length ? ev : 0;
    });
  });
  out["match-events"] = d;
}

fs.mkdirSync(GOENV.STATES, { recursive: true });
Object.keys(out).forEach(k => fs.writeFileSync(GOENV.STATES + "/" + k + ".json", JSON.stringify(out[k])));
console.log(Object.keys(out).length + " datasets written:", Object.keys(out).join(", "));

// The sweeps read whatever is in this directory, so a state that quietly stops
// being written costs coverage without failing anything. Say the number out
// loud and refuse a short count.
const EXPECTED = 23;
if (Object.keys(out).length !== EXPECTED) {
  console.error("expected " + EXPECTED + " datasets, wrote " + Object.keys(out).length);
  process.exit(1);
}
