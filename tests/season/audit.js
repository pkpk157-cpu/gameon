/* The season, checked. Every state the simulator produces — every gameweek
   from six to thirty-eight at every phase — is run through every compute
   entry point, and what comes back is checked against arithmetic done here
   from the raw rows: totals, ranks, the months, the eliminations, the
   promotions, the groups, the knockouts, the money, the badges, the status
   page and Theo's lines. Nothing may throw, and nothing may carry a NaN,
   an Infinity or the word "undefined" onto a page.

   node tests/season/audit.js [from] [to]      default 6 38
   node tests/season/audit.js battery          every gameweek's checked end, and
                                               every phase of the pivotal weeks */
"use strict";
const fs = require("fs"), vm = require("vm"), path = require("path");
const GOENV = require("../lib/env.js");
const sim = require("./sim.js");

const APP = GOENV.APP;
const BATTERY = process.argv[2] === "battery";
const FROM = BATTERY ? 6 : +(process.argv[2] || 6), TO = BATTERY ? sim.LAST : +(process.argv[3] || sim.LAST);
// the weeks where something changes hands: a mini-season ends, the draw is
// made, a double and a blank gameweek, the first knockout round, the final
const PIVOTAL = { 6: 1, 12: 1, 13: 1, 24: 1, 29: 1, 30: 1, 38: 1 };
let fails = 0, checks = 0;
const seenFail = {};
function fail(state, m, x) {
  checks++;
  const key = m;
  if (!seenFail[key]) {
    seenFail[key] = 1;
    console.log("  FAIL " + state + " :: " + m + (x !== undefined ? "  " + String(x).slice(0, 300) : ""));
  }
  fails++;
}
function chk(state, ok, m, x) { if (ok) checks++; else fail(state, m, x); }

/* ---- the app's arithmetic, loaded with a clock we control ---------------- */
function loadApp() {
  const sandbox = {
    window: null, console, Math, JSON, Object, Array, String, Number, Boolean, isNaN, isFinite,
    parseInt, parseFloat, RegExp, Error, TypeError, RangeError, Map, Set, Promise,
    setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
    requestAnimationFrame: () => 0,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: { body: null, documentElement: {}, addEventListener() {}, querySelector: () => null, getElementById: () => null },
    navigator: { userAgent: "audit" }
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  // the clock: Date.now() and new Date() read our moment, everything else is untouched
  vm.runInContext(`
    (function () {
      var Real = Date; var OFF = 0;
      function D() {
        if (!(this instanceof D)) return Real();
        var a = arguments;
        if (!a.length) return new Real(Real.now() + OFF);
        var d = new (Function.prototype.bind.apply(Real, [null].concat(Array.prototype.slice.call(a))))();
        return d;
      }
      D.prototype = Real.prototype;
      D.now = function () { return Real.now() + OFF; };
      D.parse = Real.parse; D.UTC = Real.UTC;
      window.Date = D;
      window.__setNow = function (ms) { OFF = ms - Real.now(); };
    })();`, sandbox, { filename: "clock.js" });
  vm.runInContext(fs.readFileSync(path.join(APP, "config.js"), "utf8"), sandbox, { filename: "config.js" });
  const cfg = sandbox.GO_DEFAULT_CONFIG;
  let current = null;
  sandbox.GO_STORE = { config: () => cfg, overrides: () => ({}), dataset: () => current };
  vm.runInContext(fs.readFileSync(path.join(APP, "compute.js"), "utf8"), sandbox, { filename: "compute.js" });
  vm.runInContext(fs.readFileSync(path.join(APP, "theo.js"), "utf8"), sandbox, { filename: "theo.js" });
  return {
    C: sandbox.GO_COMPUTE, T: sandbox.GO_THEO, cfg,
    use: (ds, now) => { current = ds; sandbox.__setNow(now); }
  };
}

/* ---- nothing broken may reach a page ------------------------------------ */
function scan(v, where, out, depth) {
  if (depth > 12 || out.length > 5) return;
  if (typeof v === "number") { if (!isFinite(v)) out.push(where + " = " + v); return; }
  if (typeof v === "string") { if (/\bNaN\b|\bundefined\b|\[object Object\]/.test(v)) out.push(where + " = " + JSON.stringify(v.slice(0, 80))); return; }
  if (!v || typeof v !== "object") return;
  if (Array.isArray(v)) { for (let i = 0; i < v.length && i < 400; i++) scan(v[i], where + "[" + i + "]", out, depth + 1); return; }
  for (const k of Object.keys(v)) scan(v[k], where + "." + k, out, depth + 1);
}
function call(state, name, fn) {
  try {
    const v = fn();
    const bad = []; scan(v, name, bad, 0);
    chk(state, !bad.length, name + " carries nothing broken", bad.join(" | "));
    return v;
  } catch (e) {
    fail(state, name + " threw", e && (e.stack || e.message));
    return undefined;
  }
}

/* ---- the checks ---------------------------------------------------------- */
function audit(app, st) {
  const { C, T, cfg } = app;
  const ds = st.dataset, gw = st.gw, phase = st.phase;
  const label = "GW" + gw + " " + phase;
  app.use(ds, st.now);
  const ids = ds.managers.map((m) => m.id);
  const net = (id, g) => { const r = (ds.history[id] || {})[g]; return r && typeof r.p === "number" ? r.p - (r.h || 0) : null; };
  const finishedExp = phase === "pre" || phase === "final" ? (phase === "pre" ? gw - 1 : gw) : gw - 1;
  const cur = phase === "pre" ? gw - 1 : gw;
  const liveExp = (phase === "pre" || phase === "final") ? null : gw;

  chk(label, C._hitsAlreadyOff(ds) === false, "hits are known to be still on the raw points");

  /* the calendar */
  const fin = call(label, "finishedGws", () => C.finishedGws(ds));
  chk(label, fin && fin.length === finishedExp && fin[fin.length - 1] === (finishedExp || undefined), "finished gameweeks are " + finishedExp, fin && fin.length);
  const scored = call(label, "scoredGws", () => C.scoredGws(ds));
  const scoredExp = finishedExp + ((phase === "bonus") ? 1 : 0);
  chk(label, scored && scored.length === scoredExp, "scored gameweeks are " + scoredExp, scored && scored.join(","));
  chk(label, C.liveGwId(ds) === liveExp, "live gameweek is " + liveExp, C.liveGwId(ds));
  chk(label, C.currentGw(ds) === cur, "current gameweek is " + cur, C.currentGw(ds));
  const nd = call(label, "nextDeadline", () => C.nextDeadline(ds));
  const ndExp = phase === "pre" ? gw : (gw < 38 ? gw + 1 : null);
  chk(label, (nd ? nd.gw : null) === ndExp && (!nd || nd.msLeft > 0), "next deadline is GW" + ndExp, nd && nd.gw + " in " + nd.msLeft);

  /* classic */
  const cl = call(label, "classic", () => C.classic(ds));
  if (cl) {
    chk(label, cl.length === ids.length, "classic has every manager", cl.length);
    let ok = true, ranksOk = true, prize = 0, last = 0;
    cl.forEach((r, i) => {
      const H = ds.history[r.id] || {};
      const prevT = (H[gw - 1] || {}).t || 0;
      let expTotal, expEv;
      if (liveExp) {
        const sq = ds.picks[gw][r.id], lp = ds.livePoints[gw], pb = (ds.liveBonus || {})[gw] || {};
        let s = 0; sq.p.forEach((x) => { s += ((lp[x[0]] || 0) + (pb[x[0]] || 0)) * x[1]; });
        expEv = s - (H[gw].h || 0); expTotal = prevT + expEv;
      } else { expTotal = H[cur].t; expEv = net(r.id, cur); }
      if (r.total !== expTotal || r.eventTotal !== expEv) { ok = false; }
      if (r.computedRank < last || r.computedRank > i + 1) ranksOk = false;
      last = r.computedRank; prize += r.prize || 0;
    });
    chk(label, ok, "classic totals and gameweek points are the net arithmetic");
    chk(label, ranksOk, "classic ranks are non-decreasing and never ahead of the row");
    const pool = Object.values(cfg.classicPrizes.exact).reduce((a, b) => a + b, 0) +
      cfg.classicPrizes.ranges.reduce((a, r) => a + r.amount * (r.to - r.from + 1), 0);
    chk(label, prize === pool, "classic XP adds up to the pool", prize + " vs " + pool);
    for (let i = 1; i < cl.length; i++) chk(label, cl[i].total <= cl[i - 1].total, "classic is ordered on total");
  }

  /* monthly */
  const months = call(label, "monthly", () => C.monthly(ds));
  if (months) {
    const finSet = {}; fin.forEach((g) => { finSet[g] = 1; });
    months.forEach((m) => {
      const played = m.gws.filter((g) => finSet[g] || g === liveExp);
      chk(label, m.played === played.length, m.key + " counts the played gameweeks", m.played + " vs " + played.length);
      chk(label, m.complete === (m.gws.length > 0 && m.gws.every((g) => finSet[g])), m.key + " complete flag");
      if (!played.length) { chk(label, m.rows.length === 0, m.key + " has no rows before it starts"); return; }
      let ok = true;
      m.rows.forEach((r) => {
        let s = 0; played.forEach((g) => { s += (C.gwScore(ds, r.id, g) || 0); });
        if (r.score !== s) ok = false;
      });
      chk(label, ok, m.key + " scores are the sum of the net gameweek scores");
      const pool = Object.values(m.prizes).reduce((a, b) => a + b, 0);
      chk(label, m.rows.reduce((a, r) => a + r.prize, 0) === pool, m.key + " pays its pool");
      for (let i = 1; i < m.rows.length; i++) chk(label, m.rows[i].score <= m.rows[i - 1].score, m.key + " ordered on score");
    });
  }

  /* last manager standing */
  const lms = call(label, "lms", () => C.lms(ds));
  if (lms) {
    let out = 0, carry = 0, ok = true;
    lms.grid.forEach((g) => {
      if (g.eliminated === null) return;
      const want = (cfg.lms.elimPerGw[g.gw] || 0) + carry;
      const need = Math.max(0, Math.min(want, g.sog - 1));
      if (g.expected !== need) { ok = false; }
      if (g.sog - g.eliminated !== g.eog) ok = false;
      if (g.eliminated > need) ok = false;
      carry = need - g.eliminated; out += g.eliminated;
    });
    chk(label, ok, "the elimination grid follows the rules week by week");
    chk(label, lms.survivorsCount === ids.length - out, "survivors are the managers not eliminated", lms.survivorsCount);
    chk(label, lms.perGw.length === fin.length, "one eliminations table per finished gameweek");
    // nobody eliminated outscored a survivor that week
    lms.perGw.forEach((w) => {
      const outs = w.table.filter((r) => r.eliminated), ins = w.table.filter((r) => !r.eliminated);
      if (!outs.length || !ins.length) return;
      const maxOut = Math.max.apply(null, outs.map((r) => r.score)), minIn = Math.min.apply(null, ins.map((r) => r.score));
      chk(label, maxOut <= minIn, "GW" + w.gw + " eliminated nobody above a survivor", maxOut + " > " + minIn);
      if (w.unresolved) chk(label, w.eliminated.length < w.need, "GW" + w.gw + " an unbroken tie leaves places open");
    });
    if (gw >= 10 && (phase === "final" || gw > 10)) {
      const w10 = lms.perGw.find((w) => w.gw === 10);
      chk(label, !!(w10 && (w10.unresolved || w10.eliminated.length < w10.need || lms.grid.find((g) => g.gw === 10).carried > 0)) || !!(w10 && w10.eliminated.length === w10.need),
          "GW10 handles its forced tie");
    }
    if (gw === 38 && phase === "final") {
      chk(label, lms.survivorsCount === 1 && !!lms.champion, "one Last Manager Standing at the end", lms.survivorsCount);
      chk(label, !!(lms.podium && lms.podium.length === 3), "a podium of three at the end", JSON.stringify(lms.podium));
    } else {
      chk(label, lms.survivorsCount > 1, "more than one manager alive before the end");
    }
    if (liveExp) chk(label, !!lms.live && lms.live.gw === gw && lms.live.table.length === lms.survivorsCount, "the live table lists every survivor");
    else chk(label, !lms.live, "no live table between gameweeks");
  }

  /* pyramid */
  const py = call(label, "pyramid", () => C.pyramid(ds));
  if (py) {
    const p = cfg.pyramid;
    py.seasons.forEach((se, si) => {
      const seen = {}; let n = 0;
      se.divisions.forEach((dv) => { dv.rows.forEach((r) => { seen[r.id] = (seen[r.id] || 0) + 1; n++; }); });
      chk(label, n === ids.length && Object.values(seen).every((v) => v === 1), se.key + " has every manager once", n);
      const finSet = {}; fin.forEach((g) => { finSet[g] = 1; });
      const played = se.gws.filter((g) => finSet[g] || g === liveExp);
      chk(label, se.played === played.length && se.complete === se.gws.every((g) => finSet[g]), se.key + " played and complete flags");
      se.divisions.forEach((dv) => {
        let ok = true;
        dv.rows.forEach((r) => { let s = 0; played.forEach((g) => { s += (C.gwScore(ds, r.id, g) || 0); }); if (r.score !== s) ok = false; });
        chk(label, ok, se.key + " " + dv.key + " scores are net sums");
        const pool = played.length ? Object.values(dv.prizes).reduce((a, b) => a + b, 0) : 0;
        chk(label, dv.rows.reduce((a, r) => a + r.prize, 0) === pool, se.key + " " + dv.key + " pays its pool only once played");
      });
      if (si > 0 && py.seasons[si - 1].played > 0) {
        const prev = py.seasons[si - 1];
        const where = {}; se.divisions.forEach((dv, di) => { dv.rows.forEach((r) => { where[r.id] = di; }); });
        let ok = true;
        prev.divisions.forEach((dv, di) => {
          dv.rows.forEach((r, i) => {
            const up = i < p.promoteCount && di > 0, down = i >= dv.rows.length - p.relegateCount && di < 3;
            const exp = up ? di - 1 : down ? di + 1 : di;
            if (where[r.id] !== exp) ok = false;
          });
        });
        chk(label, ok, se.key + " rosters follow the promotions and relegations of " + prev.key);
      }
    });
  }

  /* groups and knockouts */
  const h2h = call(label, "h2h", () => C.h2h(ds));
  if (h2h) {
    chk(label, h2h.groups.length === 16, "sixteen groups");
    const gsScored = cfg.h2h.groupStageGws.filter((g) => scored.indexOf(g) !== -1).length;
    h2h.groups.forEach((g) => {
      chk(label, g.table.length === 15, g.name + " has fifteen managers", g.table.length);
      chk(label, g.played === gsScored, g.name + " played count", g.played + " vs " + gsScored);
      chk(label, g.table.every((t) => t.w + t.d + t.l === gsScored && t.pts === 3 * t.w + t.d), g.name + " records add up");
      for (let i = 1; i < g.table.length; i++) chk(label, g.table[i].pts <= g.table[i - 1].pts, g.name + " ordered on points");
    });
    chk(label, h2h.groupGwsPlayed === gsScored, "group gameweeks played");
  }
  const drawnExp = fin.indexOf(29) !== -1;
  ["ucl", "uel"].forEach((comp) => {
    const B = call(label, "knockout " + comp, () => C.knockout(ds, comp));
    if (!B) { fail(label, "knockout " + comp + " missing"); return; }
    chk(label, B.drawn === drawnExp, comp + " drawn exactly when the group stage is checked", B.drawn);
    chk(label, B.rounds.length === 5 && B.rounds[0].ties.length === (drawnExp ? 16 : 0), comp + " round of 32 has sixteen ties once drawn", B.rounds[0].ties.length);
    if (drawnExp) {
      const names = {};
      B.rounds[0].ties.forEach((t) => { [t.home, t.away].forEach((s) => { if (s) names[s.id] = (names[s.id] || 0) + 1; }); });
      chk(label, Object.keys(names).length === 32 && Object.values(names).every((v) => v === 1), comp + " thirty-two different managers drawn", Object.keys(names).length);
      // every round decided by its gameweeks, and no further
      B.rounds.forEach((r, ri) => {
        const over = r.gws.every((g) => scored.indexOf(g) !== -1);
        r.ties.forEach((t) => {
          if (!t.home || !t.away) { chk(label, !over || t.bye, comp + " " + r.key + " tie " + t.n + " has both sides once the round before is scored", JSON.stringify([t.fromA, t.fromB])); return; }
          if (over) chk(label, !!t.winner, comp + " " + r.key + " tie " + t.n + " has a winner once its gameweeks are scored", JSON.stringify(t.legs));
          else chk(label, !t.winner, comp + " " + r.key + " tie " + t.n + " has no winner before its gameweeks are scored");
          if (t.legs) {
            t.legs.forEach((leg) => {
              if (leg.home != null && leg.away != null) {
                chk(label, leg.home === C.gwScore(ds, t.home.id, leg.gw) && leg.away === C.gwScore(ds, t.away.id, leg.gw), comp + " " + r.key + " legs carry the net gameweek scores");
              }
            });
            if (t.winner) {
              const ah = t.legs.reduce((a, l) => a + (l.home || 0), 0), aw = t.legs.reduce((a, l) => a + (l.away || 0), 0);
              if (t.decidedBy === "aggregate") chk(label, ah !== aw && t.winner.id === (ah > aw ? t.home.id : t.away.id), comp + " " + r.key + " winner is the aggregate winner");
              else chk(label, ah === aw && !!t.decidedBy, comp + " " + r.key + " a tie-break only splits a level aggregate", t.decidedBy);
            }
            chk(label, !(t.winner && t.level), comp + " " + r.key + " a decided tie is not also level");
          }
        });
        if (ri > 0) {
          const prevOver = B.rounds[ri - 1].gws.every((g) => scored.indexOf(g) !== -1);
          if (prevOver) chk(label, r.ties.every((t) => t.home && t.away), comp + " " + r.key + " is filled from the round before");
          else chk(label, r.ties.every((t) => !t.winner), comp + " " + r.key + " has no winners before the round before is scored");
        }
      });
      // the final is decided once its points stand (the bonus phase) and
      // settled once FPL has checked it
      if (gw === 38 && (phase === "bonus" || phase === "final")) {
        chk(label, !!(B.champion && B.runnerUp), comp + " has a champion and a runner-up once the final is scored", JSON.stringify(B.champion));
        chk(label, B.settled === (phase === "final"), comp + " settles only when the final is checked", B.settled);
      } else {
        chk(label, !B.champion, comp + " has no champion before the final is scored");
      }
    }
  });

  /* who plays whom */
  for (const g of [1, gw, 29, 30, 38]) {
    if (g > 38) continue;
    const fx = call(label, "fixtures GW" + g, () => C.fixtures(ds, g));
    if (fx) chk(label, fx.length === 128, "GW" + g + " has 128 group fixtures", fx.length);
  }

  /* money */
  const W = call(label, "winningsAll", () => C.winningsAll(ds));
  if (W) {
    let settledMonthly = 0, poolMonthly = 0, classicSettled = null, lmsPaid = 0, uclPaid = 0, uclSettled = 0;
    Object.values(W).forEach((w) => {
      w.items.forEach((it) => {
        if (it.comp === "Monthly" && it.settled) settledMonthly += it.amount;
        if (it.comp === "Classic") classicSettled = it.settled;
        if (it.comp === "Last Manager") lmsPaid += it.amount;
        if (it.comp === "UCL" || it.comp === "UEL") { uclPaid += it.amount; if (it.settled) uclSettled += it.amount; }
      });
      chk(label, w.settled + w.onTrack === w.total && w.total >= 0, "winnings totals add up");
    });
    months.forEach((m) => { if (m.complete) poolMonthly += Object.values(m.prizes).reduce((a, b) => a + b, 0); });
    chk(label, settledMonthly === poolMonthly, "settled monthly XP equals the pools of the complete months", settledMonthly + " vs " + poolMonthly);
    if (classicSettled !== null) chk(label, classicSettled === (gw === 38 && phase === "final"), "classic XP settles only when the season is checked");
    const lp = cfg.lms.prizes;
    const hp = cfg.h2h.prizes, koPool = hp.ucl.winner + hp.ucl.runnerUp + hp.uel.winner + hp.uel.runnerUp;
    if (gw === 38 && phase === "final") {
      chk(label, lmsPaid === lp.champion + lp.runnerUp + lp.third, "Last Manager pays champion, runner-up and third at the end", lmsPaid);
      chk(label, uclPaid === koPool && uclSettled === koPool, "UCL and UEL pay winner and runner-up, settled, at the end", uclPaid + "/" + uclSettled);
    } else if (gw === 38 && phase === "bonus") {
      chk(label, lmsPaid === 0 && uclPaid === koPool && uclSettled === 0, "the finals are decided but unsettled until checked", lmsPaid + "/" + uclPaid + "/" + uclSettled);
    } else {
      chk(label, lmsPaid === 0 && uclPaid === 0, "no knockout or Last Manager money before the end", lmsPaid + "/" + uclPaid);
    }
  }

  /* per manager, a sample */
  const sample = ids.filter((_, i) => i % 17 === 0).slice(0, 15);
  sample.forEach((id) => {
    const b = call(label, "badges " + id, () => C.badges(ds, id));
    if (b) {
      const top = b.find((x) => x.k === "top");
      let expTop = 0;
      fin.forEach((g) => { const mx = Math.max.apply(null, ids.map((x) => net(x, g) == null ? -999 : net(x, g))); if (net(id, g) === mx) expTop++; });
      chk(label, (top ? top.count : 0) === expTop, "top-scorer badge count for " + id, (top ? top.count : 0) + " vs " + expTop);
    }
    call(label, "snapshot " + id, () => C.snapshot(ds, id));
    call(label, "prizeStatus " + id, () => C.prizeStatus(ds, id));
    call(label, "form " + id, () => C.form(ds, id));
    call(label, "managerProfile " + id, () => C.managerProfile(ds, id));
    call(label, "managerPitch " + id, () => C.managerPitch(ds, id, cur));
    call(label, "winnings " + id, () => C.winnings(ds, id));
    call(label, "prizeGap " + id, () => C.prizeGap(ds, id));
    call(label, "managerChips " + id, () => C.managerChips(ds, id));
    call(label, "mySquadIds " + id, () => C.mySquadIds(ds, id));
    call(label, "pendingSquad " + id, () => C.pendingSquad(ds, id));
    call(label, "h2hRecord " + id, () => C.h2hRecord(ds, id));
  });
  call(label, "compare", () => C.compare(ds, sample[0], sample[1], cur));
  if (phase === "pre") {
    const anyPending = ids.some((id) => C.pendingSquad(ds, id));
    chk(label, anyPending, "pending transfers are read before a deadline");
  }

  /* highlights and the series behind the trend sheets */
  const hl = call(label, "highlights " + cur, () => C.highlights(ds, cur));
  if (hl && hl.gwStats) {
    const nets = ids.map((id) => C.gwScore(ds, id, cur)).filter((v) => v !== null);
    chk(label, hl.gwStats.count === nets.length, "highlights count every scored manager", hl.gwStats.count);
    chk(label, hl.gwStats.top.p === Math.max.apply(null, nets), "highlights top score is the net maximum");
    chk(label, hl.gwStats.average === Math.round(nets.reduce((a, b) => a + b, 0) / nets.length), "highlights average is the net mean");
  }
  if (phase === "final" && gw > 6) call(label, "highlights " + (gw - 3), () => C.highlights(ds, gw - 3));
  call(label, "gwSeries", () => C.gwSeries(ds));
  call(label, "monthlyWins", () => C.monthlyWins(ds));
  call(label, "classicRankByGw", () => C.classicRankByGw(ds));
  call(label, "voluntaryLeagues", () => C.voluntaryLeagues(ds));
  Object.keys(cfg.voluntaryPrizes).forEach((k) => {
    const v = call(label, "voluntary " + k, () => C.voluntary(ds, k));
    if (v) chk(label, v.rows.length === cfg.voluntaryPrizes[k].paid.length, k + " lists everyone who paid", v.rows.length);
  });

  /* the status page */
  const stt = call(label, "gwStatus", () => C.gwStatus(ds));
  if (stt) {
    chk(label, stt.rows.length === 38, "status lists 38 gameweeks");
    const row = stt.rows[gw - 1], s = row.steps;
    const expect = {
      pre: { lock: false, ko: false, ft: false, bonus: false, final: false, squads: false },
      locked: { lock: true, ko: false, ft: false, bonus: false, final: false, squads: false },
      live: { lock: true, ko: true, ft: false, bonus: false, final: false, squads: false },
      ft: { lock: true, ko: true, ft: true, bonus: false, final: false, squads: false },
      bonus: { lock: true, ko: true, ft: true, bonus: true, final: false, squads: true },
      final: { lock: true, ko: true, ft: true, bonus: true, final: true, squads: true }
    }[phase];
    const diff = Object.keys(expect).filter((k) => s[k] !== expect[k]);
    chk(label, !diff.length, "status steps match the phase", diff.map((k) => k + "=" + s[k]).join(","));
    chk(label, (stt.at ? stt.at.gw : null) === ((phase === "pre" || phase === "final") ? null : gw), "status points at the gameweek in progress", stt.at && stt.at.gw);
    stt.rows.forEach((r) => call(label, "gwTimes " + r.gw, () => C.gwTimes(ds, r)));
  }

  /* players, prices, the league table */
  const pl = call(label, "plTable", () => C.plTable(ds));
  if (pl) {
    chk(label, pl.teams === 20, "twenty clubs", pl.teams);
    const W2 = pl.rows.reduce((a, r) => a + r.w, 0), L2 = pl.rows.reduce((a, r) => a + r.l, 0), D2 = pl.rows.reduce((a, r) => a + r.d, 0);
    const P2 = pl.rows.reduce((a, r) => a + r.pts, 0), MP = pl.rows.reduce((a, r) => a + r.mp, 0);
    chk(label, W2 === L2 && P2 === 3 * W2 + D2 && MP === 2 * pl.played, "the league table adds up");
  }
  call(label, "playerStats", () => C.playerStats(ds));
  call(label, "priceTable", () => C.priceTable(ds));
  call(label, "priceThreshold", () => C.priceThreshold(ds));
  call(label, "pointsSpread", () => C.pointsSpread(ds));
  call(label, "leagueOwnership", () => C.leagueOwnership(ds, cur));
  call(label, "chipPlayers", () => C.chipPlayers(ds, cur, "bboost"));
  const fx0 = (ds.gwFixtures[cur] || [])[0];
  if (fx0) {
    call(label, "matchSheet", () => C.matchSheet(ds, cur, fx0[0], fx0[1]));
    call(label, "matchEvents", () => C.matchEvents(ds, cur, fx0[0], fx0[1], sample[0]));
  }
  const els = Object.keys(ds.elements).slice(0, 3);
  els.forEach((el) => {
    call(label, "playerProfile " + el, () => C.playerProfile(ds, +el));
    call(label, "availability " + el, () => C.availability(ds, +el, cur));
    call(label, "playerBreakdown " + el, () => C.playerBreakdown(ds, +el, cur));
    call(label, "playerHistory " + el, () => C.playerHistory(ds, +el));
  });

  /* Theo */
  const me = sample[2];
  T.sync({ ds, me, view: "classic" });
  const ctx = T.context();
  chk(label, ctx && +ctx.me === +me, "Theo built his facts", ctx && ctx.me);
  if (ctx && +ctx.me === +me) {
    const kinds = T.lines();
    let fits = 0, bad = [];
    kinds.forEach((k, i) => {
      if (!T.fits(i)) return;
      fits++;
      try {
        const txt = T.text(i);
        if (!txt || /\bNaN\b|\bundefined\b|\bnull\b|\[object/.test(txt)) bad.push(i + ":" + k + " " + JSON.stringify(txt).slice(0, 80));
      } catch (e) { bad.push(i + ":" + k + " threw " + e.message); }
    });
    chk(label, fits >= 8, "Theo has lines for this moment", fits);
    chk(label, !bad.length, "every Theo line that fits reads cleanly", bad.slice(0, 3).join(" | "));
  }
}

(async () => {
  const app = loadApp();
  const base = sim.loadBase();
  const t0 = Date.now();
  let n = 0;
  const S = sim.season(base);
  function* plan() {
    for (let gw = FROM; gw <= TO; gw++) {
      const phases = (!BATTERY || PIVOTAL[gw]) ? sim.PHASES : ["final"];
      for (const ph of phases) yield sim.stateAt(S, gw, ph);
    }
  }
  for (const st of plan()) {
    const before = fails;
    audit(app, st);
    n++;
    if (fails === before) process.stdout.write(".");
    if (n % 30 === 0) process.stdout.write(" GW" + st.gw + "\n");
  }
  console.log("\n" + n + " states, " + checks + " checks, " + fails + " failed, " + Math.round((Date.now() - t0) / 1000) + "s");
  console.log(fails ? "FAILS: " + fails : "ALL OK");
  process.exit(fails ? 1 : 0);
})();
