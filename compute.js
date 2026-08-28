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
  // While matches are being played, FPL's own manager total lags behind the
  // player data and leaves bonus out until each fixture finalises. Every live
  // FPL tool works the same way round: add up the squad yourself. So do we —
  // the number here is then the one people are seeing elsewhere during a match,
  // and there is no question of adding our provisional bonus on top of a total
  // that may already carry it.
  //
  // A settled gameweek keeps FPL's own figure. It is authoritative, and it
  // carries the real bonus and the automatic substitutions we cannot infer.
  function liveSquadTotal(ds, entryId, gw, benchInstead) {
    if (!ds || C.liveGwId(ds) !== +gw) return null;
    var squad = ds.picks && ds.picks[gw] && ds.picks[gw][entryId];
    var picks = squad && squad.p;
    if (!picks || !picks.length) return null;
    var lp = liveAt(ds, gw), pb = bonusAt(ds, gw);
    if (!lp || !Object.keys(lp).length) return null;
    var total = 0;
    picks.forEach(function (pk) {
      var mult = pk[1] || 0;
      var onBench = mult === 0;
      if (benchInstead !== onBench) return;
      var base = (lp[pk[0]] || 0) + (pb[pk[0]] || 0);
      total += benchInstead ? base : base * mult;
    });
    return total;
  }

  function gwScore(ds, entryId, gw) {
    var h = ds.history[entryId];
    if (!h || !h[gw]) return null;
    var row = h[gw];
    var live = liveSquadTotal(ds, entryId, gw, false);
    // hits are ours to subtract when the total is ours to add up
    if (live !== null) return live - (row.h || 0);
    if (typeof row.p !== "number") return null;
    return hitsAlreadyOff(ds) ? row.p : row.p - (row.h || 0);
  }
  C.gwScore = gwScore;
  function gwBench(ds, entryId, gw) {
    var h = ds.history[entryId];
    if (!h || !h[gw]) return 0;
    var live = liveSquadTotal(ds, entryId, gw, true);
    if (live !== null) return live;
    return h[gw].b || 0;
  }
  C.gwBench = gwBench;
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
  // The classic table is the one place that reads FPL's league standings rather
  // than adding the squad up, and those standings lag through a match and leave
  // the bonus out. Every other competition here already goes through gwScore,
  // so during a live gameweek this brings the standings into line with them.
  // Idempotent and memoised: every view must agree on the same number.
  function liveAdjust(ds) {
    if (!ds || ds._liveAdj) return;
    try { Object.defineProperty(ds, "_liveAdj", { value: true, enumerable: false }); } catch (e) { return; }
    var gw = C.liveGwId(ds);
    if (!gw) return;
    (ds.managers || []).forEach(function (m) {
      var live = gwScore(ds, m.id, gw);
      if (live == null) return;
      var hist = ds.history && ds.history[m.id];
      var prev = (hist && hist[gw - 1] && typeof hist[gw - 1].t === "number")
        ? hist[gw - 1].t
        // no prior row to build on: take FPL's own total less the event score it
        // is carrying, which is the same arithmetic from the other end
        : (typeof m.total === "number" && typeof m.eventTotal === "number"
            ? m.total - m.eventTotal : null);
      if (prev == null) return;
      m.eventTotal = live;
      m.total = prev + live;
    });
  }

  C.classic = function (ds) {
    liveAdjust(ds);
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

      // Rule 7: a tie in the month is settled by the Last Manager tie-breakers,
      // over the gameweeks that belong to the month. Best first here, so the
      // arguments go the other way round from the elimination sort.
      rows.sort(function (a, b) {
        return (b.score - a.score) || (b.bench - a.bench) ||
               lmsTieBreak(ds, b.id, a.id, playedGws);
      });
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

    var carryOver = 0;   // places a tie stopped us filling, owed to the next GW
    finished.forEach(function (gw) {
      var sog = Object.keys(alive).length;
      // Places the last gameweek could not fill because a tie straddled its cut
      // are owed here on top of this week's own. But a Last Manager Standing
      // week can never take the last manager standing: whatever is owed, one
      // has to be left, and the competition ends when one is.
      var want = (elimGrid[gw] || 0) + carryOver;
      var need = Math.max(0, Math.min(want, sog - 1));

      // Score every survivor this GW.
      var contenders = Object.keys(alive).map(function (id) {
        id = +id;
        return { id: id, score: gwScore(ds, id, gw), bench: gwBench(ds, id, gw) };
      });
      // A survivor with no score for a finished GW counts as 0 (didn't play).
      contenders.forEach(function (c) { if (c.score === null) c.score = 0; });

      var eliminatedIds, unresolved = null;
      if (manualElim[gw]) {
        eliminatedIds = manualElim[gw].filter(function (id) { return alive[id]; });
      } else {
        // Worst first, since this decides who goes out. The league's order:
        // score, then bench points, then goals, then clean sheets, then assists
        // across the playing XI — more of any of them keeps you up.
        var order = function (a, b) {
          return (a.score - b.score) || (a.bench - b.bench) ||
                 lmsTieBreak(ds, a.id, b.id, [gw]);
        };
        contenders.sort(order);
        var forced = carriedTies[gw] || [];

        // Managers the rules cannot separate are one block. If the cut falls
        // inside a block, nobody in it goes: "tied managers carry forward to
        // next GW and the tie is broken there in addition to the normal
        // eliminations for that week". So the places not filled this week are
        // added to next week's, rather than settled by list position.
        var blocks = [];
        contenders.forEach(function (c) {
          var last = blocks[blocks.length - 1];
          if (last && order(last[0], c) === 0 && order(c, last[0]) === 0) last.push(c);
          else blocks.push([c]);
        });

        var pick = [];
        for (var bi = 0; bi < blocks.length && pick.length < need; bi++) {
          var block = blocks[bi].filter(function (c) { return forced.indexOf(c.id) === -1; });
          if (!block.length) continue;
          if (pick.length + block.length <= need) {
            block.forEach(function (c) { pick.push(c.id); });
          } else {
            unresolved = { gw: gw, places: need - pick.length,
                           managers: block.map(function (c) {
                             return { id: c.id, name: nm(mm, c.id), score: c.score, bench: c.bench };
                           }) };
            break;
          }
        }
        eliminatedIds = pick;
      }

      eliminatedIds.forEach(function (id) { delete alive[id]; eliminatedAt[id] = gw; });
      var eog = Object.keys(alive).length;

      carryOver = Math.max(0, need - eliminatedIds.length);
      grid.push({ gw: gw, sog: sog, eliminated: eliminatedIds.length, expected: need, eog: eog,
                  carried: carryOver });

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
        gw: gw, need: need, sog: sog, eog: eog, table: table, unresolved: unresolved,
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

    // Base S1 rosters: admin override (ids) > id roster from config > named
    // roster from config (resolved to entry ids) > auto split by rank. The id
    // roster is the league's own sheet and survives FPL display-name changes,
    // which the name resolution does not.
    var rosters = {};
    var s1key = p.seasons[0].key;
    var named = idRosters(ds, p) || resolveNamedRosters(ds, p);
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

      var lastGw = playedGws.length ? playedGws[playedGws.length - 1] : null;
      var divResults = p.divisions.map(function (div) {
        var ids = (rosters[key] && rosters[key][div.key]) || [];
        var rows = ids.map(function (id) {
          return {
            id: id, name: nm(mm, id), player: pl(mm, id),
            score: sumGws(ds, id, playedGws) || 0,
            bench: benchSum(ds, id, playedGws),
            last: lastGw ? (gwScore(ds, id, lastGw) || 0) : 0,
            lastBench: lastGw ? gwBench(ds, id, lastGw) : 0
          };
        });
        // Rule 6: season score, then the last gameweek of the mini-season, then
        // the Last Manager tie-breakers for that gameweek — bench points there,
        // not across the whole season, then goals, clean sheets and assists.
        rows.sort(function (a, b) {
          return (b.score - a.score) || (b.last - a.last) ||
                 (b.lastBench - a.lastBench) ||
                 (lastGw ? lmsTieBreak(ds, b.id, a.id, [lastGw]) : 0);
        });
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

  // config.pyramid.seasonOneRosterIds, checked against the fetched roster so a
  // stale id degrades to absence rather than a phantom row. Returns null when
  // the config carries no ids, letting the name path below take over.
  function idRosters(ds, p) {
    var byDiv = p.seasonOneRosterIds;
    if (!byDiv) return null;
    var have = {}; ds.managers.forEach(function (m) { have[m.id] = true; });
    var out = {}, matched = 0;
    Object.keys(byDiv).forEach(function (div) {
      out[div] = (byDiv[div] || []).filter(function (id) { return have[id]; });
      matched += out[div].length;
    });
    return matched > 0 ? out : null;
  }

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

  // The Last Manager Standing tie-breakers after bench points: goals, then
  // clean sheets, then assists, counted across the playing XI.
  //
  // "Playing XI" is read as the eleven that actually played — which is what the
  // stored squad holds once a gameweek has settled, because it is re-read after
  // FPL applies its automatic substitutions. Under Bench Boost all fifteen
  // count, since all fifteen play. A captain's goal counts once: the multiplier
  // doubles points, and these are counts of things that happened, not points.
  function xiStats(ds, entryId, gws) {
    var out = { goals: 0, cs: 0, assists: 0 };
    (gws || []).forEach(function (gw) {
      var st = ds.liveStats && ds.liveStats[gw];
      var squad = ds.picks && ds.picks[gw] && ds.picks[gw][entryId];
      // The eleven who eventually played only exists once FPL has made its
      // substitutions and the updater has re-read the squad. Before that the
      // stored squad is the eleven picked, which is a different set and would
      // break the tie on the wrong players.
      if (!(ds.picksFinal && ds.picksFinal[gw])) return;
      if (!st || !squad || !squad.p) return;
      squad.p.forEach(function (pk) {
        if (!pk[1]) return;                       // benched, so not in the XI
        out.goals += (st.g && st.g[pk[0]]) || 0;
        out.cs += (st.c && st.c[pk[0]]) || 0;
        out.assists += (st.a && st.a[pk[0]]) || 0;
      });
    });
    return out;
  }
  C.xiStats = xiStats;

  // Order two tied managers by the league's rules, worst first — the caller is
  // deciding who goes out. Returns 0 when every tie-breaker is exhausted, which
  // the rules then carry forward to the next gameweek.
  function lmsTieBreak(ds, a, b, gws) {
    var sa = xiStats(ds, a, gws), sb = xiStats(ds, b, gws);
    return (sa.goals - sb.goals) || (sa.cs - sb.cs) || (sa.assists - sb.assists);
  }
  C.lmsTieBreak = lmsTieBreak;

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
  /* ---- who plays whom, gameweek by gameweek ---------------------------- */
  // The updater stores only the schedule. Scores come from the gameweek history
  // we already hold, which means a fixture in a live gameweek shows the same
  // number the tables do, provisional bonus included, without anything extra
  // being fetched.
  function fixtureRows(ds) {
    if (ds && ds._fx) return ds._fx;
    var src = (ds && ds.h2hFixtures) || {};
    var ids = cfg().h2hGroupLeagueIds || [];
    var out = [];
    ids.forEach(function (lid, gi) {
      var L = src[lid];
      if (!L || !L.fx || !L.ents) return;
      var gname = ((ds.h2h && ds.h2h[lid] && ds.h2h[lid].league) || {}).name ||
        ("Group " + String.fromCharCode(65 + gi));
      L.fx.forEach(function (f) {
        // -1 is FPL's phantom AVERAGE opponent in an odd-sized league; it is
        // carried through as entry 0, which is never a real entry id.
        var a = f[1] === -1 ? 0 : L.ents[f[1]];
        var b = f[2] === -1 ? 0 : L.ents[f[2]];
        if (a == null || b == null) return;
        out.push({ gw: f[0], group: gname, groupIndex: gi, a: a, b: b });
      });
    });
    if (ds) { try { Object.defineProperty(ds, "_fx", { value: out, enumerable: false }); } catch (e) {} }
    return out;
  }

  // Does the dataset carry a schedule at all? Everything below degrades to
  // nothing rather than guessing when it does not.
  C.hasFixtures = function (ds) { return fixtureRows(ds).length > 0; };

  C.fixtureGws = function (ds) {
    var seen = {};
    fixtureRows(ds).forEach(function (f) { seen[f.gw] = 1; });
    return Object.keys(seen).map(Number).sort(function (a, b) { return a - b; });
  };

  // What the AVERAGE opponent scores: the gameweek's FPL-wide average, which
  // is the figure FPL itself puts on that fixture. It is 0 or absent until the
  // gameweek is under way, and that reads as "not played yet" rather than 0-0.
  function gwAverage(ds, gw) {
    var ev = (ds && ds.bootstrap && ds.bootstrap.events) || [];
    for (var i = 0; i < ev.length; i++) {
      if (+ev[i].id === +gw) {
        if (ev[i].average > 0) return ev[i].average;
        // From the deadline the average exists and is simply 0 until a ball
        // is kicked — the same 0 every manager shows. Before the deadline
        // there is nothing to show.
        return C.liveGwId(ds) === +gw ? 0 : null;
      }
    }
    return null;
  }

  // A side can be a manager who is only in an h2h league — a second team that
  // never joined the classic league. Their name lives in the fetched group
  // standings rather than the roster, and they have no profile to open.
  function h2hOnlyNames(ds) {
    if (ds && ds._h2hNames) return ds._h2hNames;
    var out = {};
    var src = (ds && ds.h2h) || {};
    Object.keys(src).forEach(function (lid) {
      ((src[lid] || {}).results || []).forEach(function (r) {
        if (r.entry) out[r.entry] = { name: r.entry_name, player: r.player_name };
      });
    });
    if (ds) { try { Object.defineProperty(ds, "_h2hNames", { value: out, enumerable: false }); } catch (e) {} }
    return out;
  }

  function fxSide(ds, id, gw, mm) {
    if (!id) {
      return { id: 0, name: "AVERAGE", player: "AVERAGE",
               average: true, known: false, score: gwAverage(ds, gw) };
    }
    var known = !!mm[id];
    var alt = known ? null : h2hOnlyNames(ds)[id];
    return { id: id,
             name: known ? nm(mm, id) : ((alt && alt.name) || ("#" + id)),
             player: known ? pl(mm, id) : ((alt && alt.player) || ""),
             average: false, known: known, score: gwScore(ds, id, gw) };
  }

  function decorate(ds, f, mm) {
    var A = fxSide(ds, f.a, f.gw, mm), B = fxSide(ds, f.b, f.gw, mm);
    var sa = A.score, sb = B.score;
    var scored = sa != null && sb != null;
    // While the gameweek is being played the scores are live: shown, but not
    // a verdict. Marking a mid-gameweek leader as the winner — or a 0-0 at
    // the deadline as a draw — would state a result that does not exist yet.
    var live = scored && C.liveGwId(ds) === +f.gw;
    return {
      gw: f.gw, group: f.group, groupIndex: f.groupIndex,
      a: A, b: B,
      played: scored, live: live,
      result: (!scored || live) ? null : (sa > sb ? "a" : (sb > sa ? "b" : "draw"))
    };
  }

  // Every fixture in one gameweek, optionally narrowed to one group.
  C.fixtures = function (ds, gw, groupIndex) {
    var mm = managerMap(ds);
    return fixtureRows(ds)
      .filter(function (f) {
        return +f.gw === +gw && (groupIndex == null || f.groupIndex === +groupIndex);
      })
      .map(function (f) { return decorate(ds, f, mm); });
  };

  // One manager's whole head-to-head season: who they have played, who they
  // have left, and how each one went.
  C.h2hRecord = function (ds, entryId) {
    entryId = +entryId;
    var mm = managerMap(ds);
    var rows = fixtureRows(ds).filter(function (f) { return f.a === entryId || f.b === entryId; });
    if (!rows.length) return null;
    var w = 0, d = 0, l = 0, pf = 0, pa = 0;
    var out = rows.map(function (f) {
      var m = decorate(ds, f, mm);
      var mine = f.a === entryId ? m.a : m.b;
      var opp = f.a === entryId ? m.b : m.a;
      var res = null;
      // A live match shows its score but does not join the record until the
      // gameweek is done — the same rule FPL's own standings follow.
      if (m.played && !m.live) {
        res = mine.score > opp.score ? "W" : (mine.score < opp.score ? "L" : "D");
        if (res === "W") w++; else if (res === "L") l++; else d++;
        pf += mine.score; pa += opp.score;
      }
      return { gw: f.gw, group: f.group, me: mine, opp: opp,
               played: m.played, live: m.live, result: res };
    }).sort(function (x, y) { return x.gw - y.gw; });
    var h = cfg().h2h;
    // FPL keeps its own record for every manager, and that is what the group
    // table shows. Prefer it, so the strip on a profile can never drift from
    // the standings; the fixture-derived counts stand in only if the manager
    // is not in a group table at all.
    var off = null;
    ((C.h2h(ds) || {}).groups || []).forEach(function (g) {
      (g.table || []).forEach(function (t) {
        if (+t.id !== entryId) return;
        off = { w: t.w || 0, d: t.d || 0, l: t.l || 0, pts: t.pts || 0,
                pointsFor: t.gwPts || 0 };
        off.played = off.w + off.d + off.l;
      });
    });
    return { rows: out, official: !!off,
             w: off ? off.w : w, d: off ? off.d : d, l: off ? off.l : l,
             played: off ? off.played : w + d + l,
             pts: off ? off.pts : w * h.pointsWin + d * h.pointsDraw + l * h.pointsLoss,
             pointsFor: off ? off.pointsFor : pf, pointsAgainst: pa,
             group: out.length ? out[0].group : null };
  };

  C.knockout = function (ds, comp) {
    if (!ds) return null;
    comp = comp === "uel" ? "uel" : "ucl";
    var conf = cfg(), q = conf.h2h.qualify || { uclPerGroup: 2, uelPerGroup: 2 };
    var h = C.h2h(ds);
    var groups = h.groups || [];
    if (!groups.length) return null;

    // The draw is made when the group stage is over, not before. Pairing off a
    // table that is one gameweek old would show sixteen ties that have nothing
    // to do with who will actually meet.
    var done = {}; C.finishedGws(ds).forEach(function (x) { done[x] = true; });
    var gs = conf.h2h.groupStageGws || [];
    var left = gs.filter(function (x) { return !done[x]; });
    var drawn = gs.length > 0 && left.length === 0;

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
    if (drawn) rounds[0].ties = ties;
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

    return {
      comp: comp,
      label: comp === "ucl" ? "UCL" : "UEL",
      rounds: rounds,
      qualified: ties.length * 2,
      // Whether the draw has actually been made, and how much group stage is
      // left before it can be. The bracket shows its shape either way.
      drawn: drawn,
      provisional: !drawn,
      gwsLeft: left.length,
      groupEndsGw: gs.length ? gs[gs.length - 1] : null,
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
    var thr = C.priceThreshold(ds);
    // Ownership arrives as a percentage of everyone playing FPL; the threshold
    // behaves like a head count, so turn one into the other where we know how
    // many are playing. Older data has no such number and gets no progress.
    var playing = Number(pr.total) || 0;
    // the most recent recorded change per player, so a move that has already
    // happened is shown as fact rather than as pressure
    var last = {};
    ((ds && ds.priceLog) || []).forEach(function (r) { last[r[0]] = r; });
    return Object.keys(els).map(function (id) {
      var meta = els[id] || ["?", 0, "", 0, 0];
      var owned = (pr.owned && pr.owned[id] != null) ? pr.owned[id] : (meta[4] || 0);
      var net = (pr.netSince && pr.netSince[id]) || 0;
      var fplOwners = playing ? Math.round((owned / 100) * playing) : 0;
      // Whether the flow behind this player covers the whole run-up to his next
      // change, or only the part since we started watching him.
      var sure = !pr.exact || pr.exact[id] !== 0;
      return {
        id: +id, name: meta[0], full: meta[5] || "",
        type: meta[1], pos: PPOS[meta[1]] || "", team: meta[2],
        price: ((has && pr.now[id] != null) ? pr.now[id] : (meta[3] || 0)) / 10,
        owned: owned,
        goOwned: own ? (own.pct[id] || 0) : null,
        net: net,
        atLeast: !sure,
        // The flow against how many people hold him. This orders the table
        // whether or not the threshold is known, and is what progress is a
        // share of once it is.
        pressure: (has && fplOwners) ? (net / fplOwners) : null,
        // null, not zero, when there is nothing to work it out from: an empty
        // bar would claim he is going nowhere, which we would not know.
        progress: (function () {
          if (!has || !fplOwners) return null;
          var ratio = net / fplOwners;
          var at = ratio >= 0 ? thr.riseAt : thr.fallAt;
          return at ? (ratio / at) * 100 : null;
        })()
      };
    });
  };

  // How close a player is to his price moving.
  //
  // FPL does not publish the threshold, so there is nothing to look it up in.
  // What we can do is watch where it actually falls: every change the updater
  // records now carries the net transfers behind it and the number of people
  // who owned him at that moment, and the ratio of those two is one reading of
  // the threshold. The median of those readings is the best answer available,
  // and it is an answer measured from this season's real changes rather than a
  // constant someone once quoted.
  //
  // Until enough changes have been seen there is no threshold, and so no
  // percentage — a distance to a line whose position we are guessing is not a
  // distance. A guess was tried and thrown out: against the live table a 6%
  // threshold put a fifth of the league past the line, which would have said a
  // hundred players were changing that night when none of them were. Until it
  // is measured the table orders players by pressure and says that is what it
  // is doing.
  var ENOUGH = 6;

  function median(a) {
    if (!a.length) return null;
    var b = a.slice().sort(function (x, y) { return x - y; });
    var m = b.length >> 1;
    return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2;
  }

  C.priceThreshold = function (ds) {
    if (ds && ds._thr) return ds._thr;
    var up = [], down = [];
    ((ds && ds.priceLog) || []).forEach(function (r) {
      // entries logged before the updater kept the pressure carry only 4 fields
      if (!r || r.length < 6) return;
      var net = r[4], owners = r[5];
      if (!owners || !isFinite(net)) return;
      var ratio = net / owners;
      if (r[2] > r[1]) { if (ratio > 0) up.push(ratio); }
      else { if (ratio < 0) down.push(-ratio); }
    });
    var res = {
      rise: median(up), fall: median(down),
      risen: up.length, fell: down.length,
      // Both directions must be measured before a percentage means anything in
      // both: one side alone would leave half the table drawn against nothing
      // while the table claimed to know.
      measured: (up.length + down.length) >= ENOUGH && up.length > 0 && down.length > 0
    };
    res.riseAt = res.measured ? res.rise : null;
    res.fallAt = res.measured ? res.fall : null;
    if (ds) { try { Object.defineProperty(ds, "_thr", { value: res, enumerable: false }); } catch (e) {} }
    return res;
  };

    // Changes we have actually recorded, newest first. FPL publishes no history,



  window.GO_COMPUTE = C;
})();
