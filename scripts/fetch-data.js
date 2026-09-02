/* ==========================================================================
   Game On V12 — server-side FPL fetcher (runs in GitHub Actions).
   GitHub's runners reach the FPL API directly (no CORS, no proxy), so this
   pulls the whole league and writes ./data.json, which every participant's
   app loads. Keep CLASSIC / H2H ids in sync with config.js.
   Node 18+ (global fetch). No dependencies.
   ========================================================================== */
const fs = require("fs");
const { provisionalBonus } = require("./bonus.js");

const BASE = "https://fantasy.premierleague.com/api";
const CLASSIC = 478139;
const H2H = [
  831308, 831309, 831313, 831338, 831344, 831346, 831350, 831351,
  831357, 831362, 831367, 831369, 831370, 831372, 831383, 831385
];
const HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; GameOnV12-bot/1.0)", "Accept": "application/json" };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJSON(path, tries = 5) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 30000);
      const res = await fetch(BASE + path, { headers: HEADERS, signal: ctrl.signal });
      clearTimeout(t);
      if (res.status === 429 || res.status >= 500) { await sleep(1500 * (i + 1)); continue; }
      if (!res.ok) throw new Error("HTTP " + res.status + " for " + path);
      return await res.json();
    } catch (e) { last = e; await sleep(700 * (i + 1)); }
  }
  throw last;
}

async function pool(items, worker, concurrency = 6) {
  const results = new Array(items.length);
  let i = 0, active = 0, done = 0, failed = 0;
  return new Promise((resolve) => {
    const next = () => {
      if (done === items.length) return resolve({ results, failed });
      while (active < concurrency && i < items.length) {
        const idx = i++; active++;
        Promise.resolve(worker(items[idx], idx))
          .then((v) => { results[idx] = v; })
          .catch(() => { failed++; })
          .finally(() => { active--; done++; next(); });
      }
    };
    if (!items.length) resolve({ results, failed }); else next();
  });
}

async function classicAll() {
  let all = [], name = "";
  for (let page = 1; ; page++) {
    const d = await getJSON("/leagues-classic/" + CLASSIC + "/standings/?page_standings=" + page);
    if (!name) name = (d.league && d.league.name) || "";
    const res = (d.standings && d.standings.results) || [];
    res.forEach((r) => all.push({
      id: r.entry, entryName: r.entry_name, playerName: r.player_name,
      rank: r.rank, lastRank: r.last_rank, total: r.total, eventTotal: r.event_total
    }));
    if (!(d.standings && d.standings.has_next)) break;
  }
  return { managers: all, name };
}

// Who plays whom, gameweek by gameweek. FPL's standings endpoint gives the
// table but not the fixtures, and the app had no way to say who anyone faces
// next. Only the schedule is stored: it never changes, so it is fetched once
// and kept, and the scores are read from the gameweek history we already hold —
// which means a fixture shows live points, provisional bonus and all, without
// any of this being fetched again.
async function h2hFixtures(id) {
  const ents = [], idx = {};
  const put = (e) => { if (idx[e] == null) { idx[e] = ents.length; ents.push(e); } return idx[e]; };
  const fx = [];
  for (let page = 1; page <= 60; page++) {
    const d = await getJSON("/leagues-h2h-matches/league/" + id + "/?page=" + page);
    const res = (d && d.results) || [];
    res.forEach((m) => {
      if (!m || !m.event) return;
      // FPL pads an odd-sized league with a phantom "AVERAGE" opponent that has
      // no entry id. Dropping those fixtures would leave one manager a week
      // looking as though they had no game at all, so AVERAGE is kept and
      // stored as -1. Anything else without an id is genuinely unusable.
      const side = (e, n) => {
        if (e) return put(e);
        return /average/i.test(String(n || "")) ? -1 : null;
      };
      const a = side(m.entry_1_entry, m.entry_1_name);
      const b = side(m.entry_2_entry, m.entry_2_name);
      if (a === null || b === null) return;
      fx.push([m.event, a, b]);
    });
    // Stop on an empty page as well as on has_next:false. If the field ever
    // moves or disappears we keep paging until a page comes back empty rather
    // than silently storing half a schedule.
    if (!res.length) break;
    if (d && d.has_next === false) break;
  }
  // v2: AVERAGE fixtures are kept (stored as -1). A schedule stored without
  // the version marker predates that and is refetched once.
  return { v: 2, ents: ents, fx: fx };
}

async function h2hAll(id) {
  let all = [], name = "";
  for (let page = 1; ; page++) {
    const d = await getJSON("/leagues-h2h/" + id + "/standings/?page_standings=" + page);
    if (!name) name = (d.league && d.league.name) || "";
    const res = (d.standings && d.standings.results) || [];
    // Only the fields the app reads — the rest is a third of this file.
    res.forEach((r) => all.push({
      entry: r.entry, entry_name: r.entry_name, player_name: r.player_name,
      total: r.total, points_for: r.points_for,
      matches_won: r.matches_won, matches_drawn: r.matches_drawn, matches_lost: r.matches_lost
    }));
    if (!(d.standings && d.standings.has_next)) break;
  }
  return { league: { name: name }, results: all };
}

(async () => {
  console.log("Fetching bootstrap…");
  const bs = await getJSON("/bootstrap-static/");
  const events = (bs.events || []).map((e) => ({
    id: e.id, name: e.name, finished: e.finished, data_checked: e.data_checked,
    is_current: e.is_current, is_next: e.is_next, deadline_time: e.deadline_time,
    // what the phantom "AVERAGE" opponent scores in an odd-sized h2h league
    average: e.average_entry_score
  }));

  console.log("Fetching classic league…");
  const { managers, name } = await classicAll();
  console.log("  " + managers.length + " managers");

  console.log("Fetching manager histories…");
  const history = {};
  const pastSeasons = {};
  const chips = {};
  const hist = await pool(managers, async (m) => {
    const h = await getJSON("/entry/" + m.id + "/history/");
    const gw = {};
    (h.current || []).forEach((c) => {
      // v = squad value + bank (tenths of a million), tr = transfers, r = overall rank
      gw[c.event] = { p: c.points, h: c.event_transfers_cost || 0, b: c.points_on_bench || 0, t: c.total_points,
                      v: c.value || 0, bk: c.bank || 0, tr: c.event_transfers || 0, r: c.overall_rank || 0 };
    });
    history[m.id] = gw;
    if (h.chips && h.chips.length) {
      chips[m.id] = h.chips.map((c) => ({ n: c.name, gw: c.event }));
    }
    if (h.past && h.past.length) {
      pastSeasons[m.id] = h.past.map((p) => ({ season: p.season_name, rank: p.rank, total: p.total_points }));
    }
  }, 6);
  console.log("  histories done, failed " + hist.failed);

  console.log("Fetching H2H group standings…");
  // What we published last time: the h2h schedule and the price record are both
  // carried forward from it rather than fetched again.
  let prev = {};
  try { prev = JSON.parse(fs.readFileSync("data.json", "utf8")).dataset || {}; } catch (e) {}

  const h2h = {};
  await pool(H2H, async (id) => { h2h[id] = await h2hAll(id); }, 4);

  // A manager can enter a group league with a second FPL team that is not in
  // the classic league (there is one this season: entry 25106 in Group B).
  // Their h2h matches are scored by FPL from THAT team, so its gameweek
  // history is fetched too — otherwise every fixture of theirs would show a
  // blank where FPL shows a score. Names come from the league standings.
  const extra = [];
  Object.keys(h2h).forEach((lid) => {
    ((h2h[lid] || {}).results || []).forEach((r) => {
      if (r.entry && !history[r.entry] && extra.indexOf(r.entry) === -1) extra.push(r.entry);
    });
  });
  if (extra.length) {
    console.log("  " + extra.length + " h2h-only entr" + (extra.length === 1 ? "y" : "ies") + ": " + extra.join(", "));
    await pool(extra, async (id) => {
      const h = await getJSON("/entry/" + id + "/history/");
      const gw = {};
      (h.current || []).forEach((c) => {
        gw[c.event] = { p: c.points, h: c.event_transfers_cost || 0, b: c.points_on_bench || 0, t: c.total_points,
                        v: c.value || 0, bk: c.bank || 0, tr: c.event_transfers || 0, r: c.overall_rank || 0 };
      });
      history[id] = gw;
    }, 4);
  }

  // The schedule is static, so keep whatever we already have and only ask for
  // the leagues we are missing. A first run pays for all sixteen; every run
  // after that pays for none.
  const prevFx = (prev.h2hFixtures || {});
  const h2hFx = {};
  const needFx = H2H.filter((id) => !(prevFx[id] && prevFx[id].v === 2 && (prevFx[id].fx || []).length));
  H2H.forEach((id) => { if (prevFx[id]) h2hFx[id] = prevFx[id]; });
  if (needFx.length) {
    console.log("fetching h2h fixtures for " + needFx.length + " league(s)");
    await pool(needFx, async (id) => {
      try {
        const got = await h2hFixtures(id);
        if (got.fx.length) h2hFx[id] = got;
      } catch (e) { console.log("  h2h fixtures " + id + " failed (non-fatal): " + e.message); }
    }, 3);
  }

  // Squads for every gameweek played so far. These power the LMS "players
  // played" column and the pitch on each manager's profile, which can be
  // stepped back through the season. A finished gameweek's squads and points
  // never change, so we reuse whatever the last run already wrote and only
  // fetch the gameweeks we are missing (plus the live one, which moves).
  const liveAudit = {};

  // Everything that moves during a gameweek, in one request pair: each player's
  // points and minutes, plus the bonus FPL has not published yet.
  //
  // Bonus only appears once a fixture is finalised. Until then FPL's own site
  // ranks bps to show it provisionally, and a tracker that does not do the same
  // reads up to three points light per bonus-earning player for the length of
  // the match. It is applied ONLY to fixtures still in play: a finalised
  // fixture already has its bonus inside total_points, so adding ours on top
  // would count it twice.
  async function liveFor(gw, settled) {
    const live = await getJSON("/event/" + gw + "/live/");
    const mins = {}, pts = {}, bpsByFixture = {};
    // The league breaks a Last Manager Standing tie on bench points, then goals,
    // then clean sheets, then assists in the playing XI. Only the first was
    // computable, because only points were kept. These come from the same
    // response and are stored sparsely — in a given gameweek most players score
    // none of them, so the cost is a few hundred entries rather than 600 x 3.
    const goals = {}, cs = {}, assists = {};
    // The full scoring lines behind each player's total — minutes, goals,
    // cards, saves, bonus — exactly as FPL explains them, kept for the tap-a-
    // player breakdown. Only rows that score (plus minutes) are stored.
    const expl = {};
    (live.elements || []).forEach((el) => {
      const st = el.stats || {};
      mins[el.id] = st.minutes || 0;
      pts[el.id] = st.total_points || 0;
      if (st.goals_scored) goals[el.id] = st.goals_scored;
      if (st.clean_sheets) cs[el.id] = st.clean_sheets;
      if (st.assists) assists[el.id] = st.assists;
      (el.explain || []).forEach((ex) => {
        (ex.stats || []).forEach((x) => {
          if (x.identifier === "bps") {
            (bpsByFixture[ex.fixture] || (bpsByFixture[ex.fixture] = {}))[el.id] = x.value || 0;
            return;
          }
          if (!x.points && x.identifier !== "minutes") return;
          if (x.identifier === "minutes" && !x.value) return;
          (expl[el.id] = expl[el.id] || []).push([x.identifier, x.value || 0, x.points || 0]);
        });
      });
    });
    const bonus = {};
    if (!settled) {
      try {
        const fixtures = await getJSON("/fixtures/?event=" + gw);
        let inPlay = 0;
        (fixtures || []).forEach((f) => {
          // Provisional bonus holds from kick-off until FPL marks the fixture
          // finished — which is when the real bonus lands inside total_points.
          // Cutting off at finished_provisional (full time) left a window of
          // up to an hour where every bonus earner's score dipped and then
          // jumped back. The official app's live views and Football Fix both
          // hold the provisional value across that window.
          if (!f.started || f.finished) return;
          inPlay++;
          const b = provisionalBonus(bpsByFixture[f.id] || {});
          // a double gameweek can earn bonus in more than one fixture
          Object.keys(b).forEach((el) => { bonus[el] = (bonus[el] || 0) + b[el]; });
        });
        if (inPlay) console.log("  GW " + gw + " — " + inPlay + " fixture(s) in play, provisional bonus for " +
                                Object.keys(bonus).length + " player(s)");
      } catch (e) { console.log("  GW " + gw + " fixtures failed, no provisional bonus: " + e.message); }
    }
    return { mins, pts, bonus, goals, cs, assists, expl };
  }

  // Every run checks the formula the live view uses against FPL's own score for
  // the same gameweek — with and without provisional bonus. That is what
  // settles which of the two FPL is actually counting, from real data rather
  // than from an assumption, and it keeps checking every run afterwards.
  function audit(gw, squads, pts, bonus) {
    const ids = Object.keys(squads);
    let n = 0, plain = 0, withBonus = 0;
    for (const id of ids) {
      const row = (history[id] || {})[gw];
      if (!row || typeof row.p !== "number") continue;
      let a = 0, b = 0;
      (squads[id].p || []).forEach((pk) => {
        const base = pts[pk[0]] || 0;
        a += base * pk[1];
        b += (base + (bonus[pk[0]] || 0)) * pk[1];
      });
      const hit = row.h || 0;
      n++;
      if (a === row.p || a - hit === row.p) plain++;
      if (b === row.p || b - hit === row.p) withBonus++;
    }
    if (!n) return;
    const pc = (v) => Math.round((v / n) * 100);
    console.log("  GW " + gw + " — squad totals vs FPL: " + pc(plain) + "% match without bonus, " +
                pc(withBonus) + "% with it (" + n + " checked)");
    liveAudit[gw] = { n: n, plain: plain, withBonus: withBonus };
  }

  let elements = null, pitchGw = null;
  const livePoints = {}, picks = {}, liveBonus = {}, picksFinal = {}, liveStats = {}, breakdown = {};
  // goals, clean sheets and assists for one gameweek, kept only where a player
  // actually recorded one — these are the Last Manager Standing tie-breakers
  const keepStats = (gw, src) => {
    const g = src && src.goals, c = src && src.cs, a = src && src.assists;
    const any = (o) => o && Object.keys(o).length;
    if (any(g) || any(c) || any(a)) liveStats[gw] = { g: g || {}, c: c || {}, a: a || {} };
  };

  // Compact element lookup: id -> [web_name, element_type(1-4), team_short].
  const teamShort = {};
  const teamNames = {};
  (bs.teams || []).forEach((t) => { teamShort[t.id] = t.short_name; teamNames[t.short_name] = t.name; });

  // What FPL publishes about a player that we are not reading. We reinvented a
  // price-change progress bar from transfer counts, and a rival site says its
  // own progress "comes directly from FPL" — so a field we never looked at may
  // have been sitting in this response the whole time. Print the list once a
  // run: it costs a line in the log and answers that question every time FPL
  // adds something, instead of us finding out months later.
  const KNOWN_EL = ["id", "web_name", "first_name", "second_name", "element_type", "team",
    "now_cost", "selected_by_percent", "cost_change_event", "cost_change_start",
    "transfers_in", "transfers_out",
    "price_change_percent", "price_change_hourly_rate", "price_change_projections",
    "price_change_locked_until", "price_change_calibrating"];
  const sample = (bs.elements || [])[0];
  if (sample) {
    const unread = Object.keys(sample).filter((k) => KNOWN_EL.indexOf(k) === -1);
    console.log("bootstrap element fields we do not read (" + unread.length + "): " + unread.join(", "));
    // and what they actually hold on one real player, so a promising name is
    // not just a name
    const shown = {};
    unread.forEach((k) => { const v = sample[k]; if (v !== null && v !== "" && v !== 0) shown[k] = v; });
    console.log("  non-empty on " + sample.web_name + ": " + JSON.stringify(shown));
  }

  elements = {};
  (bs.elements || []).forEach((el) => {
    // The table shows the short name FPL uses, but people search for the name
    // they know — "Erling" finds Haaland. Keep the full name alongside it, and
    // only when it says something the short name does not.
    const full = ((el.first_name || "") + " " + (el.second_name || "")).trim();
    const extra = full && full.toLowerCase() !== String(el.web_name || "").toLowerCase()
      ? full : "";
    // [name, position, club, price(tenths), owned% across all FPL, full name,
    //  season-start price(tenths) — the purchase price of an original pick]
    elements[el.id] = [el.web_name, el.element_type, teamShort[el.team] || "",
                       el.now_cost || 0, parseFloat(el.selected_by_percent) || 0, extra,
                       (el.now_cost || 0) - (el.cost_change_start || 0)];
  });

  /* ---- prices, and the transfer flow that moves them -------------------- */
  // FPL publishes no history of price changes and no record of when one
  // happened, so the only way to have either is to keep our own from now on.
  //
  // The flow that drives a change is net transfers measured since that player
  // last moved. transfers_in_event resets at every deadline, which is not how
  // the game's own counter behaves, so this diffs the season-cumulative fields
  // between our runs instead and carries a rolling total per player — reset to
  // zero the moment his price actually moves.
  const prevPrices = (prev.prices && prev.prices.now) || {};
  const prevIn = (prev.prices && prev.prices.tIn) || {};
  const prevOut = (prev.prices && prev.prices.tOut) || {};
  const prevNet = (prev.prices && prev.prices.netSince) || {};
  const prevExact = (prev.prices && prev.prices.exact) || {};
  const priceLog = (prev.priceLog || []).slice();

  const priceNow = {}, tIn = {}, tOut = {}, netSince = {}, exact = {},
        changeStart = {}, owned = {};
  const stamp = new Date().toISOString();
  // Ownership is published as a percentage; the threshold behaves like a count,
  // so we need to know how many people are playing to turn one into the other.
  const total = Number(bs.total_players) || 0;
  let moved = 0;
  (bs.elements || []).forEach((el) => {
    const id = el.id;
    const cost = el.now_cost || 0;
    priceNow[id] = cost;
    changeStart[id] = el.cost_change_start || 0;
    owned[id] = parseFloat(el.selected_by_percent) || 0;
    tIn[id] = el.transfers_in || 0;
    tOut[id] = el.transfers_out || 0;

    const was = prevPrices[id];
    const dIn = (tIn[id] - (prevIn[id] != null ? prevIn[id] : tIn[id]));
    const dOut = (tOut[id] - (prevOut[id] != null ? prevOut[id] : tOut[id]));
    const roll = (prevNet[id] || 0) + (dIn - dOut);

    if (was != null && was !== cost) {
      // A real change, dated by us because FPL does not date them. Record the
      // pressure that was on him as it happened: the counter resets on the next
      // line and the number is gone for good otherwise. These are the only
      // observations of where the game's own threshold actually sits, so they
      // are what the progress bar is later calibrated against.
      const ownerCount = total ? Math.round((owned[id] / 100) * total) : 0;
      priceLog.push([id, was, cost, stamp, (prevNet[id] || 0), ownerCount]);
      netSince[id] = 0;                       // the counter starts again
      exact[id] = 1;                          // and we watched it happen
      moved++;
    } else if (prevExact[id]) {
      // We have seen this player's last change ourselves, so counting on from
      // it is exact and must not be replaced by the season figure below — a
      // player who rose and then fell back reads as unmoved all season.
      netSince[id] = roll;
      exact[id] = 1;
    } else if (!changeStart[id]) {
      // His price has never moved this season, so everything the season has
      // done to him still counts towards his first move. Diffing our own runs
      // would only hold the flow since we started watching, which on a player
      // like this is a couple of thousand against a couple of hundred thousand.
      netSince[id] = (tIn[id] - tOut[id]);
      exact[id] = 1;
    } else {
      // He moved before we started watching and FPL does not say when, so the
      // flow before our first run is unknowable. This counts from first sight
      // and is therefore a lower bound, which the table says out loud. It
      // becomes exact the moment we see him change.
      netSince[id] = roll;
      exact[id] = 0;
    }
  });
  // a season's changes are small, but do not let the log grow without limit
  while (priceLog.length > 6000) priceLog.shift();
  if (moved) console.log(moved + " price change(s) recorded");
  // Published: what the app reads, plus what the next run needs to diff against.
  // cost_change_event and cost_change_start are used within this run only —
  // publishing them cost about 9KB a fetch and nothing ever read them back.
  // FPL's own price-change figures, published on every player and used by its
  // app: how far along he is, which way and how fast he is moving, and where it
  // expects him to be over the next few price runs. We had been estimating all
  // of this from transfer counts. Kept raw and unrounded here — what it means
  // is settled against real changes before anything is drawn from it.
  const fplPct = {}, fplRate = {}, fplProj = {}, fplLock = {}, fplCal = {};
  (bs.elements || []).forEach((el) => {
    const id = el.id;
    const pct = parseFloat(el.price_change_percent);
    if (isFinite(pct)) fplPct[id] = pct;
    const rate = Number(el.price_change_hourly_rate);
    if (isFinite(rate) && rate !== 0) fplRate[id] = rate;
    // [offset, percent, likelihood] per projection, offsets in the order FPL
    // gives them; dropped when it projects nothing
    const proj = (el.price_change_projections || []).map((x) =>
      [Number(x.offset), parseFloat(x.projected_percent), Number(x.likelihood)])
      .filter((x) => x.every(isFinite));
    if (proj.length) fplProj[id] = proj;
    if (el.price_change_locked_until) fplLock[id] = el.price_change_locked_until;
    if (el.price_change_calibrating) fplCal[id] = 1;
  });

  const prices = { at: stamp, now: priceNow, owned,
                   tIn, tOut, netSince, exact, total,
                   fpl: { pct: fplPct, rate: fplRate, proj: fplProj,
                          lock: fplLock, cal: fplCal } };

  // A finished gameweek's deadline is history. FPL does move deadlines when
  // fixtures are rescheduled around European and cup weeks, and the app reads
  // the deadline's month to decide which month a gameweek belongs to — so a
  // shift across a month boundary would quietly reassign a gameweek that has
  // already been played, changing a settled month's winner and the months-won
  // tally that breaks classic ties. Keep whatever we published while the
  // gameweek was still being played.
  const prevEvents = {};
  ((prev.bootstrap && prev.bootstrap.events) || []).forEach((e) => { prevEvents[e.id] = e; });
  let frozen = 0;
  events.forEach((e) => {
    const was = prevEvents[e.id];
    if (was && was.finished && was.data_checked && was.deadline_time &&
        was.deadline_time !== e.deadline_time) {
      e.deadline_time = was.deadline_time;
      frozen++;
    }
  });
  if (frozen) console.log("Kept the published deadline for " + frozen + " already-finished gameweek(s)");

  const canReuse = prev.picksV >= 2;
  const prevPicks = canReuse ? (prev.picks || {}) : {};
  const prevLive = canReuse ? (prev.livePoints || {}) : {};
  const prevBonus = canReuse ? (prev.liveBonus || {}) : {};
  const prevFinal = canReuse ? (prev.picksFinal || {}) : {};
  const prevStats = canReuse ? (prev.liveStats || {}) : {};
  const prevBreak = canReuse ? (prev.breakdown || {}) : {};

  const curEv = events.find((e) => e.is_current) || events.find((e) => e.is_next);
  if (curEv) {
    pitchGw = curEv.id;
    const want = events.filter((e) => e.id <= curEv.id).map((e) => e.id);
    for (const gw of want) {
      const ev = events.find((e) => e.id === gw);
      const settled = !!(ev && ev.finished && ev.data_checked);
      const cached = prevPicks[gw] && prevLive[gw] &&
        Object.keys(prevPicks[gw]).length >= Math.floor(managers.length * 0.9);
      // Squads are frozen at the deadline, so a settled gameweek can be reused
      // — but only once it has been read AFTER it settled. FPL applies
      // automatic substitutions when the gameweek finalises, and anything
      // cached while it was still live holds the pre-substitution eleven.
      if (settled && cached && prevFinal[gw]) {
        picks[gw] = prevPicks[gw];
        livePoints[gw] = prevLive[gw];
        if (prevBonus[gw]) liveBonus[gw] = prevBonus[gw];
        if (prevStats[gw]) liveStats[gw] = prevStats[gw];
        if (prevBreak[gw]) breakdown[gw] = prevBreak[gw];
        picksFinal[gw] = 1;
        console.log("GW " + gw + " — reused " + Object.keys(picks[gw]).length + " settled squads");
        continue;
      }
      if (settled && cached) console.log("GW " + gw + " — settled: re-reading squads for auto-subs");

      // A gameweek in progress has frozen squads: nothing about a team can
      // change between the deadline and the final whistle. So refresh only what
      // moves — the players' points — and leave 245 squad requests unmade. That
      // is what makes a live refresh cheap enough to run often.
      if (!settled && cached) {
        try {
          const fresh = await liveFor(gw, false);
          picks[gw] = prevPicks[gw];
          livePoints[gw] = fresh.pts;
          if (Object.keys(fresh.bonus).length) liveBonus[gw] = fresh.bonus;
          keepStats(gw, fresh);
          breakdown[gw] = fresh.expl;
          // players played is derived from the frozen squads and fresh minutes
          for (const id of Object.keys(picks[gw])) {
            let played = 0, total = 0;
            (picks[gw][id].p || []).forEach((pk) => {
              if (pk[1] > 0) { total += pk[1]; if ((fresh.mins[pk[0]] || 0) > 0) played += pk[1]; }
            });
            if (!history[id]) history[id] = {};
            if (!history[id][gw]) history[id][gw] = { p: 0, h: 0, b: 0, t: 0 };
            history[id][gw].pl = played;
            history[id][gw].plt = total || 12;
          }
          console.log("GW " + gw + " — live refresh only, " + Object.keys(picks[gw]).length +
                      " squads reused (no squad requests)");
          audit(gw, picks[gw], fresh.pts, fresh.bonus);
          continue;
        } catch (e) {
          console.log("GW " + gw + " — live refresh failed, falling back to a full read: " + e.message);
        }
      }
      const inProgress = !!(ev && ev.is_current && !settled);
      console.log("GW " + gw + " — fetching squads…");
      try {
        const stats = await liveFor(gw, settled);
        const { mins, pts, bonus } = stats;
        const got = {};
        await pool(managers, async (m) => {
          try {
            const pk = await getJSON("/entry/" + m.id + "/event/" + gw + "/picks/");
            const list = pk.picks || [];
            // Squad: [element, multiplier, is_captain, is_vice_captain] in pick order.
            got[m.id] = {
              c: (pk.active_chip || ""),
              p: list.map((p) => [p.element, p.multiplier, p.is_captain ? 1 : 0, p.is_vice_captain ? 1 : 0])
            };
            if (inProgress) {
              let played = 0, total = 0;
              list.forEach((p) => {
                if (p.multiplier > 0) { total += p.multiplier; if ((mins[p.element] || 0) > 0) played += p.multiplier; }
              });
              if (!history[m.id]) history[m.id] = {};
              if (!history[m.id][gw]) history[m.id][gw] = { p: 0, h: 0, b: 0, t: 0 };
              history[m.id][gw].pl = played;
              history[m.id][gw].plt = total || 12;
            }
          } catch (e) { /* skip this manager */ }
        }, 6);
        if (Object.keys(got).length) {
          picks[gw] = got;
          livePoints[gw] = pts;
          if (Object.keys(bonus).length) liveBonus[gw] = bonus;
          keepStats(gw, stats);
          breakdown[gw] = stats.expl;
          if (settled) picksFinal[gw] = 1;
        }
        console.log("  GW " + gw + " — " + Object.keys(got).length + " squads" +
                    (settled ? " (settled, auto-subs included)" : ""));
        audit(gw, got, pts, bonus);
      } catch (e) { console.log("  GW " + gw + " squads failed (non-fatal): " + e.message); }
    }
  }

  /* ---- purchase prices, for selling values ------------------------------ */
  // FPL sells a risen player for his purchase price plus half the rise
  // (rounded down per tenth); a fallen one goes for his current price. The
  // purchase price of each owned player comes from the manager's transfer log
  // — the newest transfer-in of that player, or his season-start price for an
  // original pick. The squad is frozen at the deadline, so the logs are read
  // once per gameweek and reused for the rest of it.
  //
  // Only transfers up to this gameweek count. A manager who plans ahead
  // during a live gameweek adds entries for the NEXT one, and those name a
  // price he has not paid for the squad on screen; taking the newest entry
  // blindly would price a player by a transfer that has not happened yet.
  // The same log also says who each manager swapped for whom, gameweek by
  // gameweek — read here rather than in a second pass, since it is the one
  // request that carries it.
  // Reuse last publish's read only if it carried BOTH halves. The first run
  // after transfers were added would otherwise skip the log entirely — the
  // purchase prices were already there, so nothing looked stale — and publish
  // no transfers at all until the gameweek rolled over.
  const prevHadBoth = prev.buys && prev.moves &&
    Object.keys(prev.buys).length >= Math.floor(managers.length * 0.9) &&
    Object.keys(prev.moves).length > 0;
  let buys = (canReuse && prev.buysGw === pitchGw && prevHadBoth) ? prev.buys : null;
  let moves = buys ? prev.moves : null;
  if (pitchGw && picks[pitchGw] && !buys) {
    buys = {};
    moves = {};
    const startOf = {};
    (bs.elements || []).forEach((el) => {
      startOf[el.id] = (el.now_cost || 0) - (el.cost_change_start || 0);
    });
    await pool(managers, async (m) => {
      const squad = picks[pitchGw][m.id];
      if (!squad) return;
      try {
        const tr = await getJSON("/entry/" + m.id + "/transfers/");
        const latest = {}; // element -> [time, cost] of the newest transfer in
        (tr || []).forEach((t) => {
          if (t.event > pitchGw) return;
          const at = Date.parse(t.time) || 0;
          if (!latest[t.element_in] || at > latest[t.element_in][0]) {
            latest[t.element_in] = [at, t.element_in_cost];
          }
        });
        const map = {};
        (squad.p || []).forEach((pk) => {
          map[pk[0]] = latest[pk[0]] ? latest[pk[0]][1] : (startOf[pk[0]] || 0);
        });
        buys[m.id] = map;
        // [in, out] per gameweek, so a squad can show what each new player
        // replaced. Free Hit swaps are logged like any other and are left in:
        // they were real moves for that week.
        (tr || []).forEach((t) => {
          if (!t.event || t.event > pitchGw) return;
          const gwKey = String(t.event);
          if (!moves[gwKey]) moves[gwKey] = {};
          (moves[gwKey][m.id] = moves[gwKey][m.id] || []).push([t.element_in, t.element_out]);
        });
      } catch (e) { /* skip — that squad simply shows no selling detail */ }
    }, 6);
    console.log("purchase prices read for " + Object.keys(buys).length +
                " squads (GW " + pitchGw + "), transfers across " +
                Object.keys(moves).length + " gameweek(s)");
  }

  // ---- played counts and tie-break stats must survive the squad reuse -----
  // pl/plt (players played, from live minutes) and liveStats (goals, clean
  // sheets, assists — the LMS tie-breakers) are derived only when a gameweek
  // is fetched fresh. A settled gameweek is reused from the previous publish,
  // and history itself is rebuilt from FPL on every run — so without this,
  // any settled gameweek fetched before those fields existed (GW1 was) shows
  // a dash forever. Carry them forward from the previous publish; where even
  // that lacks them, pull the gameweek's live feed once and rebuild from the
  // frozen squads. Self-healing: it costs one request per damaged gameweek,
  // once.
  const prevHist = prev.history || {};
  for (const gwStr of Object.keys(picks)) {
    const gw = +gwStr;
    const ev2 = events.find((e) => e.id === gw);
    if (!(ev2 && ev2.finished && ev2.data_checked)) continue;
    const missing = [];
    for (const id of Object.keys(picks[gw])) {
      const row = history[id] && history[id][gw];
      if (!row || row.pl != null) continue;
      const old = prevHist[id] && prevHist[id][gw];
      if (old && old.pl != null) { row.pl = old.pl; row.plt = old.plt || 12; }
      else missing.push(id);
    }
    const statsGone = !liveStats[gw];
    const breakGone = !breakdown[gw];
    if (missing.length || statsGone || breakGone) {
      try {
        const fresh = await liveFor(gw, true);
        let fixed = 0;
        missing.forEach((id) => {
          const squad = picks[gw][id], row = history[id] && history[id][gw];
          if (!squad || !squad.p || !row) return;
          let played = 0, total = 0;
          squad.p.forEach((pk) => {
            if (pk[1] > 0) { total += pk[1]; if ((fresh.mins[pk[0]] || 0) > 0) played += pk[1]; }
          });
          row.pl = played; row.plt = total || 12; fixed++;
        });
        // stored outright — even a gameweek with genuinely no goals must not
        // look damaged again on the next run
        if (statsGone) liveStats[gw] = { g: fresh.goals || {}, c: fresh.cs || {}, a: fresh.assists || {} };
        if (breakGone) breakdown[gw] = fresh.expl || {};
        console.log("GW " + gw + " — backfilled " + fixed + " played counts" +
          (statsGone ? " and the tie-break stats" : ""));
      } catch (e) { console.log("  GW " + gw + " backfill failed (non-fatal): " + e.message); }
    }
  }

  // The season's real-world fixtures by gameweek and club short name, so a
  // player's card can say who he faces before he has played, and the Premier
  // League page can page through every gameweek's scoreboard: [home, away,
  // started, finished, homeScore, awayScore, minutes, kickoffISO,
  // finishedProvisional] per match. Consumers written for the old four-slot
  // shape keep working — the new fields only append. One request, rebuilt
  // every run, so the flags, scores and minutes track the afternoon. A
  // postponed fixture with no gameweek yet is left out until FPL reschedules
  // it — it would have nothing to say and no page to sit on.
  let gwFixtures = {};
  try {
    const fx = await getJSON("/fixtures/");
    (fx || []).forEach((f) => {
      if (!f.event) return;
      (gwFixtures[f.event] = gwFixtures[f.event] || []).push(
        [teamShort[f.team_h] || "?", teamShort[f.team_a] || "?", f.started ? 1 : 0, f.finished ? 1 : 0,
         f.team_h_score == null ? null : +f.team_h_score,
         f.team_a_score == null ? null : +f.team_a_score,
         +f.minutes || 0, f.kickoff_time || null, f.finished_provisional ? 1 : 0]);
    });
    const gws = Object.keys(gwFixtures);
    console.log(gws.reduce((n, k) => n + gwFixtures[k].length, 0) +
      " real fixtures published across " + gws.length + " gameweeks");
  } catch (e) { console.log("  gw fixtures failed (non-fatal): " + e.message); }

  const dataset = {
    updatedAt: new Date().toISOString(), season: "Game On V12",
    bootstrap: { events }, league: { id: CLASSIC, name: name },
    managers, history, h2h, h2hFixtures: h2hFx, pastSeasons: pastSeasons, _failed: hist.failed || 0,
    elements, pitchGw, picksV: 2, livePoints, picks, chips, gwFixtures, teams: teamShort, teamNames,
    buys: buys || {}, buysGw: pitchGw, moves: moves || {},
    liveBonus, liveStats, picksFinal, liveAudit, prices, priceLog, breakdown
  };
  // Refuse to publish something clearly worse than what is already live: a
  // partial fetch overwriting good data is worse than skipping a run.
  if (prev.managers && prev.managers.length) {
    const before = prev.managers.length, now = managers.length;
    if (now < before * 0.9) {
      throw new Error("refusing to publish: " + now + " managers vs " + before + " already live");
    }
    const withHistory = Object.keys(history).filter((k) => Object.keys(history[k] || {}).length).length;
    if (now && withHistory < now * 0.8) {
      throw new Error("refusing to publish: only " + withHistory + "/" + now + " managers have history");
    }
  }
  fs.writeFileSync("data.json", JSON.stringify({ generatedAt: dataset.updatedAt, dataset }));
  console.log("Wrote data.json — " + managers.length + " managers, " + H2H.length +
    " H2H leagues, pitch GW " + (pitchGw || "none") + ", failed " + (hist.failed || 0));
})().catch((e) => { console.error("FATAL:", e); process.exit(1); });
