// Weekly scouting reports, one per position: Goalkeepers, Defenders,
// Midfielders, Forwards. Built from the official FPL API once a gameweek is
// finished and checked, for the next deadline, and refreshed every twelve
// hours until that deadline (prices, transfers and injury news move all week).
//
//   reports/index.json            every report there is, newest first
//   reports/gw<N>/<pos>.json      the report for the GW<N> deadline
//   reports/gw<N>/<pos>.pdf       the same report as a PDF (scripts/scout-pdf.js)
//
// Everything in a report is either FPL's own figure or worked out from FPL's
// figures by the rules below; the verdicts and commentary are written by those
// rules too, never by hand, so every sentence can be traced to a number.
//
// build() is pure (feeds in, report out) and is what the tests drive; main()
// fetches, decides whether a build is due, and writes the files. Nothing here
// may throw into the data run: FPL being down, or anything else, is a skip.
"use strict";
const fs = require("fs");
const path = require("path");

const API = "https://fantasy.premierleague.com/api";
const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "reports");
const REFRESH_H = 12;            // rebuild at most this often before the deadline

// Each position: how many players the report covers, the price that counts as
// "budget", and what its underlying numbers are.
const POS = {
  1: { key: "gkp", name: "Goalkeepers", one: "goalkeeper", top: 25, budget: 4.6 },
  2: { key: "def", name: "Defenders", one: "defender", top: 60, budget: 4.8 },
  3: { key: "mid", name: "Midfielders", one: "midfielder", top: 75, budget: 5.8 },
  4: { key: "fwd", name: "Forwards", one: "forward", top: 40, budget: 6.5 }
};
// The model: form, fixtures, points per £m, minutes security; and three
// alternative weightings shown beside it
const WEIGHTS = { base: [0.45, 0.25, 0.20, 0.10], form: [0.65, 0.15, 0.15, 0.05], fix: [0.30, 0.45, 0.15, 0.10], value: [0.30, 0.20, 0.40, 0.10] };
const FORM_GWS = 4;              // "recent form" = the last four gameweeks
const RUN = 6;                   // fixtures that count in the model
const AHEAD = 8;                 // fixtures shown

const num = (v) => { const n = Number(v); return isFinite(n) ? n : 0; };
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;
const fmtK = (v) => (v > 0 ? "+" : v < 0 ? "−" : "") + (Math.abs(v) >= 1000 ? Math.round(Math.abs(v) / 1000) + "k" : Math.abs(v));
const money = (p) => "£" + p.toFixed(1) + "m";
const list = (a) => a.length <= 1 ? (a[0] || "") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1];
const pl = (n, w) => n + " " + w + (n === 1 ? "" : "s");
const ordinal = (n) => { const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };

// min-max to 0..1 over the candidates (all equal: everyone gets 0.5)
function scaler(vals) {
  const lo = Math.min(...vals), hi = Math.max(...vals);
  return (v) => hi > lo ? (v - lo) / (hi - lo) : 0.5;
}

// Every team's next AHEAD gameweeks (a blank is an empty list, a double has two)
function fixtureRuns(bs, fx, next) {
  const teams = {};
  bs.teams.forEach((t) => { teams[t.id] = { id: t.id, short: t.short_name, name: t.name, runs: [] }; });
  for (let g = next; g < next + AHEAD; g++) Object.values(teams).forEach((t) => t.runs.push({ gw: g, games: [] }));
  fx.forEach((f) => {
    if (!f.event || f.event < next || f.event >= next + AHEAD) return;
    const h = teams[f.team_h], a = teams[f.team_a];
    if (!h || !a) return;
    h.runs[f.event - next].games.push({ opp: a.short, oppId: a.id, home: true, d: f.team_h_difficulty });
    a.runs[f.event - next].games.push({ opp: h.short, oppId: h.id, home: false, d: f.team_a_difficulty });
  });
  return teams;
}
// Goals per game each team scores and concedes, at home and away, from finished fixtures
function venueRecords(bs, fx) {
  const rec = {};
  bs.teams.forEach((t) => { rec[t.id] = { h: { gf: 0, ga: 0, n: 0 }, a: { gf: 0, ga: 0, n: 0 } }; });
  fx.forEach((f) => {
    if (!f.finished || f.team_h_score == null || f.team_a_score == null) return;
    const h = rec[f.team_h], a = rec[f.team_a];
    if (!h || !a) return;
    h.h.gf += f.team_h_score; h.h.ga += f.team_a_score; h.h.n++;
    a.a.gf += f.team_a_score; a.a.ga += f.team_h_score; a.a.n++;
  });
  return rec;
}
// A team's run: weighted difficulty over the next RUN gameweeks (the first three
// count 1.5×; a blank counts as a 5), and what its opponents concede and score
// at the venue they play this team (attacking returns; clean-sheet risk)
function runSummary(team, rec) {
  let w = 0, s = 0, ga = 0, gf = 0, k = 0;
  team.runs.slice(0, RUN).forEach((r, i) => {
    const wt = i < 3 ? 1.5 : 1;
    if (!r.games.length) { s += 5 * wt; w += wt; return; }
    r.games.forEach((g) => {
      s += g.d * wt; w += wt;
      // the opponent is at home when this team is away
      const o = rec[g.oppId] && rec[g.oppId][g.home ? "a" : "h"];
      if (o && o.n) { ga += o.ga / o.n; gf += o.gf / o.n; k++; }
    });
  });
  return { fdr: w ? r2(s / w) : 5, oppGA: k ? r2(ga / k) : null, oppGF: k ? r2(gf / k) : null };
}

// One player, everything the report says about him
function playerRow(e, team, hist, cur, cfg) {
  const H = (hist || []).filter((h) => h.round <= cur);
  const byGw = {};
  H.forEach((h) => {
    const g = byGw[h.round] || (byGw[h.round] = { pts: 0, min: 0, xgi: 0, xgc: 0, sv: 0, dc: 0, bon: 0, cs: 0 });
    g.pts += num(h.total_points); g.min += num(h.minutes); g.xgi += num(h.expected_goal_involvements);
    g.xgc += num(h.expected_goals_conceded); g.sv += num(h.saves); g.dc += num(h.defensive_contribution);
    g.bon += num(h.bonus); g.cs += num(h.clean_sheets);
  });
  const recent = []; for (let g = cur - FORM_GWS + 1; g <= cur; g++) if (g >= 1) recent.push(g);
  const sum = (gws, k) => gws.reduce((s, g) => s + (byGw[g] ? byGw[g][k] : 0), 0);
  const per90 = (v, m) => m > 0 ? v / m * 90 : 0;
  const rMin = sum(recent, "min");
  const early = []; for (let g = 1; g < cur - FORM_GWS + 1; g++) early.push(g);
  const played = (gws) => gws.filter((g) => byGw[g] && byGw[g].min > 0);
  const ppg = (gws) => { const p = played(gws); return p.length ? r1(sum(p, "pts") / p.length) : null; };
  const price = num(e.now_cost) / 10;
  const mins = num(e.minutes), xg = num(e.expected_goals), xa = num(e.expected_assists);
  const pts = num(e.total_points);
  return {
    id: e.id, name: e.web_name, team: team.short, teamId: team.id, teamName: team.name,
    price, dPrice: r1(num(e.cost_change_start) / 10), pts, mins,
    p90: r1(per90(pts, mins)), g: num(e.goals_scored), a: num(e.assists),
    xg: r2(xg), xa: r2(xa), xgi90: r2(num(e.expected_goal_involvements_per_90)),
    bon: num(e.bonus), cs: num(e.clean_sheets), dc90: r1(num(e.defensive_contribution_per_90)),
    sv: num(e.saves), sv90: r2(num(e.saves_per_90)), gc: num(e.goals_conceded),
    xgc: r2(num(e.expected_goals_conceded)), xgc90: r2(num(e.expected_goals_conceded_per_90)),
    pen: e.penalties_order || null, sp: e.corners_and_indirect_freekicks_order || null, fk: e.direct_freekicks_order || null,
    own: r1(num(e.selected_by_percent)), net: num(e.transfers_in_event) - num(e.transfers_out_event),
    status: e.status || "a", chance: e.chance_of_playing_next_round, news: e.news || "",
    gws: Array.from({ length: cur }, (_, i) => byGw[i + 1] ? byGw[i + 1].pts : null),
    gwMin: Array.from({ length: cur }, (_, i) => byGw[i + 1] ? byGw[i + 1].min : null),
    recent: sum(recent, "pts"), rMinShare: r2(Math.min(1, rMin / (90 * recent.length || 1))),
    rXgi90: r2(per90(sum(recent, "xgi"), rMin)), rXgc90: r2(per90(sum(recent, "xgc"), rMin)),
    rSv90: r2(per90(sum(recent, "sv"), rMin)), rDc90: r1(per90(sum(recent, "dc"), rMin)), rBon: sum(recent, "bon"),
    ppgEarly: ppg(early), ppgRecent: ppg(recent),
    ptsPerM: r1(price ? pts / price : 0), luck: r1(num(e.goals_scored) + num(e.assists) - xg - xa),
    gcLuck: r1(num(e.goals_conceded) - num(e.expected_goals_conceded)),
    pos: cfg.key
  };
}

// The model over a position's players: each part 0..1, then weighted
function model(rows, cfg) {
  const second = (p) => cfg.key === "gkp" ? 0.5 * p.rSv90 - 0.5 * p.rXgc90
    : cfg.key === "def" ? 0.5 * p.rXgi90 + 0.05 * p.rDc90 - 0.5 * p.rXgc90
    : p.rXgi90;
  const sF = scaler(rows.map((p) => p.recent)), sS = scaler(rows.map(second));
  const sX = scaler(rows.map((p) => -p.fdr)), sV = scaler(rows.map((p) => p.ptsPerM));
  rows.forEach((p) => {
    const parts = [0.6 * sF(p.recent) + 0.4 * sS(second(p)), sX(-p.fdr), sV(p.ptsPerM), p.rMinShare];
    p.parts = parts.map(r2);
    const score = (w) => 100 * w.reduce((s, x, i) => s + x * parts[i], 0);
    p.score = Math.round(score(WEIGHTS.base));
    p.alt = {};
    ["form", "fix", "value"].forEach((k) => { p.alt[k] = score(WEIGHTS[k]); });
  });
  const rank = (key) => rows.slice().sort((a, b) => key(b) - key(a)).forEach((p, i, arr) => { p[key.name] = i + 1; });
  rows.slice().sort((a, b) => b.score - a.score || b.pts - a.pts).forEach((p, i) => { p.rank = i + 1; });
  ["form", "fix", "value"].forEach((k) => rows.slice().sort((a, b) => b.alt[k] - a.alt[k]).forEach((p, i) => { p.alt[k] = i + 1; }));
  void rank;
}

const avail = (p) => p.status === "a" && (p.chance == null || p.chance >= 75);
const unavailable = (p) => p.status === "i" || p.status === "s" || p.status === "u" || p.status === "n" || (p.chance != null && p.chance <= 25);
const nextSix = (p, teams) => teams[p.teamId].runs.slice(0, 6).map((r) => r.games.length ? r.games.map((g) => (g.home ? g.opp : g.opp.toLowerCase())).join("+") : "–");
const what = (cfg) => cfg.key === "gkp" ? "saves and clean sheets" : cfg.key === "def" ? "clean sheets and defensive contributions" : "chances";

// BUY / HOLD / WATCH / SELL, each by a rule with its reason in numbers
function verdicts(rows, cfg, next) {
  const out = [], used = new Set();
  const pick = (cands, n) => cands.filter((p) => !used.has(p.id)).slice(0, n).map((p) => { used.add(p.id); return p; });
  const byRank = rows.slice().sort((a, b) => a.rank - b.rank);
  const core = pick(byRank.filter((p) => avail(p) && p.price > cfg.budget && p.rMinShare >= 0.7), 3);
  if (core.length) out.push({ tag: "BUY", ids: core.map((p) => p.id),
    text: list(core.map((p) => p.name + " (" + money(p.price) + ")")) + ": the core. " +
      core.map((p) => p.name + " is " + ordinal(p.rank) + " in the model with " + p.recent + " points in the last " + FORM_GWS + " gameweeks").join("; ") + "." });
  const budget = pick(byRank.filter((p) => avail(p) && p.price <= cfg.budget && p.rMinShare >= 0.7), 3);
  if (budget.length) out.push({ tag: "BUY", ids: budget.map((p) => p.id),
    text: list(budget.map((p) => p.name + " (" + money(p.price) + ")")) + " are the budget picks" +
      (budget.some((p) => p.pen === 1) ? "; " + list(budget.filter((p) => p.pen === 1).map((p) => p.name)) + " " + (budget.filter((p) => p.pen === 1).length > 1 ? "are" : "is") + " first on penalties" : "") +
      ", all in the model's top " + Math.max(...budget.map((p) => p.rank)) + "." });
  const owned = rows.slice().sort((a, b) => b.own - a.own);
  const hold = pick(owned.filter((p) => p.own >= 20 && avail(p) && p.rank > 5 && p.rank <= Math.ceil(rows.length / 2)), 1);
  if (hold.length) {
    const p = hold[0];
    out.push({ tag: "HOLD", ids: [p.id], text: p.name + " (" + money(p.price) + ", " + p.own + "% owned): " + ordinal(p.rank) + " in the model, " + p.recent + " points in the last " + FORM_GWS + ". Fixtures rated " + p.fdr.toFixed(2) + " over the next six; keep for now and review weekly." });
  }
  // strong underlying numbers from real minutes, not yet in the model's top eight; and big recent
  // returns from too few minutes to trust
  const chances = pick(rows.slice().sort((a, b) => b.rXgi90 - a.rXgi90).filter((p) => (cfg.key === "mid" || cfg.key === "fwd" || cfg.key === "def") && p.rank > 8 && p.rXgi90 > 0 && p.rMinShare >= 0.6 && avail(p)), 1)
    .map((p) => p.name + " (" + p.rXgi90.toFixed(2) + " xGI per 90 lately, " + ordinal(p.rank) + " in the model)");
  const minutes = pick(rows.filter((p) => p.recent >= 15 && p.rMinShare < 0.6 && avail(p)).sort((a, b) => b.recent - a.recent), 2)
    .map((p) => p.name + " (" + pl(p.recent, "point") + " recently but " + Math.round(p.rMinShare * 100) + "% of the minutes)");
  const watch = chances.concat(minutes);
  if (watch.length) out.push({ tag: "WATCH", ids: Array.from(used).filter((id) => !out.some((v) => v.ids.indexOf(id) !== -1)),
    text: watch.join("; ") + "." });
  const dear = rows.filter((p) => p.own >= 10 && avail(p) && p.rank > Math.ceil(rows.length * 0.4)).sort((a, b) => a.rank - b.rank).reverse();
  const sold = rows.filter((p) => p.own >= 10 && p.net < -50000 && avail(p)).sort((a, b) => a.net - b.net);
  const sell = pick(dear.concat(sold), 2);
  const out3 = rows.filter((p) => unavailable(p) && p.own >= 3).sort((a, b) => b.own - a.own).slice(0, 4);
  if (sell.length || out3.length) out.push({ tag: "SELL", ids: sell.map((p) => p.id),
    text: (sell.length ? sell.map((p) => p.name + " (" + money(p.price) + ", " + p.own + "% owned, " + ordinal(p.rank) + " in the model" + (p.net < 0 ? ", " + fmtK(p.net) + " this week" : "") + ")").join(" and ") + "." : "") +
      (out3.length ? (sell.length ? " " : "") + list(out3.map((p) => p.name)) + (out3.length > 1 ? " are" : " is") + " unavailable or doubtful." : "") });
  return out;
}

// A player file: the numbers, the next six, and a few sentences by rule
function playerFile(p, rows, cfg, teams, tag) {
  const bits = [];
  const topPts = rows.slice().sort((a, b) => b.pts - a.pts).indexOf(p) + 1;
  bits.push(p.pts + " points" + (topPts <= 3 ? ", " + ordinal(topPts) + "-most of any " + cfg.one : "") + " at " + money(p.price) + (p.ptsPerM >= 9 ? " (" + p.ptsPerM + " per £m)" : "") + ".");
  if (cfg.key === "gkp") bits.push(p.cs + " clean sheets and " + p.sv + " saves (" + p.sv90.toFixed(1) + " per 90); " + (p.gcLuck > 0 ? "conceded " + p.gcLuck + " more than his expected goals against" : "conceded " + Math.abs(p.gcLuck) + " fewer than expected") + ".");
  else if (cfg.key === "def") bits.push(p.cs + " clean sheets, " + p.dc90.toFixed(1) + " defensive contributions per 90 and " + p.xgi90.toFixed(2) + " xGI per 90.");
  else bits.push(p.xgi90.toFixed(2) + " xGI per 90 over the season, " + p.rXgi90.toFixed(2) + " in the last " + FORM_GWS + "; " + (p.luck >= 1.5 ? "returning more than his chances suggest (+" + p.luck + ")" : p.luck <= -1.5 ? "returns should come (" + p.luck + " against his chances)" : "returns in line with his chances") + ".");
  if (p.pen === 1) bits.push("First on penalties" + (p.sp === 1 ? " and corners" : "") + ".");
  bits.push(p.recent + " points in the last " + FORM_GWS + " gameweeks" + (p.ppgEarly != null && p.ppgRecent != null && Math.abs(p.ppgRecent - p.ppgEarly) >= 1.5 ? " (" + p.ppgEarly + " → " + p.ppgRecent + " per game)" : "") + ".");
  const six = nextSix(p, teams);
  bits.push("Next six rated " + p.fdr.toFixed(2) + " (" + (p.fdr <= 2.8 ? "kind" : p.fdr >= 3.3 ? "hard" : "average") + "): " + six.slice(0, 3).join(", ") + " first.");
  if (p.net) bits.push(fmtK(p.net) + " net transfers this week, " + p.own + "% owned.");
  if (p.rMinShare < 0.6) bits.push("Played " + Math.round(p.rMinShare * 100) + "% of the minutes lately: a rotation risk.");
  if (!avail(p)) bits.push(p.news || "Fitness doubt.");
  return { id: p.id, tag, text: bits.join(" "), next6: six };
}

function build(bs, fx, histories, now = Date.now()) {
  const cur = (bs.events.find((e) => e.is_current) || {}).id;
  const nextEv = bs.events.find((e) => e.is_next);
  if (!cur || !nextEv) return null;
  const teams = fixtureRuns(bs, fx, nextEv.id), rec = venueRecords(bs, fx);
  const runs = {};
  Object.values(teams).forEach((t) => { runs[t.id] = runSummary(t, rec); });
  const out = { gw: nextEv.id, after: cur, deadline: nextEv.deadline_time, built: new Date(now).toISOString(), recent: [], positions: {} };
  for (let g = cur - FORM_GWS + 1; g <= cur; g++) if (g >= 1) out.recent.push(g);
  Object.keys(POS).forEach((t) => {
    const cfg = POS[t];
    const els = bs.elements.filter((e) => e.element_type === +t && !e.removed).sort((a, b) => num(b.total_points) - num(a.total_points) || num(b.minutes) - num(a.minutes)).slice(0, cfg.top);
    const rows = els.map((e) => {
      const p = playerRow(e, teams[e.team], histories[e.id], cur, cfg);
      Object.assign(p, runs[e.team]);
      return p;
    });
    if (!rows.length) return;
    model(rows, cfg);
    const by = (k, dir = -1) => rows.slice().sort((a, b) => dir * (a[k] - b[k]));
    const head = [
      { k: "Most points", v: String(by("pts")[0].pts), who: by("pts")[0].name + ", " + money(by("pts")[0].price) },
      { k: "Best pts per £m", v: String(by("ptsPerM")[0].ptsPerM), who: by("ptsPerM")[0].name + ", " + money(by("ptsPerM")[0].price) },
      { k: "Most pts, GW" + out.recent[0] + "–" + cur, v: String(by("recent")[0].recent), who: by("recent")[0].name + ", " + money(by("recent")[0].price) },
      { k: "Most bought this week", v: fmtK(by("net")[0].net), who: by("net")[0].name }
    ];
    const verdict = verdicts(rows, cfg, nextEv.id);
    // player files: the big names (most points, most owned, the form pick) and the budget picks
    const files = [], seen = new Set();
    const add = (p, group, tag) => { if (!p || seen.has(p.id) || files.filter((f) => f.group === group).length >= 6) return; seen.add(p.id); files.push(Object.assign(playerFile(p, rows, cfg, teams, tag), { group })); };
    const tagOf = (p) => { const v = verdict.find((x) => x.ids.indexOf(p.id) !== -1); return v ? v.tag : p.rank <= 10 ? "BUY" : unavailable(p) ? "SELL" : "WATCH"; };
    by("pts").slice(0, 3).forEach((p) => add(p, "big", tagOf(p)));
    add(by("recent")[0], "big", tagOf(by("recent")[0]));
    by("own").slice(0, 4).forEach((p) => add(p, "big", tagOf(p)));
    rows.filter((p) => p.price <= cfg.budget).sort((a, b) => a.rank - b.rank).slice(0, 8).forEach((p) => add(p, "budget", tagOf(p)));
    // the plan: captaincy for this position, differentials, price watch, unavailable
    const nxt = (p) => teams[p.teamId].runs[0].games;
    const capt = rows.filter((p) => avail(p) && nxt(p).length).map((p) => {
      const g = nxt(p)[0], o = rec[g.oppId] && rec[g.oppId][g.home ? "a" : "h"];
      const oppGA = o && o.n ? o.ga / o.n : 1.3, oppGF = o && o.n ? o.gf / o.n : 1.3;
      const attack = cfg.key === "gkp" || cfg.key === "def" ? (2.5 - oppGF) * 2 : oppGA * 2;
      return { p, g, oppGA: r2(oppGA), oppGF: r2(oppGF), s: p.recent / FORM_GWS + attack + (5 - g.d) + (p.pen === 1 ? 1 : 0) + nxt(p).length * 2 - 2 };
    }).sort((a, b) => b.s - a.s).slice(0, 6).map((c, i) => ({
      id: c.p.id, opp: c.g.home ? c.g.opp : c.g.opp.toLowerCase(), d: c.g.d,
      why: (c.g.home ? "At home to " : "Away at ") + teams[c.g.oppId].name + (cfg.key === "gkp" || cfg.key === "def" ? " (they score " + c.oppGF + " a game " + (c.g.home ? "away" : "at home") + ")" : " (they concede " + c.oppGA + " a game " + (c.g.home ? "away" : "at home") + ")") +
        (nxt(c.p).length > 1 ? "; a double gameweek" : "") + (c.p.pen === 1 ? "; on penalties" : "") + "."
    }));
    const diffs = rows.filter((p) => p.own < 5 && avail(p)).sort((a, b) => a.rank - b.rank).slice(0, 9).map((p) => p.id);
    const up = by("net").filter((p) => p.net > 0).slice(0, 5).map((p) => p.id);
    const down = by("net", 1).filter((p) => p.net < 0).slice(0, 6).map((p) => p.id);
    const out1 = rows.filter((p) => !avail(p)).sort((a, b) => b.own - a.own).slice(0, 8).map((p) => ({ id: p.id, news: p.news || (p.status === "s" ? "Suspended" : "Doubtful") }));
    const bands = cfg.key === "gkp" ? [[5.0, 99, "£5m+"], [4.6, 4.95, "£4.6–4.9m"], [0, 4.55, "Under £4.6m"]]
      : cfg.key === "def" ? [[5.5, 99, "£5.5m+"], [4.9, 5.45, "£4.9–5.4m"], [0, 4.85, "Under £4.9m"]]
      : cfg.key === "mid" ? [[9, 99, "£9m+"], [7, 8.95, "£7–8.9m"], [5.9, 6.95, "£5.9–6.9m"], [0, 5.85, "Under £5.9m"]]
      : [[9, 99, "£9m+"], [7, 8.95, "£7–8.9m"], [0, 6.95, "Under £7m"]];
    const budgetMoves = bands.map(([lo, hi, label]) => {
      const inBand = rows.filter((p) => p.price >= lo && p.price <= hi).sort((a, b) => a.rank - b.rank);
      const best = inBand.filter(avail).slice(0, 2), worst = inBand.filter((p) => p.own >= 10 && p.rank > Math.ceil(rows.length / 2)).slice(-1);
      if (!inBand.length) return null;
      return { band: label, text: (best.length ? "Best in the model: " + list(best.map((p) => p.name + " (" + ordinal(p.rank) + ", " + p.recent + " pts lately)")) + "." : "Nobody fit in this band.") +
        (worst.length ? " Move on from " + worst[0].name + " (" + worst[0].own + "% owned, " + ordinal(worst[0].rank) + ")." : "") };
    }).filter(Boolean);
    const changes = rows.filter((p) => !avail(p) && /expected back|chance of playing/i.test(p.news) && p.pts >= by("pts")[Math.min(9, rows.length - 1)].pts)
      .slice(0, 3).map((p) => p.name + ": " + p.news + ". " + p.pts + " points so far; a pick again once fit.");
    rows.filter((p) => p.rMinShare < 0.6 && p.rank <= 10).slice(0, 2).forEach((p) => changes.push(p.name + " starting again would make him one of the best picks (" + ordinal(p.rank) + " in the model on " + Math.round(p.rMinShare * 100) + "% of the minutes)."));
    // the form page: the 30 with most points lately, and the biggest movers
    const form = by("recent").slice(0, 30).map((p) => p.id);
    const movers = rows.filter((p) => p.ppgEarly != null && p.ppgRecent != null).map((p) => ({ id: p.id, d: r1(p.ppgRecent - p.ppgEarly) })).sort((a, b) => b.d - a.d);
    const formText = [];
    const hot = by("recent").slice(0, 3);
    formText.push("Hottest: " + list(hot.map((p) => p.name + " (" + p.recent + ")")) + " in GW" + out.recent[0] + "–" + cur + ".");
    const cooling = movers.slice().reverse().filter((m) => m.d <= -1.5).slice(0, 3).map((m) => rows.find((p) => p.id === m.id));
    if (cooling.length) formText.push("Cooling: " + list(cooling.map((p) => p.name + " (" + p.ppgEarly + " → " + p.ppgRecent + " per game)")) + ".");
    const cheapRise = movers.filter((m) => m.d >= 1.5).map((m) => rows.find((p) => p.id === m.id)).filter((p) => p.price <= cfg.budget).slice(0, 2);
    if (cheapRise.length) formText.push("Quiet risers: " + list(cheapRise.map((p) => p.name + " (" + money(p.price) + ", " + p.ppgEarly + " → " + p.ppgRecent + ")")) + ".");
    // the fixtures page: teams with players in this report, by their run
    const teamIds = Array.from(new Set(rows.map((p) => p.teamId)));
    const fixRows = teamIds.map((id) => ({ team: teams[id].short, id, ...runs[id], runs: teams[id].runs.map((r) => r.games.map((g) => ({ o: g.opp, h: g.home ? 1 : 0, d: g.d }))),
      players: rows.filter((p) => p.teamId === id).sort((a, b) => b.pts - a.pts).slice(0, 2).map((p) => p.name) })).sort((a, b) => a.fdr - b.fdr);
    const best = (from, to) => teamIds.map((id) => {
      const rr = teams[id].runs.slice(from, to); let s = 0, n = 0;
      rr.forEach((r) => { if (!r.games.length) { s += 5; n++; } r.games.forEach((g) => { s += g.d; n++; }); });
      return { id, s: n ? s / n : 5 };
    }).sort((a, b) => a.s - b.s).slice(0, 5).map((x) => ({ team: teams[x.id].short, avg: r2(x.s), runs: teams[x.id].runs.slice(from, to).map((r) => r.games.map((g) => ({ o: g.opp, h: g.home ? 1 : 0, d: g.d }))),
      player: (rows.filter((p) => p.teamId === x.id).sort((a, b) => a.rank - b.rank)[0] || {}).name }));
    const fixText = (() => {
      const kind = fixRows.slice(0, 2), hard = fixRows.slice(-2);
      return "Kindest runs: " + list(kind.map((t) => teams[t.id].name + " (" + t.fdr.toFixed(2) + (t.players.length ? ", " + list(t.players) : "") + ")")) + ". " +
        "Hardest: " + list(hard.map((t) => teams[t.id].name + " (" + t.fdr.toFixed(2) + ")")) + ". " +
        (cfg.key === "gkp" || cfg.key === "def" ? "For " + cfg.name.toLowerCase() + ", what the opponents score (Opp GF) matters most: a clean sheet is worth " + (cfg.key === "gkp" || cfg.key === "def" ? 4 : 1) + " points."
          : "For " + cfg.name.toLowerCase() + ", what the opponents concede (Opp GA) matters most.");
    })();
    const top = rows.slice().sort((a, b) => a.rank - b.rank);
    const cheapTop10 = top.slice(0, 10).filter((p) => p.price <= cfg.budget).length;
    const modelText = list(top.slice(0, 3).map((p) => p.name)) + " lead the model. " + cheapTop10 + " of the top ten cost " + money(cfg.budget) + " or less. " +
      "Most-owned outside the top ten: " + (rows.filter((p) => p.rank > 10).sort((a, b) => b.own - a.own).slice(0, 3).map((p) => p.name + " (" + ordinal(p.rank) + ")").join(", ") || "none") + ".";
    out.positions[cfg.key] = {
      key: cfg.key, name: cfg.name, one: cfg.one, budget: cfg.budget, n: rows.length,
      head, verdict, players: rows, files,
      form: { ids: form, movers: movers.slice(0, 9).concat(movers.slice(-9).reverse().filter((m) => m.d < 0)), text: formText },
      fixtures: { teams: fixRows, best: { a: best(0, 3), b: best(3, 6), c: best(6, 8) }, text: fixText },
      model: { ids: top.slice(0, 30).map((p) => p.id), text: modelText },
      plan: { budget: budgetMoves, captaincy: capt, diffs, up, down, out: out1, changes }
    };
  });
  return out;
}

/* ---- fetching and writing ------------------------------------------------ */
async function get(url) {
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (gameon scouting reports)" }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(url + " answered " + res.status);
  return res.json();
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function output(k, v) { if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, k + "=" + v + "\n"); }

// Is a build due? After a finished, checked gameweek, for the next deadline:
// none yet, or the last is over REFRESH_H old and the deadline hasn't passed
function due(bs, index, now = Date.now()) {
  const cur = bs.events.find((e) => e.is_current), nextEv = bs.events.find((e) => e.is_next);
  if (!cur || !nextEv || !cur.finished || !cur.data_checked) return { due: false, why: "gameweek " + (cur && cur.id) + " not finished and checked yet" };
  if (now >= Date.parse(nextEv.deadline_time)) return { due: false, why: "the GW" + nextEv.id + " deadline has passed" };
  const have = (index.reports || []).find((r) => r.gw === nextEv.id);
  if (!have) return { due: true, why: "no report for GW" + nextEv.id + " yet" };
  if (now - Date.parse(have.built) >= REFRESH_H * 3600e3 || process.env.SCOUT_FORCE) return { due: true, why: "refresh (last built " + have.built + ")" };
  return { due: false, why: "GW" + nextEv.id + " built " + have.built };
}

async function main() {
  let index = { reports: [] };
  try { index = JSON.parse(fs.readFileSync(path.join(OUT, "index.json"), "utf8")); } catch (e) { /* first report */ }
  const bs = await get(API + "/bootstrap-static/");
  const d = due(bs, index);
  console.log("scouting reports: " + d.why);
  if (!d.due) { output("built", "false"); return; }
  const fx = await get(API + "/fixtures/");
  // histories for every player a report covers
  const ids = [];
  Object.keys(POS).forEach((t) => bs.elements.filter((e) => e.element_type === +t && !e.removed)
    .sort((a, b) => num(b.total_points) - num(a.total_points) || num(b.minutes) - num(a.minutes)).slice(0, POS[t].top).forEach((e) => ids.push(e.id)));
  const histories = {};
  let failed = 0;
  for (const id of ids) {
    try { histories[id] = (await get(API + "/element-summary/" + id + "/")).history; }
    catch (e) { failed++; if (failed > 10) throw new Error("player histories unavailable (" + e.message + ")"); }
    await wait(150);
  }
  const rep = build(bs, fx, histories);
  if (!rep) { output("built", "false"); return; }
  const dir = path.join(OUT, "gw" + rep.gw);
  fs.mkdirSync(dir, { recursive: true });
  Object.values(rep.positions).forEach((p) => {
    fs.writeFileSync(path.join(dir, p.key + ".json"), JSON.stringify(Object.assign({ gw: rep.gw, after: rep.after, deadline: rep.deadline, built: rep.built, recent: rep.recent }, p)) + "\n");
  });
  const entry = { gw: rep.gw, after: rep.after, deadline: rep.deadline, built: rep.built,
    positions: Object.values(rep.positions).map((p) => ({ key: p.key, name: p.name, n: p.n, top: p.head[0].who, verdict: (p.verdict[0] || {}).text || "" })) };
  index.reports = [entry].concat((index.reports || []).filter((r) => r.gw !== rep.gw)).sort((a, b) => b.gw - a.gw);
  fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify(index) + "\n");
  console.log("built GW" + rep.gw + " reports: " + entry.positions.map((p) => p.name + " (" + p.n + ")").join(", ") + (failed ? "; " + failed + " histories missing" : ""));
  output("built", "true");
  output("gw", String(rep.gw));
}

module.exports = { build, due, POS, WEIGHTS };
if (require.main === module) {
  main().catch((e) => { console.log("scouting reports skipped: " + e.message); output("built", "false"); });
}
