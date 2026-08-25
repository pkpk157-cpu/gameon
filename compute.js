/* ==========================================================================
   compute.js — turn the raw dataset into competition standings.
   Everything derives from one primitive: per-manager, per-gameweek NET score
   (already includes hits) plus bench points, in dataset.history[entryId][gw].
   Admin overrides (store.overrides) can lock any human-judged outcome.
   ========================================================================== */
(function () {
  "use strict";

  var C = {};

  /* ---- helpers ---------------------------------------------------------- */
  function cfg() { return window.GO_STORE.config(); }
  function ov() { return window.GO_STORE.overrides(); }

  // Net GW score for a manager (includes hits). Missing => null (not played).
  function gwScore(ds, entryId, gw) {
    var h = ds.history[entryId];
    if (!h || !h[gw]) return null;
    return h[gw].p;
  }
  function gwBench(ds, entryId, gw) {
    var h = ds.history[entryId];
    if (!h || !h[gw]) return 0;
    return h[gw].b || 0;
  }
  function sumGws(ds, entryId, gws) {
    var s = 0, any = false;
    gws.forEach(function (gw) {
      var v = gwScore(ds, entryId, gw);
      if (v !== null) { s += v; any = true; }
    });
    return any ? s : null;
  }
  function benchSum(ds, entryId, gws) {
    var s = 0; gws.forEach(function (gw) { s += gwBench(ds, entryId, gw); }); return s;
  }

  // Which gameweeks are fully scored (finished + data checked).
  C.finishedGws = function (ds) {
    var out = [];
    if (!ds || !ds.bootstrap) return out;
    ds.bootstrap.events.forEach(function (e) {
      if (e.finished && e.data_checked) out.push(e.id);
    });
    return out;
  };
  // The in-progress gameweek (current but not yet finalised), or null.
  C.liveGwId = function (ds) {
    if (!ds || !ds.bootstrap) return null;
    var e = ds.bootstrap.events.filter(function (e) { return e.is_current && !(e.finished && e.data_checked); })[0];
    return e ? e.id : null;
  };
  C.currentGw = function (ds) {
    if (!ds || !ds.bootstrap) return null;
    var cur = null, next = null;
    ds.bootstrap.events.forEach(function (e) {
      if (e.is_current) cur = e.id;
      if (e.is_next) next = e.id;
    });
    return cur || (next ? next - 1 : null);
  };

  function managerMap(ds) {
    var m = {};
    ds.managers.forEach(function (x) { m[x.id] = x; });
    return m;
  }
  C.managerMap = managerMap;

  /* ---- prizes ----------------------------------------------------------- */
  C.classicPrize = function (rank) {
    var p = cfg().classicPrizes;
    if (p.exact[rank] != null) return p.exact[rank];
    var found = 0;
    (p.ranges || []).forEach(function (r) { if (rank >= r.from && rank <= r.to) found = r.amount; });
    return found;
  };

  /* ---- 1. Classic league ------------------------------------------------ */
  C.classic = function (ds) {
    var rows = ds.managers.slice().sort(function (a, b) {
      return (b.total - a.total) || (a.rank - b.rank);
    });
    rows.forEach(function (r, i) {
      r.computedRank = i + 1;
      r.prize = C.classicPrize(i + 1);
      r.move = (r.lastRank && r.lastRank > 0) ? (r.lastRank - (i + 1)) : 0;
    });
    return rows;
  };

  /* ---- 2. Monthly winners ---------------------------------------------- */
  C.monthly = function (ds) {
    var mm = managerMap(ds);
    var conf = cfg();
    var finished = C.finishedGws(ds);
    var fset = {}; finished.forEach(function (g) { fset[g] = true; });

    // Optionally derive each month's gameweeks from real fixture deadlines.
    var monthNum = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
    var evDate = {};
    if (ds.bootstrap) ds.bootstrap.events.forEach(function (e) { if (e.deadline_time) evDate[e.id] = new Date(e.deadline_time); });
    var canDerive = conf.autoMonths !== false && Object.keys(evDate).length > 0;
    var live = C.liveGwId(ds);

    return conf.months.map(function (month) {
      var gws = month.gws, yearForLabel = null;
      if (canDerive) {
        var mn = monthNum[month.key];
        var derived = Object.keys(evDate).map(Number).filter(function (gw) {
          return (evDate[gw].getUTCMonth() + 1) === mn;
        }).sort(function (a, b) { return a - b; });
        if (derived.length) { gws = derived; yearForLabel = evDate[derived[0]].getUTCFullYear(); }
      }
      var late = { jan: 1, feb: 1, mar: 1, apr: 1, may: 1, jun: 1, jul: 1 };
      var yr = (yearForLabel != null) ? yearForLabel : ((conf.seasonStartYear || 2025) + (late[month.key] ? 1 : 0));
      var label = month.name.slice(0, 3) + "-" + ("0" + (yr % 100)).slice(-2);

      // Include the live GW so monthly totals reflect the latest sync.
      var playedGws = gws.filter(function (g) { return fset[g] || g === live; });
      var complete = gws.length > 0 && gws.every(function (g) { return fset[g]; });
      var rows = ds.managers.map(function (m) {
        return {
          id: m.id, entryName: m.entryName, playerName: m.playerName,
          score: sumGws(ds, m.id, playedGws) || 0,
          bench: benchSum(ds, m.id, playedGws),
          gwsCounted: playedGws.length
        };
      }).filter(function (r) { return r.gwsCounted > 0; });

      rows.sort(function (a, b) { return (b.score - a.score) || (b.bench - a.bench); });
      applyOverrideOrder(rows, ov().monthlyOrder && ov().monthlyOrder[month.key]);
      rows.forEach(function (r, i) {
        r.pos = i + 1;
        r.prize = month.prizes[i + 1] || 0;
      });
      return {
        key: month.key, name: month.name, label: label, gws: gws,
        played: playedGws.length, total: gws.length,
        complete: complete, inProgress: playedGws.length > 0 && !complete,
        rows: rows, prizes: month.prizes
      };
    });
  };

  /* ---- 3. Last Manager Standing ---------------------------------------- */
  // Iterate finished GWs; eliminate the lowest scorers among survivors.
  C.lms = function (ds) {
    var mm = managerMap(ds);
    var finished = C.finishedGws(ds);
    var elimGrid = cfg().lms.elimPerGw;
    var manualElim = (ov().lms && ov().lms.elim) || {}; // { gw: [entryIds] }
    var carriedTies = (ov().lms && ov().lms.carry) || {}; // { gw: [entryIds] } forced survive

    var alive = {}; ds.managers.forEach(function (m) { alive[m.id] = true; });
    var eliminatedAt = {}; // entryId -> gw
    var grid = []; // per-gw summary rows
    var perGw = [];

    finished.forEach(function (gw) {
      var sog = Object.keys(alive).length;
      var need = elimGrid[gw] || 0;

      // Score every survivor this GW.
      var contenders = Object.keys(alive).map(function (id) {
        id = +id;
        return { id: id, score: gwScore(ds, id, gw), bench: gwBench(ds, id, gw) };
      });
      // A survivor with no score for a finished GW counts as 0 (didn't play).
      contenders.forEach(function (c) { if (c.score === null) c.score = 0; });

      var eliminatedIds;
      if (manualElim[gw]) {
        eliminatedIds = manualElim[gw].filter(function (id) { return alive[id]; });
      } else {
        // ascending by score, then FEWER bench points is worse (tie-break #1
        // rewards more bench points => higher bench survives).
        contenders.sort(function (a, b) { return (a.score - b.score) || (a.bench - b.bench); });
        var forced = carriedTies[gw] || [];
        var pick = [];
        for (var i = 0; i < contenders.length && pick.length < need; i++) {
          if (forced.indexOf(contenders[i].id) !== -1) continue; // forced survive
          pick.push(contenders[i].id);
        }
        eliminatedIds = pick;
      }

      eliminatedIds.forEach(function (id) { delete alive[id]; eliminatedAt[id] = gw; });
      var eog = Object.keys(alive).length;

      grid.push({ gw: gw, sog: sog, eliminated: eliminatedIds.length, expected: need, eog: eog });

      // Full week table: every survivor at start of GW, scored, worst first.
      var elimSet = {}; eliminatedIds.forEach(function (id) { elimSet[id] = 1; });
      var table = contenders.map(function (c) {
        var hh = (ds.history[c.id] && ds.history[c.id][gw]) ? ds.history[c.id][gw] : null;
        return { id: c.id, name: nm(mm, c.id), player: pl(mm, c.id),
                 score: c.score, bench: c.bench, hit: hh ? hh.h : 0,
                 played: (hh && hh.pl != null) ? hh.pl : null, playedTotal: (hh && hh.plt) ? hh.plt : 12,
                 eliminated: !!elimSet[c.id] };
      }).sort(function (a, b) { return (a.score - b.score) || (a.bench - b.bench); });

      perGw.push({
        gw: gw, need: need, sog: sog, eog: eog, table: table,
        eliminated: eliminatedIds.map(function (id) {
          var c = contenders.find(function (x) { return x.id === id; });
          return { id: id, name: nm(mm, id), score: c ? c.score : 0, bench: c ? c.bench : 0 };
        }).sort(function (a, b) { return a.score - b.score; })
      });
    });

    var survivors = Object.keys(alive).map(function (id) {
      return { id: +id, name: nm(mm, +id) };
    });

    // Build the full published grid (all 38 GWs) with expected numbers, so the
    // elimination grid renders even before the season starts.
    var fullGrid = [];
    var running = ds.managers.length;
    for (var g = 1; g <= cfg().totalGameweeks; g++) {
      var actual = grid.find(function (x) { return x.gw === g; });
      var exp = elimGrid[g] || 0;
      if (actual) { fullGrid.push(actual); running = actual.eog; }
      else {
        fullGrid.push({ gw: g, sog: running, eliminated: null, expected: exp, eog: running - exp });
        running = running - exp;
      }
    }

    // Live (in-progress) gameweek — the current GW that isn't finished yet.
    // Shows the survivors' running scores + how many players have played.
    var liveGw = null;
    ds.bootstrap.events.forEach(function (e) { if (e.is_current && !(e.finished && e.data_checked)) liveGw = e.id; });
    var live = null;
    if (liveGw != null) {
      var aliveIds = Object.keys(alive).map(Number);
      var need = elimGrid[liveGw] || 0;
      var ltable = aliveIds.map(function (id) {
        var hh = (ds.history[id] && ds.history[id][liveGw]) ? ds.history[id][liveGw] : null;
        return { id: id, name: nm(mm, id), player: pl(mm, id),
                 score: hh ? hh.p : 0, bench: hh ? hh.b : 0, hit: hh ? hh.h : 0,
                 played: (hh && hh.pl != null) ? hh.pl : null, playedTotal: (hh && hh.plt) ? hh.plt : 12,
                 eliminated: false, atRisk: false };
      }).sort(function (a, b) { return (a.score - b.score) || (a.bench - b.bench); });
      // Bottom `need` are in the drop zone (would be eliminated if the GW ended now).
      ltable.forEach(function (r, i) { r.atRisk = i < need; });
      live = { gw: liveGw, table: ltable, sog: aliveIds.length, eog: aliveIds.length - need, need: need, eliminated: [] };
    }

    return {
      finishedCount: finished.length,
      survivors: survivors,
      survivorsCount: survivors.length,
      eliminatedAt: eliminatedAt,
      grid: fullGrid,
      perGw: perGw,
      live: live,
      champion: survivors.length === 1 ? survivors[0] : null,
      prizes: cfg().lms.prizes
    };
  };

  /* ---- 4. Pyramid ------------------------------------------------------- */
  // Rosters per mini-season: S1 from override (or auto rank-quartiles);
  // S2/S3 auto from promotion/relegation unless overridden.
  C.pyramid = function (ds) {
    var mm = managerMap(ds);
    var p = cfg().pyramid;
    var divisions = p.divisions.map(function (d) { return d.key; });
    var finished = {}; C.finishedGws(ds).forEach(function (g) { finished[g] = true; });
    var pLive = C.liveGwId(ds); // include the live GW in mini-season totals
    var over = (ov().pyramid && ov().pyramid.rosters) || {}; // { s1: { elite:[ids] } }

    // Base S1 rosters: admin override (ids) > named roster from config
    // (resolved to entry ids) > auto split by rank.
    var rosters = {};
    var s1key = p.seasons[0].key;
    var named = resolveNamedRosters(ds, p);
    rosters[s1key] = over[s1key] || named || autoInitialRosters(ds, divisions);

    var seasonResults = [];
    p.seasons.forEach(function (season, si) {
      var key = season.key;
      if (si > 0) {
        // Derive from previous season unless an override exists.
        rosters[key] = over[key] || applyPromotionRelegation(rosters[p.seasons[si - 1].key], seasonResults[si - 1], p);
      }
      var playedGws = season.gws.filter(function (g) { return finished[g] || g === pLive; });
      var complete = season.gws.every(function (g) { return finished[g]; });

      var divResults = p.divisions.map(function (div) {
        var ids = (rosters[key] && rosters[key][div.key]) || [];
        var rows = ids.map(function (id) {
          return {
            id: id, name: nm(mm, id), player: pl(mm, id),
            score: sumGws(ds, id, playedGws) || 0,
            bench: benchSum(ds, id, playedGws),
            last: playedGws.length ? (gwScore(ds, id, playedGws[playedGws.length - 1]) || 0) : 0
          };
        });
        rows.sort(function (a, b) { return (b.score - a.score) || (b.last - a.last) || (b.bench - a.bench); });
        rows.forEach(function (r, i) { r.pos = i + 1; r.prize = div.prizes[i + 1] || 0; });
        return { key: div.key, name: div.name, prizes: div.prizes, rows: rows,
                 size: ids.length, played: playedGws.length, total: season.gws.length,
                 complete: complete };
      });
      seasonResults.push({ key: key, name: season.name, gws: season.gws,
                           played: playedGws.length, total: season.gws.length,
                           complete: complete, inProgress: playedGws.length > 0 && !complete,
                           divisions: divResults });
    });
    return { seasons: seasonResults, rosters: rosters, divisions: p.divisions,
             autoInitial: !over[p.seasons[0].key] };
  };

  // Resolve config.pyramid.seasonOneRosterNames (manager names) to entry ids
  // using the league roster's player names. Handles case/diacritics and
  // hyphen/space splits via a spaceless fallback key. Returns null if unusable.
  function resolveNamedRosters(ds, p) {
    var named = p.seasonOneRosterNames;
    if (!named) return null;
    var norm = function (s) {
      return (s || "").toString().normalize("NFD").replace(/[̀-ͯ]/g, "")
        .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    };
    var flat = function (s) { return norm(s).replace(/\s+/g, ""); };
    var byName = {}, byFlat = {};
    ds.managers.forEach(function (m) {
      byName[norm(m.playerName)] = m.id;
      byFlat[flat(m.playerName)] = m.id;
    });
    var aliases = {}; // normalized roster name -> explicit entry id
    var rawAliases = p.rosterAliases || {};
    Object.keys(rawAliases).forEach(function (k) { aliases[norm(k)] = rawAliases[k]; });
    var out = {}, matched = 0;
    Object.keys(named).forEach(function (div) {
      out[div] = [];
      named[div].forEach(function (nm) {
        var id = byName[norm(nm)];
        if (id == null) id = byFlat[flat(nm)];
        if (id == null && aliases[norm(nm)] != null) id = aliases[norm(nm)];
        if (id != null) out[div].push(id);
      });
      matched += out[div].length;
    });
    return matched > 0 ? out : null;
  }

  function autoInitialRosters(ds, divisionKeys) {
    // Split managers by overall league rank into equal tiers (best -> Elite).
    var sorted = ds.managers.slice().sort(function (a, b) { return a.rank - b.rank; });
    var n = sorted.length, k = divisionKeys.length;
    var per = Math.ceil(n / k);
    var out = {};
    divisionKeys.forEach(function (key, i) {
      out[key] = sorted.slice(i * per, (i + 1) * per).map(function (m) { return m.id; });
    });
    return out;
  }
  function applyPromotionRelegation(prevRosters, prevResult, p) {
    if (!prevRosters || !prevResult) return prevRosters || {};
    var keys = p.divisions.map(function (d) { return d.key; });
    var next = {}; keys.forEach(function (key) { next[key] = []; });
    // Start with everyone where they were, then move promoted/relegated.
    prevResult.divisions.forEach(function (dr, di) {
      var promote = dr.rows.slice(0, p.promoteCount).map(function (r) { return r.id; });
      var relegate = dr.rows.slice(Math.max(0, dr.rows.length - p.relegateCount)).map(function (r) { return r.id; });
      dr.rows.forEach(function (r) {
        var target = di;
        if (promote.indexOf(r.id) !== -1 && di > 0) target = di - 1;
        else if (relegate.indexOf(r.id) !== -1 && di < keys.length - 1) target = di + 1;
        next[keys[target]].push(r.id);
      });
    });
    return next;
  }

  /* ---- 5. H2H (Game On UCL) -------------------------------------------- */
  // Group tables computed round-robin from GW scores (higher score wins). If
  // FPL H2H standings were pulled they can be shown too, but the group tables
  // here are self-contained and match "standings follow FPL scores".
  C.h2h = function (ds) {
    var mm = managerMap(ds);
    var h = cfg().h2h;
    var finished = {}; C.finishedGws(ds).forEach(function (g) { finished[g] = true; });
    var groupGws = h.groupStageGws.filter(function (g) { return finished[g]; });

    var leagueIds = cfg().h2hGroupLeagueIds || [];
    var haveFetched = leagueIds.length && leagueIds.some(function (id) {
      return ds.h2h && ds.h2h[id] && ds.h2h[id].results && ds.h2h[id].results.length;
    });
    var complete = h.groupStageGws.every(function (g) { return finished[g]; });
    var dest = function (i) {
      return (i < h.qualify.uclPerGroup) ? "UCL"
           : (i < h.qualify.uclPerGroup + h.qualify.uelPerGroup) ? "UEL" : "";
    };
    var groups;

    if (haveFetched) {
      // Accurate: real FPL H2H standings for each group league (actual results).
      groups = leagueIds.map(function (id, gi) {
        var d = (ds.h2h && ds.h2h[id]) || {};
        var res = (d.results || []).filter(function (r) { return r.entry; }) // drop FPL "AVERAGE" phantom
          .slice().sort(function (a, b) { return (a.rank || 999) - (b.rank || 999); });
        var table = res.map(function (r, i) {
          return { id: r.entry, name: r.entry_name, player: r.player_name,
                   w: r.matches_won, d: r.matches_drawn, l: r.matches_lost,
                   pts: r.total, gwPts: r.points_for, pos: i + 1, dest: dest(i) };
        });
        var gname = (d.league && d.league.name) ? d.league.name : ("Group " + String.fromCharCode(65 + gi));
        return { name: gname, table: table, played: groupGws.length,
                 total: h.groupStageGws.length, complete: complete };
      });
    } else {
      // Fallback: build groups from GW scores (used before H2H data is pulled).
      var groupsCfg = (ov().h2h && ov().h2h.groups) || autoGroups(ds, h);
      groups = groupsCfg.map(function (grp, gi) {
        var ids = grp.entries || [];
        var table = ids.map(function (id) {
          return { id: id, name: nm(mm, id), player: pl(mm, id), w: 0, d: 0, l: 0, pts: 0, gwPts: 0 };
        });
        var byId = {}; table.forEach(function (t) { byId[t.id] = t; });
        for (var a = 0; a < ids.length; a++) {
          for (var b = a + 1; b < ids.length; b++) {
            var ta = byId[ids[a]], tb = byId[ids[b]];
            var sa = sumGws(ds, ids[a], groupGws) || 0;
            var sb = sumGws(ds, ids[b], groupGws) || 0;
            if (sa > sb) { ta.w++; tb.l++; ta.pts += h.pointsWin; }
            else if (sb > sa) { tb.w++; ta.l++; tb.pts += h.pointsWin; }
            else { ta.d++; tb.d++; ta.pts += h.pointsDraw; tb.pts += h.pointsDraw; }
          }
        }
        table.forEach(function (t) { t.gwPts = sumGws(ds, t.id, groupGws) || 0; });
        table.sort(function (x, y) { return (y.pts - x.pts) || (y.gwPts - x.gwPts); });
        table.forEach(function (t, i) { t.pos = i + 1; t.dest = dest(i); });
        return { name: grp.name || ("Group " + String.fromCharCode(65 + gi)), table: table,
                 played: groupGws.length, total: h.groupStageGws.length, complete: complete };
      });
    }

    var bracket = (ov().h2h && ov().h2h.bracket) || null;

    return { groups: groups, groupsConfigured: haveFetched || !!(ov().h2h && ov().h2h.groups),
             fromFpl: haveFetched, bracket: bracket, schedule: h.knockout, prizes: h.prizes,
             groupGwsPlayed: groupGws.length, groupGwsTotal: h.groupStageGws.length };
  };

  function autoGroups(ds, h) {
    // Snake-seed by rank into groupCount groups so groups are balanced.
    var sorted = ds.managers.slice().sort(function (a, b) { return a.rank - b.rank; });
    var groups = [];
    for (var i = 0; i < h.groupCount; i++) groups.push({ name: "Group " + String.fromCharCode(65 + i), entries: [] });
    var dir = 1, gi = 0;
    sorted.forEach(function (m) {
      groups[gi].entries.push(m.id);
      gi += dir;
      if (gi === h.groupCount) { gi = h.groupCount - 1; dir = -1; }
      else if (gi < 0) { gi = 0; dir = 1; }
    });
    return groups;
  }

  /* ---- small utils ------------------------------------------------------ */
  function nm(mm, id) { return (mm[id] && mm[id].entryName) || ("#" + id); }
  function pl(mm, id) { return (mm[id] && mm[id].playerName) || ""; }
  function applyOverrideOrder(rows, order) {
    if (!order || !order.length) return;
    var idx = {}; order.forEach(function (id, i) { idx[id] = i; });
    rows.sort(function (a, b) {
      var ia = (a.id in idx) ? idx[a.id] : 9999, ib = (b.id in idx) ? idx[b.id] : 9999;
      return ia - ib;
    });
  }

  C.nm = nm; C.pl = pl;
  /* ---- Per-manager profile across all competitions --------------------- */
  C.managerProfile = function (ds, id) {
    id = +id;
    var mm = managerMap(ds);
    var classicRows = C.classic(ds);
    var classic = classicRows.filter(function (r) { return +r.id === id; })[0] || null;

    var monthly = [];
    C.monthly(ds).forEach(function (m) {
      var row = m.rows.filter(function (r) { return +r.id === id; })[0];
      if (row) monthly.push({ name: m.name, label: m.label, pos: row.pos, score: row.score, prize: row.prize, complete: m.complete });
    });

    var lms = C.lms(ds);
    var lmsStatus = lms.eliminatedAt[id] ? { state: "out", gw: lms.eliminatedAt[id] }
      : (lms.survivors.some(function (s) { return +s.id === id; }) ? { state: "in" } : { state: "na" });

    var pyramid = [];
    C.pyramid(ds).seasons.forEach(function (se) {
      se.divisions.forEach(function (dv) {
        var row = dv.rows.filter(function (r) { return +r.id === id; })[0];
        if (row) pyramid.push({ season: se.name, division: dv.name, pos: row.pos, score: row.score, size: dv.size, prize: row.prize });
      });
    });

    var h2h = null;
    C.h2h(ds).groups.forEach(function (g) {
      var t = g.table.filter(function (x) { return +x.id === id; })[0];
      if (t) h2h = { group: g.name, pos: t.pos, pts: t.pts, w: t.w, d: t.d, l: t.l, dest: t.dest, gwPts: t.gwPts };
    });

    return {
      id: id, entryName: nm(mm, id), playerName: pl(mm, id),
      classic: classic, monthly: monthly, lms: lmsStatus, pyramid: pyramid, h2h: h2h,
      past: (ds.pastSeasons && ds.pastSeasons[id]) || []
    };
  };

  /* ---- squads -----------------------------------------------------------
     Squads are stored per gameweek (picksV 2). Older datasets held only the
     current gameweek in a flat map, so both shapes are read here. */
  function picksAt(ds, gw) {
    if (!ds || !ds.picks) return null;
    if (ds.picksV === 2) return ds.picks[gw] || null;
    return (+gw === +ds.pitchGw) ? ds.picks : null;
  }
  function liveAt(ds, gw) {
    if (!ds || !ds.livePoints) return {};
    if (ds.picksV === 2) return ds.livePoints[gw] || {};
    return (+gw === +ds.pitchGw) ? ds.livePoints : {};
  }

  /* Effective ownership across THIS league for one gameweek: the summed
     multiplier a player carries over every squad, as a percentage of squads.
     Started by everyone = 100%, captained by everyone = 200%, benched = 0.
     Also yields the league's average XI ownership and squad price, so a
     single squad can be read against the field. Scanning every squad is
     cheap but not free, so the last result is kept. */
  var _eo = { key: null, val: null };
  function eoTable(ds, gw) {
    if (!ds) return null;
    var key = (ds.updatedAt || "") + "|" + gw;
    if (_eo.key === key) return _eo.val;
    var pk = picksAt(ds, gw);
    if (!pk) return null;
    var els = ds.elements || {};
    var ids = Object.keys(pk), n = ids.length;
    if (!n) return null;

    var mult = {};
    ids.forEach(function (mid) {
      (pk[mid].p || []).forEach(function (t) {
        if (t[1] > 0) mult[t[0]] = (mult[t[0]] || 0) + t[1];
      });
    });
    var eo = {};
    Object.keys(mult).forEach(function (el) {
      eo[el] = Math.round((mult[el] / n) * 1000) / 10;
    });

    var eoSum = 0, valSum = 0, counted = 0;
    ids.forEach(function (mid) {
      var picks = pk[mid].p || [];
      var xi = 0, xiEo = 0, val = 0;
      picks.forEach(function (t) {
        var m = els[t[0]];
        val += (m && m[3]) || 0;
        if (t[1] > 0) { xi++; xiEo += eo[t[0]] || 0; }
      });
      if (!xi) return;
      eoSum += xiEo / xi; valSum += val; counted++;
    });

    var out = {
      eo: eo, managers: n,
      leagueAvgEo: counted ? Math.round((eoSum / counted) * 10) / 10 : 0,
      leagueAvgValue: counted ? Math.round(valSum / counted) : 0
    };
    _eo = { key: key, val: out };
    return out;
  }

  // Gameweeks we hold squads for, oldest first.
  C.squadGws = function (ds) {
    if (!ds || !ds.picks) return [];
    if (ds.picksV !== 2) return ds.pitchGw ? [+ds.pitchGw] : [];
    return Object.keys(ds.picks).map(Number)
      .filter(function (g) { return ds.picks[g] && Object.keys(ds.picks[g]).length; })
      .sort(function (a, b) { return a - b; });
  };

  // A manager's squad for a gameweek, laid out by position with points per
  // player. Defaults to the latest gameweek. Null when we have no squad.
  C.managerPitch = function (ds, id, gw) {
    id = +id;
    if (!ds || !ds.picks || !ds.elements) return null;
    gw = gw ? +gw : +ds.pitchGw;
    var pk = picksAt(ds, gw);
    var sq = pk && pk[id];
    if (!sq || !sq.p || !sq.p.length) return null;
    var els = ds.elements, lp = liveAt(ds, gw);
    var POS = { 1: "GK", 2: "DEF", 3: "MID", 4: "FWD" };

    var eot = eoTable(ds, gw);
    function build(el, mult, isCap, isVice) {
      var meta = els[el] || ["?", 0, "", 0, 0];
      var base = lp[el] || 0;
      return { el: el, name: meta[0], type: meta[1], team: meta[2], pos: POS[meta[1]] || "",
               pts: base * (mult || 1), base: base,
               price: meta[3] || 0, eo: (eot && eot.eo[el]) || 0,
               cap: !!isCap, vice: !!isVice, mult: mult || 0 };
    }

    var rows = { 1: [], 2: [], 3: [], 4: [] }, bench = [], total = 0;
    sq.p.forEach(function (p) {
      var pl = build(p[0], p[1], p[2], p[3]);
      if (pl.mult > 0) {
        (rows[pl.type] || (rows[pl.type] = [])).push(pl);
        total += pl.pts;
      } else {
        bench.push(pl);
      }
    });

    // Star the top scorer of the XI (ties: first one wins).
    var best = null;
    [1, 2, 3, 4].forEach(function (t) {
      (rows[t] || []).forEach(function (p) { if (!best || p.pts > best.pts) best = p; });
    });
    if (best && best.pts > 0) best.star = true;

    var lines = [1, 2, 3, 4].map(function (t) { return { pos: POS[t], players: rows[t] || [] }; });
    var gwEv = (ds.bootstrap && ds.bootstrap.events || []).filter(function (e) { return +e.id === +gw; })[0];
    var live = gwEv ? (gwEv.is_current && !(gwEv.finished && gwEv.data_checked)) : false;

    // League context for this gameweek: average and the best score.
    var hrow = (ds.history[id] || {})[gw] || null;
    var hits = hrow ? (hrow.h || 0) : 0;
    var net = hrow && typeof hrow.p === "number" ? hrow.p : (total - hits);
    var sum = 0, n = 0, top = null;
    (ds.managers || []).forEach(function (m) {
      var r = (ds.history[m.id] || {})[gw];
      if (!r || typeof r.p !== "number") return;
      sum += r.p; n++;
      if (!top || r.p > top.pts) top = { id: m.id, name: m.entryName, pts: r.p };
    });

    // Ownership and price for the squad as a whole. Effective ownership is
    // averaged over the XI (the bench cannot score), while squad value counts
    // all fifteen at today's prices.
    var xi = [], everyone = bench.slice();
    lines.forEach(function (l) { l.players.forEach(function (p) { xi.push(p); everyone.push(p); }); });
    var eoSum = 0, valSum = 0, topEo = null, topPrice = null;
    xi.forEach(function (p) {
      eoSum += p.eo;
      if (topEo === null || p.eo > topEo) topEo = p.eo;
    });
    everyone.forEach(function (p) {
      valSum += p.price;
      if (topPrice === null || p.price > topPrice) topPrice = p.price;
    });

    return { gw: gw, gwName: gwEv ? gwEv.name : ("GW " + gw), live: live,
             chip: sq.c || "", lines: lines, bench: bench,
             total: total, hits: hits, net: net,
             average: n ? Math.round(sum / n) : null, highest: top,
             avgEo: xi.length ? Math.round((eoSum / xi.length) * 10) / 10 : 0,
             topEo: topEo || 0, squadValue: valSum, topPrice: topPrice || 0,
             leagueAvgEo: eot ? eot.leagueAvgEo : 0,
             leagueAvgValue: eot ? eot.leagueAvgValue : 0 };
  };

  // Side-by-side comparison of two managers for a gameweek, plus season totals
  // and their notional head-to-head record across every gameweek played.
  C.compare = function (ds, aId, bId, gw) {
    if (!ds || !aId || !bId) return null;
    aId = +aId; bId = +bId;
    gw = gw ? +gw : +ds.pitchGw;
    var mm = managerMap(ds);
    var played = C.finishedGws(ds);
    var cur = C.currentGw(ds);
    if (cur && played.indexOf(cur) === -1) played = played.concat([cur]);

    function side(id) {
      var hist = ds.history[id] || {};
      var hits = 0, bench = 0, best = null, worst = null, chips = [];
      played.forEach(function (g) {
        var r = hist[g];
        if (!r) return;
        hits += r.h || 0;
        bench += r.b || 0;
        if (typeof r.p === "number") {
          if (!best || r.p > best.p) best = { gw: g, p: r.p };
          if (!worst || r.p < worst.p) worst = { gw: g, p: r.p };
        }
      });
      C.squadGws(ds).forEach(function (g) {
        var pk = picksAt(ds, g), sq = pk && pk[id];
        if (sq && sq.c) chips.push({ gw: g, chip: sq.c });
      });
      var row = (hist[gw] || null);
      var last = null;
      played.forEach(function (g) { if (hist[g] && typeof hist[g].t === "number") last = hist[g].t; });
      return {
        id: id, name: nm(mm, id), player: pl(mm, id),
        pitch: C.managerPitch(ds, id, gw),
        gwPts: row && typeof row.p === "number" ? row.p : null,
        gwHits: row ? (row.h || 0) : 0,
        gwBench: row ? (row.b || 0) : 0,
        total: last, hits: hits, bench: bench, best: best, worst: worst, chips: chips
      };
    }

    var A = side(aId), B = side(bId);

    // Classic-league standing for each.
    C.classic(ds).forEach(function (r) {
      if (+r.id === aId) A.rank = r.computedRank;
      if (+r.id === bId) B.rank = r.computedRank;
    });

    // Notional head-to-head: who scored more, gameweek by gameweek.
    var rec = { w: 0, d: 0, l: 0, gws: [] };
    played.forEach(function (g) {
      var x = (ds.history[aId] || {})[g], y = (ds.history[bId] || {})[g];
      if (!x || !y || typeof x.p !== "number" || typeof y.p !== "number") return;
      if (x.p > y.p) rec.w++; else if (x.p < y.p) rec.l++; else rec.d++;
      rec.gws.push({ gw: g, a: x.p, b: y.p });
    });

    // Who owns whom this gameweek.
    function squadIds(p) {
      var s = {};
      if (!p) return s;
      p.lines.forEach(function (l) { l.players.forEach(function (x) { s[x.el] = x; }); });
      p.bench.forEach(function (x) { s[x.el] = x; });
      return s;
    }
    var sa = squadIds(A.pitch), sb = squadIds(B.pitch);
    var shared = [], aOnly = [], bOnly = [];
    Object.keys(sa).forEach(function (k) { (sb[k] ? shared : aOnly).push(sa[k]); });
    Object.keys(sb).forEach(function (k) { if (!sa[k]) bOnly.push(sb[k]); });
    function byPts(x, y) { return y.pts - x.pts; }

    var gwEv = (ds.bootstrap && ds.bootstrap.events || []).filter(function (e) { return +e.id === +gw; })[0];
    return { gw: gw, gwName: gwEv ? gwEv.name : ("GW " + gw), a: A, b: B, record: rec,
             shared: shared.sort(byPts), aOnly: aOnly.sort(byPts), bOnly: bOnly.sort(byPts) };
  };

  /* ---- league stats & highlights ---------------------------------------
     Everything here is derived from data we already hold: per-gameweek
     history rows (points, hits, bench, squad value) and the stored squads
     (ownership, captaincy). Returns null when there is nothing to show. */
  C.highlights = function (ds, gw) {
    if (!ds || !ds.managers || !ds.managers.length) return null;
    gw = gw ? +gw : +ds.pitchGw;
    var mm = managerMap(ds);
    var els = ds.elements || {};
    var lp = liveAt(ds, gw);
    var pk = picksAt(ds, gw);
    var played = C.finishedGws(ds);
    var cur = C.currentGw(ds);
    if (cur && played.indexOf(cur) === -1) played = played.concat([cur]);

    function meta(el) {
      var m = els[el] || ["?", 0, "", 0, 0];
      return { el: +el, name: m[0], type: m[1], team: m[2], price: m[3] || 0, ownedAll: m[4] || 0 };
    }
    function best(list, key) {
      var out = null;
      list.forEach(function (x) { if (out === null || x[key] > out[key]) out = x; });
      return out;
    }
    function worst(list, key) {
      var out = null;
      list.forEach(function (x) { if (out === null || x[key] < out[key]) out = x; });
      return out;
    }

    /* ---- this gameweek, from the history rows ---- */
    var rows = [];
    ds.managers.forEach(function (m) {
      var r = (ds.history[m.id] || {})[gw];
      if (!r || typeof r.p !== "number") return;
      rows.push({ id: m.id, name: nm(mm, m.id), player: pl(mm, m.id),
                  p: r.p, hits: r.h || 0, bench: r.b || 0,
                  value: r.v || 0, bank: r.bk || 0, transfers: r.tr || 0 });
    });
    var gwStats = null;
    if (rows.length) {
      var sorted = rows.slice().sort(function (a, b) { return b.p - a.p; });
      var sum = 0, hitTotal = 0, benchTotal = 0, trTotal = 0;
      rows.forEach(function (r) { sum += r.p; hitTotal += r.hits; benchTotal += r.bench; trTotal += r.transfers; });
      var mid = sorted[Math.floor(sorted.length / 2)];
      gwStats = {
        count: rows.length,
        top: sorted[0], second: sorted[1] || null, low: sorted[sorted.length - 1],
        average: Math.round(sum / rows.length), median: mid ? mid.p : null,
        hitTotal: hitTotal, mostHits: best(rows, "hits"),
        benchTotal: benchTotal, mostBench: best(rows, "bench"),
        transfersTotal: trTotal, mostTransfers: best(rows, "transfers")
      };
    }

    /* ---- squad value ---- */
    var value = null;
    var withVal = rows.filter(function (r) { return r.value > 0; });
    if (withVal.length) {
      var vs = 0, bs = 0;
      withVal.forEach(function (r) { vs += r.value; bs += r.bank; });
      value = {
        richest: best(withVal, "value"), poorest: worst(withVal, "value"),
        average: Math.round(vs / withVal.length), averageBank: Math.round(bs / withVal.length),
        mostBanked: best(withVal, "bank"), count: withVal.length
      };
    }

    /* ---- ownership & captaincy, from the stored squads ---- */
    var squads = null;
    if (pk) {
      var ids = Object.keys(pk), n = ids.length;
      var own = {}, cap = {}, chips = {};
      ids.forEach(function (mid) {
        var sq = pk[mid];
        if (sq.c) chips[sq.c] = (chips[sq.c] || 0) + 1;
        (sq.p || []).forEach(function (t) {
          var el = t[0];
          if (!own[el]) own[el] = 0;
          own[el]++;
          if (t[2]) cap[el] = (cap[el] || 0) + 1;
        });
      });
      var ownedList = Object.keys(own).map(function (el) {
        var m = meta(el);
        m.owners = own[el];
        m.ownedPct = n ? Math.round((own[el] / n) * 1000) / 10 : 0;
        m.pts = lp[el] || 0;
        m.caps = cap[el] || 0;
        m.value = m.price ? Math.round((m.pts / (m.price / 10)) * 100) / 100 : 0;
        return m;
      });
      var capList = ownedList.filter(function (x) { return x.caps > 0; });
      // A differential: in fewer than one in ten squads in this league.
      var diffs = ownedList.filter(function (x) { return x.ownedPct < 10 && x.pts > 0; });
      var priced = ownedList.filter(function (x) { return x.price > 0 && x.pts > 0; });
      squads = {
        managers: n, chips: chips,
        mostOwned: ownedList.slice().sort(function (a, b) { return b.owners - a.owners; }).slice(0, 5),
        topScorers: ownedList.slice().sort(function (a, b) { return b.pts - a.pts; }).slice(0, 5),
        mostCaptained: capList.slice().sort(function (a, b) { return b.caps - a.caps; }).slice(0, 5),
        bestCaptain: capList.slice().sort(function (a, b) { return b.pts - a.pts; })[0] || null,
        worstCaptain: capList.filter(function (x) { return x.caps >= Math.max(2, n * 0.03); })
          .sort(function (a, b) { return a.pts - b.pts; })[0] || null,
        differentials: diffs.sort(function (a, b) { return b.pts - a.pts; }).slice(0, 5),
        bestValue: priced.sort(function (a, b) { return b.value - a.value; }).slice(0, 5),
        priciest: ownedList.slice().sort(function (a, b) { return b.price - a.price; }).slice(0, 5)
      };
    }

    /* ---- season so far ---- */
    var season = null;
    if (played.length) {
      var bestGw = null, agg = [];
      ds.managers.forEach(function (m) {
        var h = ds.history[m.id] || {};
        var tot = 0, hits = 0, bench = 0, cnt = 0, hi = null;
        played.forEach(function (g) {
          var r = h[g];
          if (!r || typeof r.p !== "number") return;
          tot += r.p; hits += r.h || 0; bench += r.b || 0; cnt++;
          if (!hi || r.p > hi.p) hi = { gw: g, p: r.p };
          if (!bestGw || r.p > bestGw.p) bestGw = { id: m.id, name: nm(mm, m.id), gw: g, p: r.p };
        });
        if (!cnt) return;
        agg.push({ id: m.id, name: nm(mm, m.id), total: tot, hits: hits, bench: bench,
                   avg: Math.round((tot / cnt) * 10) / 10, best: hi ? hi.p : 0 });
      });
      if (agg.length) {
        season = {
          gws: played.length, bestGw: bestGw,
          mostHits: best(agg, "hits"), mostBench: best(agg, "bench"),
          cleanest: agg.filter(function (a) { return a.hits === 0; }).length,
          bestAvg: best(agg, "avg")
        };
      }
    }

    /* ---- past seasons (hall of fame) ---- */
    var past = null;
    if (ds.pastSeasons) {
      var pr = [];
      Object.keys(ds.pastSeasons).forEach(function (id) {
        var list = ds.pastSeasons[id] || [];
        if (!list.length) return;
        var bestRank = null, bestPts = null;
        list.forEach(function (s) {
          if (s.rank && (bestRank === null || s.rank < bestRank.rank)) bestRank = { rank: s.rank, season: s.season };
          if (typeof s.total === "number" && (bestPts === null || s.total > bestPts.total)) bestPts = { total: s.total, season: s.season };
        });
        pr.push({ id: +id, name: nm(mm, +id), seasons: list.length, bestRank: bestRank, bestPts: bestPts });
      });
      if (pr.length) {
        var ranked = pr.filter(function (x) { return x.bestRank; })
          .sort(function (a, b) { return a.bestRank.rank - b.bestRank.rank; });
        var scored = pr.filter(function (x) { return x.bestPts; })
          .sort(function (a, b) { return b.bestPts.total - a.bestPts.total; });
        past = {
          players: pr.length,
          topRanks: ranked.slice(0, 5),
          topScores: scored.slice(0, 5),
          veterans: pr.slice().sort(function (a, b) { return b.seasons - a.seasons; }).slice(0, 5)
        };
      }
    }

    var gwEv = (ds.bootstrap && ds.bootstrap.events || []).filter(function (e) { return +e.id === +gw; })[0];
    return { gw: gw, gwName: gwEv ? gwEv.name : ("GW " + gw),
             live: gwEv ? !!(gwEv.is_current && !(gwEv.finished && gwEv.data_checked)) : false,
             gwStats: gwStats, value: value, squads: squads, season: season, past: past };
  };

  window.GO_COMPUTE = C;
})();
