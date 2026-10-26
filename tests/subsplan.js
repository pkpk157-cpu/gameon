/* When the updater reads squads again. FPL makes its automatic substitutions
 * when it signs a gameweek off, not when the bonus lands: GW6, GW7 and GW8
 * were each read with every bonus in and still held the eleven as picked. So
 * the squads are read again once FPL flags the week finished and checked, and
 * no read taken before that is ever reused. No network: the decision is a
 * pure function. */
const { squadPlan } = require("../scripts/fetch-data.js");
let fails = 0;
const chk = (ok, m, x) => { console.log((ok ? "  ok   " : "  FAIL ") + m + (x ? "  " + x : "")); if (!ok) fails++; };
const plan = (o) => squadPlan(Object.assign({ cached: true, settled: false, prevFinal: 0 }, o));

chk(plan({ cached: false }) === "full", "nothing cached: read everything");
chk(plan({}) === "live", "in play, squads cached: points only");
chk(plan({ allFinished: true }) === "live", "every match's bonus in, FPL not signed off: no subs yet, points only");
chk(plan({ allFinished: true, prevFinal: 1 }) === "live", "an old bonus-time read: still points only until FPL signs off");
chk(plan({ settled: true, prevFinal: 1 }) === "full", "FPL signed off after a bonus-time read: read the squads with the subs");
chk(plan({ settled: true, prevFinal: 0 }) === "full", "FPL signed off, nothing read since: read");
chk(plan({ settled: true, prevFinal: 2 }) === "reuse", "read after FPL signed off: reuse, nothing can change");
chk(plan({ settled: true, cached: false, prevFinal: 2 }) === "full", "settled but the cache is thin: read");
chk(plan({ prevFinal: 2 }) === "live", "a sign-off taken back after the final read: points only, the stored squads stand");
console.log(fails ? "\nFAILS: " + fails : "\nthe subs are read when FPL makes them");
process.exit(fails ? 1 : 0);
