const GOENV = require("./lib/env.js");
/* The classic table must now follow the league's own rule: months won separate
   tied managers; anyone still level shares the place and splits that money. */
const fs = require("fs"), vm = require("vm");
const APP = GOENV.APP;

function load() {
  const s = { window: {}, console,
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    document: { documentElement: { setAttribute() {} } } };
  vm.createContext(s);
  vm.runInContext(fs.readFileSync(APP + "/config.js", "utf8"), s);
  s.window.GO_STORE = { config: () => s.window.GO_DEFAULT_CONFIG, overrides: () => ({}) };
  vm.runInContext(fs.readFileSync(APP + "/compute.js", "utf8"), s);
  return { C: s.window.GO_COMPUTE, CFG: s.window.GO_DEFAULT_CONFIG };
}

let fails = 0;
const chk = (n, ok, d) => { if (!ok) { fails++; console.log("   FAIL " + n + (d ? " — " + d : "")); } };

// ---- the real, current league ---------------------------------------------
{
  const { C, CFG } = load();
  const ds = JSON.parse(fs.readFileSync(APP + "/data.json", "utf8")).dataset;
  const rows = C.classic(ds);

  console.log("CURRENT LEAGUE — places now shared:");
  const seen = new Set();
  let shown = 0;
  rows.forEach((r) => {
    if (r.tiedWith > 1 && !seen.has(r.computedRank)) {
      seen.add(r.computedRank);
      const g = rows.filter((x) => x.computedRank === r.computedRank);
      if (shown++ < 5) {
        console.log("  #" + r.computedRank + " (x" + g.length + ") on " + r.total + " pts: " +
          g.map((x) => x.entryName.slice(0, 16)).join(", ") + "  →  Rs" + r.prize + " each");
      }
    }
  });
  console.log("  " + seen.size + " shared places in total");

  // the pot must not change
  const before = rows.reduce((s, r, i) => s + C.classicPrize(i + 1), 0);
  const after = rows.reduce((s, r) => s + (r.prize || 0), 0);
  chk("prize pot unchanged", Math.abs(before - after) < 0.01, "Rs" + before + " -> Rs" + after);
  console.log("  pot: Rs" + before + " by rank, Rs" + Math.round(after) + " after sharing");

  // everyone level on points and months won must be paid the same
  let mismatch = 0;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].total === rows[i - 1].total && rows[i].monthWins === rows[i - 1].monthWins &&
        Math.abs(rows[i].prize - rows[i - 1].prize) > 1) mismatch++;
  }
  chk("level managers are paid the same", mismatch === 0, mismatch + " pairs differ");

  // and share a position
  let posBad = 0;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].total === rows[i - 1].total && rows[i].monthWins === rows[i - 1].monthWins &&
        rows[i].computedRank !== rows[i - 1].computedRank) posBad++;
  }
  chk("level managers share a position", posBad === 0, posBad + " pairs differ");

  // positions must still ascend and start at 1
  chk("first place is #1", rows[0].computedRank === 1);
  let desc = true;
  for (let i = 1; i < rows.length; i++) if (rows[i].computedRank < rows[i - 1].computedRank) desc = false;
  chk("positions never go backwards", desc);

  // the worked example from the rules
  const g78 = rows.filter((r) => r.total === 78);
  if (g78.length > 1) {
    const want = g78.reduce((s, r) => s + C.classicPrize(r.order), 0) / g78.length;
    console.log("  worked example: " + g78.length + " on 78 pts, places " +
      g78.map((r) => r.order).join("/") + " → " + g78.map((r) => "Rs" + r.prize).join(", ") +
      "  (average of those places = Rs" + Math.round(want) + ")");
    chk("78-point group gets the average", Math.abs(g78[0].prize - want) < 0.01);
  }
}

// ---- months won must actually break a tie ---------------------------------
{
  const { C, CFG } = load();
  const ds = JSON.parse(fs.readFileSync(APP + "/data.json", "utf8")).dataset;
  // The app derives a month's gameweeks from the real deadline dates rather
  // than the configured list, so ask it which ones this month actually spans.
  const month = CFG.months[0];
  ds.bootstrap.events.forEach((e) => {
    e.finished = e.id <= 8; e.data_checked = e.id <= 8;
    e.is_current = e.id === 8; e.is_next = e.id === 9;
  });
  const IN = (C.monthly(ds).find((x) => x.key === month.key) || {}).gws || month.gws;
  const ALL = [];
  for (let g = 1; g <= 8; g++) ALL.push(g);
  const OUT = ALL.filter((g) => IN.indexOf(g) === -1);
  if (!OUT.length) { console.log("\n(the month spans every settled gameweek; widening)"); }

  // A and B score identically everywhere except one swap: A takes 20 more in a
  // gameweek inside the month and 20 fewer outside it, B the reverse. Same
  // season total, different months won — exactly the case the rule is for.
  const A = ds.managers[0], B = ds.managers[1];   // ds.managers[2] is the runaway
  ds.managers.forEach((m, i) => {
    const h = {};
    let t = 0;
    ALL.forEach((g) => {
      let pts = 20 + (i % 10);                       // everyone else, well behind
      // One runaway manager wins every month except the one under test, so the
      // swap below cannot hand B a month win somewhere else.
      if (i === 2) pts = IN.indexOf(g) !== -1 ? 5 : 500;
      if (m.id === A.id || m.id === B.id) {
        pts = 70;
        if (m.id === A.id && g === IN[0]) pts += 20;
        if (m.id === A.id && g === OUT[0]) pts -= 20;
      }
      t += pts;
      h[g] = { p: pts, h: 0, b: 0, t: t };
    });
    ds.history[m.id] = h;
    m.total = t;
  });

  const mo = C.monthly(ds);
  const m0 = mo.find((x) => x.key === month.key);
  const wins = C.monthlyWins(ds);
  const rows = C.classic(ds);
  const rA = rows.find((r) => r.id === A.id), rB = rows.find((r) => r.id === B.id);

  console.log("\nMONTHS WON AS A TIE-BREAK:");
  console.log("  '" + month.key + "' spans gws " + IN.join(",") + ", rest of season " +
              (OUT.join(",") || "none") + "; complete: " + (m0 && m0.complete) +
              ", won with " + (m0 && m0.rows[0] ? m0.rows[0].score : "?"));
  console.log("  " + A.entryName.slice(0, 18) + ": season " + A.total + ", " + (wins[A.id] || 0) +
              " month win(s) -> #" + rA.computedRank + ", Rs" + rA.prize);
  console.log("  " + B.entryName.slice(0, 18) + ": season " + B.total + ", " + (wins[B.id] || 0) +
              " month win(s) -> #" + rB.computedRank + ", Rs" + rB.prize);

  chk("the month completed", !!(m0 && m0.complete));
  chk("they are level on the season", A.total === B.total, A.total + " vs " + B.total);
  chk("only one of them won the month", (wins[A.id] || 0) !== (wins[B.id] || 0),
      (wins[A.id] || 0) + " vs " + (wins[B.id] || 0));
  chk("months won separated them", rA.computedRank !== rB.computedRank,
      "both still at #" + rA.computedRank);
  chk("the month winner placed higher", rA.computedRank < rB.computedRank);
  chk("they no longer share a prize", rA.prize !== rB.prize || rA.tiedWith <= 1);
}

console.log("\n" + (fails ? fails + " FAILURES" : "the classic table follows the league's tie rule"));
