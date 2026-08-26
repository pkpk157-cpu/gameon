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

  // The score every competition is settled on. Missing => null (not played).
  // FPL reports a gameweek's points and its transfer cost in separate fields,
  // and one gameweek on its own cannot tell you whether points already has the
  // hit taken off it. The cumulative total settles it: whichever reading adds
  // up to total_points is the one FPL means. Until somebody actually takes a
  // hit the two readings are identical, so this is right from the first
  // gameweek that has one — and the league's rules say hits count.
  var _hitCache = null;
  function hitsAlreadyOff(ds) {
    if (_hitCache && _hitCache.ds === ds) return _hitCache.v;
    var settled = {};
    C.finishedGws(ds).forEach(function (g) { settled[g] = true; });
    var already = 0, still = 0;
    var ids = Object.keys(ds.history || {});
    for (var i = 0; i < ids.length && already + still < 50; i++) {
      var h = ds.history[ids[i]] || {};
      var gws = Object.keys(h).map(Number).filter(function (g) { return settled[g]; })
                  .sort(function (a, b) { return a - b; });
      if (!gws.length) continue;
      var last = h[gws[gws.length - 1]];
      if (!last || typeof last.t !== "number") continue;
      var sp = 0, sh = 0;
      for (var j = 0; j < gws.length; j++) { sp += h[gws[j]].p || 0; sh += h[gws[j]].h || 0; }
      if (!sh) continue;                       // no hit taken: tells us nothing
      if (Math.abs(last.t - sp) <= 0.5) already++;
      else if (Math.abs(last.t - (sp - sh)) <= 0.5) still++;
    }
    // No evidence either way means nobody has taken a hit, where both agree.
    var v = already > still;
    _hitCache = { ds: ds, v: v };
    return v;
  }
  C._hitsAlreadyOff = hitsAlreadyOff;   // so the check can be asserted in tests

  // The score a competition is settled on: net of hits, however FPL reports it.
  function gwScore(ds, entryId, gw) {
    var h = ds.history[entryId];
    if (!h || !h[gw]) return null;
    var row = h[gw];
    if (typeof row.p !== "number") return null;
    return hitsAlreadyOff(ds) ? row.p : row.p - (row.h || 0);
  }
  C.gwScore = gwScore;
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
  // How many completed months each manager has won, which is the league's first
  // tie-break for the classic table. Managers level at the top of a month are
  // all credited with winning it: the monthly table pays only its first row,
  // but that order can come down to bench points, and it would be wrong to let
  // that decide the classic standings as well.
  C.monthlyWins = function (ds) {
    var wins = {};
    C.monthly(ds).forEach(function (m) {
      if (!m.complete || !m.rows.length) return;
      var top = m.rows[0].score;
      m.rows.forEach(function (r) { if (r.score === top) wins[r.id] = (wins[r.id] || 0) + 1; });
    });
    return wins;
  };

  // Rule: "Tie breakers settled with monthly wins between tied managers, else
  // prize split as average of prize for the tied spots." So managers level on
  // points are separated by months won; any still level share one position and
  // split the money for the places they occupy, rather than being ordered by
  // something the table never shows.
  C.classic = function (ds) {
    var wins = C.monthlyWins(ds);
    var rows = ds.managers.slice().sort(function (a, b) {
      return (b.total - a.total) ||
             ((wins[b.id] || 0) - (wins[a.id] || 0)) ||
             (a.rank - b.rank);
    });
    rows.forEach(function (r, i) {
      r.order = i + 1;                       // where it sits in the list
      r.computedRank = i + 1;                // the position shown, joint on a tie
      r.monthWins = wins[r.id] || 0;
      r.prize = C.classicPrize(i + 1);
      r.tiedWith = 0;
      r.move = (r.lastRank && r.lastRank > 0) ? (r.lastRank - (i + 1)) : 0;
    });
    // Anyone still level after months won shares the position and the money.
    for (var i = 0; i < rows.length; ) {
      var j = i;
      while (j + 1 < rows.length &&
             rows[j + 1].total === rows[i].total &&
             rows[j + 1].monthWins === rows[i].monthWins) j++;
      if (j > i) {
        var pot = 0, n = j - i + 1;
        for (var k = i; k <= j; k++) pot += C.classicPrize(k + 1);
        // Whole rupees, and the pot has to come out exactly: a three-way split
        // of an odd amount hands the odd rupees to the higher places rather
        // than leaving paise on the table.
        var base = Math.floor(pot / n), extra = pot - base * n;
        for (var k2 = i; k2 <= j; k2++) {
          rows[k2].computedRank = i + 1;     // joint position
          rows[k2].prize = base + ((k2 - i) < extra ? 1 : 0);
          rows[k2].tiedWith = n;
          rows[k2].move = (rows[k2].lastRank && rows[k2].lastRank > 0) ? (rows[k2].lastRank - (i + 1)) : 0;
        }
      }
      i = j + 1;
    }
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
    if (ds.picksV >= 2) return ds.picks[gw] || null;
    return (+gw === +ds.pitchGw) ? ds.picks : null;
  }
  function liveAt(ds, gw) {
    if (!ds || !ds.livePoints) return {};
    if (ds.picksV >= 2) return ds.livePoints[gw] || {};
    return (+gw === +ds.pitchGw) ? ds.livePoints : {};
  }
  // Bonus FPL has not published yet, ranked from bps by the updater. It exists
  // only for fixtures still in play: once one is finalised its bonus is already
  // inside the player's points and this is empty for them again.
  function bonusAt(ds, gw) {
    return (ds && ds.liveBonus && ds.liveBonus[gw]) || {};
  }
  C.provisionalBonus = bonusAt;

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

  // Every chip, with the gameweeks a manager played it. Prefers the history's
  // own chip record; older datasets fall back to scanning stored squads.
  var CHIP_TYPES = [
    { key: "wildcard", label: "Wildcard" },
    { key: "bboost", label: "Bench Boost" },
    { key: "3xc", label: "Triple Captain" },
    { key: "freehit", label: "Free Hit" }
  ];
  C.managerChips = function (ds, id) {
    id = +id;
    var used = {};
    var rec = ds && ds.chips && ds.chips[id];
    if (rec && rec.length) {
      rec.forEach(function (c) { (used[c.n] || (used[c.n] = [])).push(c.gw); });
    } else {
      C.squadGws(ds).forEach(function (g) {
        var pk = picksAt(ds, g), sq = pk && pk[id];
        if (sq && sq.c) (used[sq.c] || (used[sq.c] = [])).push(g);
      });
    }
    return CHIP_TYPES.map(function (t) {
      var gws = (used[t.key] || []).slice().sort(function (a, b) { return a - b; });
      return { key: t.key, label: t.label, gws: gws, used: gws.length > 0 };
    });
  };

  // Gameweeks we hold squads for, oldest first.
  C.squadGws = function (ds) {
    if (!ds || !ds.picks) return [];
    if (!(ds.picksV >= 2)) return ds.pitchGw ? [+ds.pitchGw] : [];
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
    var els = ds.elements, lp = liveAt(ds, gw), pb = bonusAt(ds, gw);
    var POS = { 1: "GK", 2: "DEF", 3: "MID", 4: "FWD" };

    var eot = eoTable(ds, gw);
    function build(el, mult, isCap, isVice) {
      var meta = els[el] || ["?", 0, "", 0, 0];
      // While a fixture is in play FPL withholds bonus, so a squad reads up to
      // three points light per bonus-earning player unless it is added back.
      var prov = pb[el] || 0;
      var base = (lp[el] || 0) + prov;
      return { el: el, name: meta[0], type: meta[1], team: meta[2], pos: POS[meta[1]] || "",
               pts: base * (mult || 1), base: base, prov: prov,
               price: meta[3] || 0, eo: (eot && eot.eo[el]) || 0,
               cap: !!isCap, vice: !!isVice, mult: mult || 0 };
    }

    // Picks arrive in position order: the first eleven are the XI, the rest
    // the bench. Multiplier decides scoring, not placement — under Bench Boost
    // the bench scores too but still belongs on the bench.
    var rows = { 1: [], 2: [], 3: [], 4: [] }, bench = [], total = 0, scoring = [];
    sq.p.forEach(function (p, i) {
      var pl = build(p[0], p[1], p[2], p[3]);
      pl.benched = i >= 11;
      if (pl.benched) bench.push(pl);
      else (rows[pl.type] || (rows[pl.type] = [])).push(pl);
      if (pl.mult > 0) { total += pl.base * pl.mult; scoring.push(pl); }
    });

    // Star the squad's top scorer (ties: first one wins).
    var best = null;
    scoring.forEach(function (p) { if (!best || p.pts > best.pts) best = p; });
    if (best && best.pts > 0) best.star = true;

    var lines = [1, 2, 3, 4].map(function (t) { return { pos: POS[t], players: rows[t] || [] }; });
    // A pick whose player is missing from the element table has no position, so
    // it belongs to none of the four lines. Give it its own row rather than
    // letting it drop out of the XI and leave a hole on the pitch.
    Object.keys(rows).forEach(function (t) {
      if (!POS[t] && rows[t] && rows[t].length) lines.push({ pos: "?", players: rows[t] });
    });
    var gwEv = (ds.bootstrap && ds.bootstrap.events || []).filter(function (e) { return +e.id === +gw; })[0];
    var live = gwEv ? (gwEv.is_current && !(gwEv.finished && gwEv.data_checked)) : false;

    // League context for this gameweek: average and the best score.
    var hrow = (ds.history[id] || {})[gw] || null;
    var hits = hrow ? (hrow.h || 0) : 0;
    var scored = gwScore(ds, id, gw);
    var net = scored === null ? (total - hits) : scored;
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
    var everyone = bench.slice();
    lines.forEach(function (l) { l.players.forEach(function (p) { everyone.push(p); }); });
    var eoSum = 0, valSum = 0, topEo = null, topPrice = null;
    // Averaged over the players who actually count this week — which under
    // Bench Boost is all fifteen.
    scoring.forEach(function (p) {
      eoSum += p.eo;
      if (topEo === null || p.eo > topEo) topEo = p.eo;
    });
    everyone.forEach(function (p) {
      valSum += p.price;
      if (topPrice === null || p.price > topPrice) topPrice = p.price;
    });

    var provTotal = 0;
    scoring.forEach(function (p) { provTotal += (p.prov || 0) * p.mult; });
    return { gw: gw, gwName: gwEv ? gwEv.name : ("GW " + gw), live: live, provisional: provTotal,
             chip: sq.c || "", lines: lines, bench: bench,
             total: total, hits: hits, net: net,
             average: n ? Math.round(sum / n) : null, highest: top,
             avgEo: scoring.length ? Math.round((eoSum / scoring.length) * 10) / 10 : 0,
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

      // Past FPL seasons, for the all-time comparison.
      var seasons = ((ds.pastSeasons && ds.pastSeasons[id]) || []).slice();
      var pBestRank = null, pBestPts = null, career = 0;
      seasons.forEach(function (s) {
        if (s.rank && (pBestRank === null || s.rank < pBestRank.rank)) pBestRank = s;
        if (typeof s.total === "number") {
          career += s.total;
          if (pBestPts === null || s.total > pBestPts.total) pBestPts = s;
        }
      });

      return {
        id: id, name: nm(mm, id), player: pl(mm, id),
        pitch: C.managerPitch(ds, id, gw),
        gwPts: row && typeof row.p === "number" ? row.p : null,
        gwHits: row ? (row.h || 0) : 0,
        gwBench: row ? (row.b || 0) : 0,
        total: last, hits: hits, bench: bench, best: best, worst: worst, chips: chips,
        seasons: seasons, seasonCount: seasons.length,
        bestRank: pBestRank, bestPts: pBestPts, career: career,
        avgSeason: seasons.length ? Math.round(career / seasons.length) : null
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
    // Position first, then points — so the two columns read like team sheets.
    function bySheet(x, y) { return (x.type - y.type) || (y.pts - x.pts); }
    shared.sort(bySheet); aOnly.sort(bySheet); bOnly.sort(bySheet);

    // Every player, with the ones both managers own on a shared row.
    var squadRows = shared.map(function (p) {
      return { a: p, b: sb[p.el], shared: true };
    });
    var most = Math.max(aOnly.length, bOnly.length);
    for (var i = 0; i < most; i++) {
      squadRows.push({ a: aOnly[i] || null, b: bOnly[i] || null, shared: false });
    }

    // Past seasons either manager played, newest first.
    var seen = {};
    A.seasons.concat(B.seasons).forEach(function (s) { seen[s.season] = true; });
    var seasonRows = Object.keys(seen).sort().reverse().map(function (name) {
      function find(list) {
        return list.filter(function (s) { return s.season === name; })[0] || null;
      }
      return { season: name, a: find(A.seasons), b: find(B.seasons) };
    });

    var gwEv = (ds.bootstrap && ds.bootstrap.events || []).filter(function (e) { return +e.id === +gw; })[0];
    return { gw: gw, gwName: gwEv ? gwEv.name : ("GW " + gw), a: A, b: B, record: rec,
             shared: shared, aOnly: aOnly, bOnly: bOnly,
             squadRows: squadRows, seasonRows: seasonRows };
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
    var eot = eoTable(ds, gw);
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
      var avg = Math.round(sum / rows.length);
      gwStats = {
        count: rows.length,
        top: sorted[0], second: sorted[1] || null, low: sorted[sorted.length - 1],
        average: avg, median: mid ? mid.p : null,
        range: sorted[0].p - sorted[sorted.length - 1].p,
        aboveAvg: rows.filter(function (r) { return r.p > avg; }).length,
        hitTotal: hitTotal, mostHits: best(rows, "hits"),
        benchTotal: benchTotal, mostBench: best(rows, "bench"),
        transfersTotal: trTotal, mostTransfers: best(rows, "transfers"),
        noTransfer: rows.filter(function (r) { return !r.transfers; }).length
      };
      // League movement only means anything for the newest gameweek.
      if (+gw === +cur) {
        var moves = C.classic(ds).filter(function (r) { return r.move; });
        if (moves.length) {
          var up = moves.slice().sort(function (a, b) { return b.move - a.move; })[0];
          var down = moves.slice().sort(function (a, b) { return a.move - b.move; })[0];
          gwStats.climbers = moves.filter(function (r) { return r.move > 0; }).length;
          gwStats.fallers = moves.filter(function (r) { return r.move < 0; }).length;
          if (up && up.move > 0) gwStats.biggestClimb = { id: up.id, name: up.entryName, move: up.move };
          if (down && down.move < 0) gwStats.biggestFall = { id: down.id, name: down.entryName, move: -down.move };
        }
      }
    }

    /* ---- squad value ---- */
    var value = null;
    var withVal = rows.filter(function (r) { return r.value > 0; });
    if (withVal.length) {
      var vs = 0, bs = 0;
      withVal.forEach(function (r) { vs += r.value; bs += r.bank; });
      value = {
        top: withVal.slice().sort(function (a, b) { return b.value - a.value; }).slice(0, 5),
        richest: best(withVal, "value"), poorest: worst(withVal, "value"),
        average: Math.round(vs / withVal.length), averageBank: Math.round(bs / withVal.length),
        mostBanked: best(withVal, "bank"), count: withVal.length
      };
    }

    /* ---- ownership & captaincy, from the stored squads ---- */
    var squads = null;
    if (pk) {
      var ids = Object.keys(pk), n = ids.length;
      var own = {}, cap = {}, vice = {}, chips = {};
      ids.forEach(function (mid) {
        var sq = pk[mid];
        if (sq.c) chips[sq.c] = (chips[sq.c] || 0) + 1;
        (sq.p || []).forEach(function (t) {
          var el = t[0];
          if (!own[el]) own[el] = 0;
          own[el]++;
          if (t[2]) cap[el] = (cap[el] || 0) + 1;
          if (t[3]) vice[el] = (vice[el] || 0) + 1;
        });
      });
      var ownedList = Object.keys(own).map(function (el) {
        var m = meta(el);
        m.owners = own[el];
        m.ownedPct = n ? Math.round((own[el] / n) * 1000) / 10 : 0;
        m.pts = lp[el] || 0;
        m.caps = cap[el] || 0;
        m.vices = vice[el] || 0;
        m.value = m.price ? Math.round((m.pts / (m.price / 10)) * 100) / 100 : 0;
        m.eo = (eot && eot.eo[el]) || 0;
        return m;
      });
      var capList = ownedList.filter(function (x) { return x.caps > 0; });
      // A differential: in fewer than one in ten squads in this league.
      var diffs = ownedList.filter(function (x) { return x.ownedPct < 10 && x.pts > 0; });
      var priced = ownedList.filter(function (x) { return x.price > 0 && x.pts > 0; });
      // The eleven most-owned players, as a notional league template side.
      var byPos = { 1: [], 2: [], 3: [], 4: [] };
      ownedList.forEach(function (x) { if (byPos[x.type]) byPos[x.type].push(x); });
      [1, 2, 3, 4].forEach(function (t) {
        byPos[t].sort(function (a, b) { return b.owners - a.owners; });
      });
      var SHAPE = { 1: 1, 2: 4, 3: 4, 4: 2 }, POSNAME = { 1: "GK", 2: "DEF", 3: "MID", 4: "FWD" };
      var templateXi = [1, 2, 3, 4].map(function (t) {
        return {
          pos: POSNAME[t],
          players: byPos[t].slice(0, SHAPE[t]).map(function (x) {
            // Shaped like a squad player so the pitch can draw it; the card
            // shows ownership rather than effective ownership here.
            return { el: x.el, name: x.name, team: x.team, type: x.type, pos: POSNAME[t],
                     pts: x.pts, price: x.price, eo: x.ownedPct,
                     cap: false, vice: false, mult: 1, benched: false };
          })
        };
      });

      // What the league moved in and out since last gameweek. Comparing
      // squads means chip weeks (wildcard, free hit) show up as churn too,
      // which is what actually changed hands.
      var movedIn = null, movedOut = null, churn = 0;
      var prevPk = picksAt(ds, gw - 1);
      if (prevPk) {
        var inC = {}, outC = {};
        Object.keys(pk).forEach(function (mid) {
          var pv = prevPk[mid];
          if (!pv) return;
          var now = {}, before = {};
          (pk[mid].p || []).forEach(function (t) { now[t[0]] = 1; });
          (pv.p || []).forEach(function (t) { before[t[0]] = 1; });
          Object.keys(now).forEach(function (el) {
            if (!before[el]) { inC[el] = (inC[el] || 0) + 1; churn++; }
          });
          Object.keys(before).forEach(function (el) {
            if (!now[el]) outC[el] = (outC[el] || 0) + 1;
          });
        });
        function churnList(map) {
          return Object.keys(map).map(function (el) {
            var m2 = meta(el);
            m2.count = map[el];
            m2.pts = lp[el] || 0;
            return m2;
          }).sort(function (a, b) { return b.count - a.count; }).slice(0, 5);
        }
        movedIn = churnList(inC);
        movedOut = churnList(outC);
      }

      squads = {
        managers: n, chips: chips,
        movedIn: movedIn, movedOut: movedOut, churn: churn,
        mostVice: ownedList.slice().filter(function (x) { return x.vices > 0; })
          .sort(function (a, b) { return b.vices - a.vices; }).slice(0, 5),
        templateXi: templateXi,
        distinctCaptains: capList.length,
        ownershipLeaders: ownedList.slice().sort(function (a, b) { return b.eo - a.eo; }).slice(0, 5),
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

    /* ---- the gameweek's best player, whoever owns him ---- */
    var potw = null;
    if (lp && Object.keys(lp).length) {
      var bestEl = null, bestPts = -1;
      Object.keys(lp).forEach(function (el) {
        if (lp[el] > bestPts) { bestPts = lp[el]; bestEl = el; }
      });
      if (bestEl !== null && bestPts > 0) {
        potw = meta(bestEl);
        potw.pts = bestPts;
        // how much of this league had him
        if (squads) {
          var mine = squads.mostOwned.concat(squads.topScorers, squads.differentials)
            .filter(function (x) { return +x.el === +bestEl; })[0];
          potw.ownedPct = mine ? mine.ownedPct : null;
        }
      }
    }

    /* ---- season so far ---- */
    var season = null;
    if (played.length) {
      var bestGw = null, worstGw = null, agg = [];
      ds.managers.forEach(function (m) {
        var h = ds.history[m.id] || {};
        var tot = 0, hits = 0, bench = 0, cnt = 0, hi = null, lo = null, tr = 0;
        var firstRank = null, lastRank = null;
        played.forEach(function (g) {
          var r = h[g];
          if (!r || typeof r.p !== "number") return;
          tot += r.p; hits += r.h || 0; bench += r.b || 0; tr += r.tr || 0; cnt++;
          if (!hi || r.p > hi.p) hi = { gw: g, p: r.p };
          if (!lo || r.p < lo.p) lo = { gw: g, p: r.p };
          if (r.r) { if (firstRank === null) firstRank = r.r; lastRank = r.r; }
          if (!bestGw || r.p > bestGw.p) bestGw = { id: m.id, name: nm(mm, m.id), gw: g, p: r.p };
          if (!worstGw || r.p < worstGw.p) worstGw = { id: m.id, name: nm(mm, m.id), gw: g, p: r.p };
        });
        if (!cnt) return;
        agg.push({ id: m.id, name: nm(mm, m.id), total: tot, hits: hits, bench: bench,
                   transfers: tr, gws: cnt,
                   avg: Math.round((tot / cnt) * 10) / 10,
                   best: hi ? hi.p : 0, worst: lo ? lo.p : 0,
                   spread: (hi && lo) ? (hi.p - lo.p) : 0,
                   climb: (firstRank && lastRank) ? (firstRank - lastRank) : 0 });
      });
      if (agg.length) {
        // Consistency only means something once there are a few gameweeks.
        var steady = null;
        if (played.length >= 3) {
          steady = agg.slice().sort(function (a, b) { return a.spread - b.spread; })[0];
        }
        var chipsPlayed = 0;
        C.squadGws(ds).forEach(function (g) {
          var pkg = picksAt(ds, g);
          if (pkg) Object.keys(pkg).forEach(function (k) { if (pkg[k].c) chipsPlayed++; });
        });
        season = {
          gws: played.length, bestGw: bestGw, worstGw: worstGw,
          mostHits: best(agg, "hits"), mostBench: best(agg, "bench"),
          cleanest: agg.filter(function (a) { return a.hits === 0; }).length,
          bestAvg: best(agg, "avg"),
          mostTransfers: best(agg, "transfers"),
          transfersTotal: agg.reduce(function (t, a) { return t + a.transfers; }, 0),
          benchTotal: agg.reduce(function (t, a) { return t + a.bench; }, 0),
          hitsTotal: agg.reduce(function (t, a) { return t + a.hits; }, 0),
          steadiest: steady, chipsPlayed: chipsPlayed,
          biggestClimb: best(agg, "climb")
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
          if (s.rank && (bestRank === null || s.rank < bestRank.rank)) bestRank = { rank: s.rank, season: s.season, total: s.total };
          if (typeof s.total === "number" && (bestPts === null || s.total > bestPts.total)) bestPts = { total: s.total, season: s.season, rank: s.rank };
        });
        var career = 0, scored = 0;
        list.forEach(function (s2) {
          if (typeof s2.total === "number") { career += s2.total; scored++; }
        });
        pr.push({ id: +id, name: nm(mm, +id), seasons: list.length,
                  bestRank: bestRank, bestPts: bestPts, career: career,
                  avg: scored ? Math.round(career / scored) : 0 });
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
          veterans: pr.slice().sort(function (a, b) { return b.seasons - a.seasons; }).slice(0, 5),
          topCareer: pr.slice().sort(function (a, b) { return b.career - a.career; }).slice(0, 5),
          topAvg: pr.filter(function (x) { return x.seasons >= 2; })
                    .sort(function (a, b) { return b.avg - a.avg; }).slice(0, 5),
          topTen: ranked.filter(function (x) { return x.bestRank.rank <= 10000; }).length
        };
      }
    }

    var gwEv = (ds.bootstrap && ds.bootstrap.events || []).filter(function (e) { return +e.id === +gw; })[0];
    return { gw: gw, gwName: gwEv ? gwEv.name : ("GW " + gw),
             live: gwEv ? !!(gwEv.is_current && !(gwEv.finished && gwEv.data_checked)) : false,
             gwStats: gwStats, value: value, squads: squads, season: season,
             past: past, potw: potw };
  };

  /* ---- deadline, winnings, the cut line, and form ----------------------- */

  // The next gameweek deadline still in the future.
  C.nextDeadline = function (ds, now) {
    if (!ds || !ds.bootstrap) return null;
    var t = (now === undefined ? Date.now() : now);
    var soon = null;
    ds.bootstrap.events.forEach(function (e) {
      if (!e.deadline_time) return;
      var when = Date.parse(e.deadline_time);
      if (when > t && (!soon || when < soon.when)) soon = { gw: e.id, name: e.name, when: when };
    });
    if (!soon) return null;
    soon.msLeft = soon.when - t;
    return soon;
  };

  // What a manager has actually won, kept separate from what they are on
  // course for. A league plays for real money — showing an unsettled standing
  // as winnings would be plainly wrong.
  C.winnings = function (ds, id) {
    if (!ds || !id) return null;
    id = +id;
    var items = [], settledTotal = 0, onTrackTotal = 0;
    function add(comp, label, amount, settled) {
      if (!amount) return;
      items.push({ comp: comp, label: label, amount: amount, settled: !!settled });
      if (settled) settledTotal += amount; else onTrackTotal += amount;
    }

    // Classic only pays out at the end of the season.
    var finished = C.finishedGws(ds);
    var seasonDone = finished.length >= (cfg().totalGameweeks || 38);
    C.classic(ds).forEach(function (r) {
      if (+r.id === id && r.prize) add("Classic", "#" + r.computedRank + " overall", r.prize, seasonDone);
    });

    // A month pays once every one of its gameweeks is done.
    C.monthly(ds).forEach(function (m) {
      var row = m.rows.filter(function (r) { return +r.id === id; })[0];
      if (row && row.prize) add("Monthly", (m.label || m.name) + " · #" + row.pos, row.prize, m.complete);
    });

    // A pyramid mini-season pays once its gameweeks are done.
    var fset = {}; finished.forEach(function (g) { fset[g] = true; });
    C.pyramid(ds).seasons.forEach(function (se) {
      var done = (se.gws || []).length > 0 && se.gws.every(function (g) { return fset[g]; });
      se.divisions.forEach(function (dv) {
        var row = dv.rows.filter(function (r) { return +r.id === id; })[0];
        if (row && row.prize) add("Pyramid", se.name + " · " + dv.name + " · #" + row.pos, row.prize, done);
      });
    });

    // Last Manager Standing pays when a champion exists.
    var lms = C.lms(ds);
    if (lms.champion && +lms.champion.id === id) {
      add("Last Manager", "Champion", (cfg().lms.prizes || {}).champion, true);
    }

    return { items: items, settled: settledTotal, onTrack: onTrackTotal,
             total: settledTotal + onTrackTotal };
  };

  // Where a manager sits against the paid places in the Classic league.
  C.prizeGap = function (ds, id) {
    if (!ds || !id) return null;
    id = +id;
    var rows = C.classic(ds);
    var me = rows.filter(function (r) { return +r.id === id; })[0];
    if (!me) return null;
    // the lowest rank that still earns something
    var lastPaid = 0;
    for (var r = rows.length; r >= 1; r--) { if (C.classicPrize(r)) { lastPaid = r; break; } }
    if (!lastPaid) return null;
    if (me.computedRank <= lastPaid) {
      // how much cushion above the cut
      var cutRow = rows[lastPaid - 1];
      return { inMoney: true, rank: me.computedRank, prize: me.prize, lastPaid: lastPaid,
               cushion: cutRow ? (me.total - cutRow.total) : null };
    }
    var target = rows[lastPaid - 1];
    return { inMoney: false, rank: me.computedRank, lastPaid: lastPaid,
             behind: target ? (target.total - me.total) : null,
             prizeThere: C.classicPrize(lastPaid) };
  };

  // Recent gameweek scores, oldest first — the shape of someone's season.
  C.form = function (ds, id, count) {
    if (!ds || !id) return [];
    id = +id;
    var played = C.finishedGws(ds);
    var cur = C.currentGw(ds);
    if (cur && played.indexOf(cur) === -1) played = played.concat([cur]);
    var h = ds.history[id] || {};
    var out = [];
    played.forEach(function (g) {
      var r = h[g];
      if (r && typeof r.p === "number") out.push({ gw: g, p: r.p });
    });
    return count ? out.slice(-count) : out;
  };

  // Where a manager stands against the money in every competition at once —
  // in it and by how much, or out of it and by how far.
  C.prizeStatus = function (ds, id) {
    if (!ds || !id) return [];
    id = +id;
    var conf = cfg(), out = [];

    function entry(comp, where, pos, prize, settled, state, gap, gapLabel) {
      out.push({ comp: comp, where: where, pos: pos, prize: prize || 0, settled: !!settled,
                 state: state, gap: gap, gapLabel: gapLabel });
    }
    // distance to a paid place inside an ordered table
    function against(rows, myPos, paidTo, valueOf) {
      var cut = rows[paidTo - 1];
      if (!cut) return null;
      var mine = rows[myPos - 1];
      return (myPos <= paidTo) ? (valueOf(mine) - valueOf(cut)) : (valueOf(cut) - valueOf(mine));
    }

    /* Classic — paid down to the last funded rank */
    var cl = C.classic(ds);
    var mine = cl.filter(function (r) { return +r.id === id; })[0];
    if (mine) {
      var lastPaid = 0;
      for (var r = cl.length; r >= 1; r--) { if (C.classicPrize(r)) { lastPaid = r; break; } }
      var inMoney = mine.computedRank <= lastPaid;
      var d = lastPaid ? against(cl, mine.computedRank, lastPaid, function (x) { return x.total; }) : null;
      entry("Classic", "overall", mine.computedRank, mine.prize, false,
        inMoney ? "in" : "out", d,
        inMoney ? "pts clear of " + ordinalOf(lastPaid) : "pts off " + ordinalOf(lastPaid));
    }

    /* Monthly — the month currently being played */
    var months = C.monthly(ds).filter(function (m) { return m.played > 0; });
    var M = months[months.length - 1];
    if (M) {
      var row = M.rows.filter(function (x) { return +x.id === id; })[0];
      if (row) {
        var paid = Object.keys(M.prizes).length;
        var inM = row.pos <= paid;
        entry("Monthly", M.label || M.name, row.pos, row.prize, M.complete,
          inM ? "in" : "out",
          against(M.rows, row.pos, paid, function (x) { return x.score; }),
          inM ? "pts clear of " + ordinalOf(paid) : "pts off " + ordinalOf(paid));
      }
    }

    /* Last Manager Standing — being alive is the whole contest */
    var lms = C.lms(ds);
    var elimGw = lms.eliminatedAt[id];
    if (elimGw) {
      entry("Last Manager", "eliminated GW" + elimGw, null, 0, true, "out", null, "");
    } else if (lms.survivors.some(function (s) { return +s.id === id; })) {
      var champ = lms.champion && +lms.champion.id === id;
      entry("Last Manager", lms.survivorsCount + " still standing", null,
        champ ? (conf.lms.prizes || {}).champion : 0, !!champ,
        champ ? "in" : "alive", null, "");
    }

    /* Pyramid — the mini-season being played, inside their division */
    var pyr = C.pyramid(ds).seasons.filter(function (se) { return se.played > 0; });
    var S2 = pyr[pyr.length - 1];
    if (S2) {
      S2.divisions.forEach(function (dv) {
        var prow = dv.rows.filter(function (x) { return +x.id === id; })[0];
        if (!prow) return;
        var paidP = Object.keys(dv.prizes).length;
        var inP = prow.pos <= paidP;
        entry("Pyramid", dv.name + " · " + S2.name, prow.pos, prow.prize, S2.complete,
          inP ? "in" : "out",
          against(dv.rows, prow.pos, paidP, function (x) { return x.score; }),
          inP ? "pts clear of " + ordinalOf(paidP) : "pts off " + ordinalOf(paidP));
      });
    }

    /* UCL — group stage decides which knockout you land in */
    var q = conf.h2h.qualify || { uclPerGroup: 2, uelPerGroup: 2 };
    var ucl = q.uclPerGroup, uel = ucl + (q.uelPerGroup || 0);
    C.h2h(ds).groups.forEach(function (g) {
      var t = g.table.filter(function (x) { return +x.id === id; })[0];
      if (!t) return;
      var state = t.pos <= ucl ? "in" : (t.pos <= uel ? "alive" : "out");
      var target = t.pos <= ucl ? ucl : uel;
      entry("UCL", g.name + (t.dest ? " · " + t.dest : ""), t.pos, 0, false, state,
        against(g.table, t.pos, target, function (x) { return x.pts; }),
        (t.pos <= target ? "pts clear of " : "pts off ") + ordinalOf(target));
    });

    return out;
  };
  function ordinalOf(n) {
    var s = ["th", "st", "nd", "rd"], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  // The knockout path for either competition, seeded from the group tables.
  // Until the group stage is over and a draw is made this is a projection —
  // callers must say so rather than presenting it as the real draw.
  C.knockout = function (ds, comp) {
    if (!ds) return null;
    comp = comp === "uel" ? "uel" : "ucl";
    var conf = cfg(), q = conf.h2h.qualify || { uclPerGroup: 2, uelPerGroup: 2 };
    var h = C.h2h(ds);
    var groups = h.groups || [];
    if (!groups.length) return null;

    // who goes where: the top slice to the UCL, the next slice to the UEL
    var from = comp === "ucl" ? 0 : q.uclPerGroup;
    var take = comp === "ucl" ? q.uclPerGroup : (q.uelPerGroup || 0);
    if (!take) return null;

    var seeded = groups.map(function (g) {
      return {
        group: g.name,
        slots: g.table.slice(from, from + take).map(function (t, i) {
          return { id: t.id, name: t.name, player: t.player, place: from + i + 1, group: g.name };
        })
      };
    });

    // Adjacent groups cross-pair: each group's winner meets the other's
    // runner-up, which is transparent and repeatable without a real draw.
    var ties = [], n = 1;
    for (var i = 0; i < seeded.length; i += 2) {
      var a = seeded[i], b = seeded[i + 1] || seeded[i];
      for (var k = 0; k < take; k++) {
        var home = a.slots[k] || null;
        var away = b.slots[take - 1 - k] || null;
        if (a === b && home && away && home.id === away.id) away = null;
        ties.push({ n: n++, home: home, away: away });
      }
    }

    var rounds = (h.schedule || []).map(function (r, ri) {
      return { key: r.key, name: r.name, gws: r.gws, legs: r.legs, index: ri, ties: [] };
    });
    if (!rounds.length) return null;
    rounds[0].ties = ties;
    // later rounds are placeholders until the round before them is decided
    var count = ties.length;
    for (var r2 = 1; r2 < rounds.length; r2++) {
      count = Math.ceil(count / 2);
      var prev = rounds[r2 - 1];
      for (var t = 0; t < count; t++) {
        rounds[r2].ties.push({
          n: t + 1,
          fromA: prev.ties[t * 2] ? prev.ties[t * 2].n : null,
          fromB: prev.ties[t * 2 + 1] ? prev.ties[t * 2 + 1].n : null,
          prevRound: prev.name
        });
      }
    }

    var finished = C.finishedGws(ds);
    var lastGroupGw = (conf.h2h.groupStageGws || []).slice(-1)[0] || 0;
    return {
      comp: comp,
      label: comp === "ucl" ? "UCL" : "UEL",
      rounds: rounds,
      qualified: ties.length * 2,
      // the draw only means anything once the groups are settled
      provisional: !(lastGroupGw && finished.indexOf(lastGroupGw) !== -1),
      startsGw: rounds[0].gws ? rounds[0].gws[0] : null,
      prizes: (conf.h2h.prizes || {})[comp] || null
    };
  };

  /* ---- player prices ---------------------------------------------------- */
  // How much of our own league owns each player. Counted the way FPL counts
  // its own ownership — squad membership, bench included — rather than the
  // effective ownership the squad view shows, which weights by multiplier.
  var _own = { key: "", val: null };
  C.leagueOwnership = function (ds, gw) {
    if (!ds) return null;
    gw = gw ? +gw : +ds.pitchGw;
    var key = (ds.updatedAt || "") + "|" + gw;
    if (_own.key === key) return _own.val;
    var pk = picksAt(ds, gw);
    if (!pk) return null;
    var ids = Object.keys(pk), n = ids.length;
    if (!n) return null;
    var count = {};
    ids.forEach(function (mid) {
      (pk[mid].p || []).forEach(function (t) { count[t[0]] = (count[t[0]] || 0) + 1; });
    });
    var pct = {};
    Object.keys(count).forEach(function (el) {
      pct[el] = Math.round((count[el] / n) * 1000) / 10;
    });
    var out = { pct: pct, count: count, managers: n };
    _own = { key: key, val: out };
    return out;
  };

  var PPOS = { 1: "GK", 2: "DEF", 3: "MID", 4: "FWD" };

  // Every player, with what the game says about his price and what our own
  // record says about the flow behind it.
  // Price and ownership have been in every publish since the squad views
  // needed them, so this reads the player table and treats the price record as
  // an enrichment — the list works from the first load, and gains its change
  // and flow columns once the updater has been keeping them.
  C.priceTable = function (ds) {
    var els = (ds && ds.elements) || null;
    if (!els) return null;
    var pr = (ds && ds.prices) || {};
    var has = !!pr.now;
    var own = C.leagueOwnership(ds);
    // the most recent recorded change per player, so a move that has already
    // happened is shown as fact rather than as pressure
    var last = {};
    ((ds && ds.priceLog) || []).forEach(function (r) { last[r[0]] = r; });
    return Object.keys(els).map(function (id) {
      var meta = els[id] || ["?", 0, "", 0, 0];
      var owned = (pr.owned && pr.owned[id] != null) ? pr.owned[id] : (meta[4] || 0);
      var net = (pr.netSince && pr.netSince[id]) || 0;
      return {
        id: +id, name: meta[0], type: meta[1], pos: PPOS[meta[1]] || "", team: meta[2],
        price: ((has && pr.now[id] != null) ? pr.now[id] : (meta[3] || 0)) / 10,
        gw: (pr.changeEvent && pr.changeEvent[id] || 0) / 10,
        season: (pr.changeStart && pr.changeStart[id] || 0) / 10,
        tracked: has,
        owned: owned,
        goOwned: own ? (own.pct[id] || 0) : null,
        moved: last[id] ? { up: last[id][2] > last[id][1], at: last[id][3] } : null,
        owners: own ? (own.count[id] || 0) : null,
        net: net,
        // Pressure relative to how many people own him. The threshold the game
        // uses is not published, so this is not a percentage of anything — it
        // orders players by how hard they are being bought or sold, which is
        // the part that can be said without inventing a constant.
        pressure: owned > 0 ? net / owned : 0
      };
    });
  };

  // Changes we have actually recorded, newest first. FPL publishes no history,
  // so this only reaches back to the day the tracker started keeping one.
  C.priceChanges = function (ds, limit) {
    var log = (ds && ds.priceLog) || [];
    var els = (ds && ds.elements) || {};
    var out = log.slice().reverse().map(function (r) {
      var meta = els[r[0]] || ["?", 0, "", 0, 0];
      return { id: r[0], name: meta[0], pos: PPOS[meta[1]] || "", team: meta[2],
               from: r[1] / 10, to: r[2] / 10, up: r[2] > r[1], at: r[3] };
    });
    return limit ? out.slice(0, limit) : out;
  };

  // When our record began, so the view can say how far back it goes.
  C.priceLogFrom = function (ds) {
    var log = (ds && ds.priceLog) || [];
    return log.length ? log[0][3] : null;
  };

  // Who is under the most pressure each way. Ordered, not timed: the ordering
  // holds without knowing the game's threshold, the night it lands does not.
  C.priceWatch = function (ds, n) {
    var rows = C.priceTable(ds);
    if (!rows) return null;
    var live = rows.filter(function (r) { return r.owned > 0 && r.net !== 0; });
    var rising = live.filter(function (r) { return r.net > 0; })
                     .sort(function (a, b) { return b.pressure - a.pressure; }).slice(0, n || 10);
    var falling = live.filter(function (r) { return r.net < 0; })
                      .sort(function (a, b) { return a.pressure - b.pressure; }).slice(0, n || 10);
    return { rising: rising, falling: falling, tracked: live.length, at: ds.prices && ds.prices.at };
  };

  window.GO_COMPUTE = C;
})();
