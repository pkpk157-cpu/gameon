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
    is_current: e.is_current, is_next: e.is_next, deadline_time: e.deadline_time
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
  const h2h = {};
  await pool(H2H, async (id) => { h2h[id] = await h2hAll(id); }, 4);

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
    (live.elements || []).forEach((el) => {
      const st = el.stats || {};
      mins[el.id] = st.minutes || 0;
      pts[el.id] = st.total_points || 0;
      (el.explain || []).forEach((ex) => {
        const b = (ex.stats || []).filter((x) => x.identifier === "bps")[0];
        if (!b) return;
        (bpsByFixture[ex.fixture] || (bpsByFixture[ex.fixture] = {}))[el.id] = b.value || 0;
      });
    });
    const bonus = {};
    if (!settled) {
      try {
        const fixtures = await getJSON("/fixtures/?event=" + gw);
        let inPlay = 0;
        (fixtures || []).forEach((f) => {
          if (!f.started || f.finished_provisional) return;
          inPlay++;
          const b = provisionalBonus(bpsByFixture[f.id] || {});
          // a double gameweek can earn bonus in more than one fixture
          Object.keys(b).forEach((el) => { bonus[el] = (bonus[el] || 0) + b[el]; });
        });
        if (inPlay) console.log("  GW " + gw + " — " + inPlay + " fixture(s) in play, provisional bonus for " +
                                Object.keys(bonus).length + " player(s)");
      } catch (e) { console.log("  GW " + gw + " fixtures failed, no provisional bonus: " + e.message); }
    }
    return { mins, pts, bonus };
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
  const livePoints = {}, picks = {}, liveBonus = {}, picksFinal = {};

  // Compact element lookup: id -> [web_name, element_type(1-4), team_short].
  const teamShort = {};
  (bs.teams || []).forEach((t) => { teamShort[t.id] = t.short_name; });
  elements = {};
  (bs.elements || []).forEach((el) => {
    // The table shows the short name FPL uses, but people search for the name
    // they know — "Erling" finds Haaland. Keep the full name alongside it, and
    // only when it says something the short name does not.
    const full = ((el.first_name || "") + " " + (el.second_name || "")).trim();
    const extra = full && full.toLowerCase() !== String(el.web_name || "").toLowerCase()
      ? full : "";
    // [name, position, club, price(tenths), owned% across all FPL, full name]
    elements[el.id] = [el.web_name, el.element_type, teamShort[el.team] || "",
                       el.now_cost || 0, parseFloat(el.selected_by_percent) || 0, extra];
  });

  let prev = {};
  try { prev = JSON.parse(fs.readFileSync("data.json", "utf8")).dataset || {}; } catch (e) {}

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
  const prices = { at: stamp, now: priceNow, owned,
                   tIn, tOut, netSince, exact, total };

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
        const { mins, pts, bonus } = await liveFor(gw, settled);
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
          if (settled) picksFinal[gw] = 1;
        }
        console.log("  GW " + gw + " — " + Object.keys(got).length + " squads" +
                    (settled ? " (settled, auto-subs included)" : ""));
        audit(gw, got, pts, bonus);
      } catch (e) { console.log("  GW " + gw + " squads failed (non-fatal): " + e.message); }
    }
  }

  const dataset = {
    updatedAt: new Date().toISOString(), season: "Game On V12",
    bootstrap: { events }, league: { id: CLASSIC, name: name },
    managers, history, h2h, pastSeasons: pastSeasons, _failed: hist.failed || 0,
    elements, pitchGw, picksV: 2, livePoints, picks, chips,
    liveBonus, picksFinal, liveAudit, prices, priceLog
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
