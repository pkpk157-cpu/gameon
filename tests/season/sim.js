/* The rest of the season, played out on the real dataset.

   Starting from the published data.json (five gameweeks played), every later
   gameweek is generated the way the updater would publish it: squads that
   move week to week (transfers, hits, captains, both halves' chips, a free
   hit that reverts), points for every player that follow the fixture list,
   a double gameweek and a blank one, FPL's automatic substitutions once the
   bonus is in, the history row, the roster, the voluntary and group standings
   computed the way FPL computes them, price changes, and the pending
   transfers before a deadline.

   Every gameweek is produced at each phase the app distinguishes:

     pre     the week before the deadline, the previous one settled
     locked  deadline passed, nothing kicked off
     live    a Saturday afternoon: some matches finished, some in play
     ft      every match at full time, the last day's bonus not yet in
     bonus   bonus in, subs made, FPL says finished, not yet checked
     final   checked

   and every phase carries the moment it describes ("now"), so a caller can
   set the clock: nothing in the dates is shifted, the calendar stays real.

   Deterministic: the same gameweek always comes out the same. */
"use strict";
const fs = require("fs"), path = require("path");
const GOENV = require("../lib/env.js");

const PHASES = ["pre", "locked", "live", "ft", "bonus", "final"];
const LAST = 38;
const DGW = 24;             // four clubs play twice
const BGW = 29;             // four clubs do not play
const H = 3600 * 1000;

function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clone = (o) => JSON.parse(JSON.stringify(o));
const iso = (ms) => new Date(ms).toISOString();

function loadBase() {
  const raw = JSON.parse(fs.readFileSync(path.join(GOENV.APP, "data.json"), "utf8"));
  return raw.dataset;
}

/* ---- the plan: everything that is decided once for the whole season ---- */
function plan(base) {
  const R = rng(20262027);
  const els = base.elements;
  const elIds = Object.keys(els).map(Number);
  const byType = { 1: [], 2: [], 3: [], 4: [] };
  elIds.forEach((e) => { byType[els[e][1]].push(e); });
  const teamOf = (e) => els[e][2];

  // Which real gameweek each future one borrows its player points from, and
  // a permutation of players within each position so no two weeks repeat.
  const realGws = Object.keys(base.livePoints).map(Number).filter((g) => Object.keys(base.livePoints[g]).length);
  const weeks = {};
  for (let g = 6; g <= LAST; g++) {
    const perm = {};
    Object.keys(byType).forEach((t) => {
      const ids = byType[t].slice(), shuffled = ids.slice();
      for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
      ids.forEach((e, i) => { perm[e] = shuffled[i]; });
    });
    weeks[g] = { src: realGws[(g - 1) % realGws.length], src2: realGws[(g + 2) % realGws.length], perm };
  }

  // Chips: whatever is still unplayed in the first half goes in by GW19 for
  // some, and every chip is available again from GW20.
  const chips = {};
  base.managers.forEach((m) => {
    const had = (base.chips[m.id] || []).map((c) => c.n);
    const mine = [];
    ["wildcard", "freehit", "bboost", "3xc"].forEach((n) => {
      if (had.indexOf(n) === -1 && R() < 0.6) mine.push({ n, gw: 6 + Math.floor(R() * 14) });
      if (R() < 0.8) mine.push({ n, gw: 20 + Math.floor(R() * 19) });
    });
    // one chip a week at most
    const seen = {};
    chips[m.id] = mine.filter((c) => { if (seen[c.gw]) return false; seen[c.gw] = 1; return true; })
      .sort((a, b) => a.gw - b.gw);
  });

  // Clubs that double up and clubs that sit out.
  const teams = Object.values(base.teams);
  const dgwTeams = [], bgwTeams = [];
  (base.gwFixtures[DGW] || []).slice(0, 2).forEach((f) => { dgwTeams.push(f[0], f[1]); });
  (base.gwFixtures[BGW] || []).slice(0, 2).forEach((f) => { bgwTeams.push(f[0], f[1]); });
  return { R, els, elIds, byType, teamOf, weeks, chips, teams, dgwTeams, bgwTeams };
}

/* ---- one gameweek's fixtures with flags for a phase --------------------- */
function fixturesFor(base, P, gw, phase) {
  let fx = clone(base.gwFixtures[gw] || []);
  if (gw === DGW) {
    // the two extra matches: the same four clubs, home and away swapped, a
    // day later
    const extra = fx.slice(0, 2).map((f) => {
      const g = clone(f); g[0] = f[1]; g[1] = f[0];
      g[7] = iso(Date.parse(f[7]) + 24 * H); return g;
    });
    fx = fx.concat(extra);
  }
  if (gw === BGW) fx = fx.slice(2);
  fx.sort((a, b) => (a[7] < b[7] ? -1 : a[7] > b[7] ? 1 : 0));
  const kos = fx.map((f) => Date.parse(f[7]));
  const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);
  const lastDay = dayKey(kos[kos.length - 1]);
  let now;
  const dl = Date.parse(base.bootstrap.events[gw - 1].deadline_time);
  if (phase === "pre") now = dl - 36 * H;
  else if (phase === "locked") now = dl + 20 * 60 * 1000;
  else if (phase === "live") now = kos[Math.min(2, kos.length - 1)] + 60 * 60 * 1000;
  else if (phase === "ft") now = kos[kos.length - 1] + 3 * H;
  else if (phase === "bonus") now = Date.UTC(+lastDay.slice(0, 4), +lastDay.slice(5, 7) - 1, +lastDay.slice(8, 10)) + 24 * H + 8.25 * H;
  else now = Date.UTC(+lastDay.slice(0, 4), +lastDay.slice(5, 7) - 1, +lastDay.slice(8, 10)) + 24 * H + 14.1 * H;
  const R = rng(gw * 7919 + 13);
  fx.forEach((f, i) => {
    const ko = kos[i];
    const started = phase !== "pre" && phase !== "locked" && ko <= now;
    const over = started && (ko + 2 * H <= now);
    // bonus (FPL "finished") follows full time by an hour, except on the last
    // day, where it lands the next morning — as the stamps show it does
    const bonusIn = over && (dayKey(ko) !== lastDay ? (ko + 3 * H <= now) : (phase === "bonus" || phase === "final"));
    f[2] = started ? 1 : 0;
    f[8] = over ? 1 : 0;
    f[3] = bonusIn ? 1 : 0;
    if (started) {
      const hs = Math.floor(R() * 4), as = Math.floor(R() * 3);
      f[4] = over ? hs : Math.floor(hs * 0.6); f[5] = over ? as : Math.floor(as * 0.6);
      f[6] = over ? 90 : Math.min(89, Math.floor((now - ko) / 60000));
    } else { f[4] = null; f[5] = null; f[6] = 0; }
  });
  return { fx, now, deadline: dl, lastDay };
}

/* ---- the season, gameweek by gameweek ------------------------------------ */
// Everything persistent between weeks lives in `S`; a state for a phase is a
// snapshot of it with the phase's flags applied.
function season(base) {
  const P = plan(base);
  const S = {
    base, P,
    squads: {},      // id -> current fifteen [[el,mult,cap,vice]] (the persistent squad)
    fhBackup: {},    // id -> squad to restore after a free hit
    history: clone(base.history),
    picks: clone(base.picks),
    livePoints: clone(base.livePoints),
    breakdown: clone(base.breakdown),
    liveStats: clone(base.liveStats),
    moves: clone(base.moves),
    buys: clone(base.buys),
    chips: clone(base.chips),
    priceLog: clone(base.priceLog),
    prices: clone(base.prices),
    elements: clone(base.elements),
    gwStamps: clone(base.gwStamps),
    picksFinal: clone(base.picksFinal),
    gwFixtures: clone(base.gwFixtures),
    gwEvents: clone(base.gwEvents),
    events: clone(base.bootstrap.events),
    overall: {},
    lastRank: {}
  };
  // Managers who are only in a group league — a second team that never
  // joined the classic league — play their group matches all the same.
  const have = {}; base.managers.forEach((m) => { have[m.id] = 1; });
  const extras = [];
  Object.values(base.h2hFixtures || {}).forEach((L) => {
    (L.ents || []).forEach((id) => { if (!have[id]) { have[id] = 1; extras.push({ id, entryName: "Second team " + id, playerName: "", extra: true }); } });
  });
  S.entries = base.managers.concat(extras);
  S.entries.forEach((m) => {
    const last = Object.keys(base.picks).map(Number).sort((a, b) => b - a)[0];
    const anyPick = base.picks[last][base.managers[m.extra ? extras.indexOf(m) : 0].id];
    S.squads[m.id] = clone((base.picks[last] && base.picks[last][m.id]) || anyPick || { c: "", p: [] }).p;
    const h = base.history[m.id] || {};
    const lg = Object.keys(h).map(Number).sort((a, b) => b - a)[0];
    S.overall[m.id] = lg ? h[lg].r : 3000000;
    S.lastRank[m.id] = m.rank;
  });
  return S;
}

// Points every player scores this gameweek, by fixture state.
function playerPoints(S, gw, fx, phase) {
  const { els, weeks, teamOf, dgwTeams, bgwTeams } = S.P;
  const W = weeks[gw];
  const src = S.base.livePoints[W.src], src2 = S.base.livePoints[W.src2];
  const bdSrc = S.base.breakdown[W.src] || {}, bdSrc2 = S.base.breakdown[W.src2] || {};
  const stSrc = S.base.liveStats[W.src] || { g: {}, c: {}, a: {} };
  const teamState = {};   // team -> "none" | "ahead" | "live" | "over" | "final"
  Object.values(S.base.teams).forEach((t) => { teamState[t] = "none"; });
  fx.forEach((f) => {
    [f[0], f[1]].forEach((t) => {
      const st = f[3] ? "final" : f[8] ? "over" : f[2] ? "live" : "ahead";
      // a club playing twice: the further along of its two matches leads
      const order = ["none", "ahead", "live", "over", "final"];
      if (order.indexOf(st) > order.indexOf(teamState[t]) || teamState[t] === "none") teamState[t] = st;
      if (gw === DGW && dgwTeams.indexOf(t) !== -1) teamState[t + "#2"] = st;
    });
  });
  const pts = {}, bd = {}, stats = { g: {}, c: {}, a: {} }, bonus = {};
  const R = rng(gw * 104729 + 7);
  S.P.elIds.forEach((e) => {
    const t = teamOf(e), st = teamState[t] || "none";
    const from = W.perm[e];
    let p = src[from] || 0, rows = clone(bdSrc[from] || []);
    if (st === "none" || st === "ahead") { p = 0; rows = []; }
    else if (st === "live") { p = Math.round(p * 0.6); rows = rows.filter((r) => r[0] === "minutes").map((r) => [r[0], Math.min(r[1], 55), r[2]]); }
    if (gw === DGW && dgwTeams.indexOf(t) !== -1 && (st === "over" || st === "final")) {
      p += src2[from] || 0;
      rows = rows.concat(clone(bdSrc2[from] || []));
    }
    if (st === "live" && R() < 0.08) bonus[e] = 1 + Math.floor(R() * 3);
    if (p || rows.length) { pts[e] = p; if (rows.length) bd[e] = rows; }
    if (st === "over" || st === "final") {
      if (stSrc.g[from]) stats.g[e] = stSrc.g[from];
      if (stSrc.c[from]) stats.c[e] = stSrc.c[from];
      if (stSrc.a[from]) stats.a[e] = stSrc.a[from];
    }
  });
  return { pts, bd, stats, bonus, teamState };
}

const minutesOf = (bd, e) => { const r = (bd[e] || []).find((x) => x[0] === "minutes"); return r ? r[1] : 0; };

// FPL's automatic substitutions: a starter who did not play swaps with the
// first bench player who did, goalkeepers only with goalkeepers.
function autoSub(S, p, bd) {
  const els = S.P.els;
  const out = clone(p);
  const xi = out.filter((x) => x[1] > 0), bench = out.filter((x) => x[1] === 0);
  const used = {};
  xi.forEach((x) => {
    if (minutesOf(bd, x[0]) > 0) return;
    const isGk = els[x[0]][1] === 1;
    const sub = bench.find((b) => !used[b[0]] && minutesOf(bd, b[0]) > 0 && ((els[b[0]][1] === 1) === isGk));
    if (!sub) return;
    used[sub[0]] = 1;
    const m = x[1]; x[1] = 0; sub[1] = m;
    if (x[2]) { x[2] = 0; sub[2] = 1; }
  });
  return out;
}

// Transfers and the chip for a gameweek, applied to the persistent squads.
function moveSquads(S, gw) {
  const { byType, els, chips } = S.P;
  const R = rng(gw * 9973 + 1);   // the same moves whichever phase asks first
  const mv = {};
  const inSquad = (p, e) => p.some((x) => x[0] === e);
  const random = (type, p) => {
    for (let k = 0; k < 40; k++) { const e = byType[type][Math.floor(R() * byType[type].length)]; if (!inSquad(p, e)) return e; }
    return null;
  };
  S.entries.forEach((m) => {
    const id = m.id;
    const chip = (chips[id] || []).find((c) => c.gw === gw);
    if (S.fhBackup[id]) { S.squads[id] = S.fhBackup[id]; delete S.fhBackup[id]; }
    let p = clone(S.squads[id]);
    if (!p.length) return;
    let n = 0;
    if (chip && chip.n === "wildcard") n = 5 + Math.floor(R() * 8);
    else if (chip && chip.n === "freehit") { S.fhBackup[id] = clone(p); n = 6 + Math.floor(R() * 6); }
    else { const r = R(); n = r < 0.35 ? 0 : r < 0.8 ? 1 : r < 0.95 ? 2 : 3 + Math.floor(R() * 3); }
    const list = [];
    for (let i = 0; i < n; i++) {
      const slot = Math.floor(R() * p.length), out = p[slot][0];
      const e = random(els[out][1], p);
      if (!e) continue;
      list.push([e, out]);
      p[slot][0] = e;
      S.buys[id] = S.buys[id] || {};
      delete S.buys[id][out]; S.buys[id][e] = els[e][3];
    }
    if (list.length) mv[id] = list;
    // a new captain now and then
    if (R() < 0.3) {
      p.forEach((x) => { x[2] = 0; x[3] = 0; });
      const xi = p.filter((x) => x[1] > 0);
      const c = xi[Math.floor(R() * xi.length)]; c[2] = 1;
      const v = xi.find((x) => x !== c); if (v) v[3] = 1;
    }
    p.forEach((x) => { if (x[1] > 0) x[1] = x[2] ? 2 : 1; });
    S.squads[id] = p;
  });
  return mv;
}

// The squad as picked for the week, with the chip's multipliers applied.
function picksFor(S, gw, id) {
  const chip = (S.P.chips[id] || []).find((c) => c.gw === gw);
  const p = clone(S.squads[id]);
  if (chip && chip.n === "bboost") p.forEach((x) => { if (x[1] === 0) x[1] = 1; });
  if (chip && chip.n === "3xc") p.forEach((x) => { if (x[2]) x[1] = 3; });
  return { c: chip ? chip.n : "", p };
}

/* ---- standings the way FPL publishes them ------------------------------ */
function netScore(S, id, gw) {
  const r = (S.history[id] || {})[gw];
  return r && typeof r.p === "number" ? r.p - (r.h || 0) : null;
}
function h2hStandings(S, scoredUpTo) {
  const out = {};
  const names = {}; S.base.managers.forEach((m) => { names[m.id] = m; });
  Object.keys(S.base.h2hFixtures).forEach((lid) => {
    const L = S.base.h2hFixtures[lid];
    const rows = {};
    const seat = (id, nm, pn) => rows[id] || (rows[id] = { entry: id === 0 ? null : id, entry_name: nm, player_name: pn, total: 0, points_for: 0, matches_won: 0, matches_drawn: 0, matches_lost: 0 });
    L.ents.forEach((id) => { const m = names[id]; seat(id, m ? m.entryName : "#" + id, m ? m.playerName : ""); });
    seat(0, "AVERAGE", "AVERAGE");
    L.fx.forEach((f) => {
      const gw = f[0];
      if (gw > scoredUpTo) return;
      const a = f[1] === -1 ? 0 : L.ents[f[1]], b = f[2] === -1 ? 0 : L.ents[f[2]];
      const sa = a === 0 ? S.events[gw - 1].average : netScore(S, a, gw);
      const sb = b === 0 ? S.events[gw - 1].average : netScore(S, b, gw);
      if (sa == null || sb == null) return;
      const A = rows[a], B = rows[b];
      A.points_for += sa; B.points_for += sb;
      if (sa > sb) { A.matches_won++; B.matches_lost++; A.total += 3; }
      else if (sb > sa) { B.matches_won++; A.matches_lost++; B.total += 3; }
      else { A.matches_drawn++; B.matches_drawn++; A.total++; B.total++; }
    });
    const results = Object.values(rows).sort((x, y) => (y.total - x.total) || (y.points_for - x.points_for));
    results.forEach((r, i) => { r.rank = i + 1; });
    out[lid] = { league: { name: S.base.h2h[lid].league.name }, results };
  });
  return out;
}
function voluntaryStandings(S, cfgVol, gw) {
  const out = {};
  Object.keys(S.base.voluntary).forEach((k) => {
    const v = S.base.voluntary[k];
    const results = v.results.map((r) => {
      const h = (S.history[r.id] || {})[gw];
      const prev = (S.history[r.id] || {})[gw - 1];
      return { id: r.id, entryName: r.entryName, playerName: r.playerName, rank: 0, lastRank: 0,
               total: h ? h.t : (prev ? prev.t : r.total), eventTotal: h ? h.p : 0, _prevTotal: prev ? prev.t : 0 };
    });
    const byPrev = results.slice().sort((a, b) => b._prevTotal - a._prevTotal);
    byPrev.forEach((r, i) => { r.lastRank = i + 1; });
    results.sort((a, b) => (b.total - a.total) || (a.lastRank - b.lastRank));
    results.forEach((r, i) => { r.rank = i + 1; delete r._prevTotal; });
    out[k] = { id: v.id, name: v.name, at: null, results };
  });
  return out;
}

/* ---- advance the season to a gameweek at a phase ------------------------ */
// Weeks before `gw` are played to their end first, so a state carries the
// whole season up to it. Cached, so asking for the phases of one week in
// order costs one pass.
function stateAt(S, gw, phase) {
  if (!S._done) S._done = 5;
  while (S._done < gw - 1) playWeek(S, S._done + 1, "final");
  return playWeek(S, gw, phase, true);
}

// Plays week `gw` to `phase` on a copy of the persistent state and returns
// the dataset. The copy becomes the state at "final".
function playWeek(S, gw, phase, snapshot) {
  if (!snapshot) { const ds = buildWeek(S, gw, phase); if (phase === "final") S._done = gw; return ds; }
  const T = cloneState(S);
  const out = buildWeek(T, gw, phase);
  if (phase === "final") { Object.keys(T).forEach((k) => { S[k] = T[k]; }); S._done = gw; }
  return out;
}
function cloneState(S) {
  const c = {};
  Object.keys(S).forEach((k) => { c[k] = (k === "base" || k === "P") ? S[k] : clone(S[k]); });
  return c;
}

function buildWeek(S, gw, phase) {
  const base = S.base, P = S.P;
  const F = fixturesFor(base, P, gw, phase);
  const fx = F.fx, now = F.now;

  // events
  S.events.forEach((e) => {
    e.finished = e.id < gw; e.data_checked = e.id < gw;
    e.is_current = false; e.is_next = false;
    if (e.id < gw) e.average = e.average || 50;
    if (e.id >= gw) e.average = 0;
  });
  const ev = S.events[gw - 1];
  if (phase === "pre") {
    if (gw > 1) S.events[gw - 2].is_current = true;
    ev.is_next = true;
  } else {
    ev.is_current = true;
    if (gw < LAST) S.events[gw].is_next = true;
    ev.finished = phase === "bonus" || phase === "final";
    ev.data_checked = phase === "final";
  }

  // pre: nothing of this week exists yet except pending transfers
  if (phase === "pre") {
    const R = rng(gw * 31 + 5);
    const moves = {};
    base.managers.forEach((m) => {
      if (R() < 0.3) {
        const p = S.squads[m.id]; if (!p.length) return;
        const out = p[Math.floor(R() * p.length)][0];
        const type = P.els[out][1];
        const e = P.byType[type][Math.floor(R() * P.byType[type].length)];
        if (!p.some((x) => x[0] === e)) moves[m.id] = [[e, out]];
      }
    });
    const out = assemble(S, gw - 1, now, { pending: { gw, at: iso(now - 2 * H), moves } });
    out.gw = gw; out.phase = "pre";
    return out;
  }

  // the deadline has passed: squads locked, transfers logged
  if (!S._moved || S._moved !== gw) {
    const mv = moveSquads(S, gw);
    S.moves[gw] = mv;
    S._moved = gw;
    S.picks[gw] = {}; S.extraPicks = {};
    S.entries.forEach((m) => { (m.extra ? S.extraPicks : S.picks[gw])[m.id] = picksFor(S, gw, m.id); });
    // the chip record FPL keeps
    base.managers.forEach((m) => {
      const chip = (P.chips[m.id] || []).find((c) => c.gw === gw);
      if (chip) { S.chips[m.id] = (S.chips[m.id] || []).concat([{ n: chip.n, gw }]); }
    });
  }
  S.gwFixtures[gw] = fx;

  // points
  const PP = playerPoints(S, gw, fx, phase);
  S.livePoints[gw] = PP.pts;
  S.breakdown[gw] = PP.bd;
  S.liveStats[gw] = PP.stats;
  const liveBonus = {}; if (phase === "live") liveBonus[gw] = PP.bonus;

  // subs, once the bonus is in
  const subsIn = phase === "bonus" || phase === "final";
  if (subsIn) {
    S.entries.forEach((m) => {
      const sq = m.extra ? S.extraPicks[m.id] : S.picks[gw][m.id];
      sq.p = autoSub(S, sq.p, PP.bd);
    });
  }
  S.picksFinal[gw] = phase === "final" ? 2 : (phase === "bonus" ? 1 : undefined);
  if (S.picksFinal[gw] === undefined) delete S.picksFinal[gw];
  // a stamp for each step reached
  const stamps = {};
  if (phase === "ft" || subsIn) stamps.ft = iso(Date.parse(fx[fx.length - 1][7]) + 2 * H);
  if (subsIn) { stamps.bonus = iso(now - (phase === "final" ? 6 * H : 5 * 60 * 1000)); stamps.squads = iso(Date.parse(stamps.bonus) + 40 * 60 * 1000); }
  if (phase === "final") stamps.final = iso(now - 5 * 60 * 1000);
  if (Object.keys(stamps).length) S.gwStamps[gw] = stamps; else delete S.gwStamps[gw];

  // history rows
  const R = rng(gw * 17 + 3);
  let sumP = 0;
  S.entries.forEach((m) => {
    const id = m.id, sq = m.extra ? S.extraPicks[id] : S.picks[gw][id];
    const chip = sq.c;
    const prev = (S.history[id] || {})[gw - 1] || { t: 0, v: 1000, bk: 0 };
    let p = 0, b = 0, played = 0, total = 0;
    sq.p.forEach((x) => {
      const pts = PP.pts[x[0]] || 0;
      if (x[1] > 0) { p += pts * x[1]; total += x[1]; if (minutesOf(PP.bd, x[0]) > 0) played += x[1]; }
      else b += pts;
    });
    const nTr = (S.moves[gw][id] || []).length;
    const free = 1;
    const h = (chip === "wildcard" || chip === "freehit") ? 0 : Math.max(0, nTr - free) * 4;
    const v = sq.p.reduce((s, x) => s + (P.els[x[0]][3] || 0), 0);
    const bk = Math.max(0, Math.round(prev.bk + (R() - 0.5) * 6));
    S.history[id] = S.history[id] || {};
    S.history[id][gw] = { p, h, b, t: prev.t + p - h, v, bk, tr: nTr, r: 0, pl: played, plt: total };
    sumP += p;
  });
  // a tie nobody's tie-breakers can split, once, to see the carry-over work
  if (gw === 10 && subsIn) {
    const ids = base.managers.map((m) => m.id).sort((a, b) => netScore(S, a, gw) - netScore(S, b, gw)).slice(0, 2);
    const [a, b] = ids;
    S.picks[gw][b] = clone(S.picks[gw][a]);
    S.history[b][gw] = Object.assign({}, S.history[b][gw], { p: S.history[a][gw].p, h: S.history[a][gw].h, b: S.history[a][gw].b, pl: S.history[a][gw].pl, plt: S.history[a][gw].plt });
    S.history[b][gw].t = ((S.history[b][gw - 1] || {}).t || 0) + S.history[b][gw].p - S.history[b][gw].h;
  }
  ev.average = phase === "locked" ? 0 : Math.round(sumP / S.entries.length);
  // overall ranks drift
  const order = base.managers.map((m) => m.id).sort((a, b) => S.history[b][gw].t - S.history[a][gw].t);
  order.forEach((id) => {
    S.overall[id] = Math.max(1, Math.round(S.overall[id] * (0.85 + R() * 0.3)));
    S.history[id][gw].r = S.overall[id];
  });

  // prices: a handful move each night
  if (phase === "final") {
    for (let i = 0; i < 5; i++) {
      const e = P.elIds[Math.floor(R() * P.elIds.length)];
      const from = S.elements[e][3], to = from + (R() < 0.5 ? 1 : -1);
      S.elements[e][3] = to; S.prices.now[e] = to;
      S.priceLog.push([e, from, to, iso(now - 15 * H), Math.round((R() - 0.5) * 400000), Math.round(R() * 900000)]);
    }
    S.prices.at = iso(now - 15 * H);
  }
  return assemble(S, gw, now, { liveBonus, phase });
}

function assemble(S, gw, now, extra) {
  const base = S.base;
  const managers = base.managers.map((m) => {
    const h = (S.history[m.id] || {})[gw];
    const prev = (S.history[m.id] || {})[gw - 1];
    return { id: m.id, entryName: m.entryName, playerName: m.playerName, rank: 0,
             lastRank: 0, total: h ? h.t : (prev ? prev.t : m.total), eventTotal: h ? h.p : 0,
             _prev: prev ? prev.t : (h ? h.t : m.total) };
  });
  const byPrev = managers.slice().sort((a, b) => b._prev - a._prev);
  byPrev.forEach((m, i) => { m.lastRank = i + 1; });
  managers.sort((a, b) => (b.total - a.total) || (a.lastRank - b.lastRank));
  managers.forEach((m, i) => { m.rank = i + 1; delete m._prev; });

  const scoredUpTo = (() => {
    let g = 0;
    S.events.forEach((e) => { if (e.finished && e.data_checked) g = e.id; });
    const fin = S.picksFinal[gw];
    if (fin && (S.gwFixtures[gw] || []).every((f) => f[3])) g = Math.max(g, gw);
    return g;
  })();
  const ds = {
    updatedAt: iso(now),
    season: base.season,
    bootstrap: { events: clone(S.events) },
    league: base.league, rosterAsOf: null,
    voluntary: voluntaryStandings(S, null, gw),
    managers,
    history: clone(S.history),
    h2h: h2hStandings(S, Math.min(29, scoredUpTo)),
    h2hFixtures: base.h2hFixtures,
    pastSeasons: base.pastSeasons,
    _failed: 0, historyCarried: null,
    elements: clone(S.elements),
    pitchGw: gw, picksV: 2,
    livePoints: clone(S.livePoints), picks: clone(S.picks), chips: clone(S.chips),
    gwFixtures: clone(S.gwFixtures), teams: base.teams, teamNames: base.teamNames,
    buys: clone(S.buys), buysGw: gw, moves: clone(S.moves),
    liveBonus: (extra && extra.liveBonus) || {},
    liveStats: clone(S.liveStats), picksFinal: clone(S.picksFinal), liveAudit: {},
    prices: clone(S.prices), priceLog: clone(S.priceLog),
    breakdown: clone(S.breakdown), gwStamps: clone(S.gwStamps), gwEvents: base.gwEvents,
    flags: base.flags, faceHide: base.faceHide,
    pending: (extra && extra.pending) || null
  };
  Object.keys(ds.voluntary).forEach((k) => { ds.voluntary[k].at = iso(now - 60000); });
  return { dataset: ds, now, gw, phase: (extra && extra.phase) || "pre" };
}

/* ---- every state of the season, in order ------------------------------- */
function* states(base, opts) {
  const S = season(base);
  const from = (opts && opts.from) || 6, to = (opts && opts.to) || LAST;
  const phases = (opts && opts.phases) || PHASES;
  for (let gw = from; gw <= to; gw++) {
    for (const ph of phases) {
      yield stateAt(S, gw, ph);
    }
  }
}

module.exports = { loadBase, states, stateAt, season, PHASES, LAST, DGW, BGW };

if (require.main === module) {
  // node sim.js <gw> <phase> <out.json>  — writes one state as a data.json
  const [gw, phase, out] = process.argv.slice(2);
  const base = loadBase();
  const S = season(base);
  const st = stateAt(S, +gw, phase);
  fs.writeFileSync(out, JSON.stringify({ generatedAt: st.dataset.updatedAt, dataset: st.dataset }));
  fs.writeFileSync(out.replace(/\.json$/, "") + ".now", String(st.now));
  console.log("GW" + gw + " " + phase + " -> " + out + " (" + (fs.statSync(out).size / 1024 / 1024).toFixed(1) + " MB), now " + iso(st.now));
}
