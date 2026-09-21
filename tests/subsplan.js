/* When the updater reads squads again. FPL makes its automatic substitutions
 * once every match's bonus is in, hours before it flags the gameweek finished
 * and checked; the updater must read the squads at that first moment, read
 * them once more when FPL signs off, and never reuse a read taken before the
 * subs were in. No network: the decision is a pure function. */
const { squadPlan } = require("../scripts/fetch-data.js");
let fails = 0;
const chk = (ok, m, x) => { console.log((ok ? "  ok   " : "  FAIL ") + m + (x ? "  " + x : "")); if (!ok) fails++; };
const plan = (o) => squadPlan(Object.assign({ cached: true, settled: false, prevFinal: 0, allFinished: false }, o));

chk(plan({ cached: false }) === "full", "nothing cached: read everything");
chk(plan({}) === "live", "in play, squads cached: points only");
chk(plan({ allFinished: true }) === "full", "every match's bonus in, not yet read since: read the squads for the subs");
chk(plan({ allFinished: true, prevFinal: 1 }) === "live", "subs already stored: back to points only until FPL signs off");
chk(plan({ settled: true, prevFinal: 1 }) === "full", "FPL signed off after a subs read: read once more for the final word");
chk(plan({ settled: true, prevFinal: 0 }) === "full", "FPL signed off with no subs read at all: read");
chk(plan({ settled: true, prevFinal: 2 }) === "reuse", "read after FPL signed off: reuse, nothing can change");
chk(plan({ settled: true, cached: false, prevFinal: 2 }) === "full", "settled but the cache is thin: read");
chk(plan({ allFinished: false, prevFinal: 1 }) === "live", "a flag taken back after a subs read: points only, the stored squads stand");
console.log(fails ? "\nFAILS: " + fails : "\nthe subs are read when FPL makes them");
process.exit(fails ? 1 : 0);
