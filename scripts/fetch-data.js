/* ==========================================================================
   Game On V12 — server-side FPL fetcher (runs in GitHub Actions).
   GitHub's runners reach the FPL API directly (no CORS, no proxy), so this
   pulls the whole league and writes ./data.json, which every participant's
   app loads. Keep CLASSIC / H2H ids in sync with config.js.
   Node 18+ (global fetch). No dependencies.
   ========================================================================== */
const fs = require("fs");

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
  let elements = null, pitchGw = null;
  const livePoints = {}, picks = {};

  // Compact element lookup: id -> [web_name, element_type(1-4), team_short].
  const teamShort = {};
  (bs.teams || []).forEach((t) => { teamShort[t.id] = t.short_name; });
  elements = {};
  (bs.elements || []).forEach((el) => {
    // [name, position, club, price(tenths), owned% across all FPL]
    elements[el.id] = [el.web_name, el.element_type, teamShort[el.team] || "",
                       el.now_cost || 0, parseFloat(el.selected_by_percent) || 0];
  });

  let prev = {};
  try { prev = JSON.parse(fs.readFileSync("data.json", "utf8")).dataset || {}; } catch (e) {}

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

  const canReuse = prev.picksV === 2;
  const prevPicks = canReuse ? (prev.picks || {}) : {};
  const prevLive = canReuse ? (prev.livePoints || {}) : {};

  const curEv = events.find((e) => e.is_current) || events.find((e) => e.is_next);
  if (curEv) {
    pitchGw = curEv.id;
    const want = events.filter((e) => e.id <= curEv.id).map((e) => e.id);
    for (const gw of want) {
      const ev = events.find((e) => e.id === gw);
      const settled = !!(ev && ev.finished && ev.data_checked);
      const cached = prevPicks[gw] && prevLive[gw] &&
        Object.keys(prevPicks[gw]).length >= Math.floor(managers.length * 0.9);
      if (settled && cached) {
        picks[gw] = prevPicks[gw];
        livePoints[gw] = prevLive[gw];
        console.log("GW " + gw + " — reused " + Object.keys(picks[gw]).length + " cached squads");
        continue;
      }
      const inProgress = !!(ev && ev.is_current && !settled);
      console.log("GW " + gw + " — fetching squads…");
      try {
        const live = await getJSON("/event/" + gw + "/live/");
        const mins = {}, pts = {};
        (live.elements || []).forEach((el) => {
          const st = el.stats || {};
          mins[el.id] = st.minutes || 0;
          pts[el.id] = st.total_points || 0;
        });
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
        if (Object.keys(got).length) { picks[gw] = got; livePoints[gw] = pts; }
        console.log("  GW " + gw + " — " + Object.keys(got).length + " squads");
      } catch (e) { console.log("  GW " + gw + " squads failed (non-fatal): " + e.message); }
    }
  }

  const dataset = {
    updatedAt: new Date().toISOString(), season: "Game On V12",
    bootstrap: { events }, league: { id: CLASSIC, name: name },
    managers, history, h2h, pastSeasons: pastSeasons, _failed: hist.failed || 0,
    elements, pitchGw, picksV: 2, livePoints, picks, chips
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
