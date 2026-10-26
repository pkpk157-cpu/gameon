/* When the updater reads squads again. FPL makes its automatic substitutions
 * some hours after the bonus lands and before it signs the week off, with no
 * flag to say so: GW8 read at bonus time still held the eleven as picked. So
 * from the bonus on the updater asks about a few squads that need a sub, reads
 * every squad the moment FPL has made them (mark 3), reads once more at the
 * sign-off (mark 2), and never reuses a read taken before the subs were in.
 * No network: the decisions are pure functions. */
const { squadPlan, subsCandidates, subsShown } = require("../scripts/fetch-data.js");
let fails = 0;
const chk = (ok, m, x) => { console.log((ok ? "  ok   " : "  FAIL ") + m + (x ? "  " + x : "")); if (!ok) fails++; };
const plan = (o) => squadPlan(Object.assign({ cached: true, settled: false, prevFinal: 0, subsSeen: false }, o));

chk(plan({ cached: false }) === "full", "nothing cached: read everything");
chk(plan({}) === "live", "in play, squads cached: points only");
chk(plan({ subsSeen: false, prevFinal: 1 }) === "live", "bonus in, FPL has not made its subs: points only");
chk(plan({ subsSeen: true }) === "full", "FPL has made its subs: read every squad");
chk(plan({ subsSeen: true, prevFinal: 1 }) === "full", "an old bonus-time read is no excuse: read every squad");
chk(plan({ subsSeen: true, prevFinal: 3 }) === "live", "subs already stored: points only until FPL signs off");
chk(plan({ settled: true, prevFinal: 3 }) === "full", "FPL signed off after the subs read: read once more for the final word");
chk(plan({ settled: true, prevFinal: 1 }) === "full", "FPL signed off after a bonus-time read: read");
chk(plan({ settled: true, prevFinal: 0 }) === "full", "FPL signed off, nothing read since: read");
chk(plan({ settled: true, prevFinal: 2 }) === "reuse", "read after FPL signed off: reuse, nothing can change");
chk(plan({ settled: true, cached: false, prevFinal: 2 }) === "full", "settled but the cache is thin: read");
chk(plan({ prevFinal: 2 }) === "live", "a sign-off taken back after the final read: points only, the stored squads stand");

// which squads are worth asking about
const sq = (p, c) => ({ c: c || "", p });
const XI = () => Array.from({ length: 15 }, (_, i) => [i + 1, i < 11 ? (i === 10 ? 2 : 1) : 0, i === 10 ? 1 : 0, 0]);
const mins = {}; for (let i = 1; i <= 15; i++) mins[i] = 90;
const noShow = Object.assign({}, mins, { 5: 0 });
const squads = { a: sq(XI()), b: sq(XI()), c: sq(XI(), "bboost") };
chk(subsCandidates(squads, mins, 6).length === 0, "everyone played: nobody to ask about");
chk(JSON.stringify(subsCandidates(squads, noShow, 6)) === '["a","b"]', "a starter blanked and the bench played: asked, Bench Boost left out",
    JSON.stringify(subsCandidates(squads, noShow, 6)));
chk(subsCandidates(squads, noShow, 1).length === 1, "never more than asked for");
const benchIdle = Object.assign({}, noShow, { 12: 0, 13: 0, 14: 0, 15: 0 });
chk(subsCandidates(squads, benchIdle, 6).length === 0, "nobody on the bench played: no sub to make, nobody asked");

// whether FPL's answer holds subs
const fpl = (mults, subs) => ({ automatic_subs: subs || [], picks: XI().map((x, i) => ({ element: x[0], multiplier: mults[i] })) });
const same = XI().map((x) => x[1]);
const swapped = same.slice(); swapped[4] = 0; swapped[11] = 1;
chk(!subsShown(squads.a, fpl(same)), "the eleven as picked: no subs yet");
chk(subsShown(squads.a, fpl(swapped)), "a bench player now counts: subs made");
chk(subsShown(squads.a, fpl(same, [{ element_in: 12, element_out: 5 }])), "FPL lists a substitution: subs made");
chk(!subsShown(squads.a, null), "no answer: nothing seen");
console.log(fails ? "\nFAILS: " + fails : "\nthe subs are read when FPL makes them");
process.exit(fails ? 1 : 0);
