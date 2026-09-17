const GOENV = require("./lib/env.js");
/* The league's Last Manager Standing tie-breakers, in order:
   score, bench points, goals, clean sheets, assists in the playing XI.
   Anyone still level after all four carries the tie to the next gameweek. */
const fs = require("fs"), vm = require("vm");
const APP = GOENV.APP;
function load() {
  const s = { window: {}, console, localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
              document: { documentElement: { setAttribute() {} } } };
  vm.createContext(s);
  vm.runInContext(fs.readFileSync(APP + "/config.js", "utf8"), s);
  s.window.GO_STORE = { config: () => s.window.GO_DEFAULT_CONFIG, overrides: () => ({}) };
  vm.runInContext(fs.readFileSync(APP + "/compute.js", "utf8"), s);
  return s.window.GO_COMPUTE;
}
const C = load();
let fails = 0;
const chk = (n, ok, d) => { if (!ok) { fails++; console.log("   FAIL " + n + (d ? " — " + d : "")); } };

// two managers, identical except for the one stat under test
function build(aStats, bStats, opts) {
  opts = opts || {};
  // A holds players 1-11 (bench 12-15), B holds 21-31 (bench 32-35)
  const mk = (base) => ({ p: Array.from({ length: 11 }, (_, i) => [base + i, i === 0 ? 2 : 1])
    .concat(Array.from({ length: 4 }, (_, i) => [base + 11 + i, 0])) });
  const els = {};
  for (let i = 1; i <= 40; i++) els[i] = ["P" + i, 3, "AAA", 50, 5];
  const put = (o, base, s) => {
    // spread the count across the XI, never on the captain unless asked
    let left = s || 0, at = base + 1;
    while (left > 0 && at < base + 11) { o[at] = (o[at] || 0) + 1; left--; at++; }
  };
  const g = {}, c = {}, a = {};
  put(g, 1, aStats.goals); put(g, 21, bStats.goals);
  put(c, 1, aStats.cs);    put(c, 21, bStats.cs);
  put(a, 1, aStats.assists); put(a, 21, bStats.assists);
  return {
    picksV: 2, pitchGw: 1,
    bootstrap: { events: [{ id: 1, name: "GW1", is_current: true, is_next: false,
      finished: true, data_checked: true, deadline_time: "2026-08-14T17:30:00Z" }] },
    elements: els,
    managers: [{ id: 1, entryName: "A", playerName: "a", rank: 1, total: 50, eventTotal: 50 },
               { id: 2, entryName: "B", playerName: "b", rank: 2, total: 50, eventTotal: 50 }],
    history: { 1: { 1: { p: 50, h: 0, b: opts.aBench || 0, t: 50 } },
               2: { 1: { p: 50, h: 0, b: opts.bBench || 0, t: 50 } } },
    picks: { 1: { 1: mk(1), 2: mk(21) } },
    picksFinal: opts.notFinal ? {} : { 1: 1 },
    livePoints: { 1: {} },
    liveStats: { 1: { g: g, c: c, a: a } }
  };
}
const none = { goals: 0, cs: 0, assists: 0 };
const worse = (ds) => C.lmsTieBreak(ds, 1, 2, [1]);   // < 0 means A is worse

// --- each tie-breaker in turn --------------------------------------------
let ds = build({ goals: 1, cs: 0, assists: 0 }, none);
console.log("A has a goal, B has none          -> " + (worse(ds) > 0 ? "A survives" : "A goes out"));
chk("more goals survives", worse(ds) > 0, String(worse(ds)));

ds = build({ goals: 2, cs: 0, assists: 9 }, { goals: 3, cs: 9, assists: 0 });
console.log("A 2 goals, B 3 goals              -> " + (worse(ds) > 0 ? "A survives" : "A goes out"));
chk("goals outrank clean sheets and assists", worse(ds) < 0, String(worse(ds)));

ds = build({ goals: 2, cs: 3, assists: 0 }, { goals: 2, cs: 1, assists: 9 });
console.log("goals level, A 3 CS to B's 1      -> " + (worse(ds) > 0 ? "A survives" : "A goes out"));
chk("clean sheets break a goals tie", worse(ds) > 0, String(worse(ds)));

ds = build({ goals: 2, cs: 2, assists: 4 }, { goals: 2, cs: 2, assists: 1 });
console.log("goals and CS level, A 4 assists   -> " + (worse(ds) > 0 ? "A survives" : "A goes out"));
chk("assists break a goals-and-clean-sheets tie", worse(ds) > 0, String(worse(ds)));

ds = build({ goals: 2, cs: 2, assists: 2 }, { goals: 2, cs: 2, assists: 2 });
console.log("level on all four                 -> " + (worse(ds) === 0 ? "still tied" : "separated"));
chk("a complete tie stays tied, to be carried forward", worse(ds) === 0, String(worse(ds)));

// --- what counts, and what does not --------------------------------------
ds = build(none, none);
ds.liveStats[1].g[12] = 5;                     // five goals, but he was benched
console.log("\nfive goals from a benched player  -> " + (worse(ds) === 0 ? "ignored" : "COUNTED"));
chk("a benched player's goals do not count", worse(ds) === 0, String(worse(ds)));

ds = build(none, none);
ds.liveStats[1].g[1] = 1;                      // the captain scores
const capt = C.xiStats(ds, 1, [1]);
console.log("the captain scores once           -> counted as " + capt.goals);
chk("a captain's goal counts once, not twice", capt.goals === 1, String(capt.goals));

// bench boost: everyone is playing, so everyone's goals count
ds = build(none, none);
ds.picks[1][1].p = ds.picks[1][1].p.map((pk) => [pk[0], pk[1] || 1]);
ds.liveStats[1].g[12] = 2;
console.log("under bench boost, all fifteen    -> " + C.xiStats(ds, 1, [1]).goals + " goals");
chk("bench boost counts the whole squad", C.xiStats(ds, 1, [1]).goals === 2);

// --- the eleven who eventually played, not the eleven picked --------------
ds = build({ goals: 3, cs: 0, assists: 0 }, none, { notFinal: true });
console.log("\nfinished, but squads not yet re-read after substitutions -> " +
  (worse(ds) === 0 ? "left tied" : "SEPARATED"));
chk("a tie is not broken on the picked eleven", worse(ds) === 0, String(worse(ds)));
ds = build({ goals: 3, cs: 0, assists: 0 }, none);
chk("and is broken once the played eleven is known", worse(ds) > 0, String(worse(ds)));

// --- missing data must not invent a winner -------------------------------
ds = build({ goals: 3, cs: 0, assists: 0 }, none);
delete ds.liveStats;
console.log("\nno stats recorded for that gameweek -> " + (worse(ds) === 0 ? "left tied" : "separated"));
chk("without the stats nobody is separated", worse(ds) === 0, String(worse(ds)));

ds = build({ goals: 3, cs: 0, assists: 0 }, none);
delete ds.picks[1][2];
chk("a missing squad does not crash", typeof worse(ds) === "number");

// --- and the elimination actually uses it ---------------------------------
// Ten managers dead level on score and bench, separated only by goals. The
// gameweek takes eight, so the two with the most goals should be left standing.
(function () {
  const els = {};
  for (let i = 1; i <= 200; i++) els[i] = ["P" + i, 3, "AAA", 50, 5];
  const managers = [], history = {}, picks = {}, g = {};
  for (let m = 0; m < 10; m++) {
    const id = m + 1, base = 1 + m * 15;
    managers.push({ id: id, entryName: "M" + id + " (" + m + " goals)", playerName: "p" + id,
                    rank: id, total: 50, eventTotal: 50 });
    history[id] = { 1: { p: 50, h: 0, b: 0, t: 50 } };
    picks[id] = { p: Array.from({ length: 11 }, (_, i) => [base + i, 1])
      .concat(Array.from({ length: 4 }, (_, i) => [base + 11 + i, 0])) };
    for (let k = 0; k < m; k++) g[base + k] = 1;      // manager m scores m goals
  }
  const ds2 = {
    picksV: 2, pitchGw: 1,
    bootstrap: { events: [{ id: 1, name: "GW1", is_current: true, is_next: false,
      finished: true, data_checked: true, deadline_time: "2026-08-14T17:30:00Z" }] },
    elements: els, managers: managers, history: history,
    picks: { 1: picks }, picksFinal: { 1: 1 }, livePoints: { 1: {} },
    liveStats: { 1: { g: g, c: {}, a: {} } }
  };
  const lms = C.lms(ds2);
  const gw1 = (lms.perGw || [])[0] || {};
  const gone = (gw1.eliminated || []).map((e) => e.name).sort();
  const left = managers.filter((m) => !gone.includes(m.entryName)).map((m) => m.entryName);
  console.log("\nten level managers, eight eliminated:");
  console.log("   still standing: " + JSON.stringify(left));
  chk("eight are eliminated", gone.length === 8, String(gone.length));
  chk("the two with the most goals survive",
      left.length === 2 && left.every((n) => /\(9 goals\)|\(8 goals\)/.test(n)),
      JSON.stringify(left));
})();

// --- a tie the rules cannot break carries forward -------------------------
(function () {
  // eleven managers, all identical in every respect: the gameweek wants eight
  // gone but cannot separate anybody, so nobody goes and the eight are owed
  const els = {};
  for (let i = 1; i <= 400; i++) els[i] = ["P" + i, 3, "AAA", 50, 5];
  const managers = [], history = {}, picks1 = {}, picks2 = {}, g2 = {};
  for (let m = 0; m < 11; m++) {
    const id = m + 1, base = 1 + m * 15;
    managers.push({ id: id, entryName: "T" + id, playerName: "p" + id, rank: id, total: 50, eventTotal: 50 });
    history[id] = { 1: { p: 50, h: 0, b: 0, t: 50 }, 2: { p: 50, h: 0, b: 0, t: 100 } };
    const squad = { p: Array.from({ length: 11 }, (_, i) => [base + i, 1])
      .concat(Array.from({ length: 4 }, (_, i) => [base + 11 + i, 0])) };
    picks1[id] = squad; picks2[id] = squad;
    for (let k = 0; k < m; k++) g2[base + k] = 1;    // GW2 separates them
  }
  const ds3 = {
    picksV: 2, pitchGw: 2,
    bootstrap: { events: [
      { id: 1, name: "GW1", is_current: false, finished: true, data_checked: true, deadline_time: "2026-08-14T17:30:00Z" },
      { id: 2, name: "GW2", is_current: true, finished: true, data_checked: true, deadline_time: "2026-08-21T17:30:00Z" }] },
    elements: els, managers: managers, history: history,
    picks: { 1: picks1, 2: picks2 }, picksFinal: { 1: 1, 2: 1 },
    livePoints: { 1: {}, 2: {} },
    liveStats: { 1: { g: {}, c: {}, a: {} }, 2: { g: g2, c: {}, a: {} } }
  };
  const lms = C.lms(ds3);
  const g1 = (lms.perGw || [])[0] || {}, gw2 = (lms.perGw || [])[1] || {};
  console.log("\neleven managers the rules cannot separate in GW1:");
  console.log("   GW1 wanted " + g1.need + ", eliminated " + (g1.eliminated || []).length +
    (g1.unresolved ? "  (tie among " + g1.unresolved.managers.length + " for " +
      g1.unresolved.places + " places)" : ""));
  console.log("   GW2 wanted " + gw2.need + ", eliminated " + (gw2.eliminated || []).length);
  chk("nobody is eliminated on a tie the rules cannot break",
      (g1.eliminated || []).length === 0, String((g1.eliminated || []).length));
  chk("the unbreakable tie is reported, not hidden", !!g1.unresolved);
  // GW2 owes 8 of its own plus the 8 carried = 16, but only 11 are left, so it
  // takes 10 and leaves the last manager standing
  chk("next gameweek owes the carried places as well as its own",
      gw2.need === 10, "acted on " + gw2.need);
  chk("and settles them once the managers can be separated",
      (gw2.eliminated || []).length === 10, String((gw2.eliminated || []).length));
  chk("but never takes the last manager standing", gw2.eog === 1, String(gw2.eog));
  console.log("   left standing after GW2: " + gw2.eog);
})();

console.log("\n" + (fails ? fails + " FAILURES"
  : "the tie-breakers run in the league's order and stop where the rules stop"));
