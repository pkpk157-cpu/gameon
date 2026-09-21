/* When a gameweek's points stand. FPL's H2H tables count a week once every
 * match's bonus is in and the subs are made, hours before the week is
 * checked; the app's group tables and match results follow the same rule,
 * while anything closed for good — the stage complete, a month, an
 * elimination, a badge — still waits for the check. No browser: the rule is
 * in compute.js and is tried on the live data bent into each state. */
const GOENV = require("./lib/env.js");
const fs = require("fs"), path = require("path");
const APP = GOENV.APP;
global.window = global; global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
require(path.join(APP, "config.js"));
let ds = null;
window.GO_STORE = { config: () => window.GO_DEFAULT_CONFIG, overrides: () => ({}), dataset: () => ds };
require(path.join(APP, "compute.js"));
const C = window.GO_COMPUTE;
const base = JSON.parse(fs.readFileSync(path.join(APP, "data.json"), "utf8")).dataset;
let fails = 0;
const chk = (ok, m, x) => { console.log((ok ? "  ok   " : "  FAIL ") + m + (x ? "  " + x : "")); if (!ok) fails++; };
const fresh = () => JSON.parse(JSON.stringify(base));
const cur = base.bootstrap.events.find((e) => e.is_current).id;
const gwsOf = (h) => h.groupStageGws;

// the current gameweek, bent into each state
const state = (mods) => { ds = fresh(); const e = ds.bootstrap.events.find((x) => x.id === cur); mods(ds, e); return ds; };
const fxOf = (d, gw) => C.fixtures(d, gw, 0);

// 1. bonus in and subs stored, not checked: the week counts and results are called
state((d, e) => { e.finished = false; e.data_checked = false; d.gwFixtures[cur].forEach((f) => { f[3] = 1; f[8] = 1; }); d.picksFinal[cur] = 1; });
chk(C.scoredGws(ds).indexOf(cur) !== -1 && C.finishedGws(ds).indexOf(cur) === -1, "bonus in, subs stored, unchecked: the week is scored but not finished");
let fx = fxOf(ds, cur);
chk(fx.length > 0 && fx.every((f) => f.played && !f.live && f.result), "its matches carry a result, not a live tag", fx.slice(0, 2).map((f) => f.result).join(","));
let h = C.h2h(ds);
chk(h.groupGwsPlayed === gwsOf(window.GO_DEFAULT_CONFIG.h2h).filter((g) => C.scoredGws(ds).indexOf(g) !== -1).length && (h.groupGwsPlayed > C.finishedGws(ds).filter((g) => gwsOf(window.GO_DEFAULT_CONFIG.h2h).indexOf(g) !== -1).length),
    "the group stage counts it as played", "GW " + h.groupGwsPlayed + "/" + h.groupGwsTotal);
chk(!h.groups[0].complete, "but the stage is not complete on an unchecked week");

// 2. a match still unfinished: live, no result, not counted
state((d, e) => { e.finished = false; e.data_checked = false; d.gwFixtures[cur].forEach((f) => { f[3] = 1; f[8] = 1; }); d.gwFixtures[cur][0][3] = 0; d.picksFinal[cur] = 1; });
chk(C.scoredGws(ds).indexOf(cur) === -1, "one match without its bonus: the week does not count yet");
fx = fxOf(ds, cur);
chk(fx.every((f) => !f.played || (f.live && !f.result)), "its matches are live with no result");

// 3. bonus in but the subs not yet stored: still live
state((d, e) => { e.finished = false; e.data_checked = false; d.gwFixtures[cur].forEach((f) => { f[3] = 1; f[8] = 1; }); delete d.picksFinal[cur]; });
chk(C.scoredGws(ds).indexOf(cur) === -1 && fxOf(ds, cur).every((f) => !f.played || f.live), "bonus in, subs not stored: still live");

// 4. checked: finished, scored, and the results stand
state((d, e) => { e.finished = true; e.data_checked = true; d.gwFixtures[cur].forEach((f) => { f[3] = 1; f[8] = 1; }); d.picksFinal[cur] = 2; });
chk(C.finishedGws(ds).indexOf(cur) !== -1 && C.scoredGws(ds).indexOf(cur) !== -1 && fxOf(ds, cur).every((f) => !f.played || (!f.live && f.result)), "checked: finished and scored, results called");

// 5. what waits for the check still waits: badges read finished gameweeks only
state((d, e) => { e.finished = false; e.data_checked = false; d.gwFixtures[cur].forEach((f) => { f[3] = 1; f[8] = 1; }); d.picksFinal[cur] = 1; });
const anyCur = ds.managers.some((m) => C.badges(ds, m.id).some((b) => b.gws.indexOf(cur) !== -1));
chk(!anyCur, "no badge or blot names the unchecked week");
console.log(fails ? "\nFAILS: " + fails : "\na week counts when its points stand");
process.exit(fails ? 1 : 0);
