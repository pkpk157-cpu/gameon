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
  let all = [], meta = null;
  for (let page = 1; ; page++) {
    const d = await getJSON("/leagues-h2h/" + id + "/standings/?page_standings=" + page);
    if (!meta) meta = d.league;
    const res = (d.standings && d.standings.results) || [];
    all = all.concat(res);
    if (!(d.standings && d.standings.has_next)) break;
  }
  return { league: meta, results: all };
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
  const hist = await pool(managers, async (m) => {
    const h = await getJSON("/entry/" + m.id + "/history/");
    const gw = {};
    (h.current || []).forEach((c) => {
      gw[c.event] = { p: c.points, h: c.event_transfers_cost || 0, b: c.points_on_bench || 0, t: c.total_points };
    });
    history[m.id] = gw;
    if (h.past && h.past.length) {
      pastSeasons[m.id] = h.past.map((p) => ({ season: p.season_name, rank: p.rank, total: p.total_points }));
    }
  }, 6);
  console.log("  histories done, failed " + hist.failed);

  console.log("Fetching H2H group standings…");
  const h2h = {};
  await pool(H2H, async (id) => { h2h[id] = await h2hAll(id); }, 4);

  // Current-gameweek squads: powers the LMS "players played" column and the
  // live football-pitch on each manager's profile. We fetch every manager's
  // picks for the current GW once and reuse them for both.
  let elements = null, pitchGw = null, livePoints = null, picks = null;
  const curEv = events.find((e) => e.is_current) || events.find((e) => e.is_next);
  if (curEv) {
    const lg = curEv.id;
    pitchGw = lg;
    const inProgress = curEv.is_current && !(curEv.finished && curEv.data_checked);
    console.log("Current GW " + lg + " — fetching squads for pitch + players-played…");
    try {
      // Compact element lookup: id -> [web_name, element_type(1-4), team_short].
      const teamShort = {};
      (bs.teams || []).forEach((t) => { teamShort[t.id] = t.short_name; });
      elements = {};
      (bs.elements || []).forEach((el) => {
        elements[el.id] = [el.web_name, el.element_type, teamShort[el.team] || ""];
      });

      const live = await getJSON("/event/" + lg + "/live/");
      const mins = {};
      livePoints = {};
      (live.elements || []).forEach((el) => {
        const st = el.stats || {};
        mins[el.id] = st.minutes || 0;
        livePoints[el.id] = st.total_points || 0;
      });

      picks = {};
      await pool(managers, async (m) => {
        try {
          const pk = await getJSON("/entry/" + m.id + "/event/" + lg + "/picks/");
          const list = pk.picks || [];
          // Store squad: [element, multiplier, is_captain(0/1)] in pick order.
          picks[m.id] = {
            c: (pk.active_chip || ""),
            p: list.map((p) => [p.element, p.multiplier, p.is_captain ? 1 : 0])
          };
          if (inProgress) {
            let played = 0, total = 0;
            list.forEach((p) => {
              if (p.multiplier > 0) { total += p.multiplier; if ((mins[p.element] || 0) > 0) played += p.multiplier; }
            });
            if (!history[m.id]) history[m.id] = {};
            if (!history[m.id][lg]) history[m.id][lg] = { p: 0, h: 0, b: 0, t: 0 };
            history[m.id][lg].pl = played;
            history[m.id][lg].plt = total || 12;
          }
        } catch (e) { /* skip this manager */ }
      }, 6);
    } catch (e) { console.log("  live/picks step failed (non-fatal): " + e.message); }
  }

  const dataset = {
    updatedAt: new Date().toISOString(), season: "Game On V12",
    bootstrap: { events }, league: { id: CLASSIC, name: name },
    managers, history, h2h, pastSeasons: pastSeasons, _failed: hist.failed || 0,
    elements, pitchGw, livePoints, picks
  };
  fs.writeFileSync("data.json", JSON.stringify({ generatedAt: dataset.updatedAt, dataset }));
  console.log("Wrote data.json — " + managers.length + " managers, " + H2H.length +
    " H2H leagues, pitch GW " + (pitchGw || "none") + ", failed " + (hist.failed || 0));
})().catch((e) => { console.error("FATAL:", e); process.exit(1); });
