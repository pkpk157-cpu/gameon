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

  /* How many of a manager's players actually featured, counted by multiplier
     so a captain is worth two of the twelve. Recounted from the squad and the
     breakdown's minutes whenever both are held, rather than read off the
     history row: FPL substitutes a blank out when a gameweek finalises, and a
     figure written while the match was on counts the man who was replaced. A
     gameweek whose breakdown we no longer carry falls back to the stored row,
     which is the only answer left for it. */
  function playedCount(ds, entryId, gw) {
    var row = (ds.history[entryId] || {})[gw] || null;
    var stored = (row && row.pl != null)
      ? { played: row.pl, total: row.plt || 12 } : null;
    var squad = ds.picks && ds.picks[gw] && ds.picks[gw][entryId];
    var bd = (ds.breakdown || {})[gw];
    if (!squad || !squad.p || !bd) return stored || { played: null, total: 12 };
    var minutesOf = function (el) {
      var rows = bd[el] || [];
      for (var i = 0; i < rows.length; i++) if (rows[i][0] === "minutes") return rows[i][1] || 0;
      return 0;
    };
    var played = 0, total = 0;
    squad.p.forEach(function (pk) {
      if (pk[1] > 0) { total += pk[1]; if (minutesOf(pk[0]) > 0) played += pk[1]; }
    });
    if (!total) return stored || { played: null, total: 12 };
    return { played: played, total: total };
  }
  C.playedCount = playedCount;

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
  // A gameweek figure FPL reports on a league table, brought to the same
  // footing: its event_total is the points before the transfer cost, while
  // its season total has the cost off. Every number here is net of hits, so
  // the hit comes off this one too — from the manager's own history row for
  // that week, which is the only place FPL says what it was.
  function netEvent(ds, entryId, gw, ev) {
    if (typeof ev !== "number" || !gw) return ev;
    var row = ds.history && ds.history[entryId] && ds.history[entryId][gw];
    if (!row || hitsAlreadyOff(ds)) return ev;
    return ev - (row.h || 0);
  }
  C.netEvent = netEvent;
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
  // Gameweeks whose points stand: FPL has checked them, or every match's bonus
  // is in and the squads were re-read with the substitutions. FPL's own H2H
  // tables count a week from that moment, hours before it is checked, so a
  // result marked here is one FPL is already showing. A check can still move
  // a score, which is why what depends on a week being closed for good — a
  // month won, a group complete, an elimination, a badge — waits for the check.
  C.scoredGws = function (ds) {
    var have = {};
    C.finishedGws(ds).forEach(function (g) { have[g] = 1; });
    var fx = (ds && ds.gwFixtures) || {}, fin = (ds && ds.picksFinal) || {};
    Object.keys(fx).forEach(function (g) {
      var list = fx[g] || [];
      if (list.length && fin[g] && list.every(function (f) { return f[3]; })) have[g] = 1;
    });
    return Object.keys(have).map(Number).sort(function (a, b) { return a - b; });
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
  //
  // Between gameweeks the standings are authoritative, but their event_total
  // is the week's points before the transfer cost — the one figure FPL shows
  // gross. The season total already has the cost off, and so does every
  // other score in this app, so the gameweek column is brought to net too.
  function liveAdjust(ds) {
    if (!ds || ds._liveAdj) return;
    try { Object.defineProperty(ds, "_liveAdj", { value: true, enumerable: false }); } catch (e) { return; }
    var gw = C.liveGwId(ds);
    if (!gw) {
      var cur = C.currentGw(ds);
      if (!cur) return;
      (ds.managers || []).forEach(function (m) {
        m.eventTotal = netEvent(ds, m.id, cur, m.eventTotal);
      });
      return;
    }
    (ds.managers || []).forEach(function (m) {
      var live = gwScore(ds, m.id, gw);
      if (live == null) return;
      var hist = ds.history && ds.history[m.id];
      var prev = (hist && hist[gw - 1] && typeof hist[gw - 1].t === "number")
        ? hist[gw - 1].t
        // no prior row to build on: take FPL's own total less the net event
        // score it is carrying, which is the same arithmetic from the other end
        : (typeof m.total === "number" && typeof m.eventTotal === "number"
            ? m.total - netEvent(ds, m.id, gw, m.eventTotal) : null);
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

  /* ---- Voluntary leagues -------------------------------------------------
     Five side leagues played on the same team a manager already has. Each is a
     classic league of its own on FPL, so the entries and the totals are read
     straight from the game: nobody is matched by name, which is the only way
     to be sure that a Darayus Bathena and a Darayus Bhathena are one man, and
     the only way to include somebody who is in a side league but not in the
     main one.

     FPL settles the order and the ties; what it knows nothing about is the
     money, which is here. Managers level on points share the place and split
     what those places pay between them, as the classic league does. */
  C.voluntaryLeagues = function (ds) {
    var money = cfg().voluntaryPrizes || {};
    var order = cfg().voluntaryOrder || Object.keys(money);
    return order.filter(function (k) { return money[k]; }).map(function (k) {
      var live = ((ds && ds.voluntary) || {})[k];
      var paid = money[k].paid || null;
      var n = live
        ? (paid ? live.results.filter(function (r) { return paid.indexOf(r.id) !== -1; }).length
                : live.results.length)
        : money[k].entries;
      return { key: k, name: money[k].name, short: money[k].short,
               fee: money[k].fee, pot: money[k].pot, entries: n, loaded: !!live };
    });
  };

  C.voluntary = function (ds, key) {
    var money = (cfg().voluntaryPrizes || {})[key];
    if (!money) return null;
    var live = ((ds && ds.voluntary) || {})[key];
    if (!live || !live.results) {
      return { key: key, name: money.name, short: money.short, fee: money.fee,
               pot: money.pot, prizes: money.prizes, entries: money.entries,
               places: Object.keys(money.prizes).map(Number).sort(function (a, b) { return a - b; }),
               rows: [], paid: 0, loaded: false, at: null, expected: money.entries,
               awaiting: (money.awaiting || []).slice(), notPaid: [] };
    }
    // FPL's league is open to anyone with the code, and carries people the
    // prize sheet does not — its own creator among them, who sits in all five.
    // The sheet is what says who bought in, so the table is FPL's league
    // filtered to the entry ids the sheet resolved to.
    var paid = money.paid || null;
    var joined = paid
      ? live.results.filter(function (r) { return paid.indexOf(r.id) !== -1; })
      : live.results.slice();
    var notOnSheet = paid
      ? live.results.filter(function (r) { return paid.indexOf(r.id) === -1; })
                    .map(function (r) { return r.playerName; })
      : [];
    // FPL has already ordered the league and given joint ranks where managers
    // are level; its order is the one the game itself shows, so it is kept.
    // The gameweek column is FPL's event_total, the one figure it shows
    // before the transfer cost; net here, like every other score.
    var evGw = C.liveGwId(ds) || C.currentGw(ds);
    var rows = joined.slice().sort(function (a, b) {
      return (a.rank - b.rank) || (b.total - a.total);
    }).map(function (r) {
      return { id: r.id, name: r.playerName, entryName: r.entryName,
               total: r.total, eventTotal: netEvent(ds, r.id, evGw, r.eventTotal),
               fplRank: r.rank, lastRank: r.lastRank };
    });

    var prizeAt = function (place) { return (money.prizes && money.prizes[place]) || 0; };
    rows.forEach(function (r, i) {
      r.order = i + 1;
      r.computedRank = i + 1;
      r.prize = prizeAt(i + 1);
      r.tiedWith = 0;
    });
    // Level on points: one place between them, and the money those places pay
    // split evenly, whole rupees, the odd ones to the higher places.
    for (var i = 0; i < rows.length; ) {
      var j = i;
      while (j + 1 < rows.length && rows[j + 1].total === rows[i].total) j++;
      if (j > i) {
        var pot = 0, n = j - i + 1;
        for (var k = i; k <= j; k++) pot += prizeAt(k + 1);
        var base = Math.floor(pot / n), extra = pot - base * n;
        for (var k2 = i; k2 <= j; k2++) {
          rows[k2].computedRank = i + 1;
          rows[k2].prize = base + ((k2 - i) < extra ? 1 : 0);
          rows[k2].tiedWith = n;
        }
      }
      i = j + 1;
    }
    var paid = 0;
    rows.forEach(function (r) { paid += r.prize; });
    return {
      key: key, name: money.name, short: money.short, fee: money.fee,
      pot: money.pot, prizes: money.prizes, entries: rows.length,
      expected: money.entries, at: live.at || null, loaded: true,
      // on the sheet but not in the FPL league, so they cannot be scored
      awaiting: (money.awaiting || []).slice(),
      // in the FPL league but not on the sheet, so they are not playing for
      // the money and are left out of the table
      notPaid: notOnSheet,
      places: Object.keys(money.prizes).map(Number).sort(function (a, b) { return a - b; }),
      rows: rows, paid: paid
    };
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

      // Worst first, since this decides who goes out. The league's order:
      // score, then bench points, then goals, then clean sheets, then assists
      // across the playing XI — more of any of them keeps you up. The week's
      // table is shown in this same order, so what the page shows is the order
      // the eliminations were read off, not an approximation of it.
      var order = function (a, b) {
        return (a.score - b.score) || (a.bench - b.bench) ||
               lmsTieBreak(ds, a.id, b.id, [gw]);
      };
      contenders.sort(order);

      var eliminatedIds, unresolved = null;
      if (manualElim[gw]) {
        eliminatedIds = manualElim[gw].filter(function (id) { return alive[id]; });
      } else {
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
      // contenders is already in the order above; re-sorting it on score and
      // bench alone would drop the goals, clean sheets and assists that
      // separated the managers those two could not.
      var table = contenders.map(function (c) {
        var hh = (ds.history[c.id] && ds.history[c.id][gw]) ? ds.history[c.id][gw] : null;
        var pc = playedCount(ds, c.id, gw);
        return { id: c.id, name: nm(mm, c.id), player: pl(mm, c.id),
                 score: c.score, bench: c.bench, hit: hh ? hh.h : 0,
                 played: pc.played, playedTotal: pc.total,
                 eliminated: !!elimSet[c.id] };
      });

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
    // The podium: the last one standing, then the two who went out last —
    // read off the final week's table in the order the eliminations were
    // decided, so the runner-up is the best placed of them.
    var podium = null;
    if (survivors.length === 1) {
      podium = [{ id: survivors[0].id, name: survivors[0].name, gw: null }];
      for (var pi = perGw.length - 1; pi >= 0 && podium.length < 3; pi--) {
        var outs = perGw[pi].table.filter(function (r) { return r.eliminated; });
        for (var oi = outs.length - 1; oi >= 0 && podium.length < 3; oi--) {
          podium.push({ id: outs[oi].id, name: outs[oi].name, gw: perGw[pi].gw });
        }
      }
    }

    // Build the full published grid (all 38 GWs) with expected numbers, so the
    // elimination grid renders even before the season starts.
    var fullGrid = [];
    var running = ds.managers.length, owed = carryOver;
    for (var g = 1; g <= cfg().totalGameweeks; g++) {
      var actual = grid.find(function (x) { return x.gw === g; });
      if (actual) { fullGrid.push(actual); running = actual.eog; }
      else {
        // places a tie left open are owed to the next week that is played,
        // and no week takes the last manager standing
        var exp = Math.max(0, Math.min((elimGrid[g] || 0) + owed, running - 1));
        owed = 0;
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
      var need = Math.max(0, Math.min((elimGrid[liveGw] || 0) + carryOver, aliveIds.length - 1));
      var ltable = aliveIds.map(function (id) {
        var hh = (ds.history[id] && ds.history[id][liveGw]) ? ds.history[id][liveGw] : null;
        // The same live-aware scoring every other view uses — FPL's history
        // row lags during a live gameweek, and reading it raw left this table
        // on zeros while the rest of the app moved.
        var sc = gwScore(ds, id, liveGw);
        var pc = playedCount(ds, id, liveGw);
        return { id: id, name: nm(mm, id), player: pl(mm, id),
                 score: sc == null ? 0 : sc, bench: gwBench(ds, id, liveGw), hit: hh ? hh.h : 0,
                 played: pc.played, playedTotal: pc.total,
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
      podium: podium,
      // every gameweek checked and still more than one alive: a tie the
      // rules could not break at the very end, which is the league's to settle
      undecided: survivors.length > 1 && finished.length >= (cfg().totalGameweeks || 38),
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
        // A mini-season nobody has played yet awards nothing. Everyone sits
        // level on nothing, so the order is the roster's and means nothing —
        // and the man it happens to put first is not on his way to a prize.
        // The page already refuses to draw that table; the XP has to refuse it
        // too, or the winnings page pays out on a standing that does not exist.
        // Positions stay: the next season's divisions are derived from them,
        // provisionally, which is a different claim from money.
        rows.forEach(function (r, i) {
          r.pos = i + 1;
          r.prize = playedGws.length ? (div.prizes[i + 1] || 0) : 0;
        });
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
    // A week counts in the tables once its points stand; the stage is complete
    // only once FPL has checked every week of it.
    var scored = {}; C.scoredGws(ds).forEach(function (g) { scored[g] = true; });
    var groupGws = h.groupStageGws.filter(function (g) { return scored[g]; });

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
        // FPL names every one of these "UCL Group N (Game On R1)". The bracket
        // is the site's own bookkeeping and nobody in the league needs it; it
        // was widening the dropdown and wrapping the profile's UCL row to three
        // lines. Take it off here so every page reads the same.
        var gname = (d.league && d.league.name)
          ? d.league.name.replace(/\s*\(Game On[^)]*\)\s*$/i, "")
          : ("Group " + String.fromCharCode(65 + gi));
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

  /* The season in one card: the figures a manager asks about first. Points
     and position come from the classic table, so they are live when a
     gameweek is; the rest is read off the per-gameweek history. Anything the
     dataset lacks comes back null and the page leaves that tile out. */
  C.snapshot = function (ds, id) {
    id = +id;
    if (!ds || !ds.managers || !ds.managers.length) return null;
    var rows = C.classic(ds), me = null, idx = -1;
    rows.forEach(function (r, i) { if (+r.id === id) { me = r; idx = i; } });
    if (!me || typeof me.total !== "number") return null;
    var counted = rows.filter(function (r) { return typeof r.eventTotal === "number"; });
    var avg = counted.length
      ? Math.round(counted.reduce(function (s, r) { return s + r.eventTotal; }, 0) / counted.length) : null;
    var H = (ds.history && ds.history[id]) || null;
    var gws = H ? Object.keys(H).map(Number).filter(function (g) { return H[g] && typeof H[g].p === "number"; })
                    .sort(function (a, b) { return a - b; }) : [];
    var sum = function (k) { return gws.reduce(function (s, g) { return s + (+H[g][k] || 0); }, 0); };
    var last = gws.length ? H[gws[gws.length - 1]] : null, prev = gws.length > 1 ? H[gws[gws.length - 2]] : null;
    var lastWorth = gws.length ? C.squadWorth(ds, id, gws[gws.length - 1]) : null;
    var best = null, bestP = null;
    gws.forEach(function (g) {
      var sc = gwScore(ds, id, g);
      if (sc !== null && (best === null || sc > bestP)) { best = g; bestP = sc; }
    });
    // The nearest manager strictly above, so a tie reads as shared rather
    // than "0 off"; and the first strictly below, for how far a leader leads.
    var above = null, below = null;
    for (var i = idx - 1; i >= 0; i--) { if (rows[i].total > me.total) { above = rows[i]; break; } }
    for (var j = idx + 1; j < rows.length; j++) { if (rows[j].total < me.total) { below = rows[j]; break; } }
    var chips = C.managerChips(ds, id).filter(function (c) { return c.used; });
    var plays = chips.reduce(function (s, c) { return s + c.gws.length; }, 0);
    return {
      total: me.total,
      gwPoints: typeof me.eventTotal === "number" ? me.eventTotal : null,
      gw: C.currentGw(ds), leagueAvg: avg,
      rank: me.computedRank, tied: me.tiedWith > 1, move: me.move || 0,
      overall: last && typeof last.r === "number" ? last.r : null,
      overallMove: last && prev && typeof last.r === "number" && typeof prev.r === "number" ? prev.r - last.r : null,
      played: gws.length,
      hits: gws.length ? sum("h") : null, transfers: gws.length ? sum("tr") : null,
      bench: gws.length ? sum("b") : null,
      best: best === null ? null : { gw: best, points: bestP },
      leading: above === null,
      lead: above === null && below ? me.total - below.total : null,
      behindLeader: rows[0].total - me.total,
      above: above ? { rank: above.computedRank, gap: above.total - me.total } : null,
      chipPlays: plays, chipNames: chips.map(function (c) { return c.label; }).join(", "),
      value: lastWorth ? lastWorth.value : null,
      bank: lastWorth ? lastWorth.bank : null
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
  /* What a squad is worth in a gameweek: the fifteen players, with the bank
     apart. The newest squad is valued at today's prices, the figure its cards
     show and FPL's own Pick Team page gives. An older squad is valued as FPL
     recorded it when that gameweek was played: the history row's value less
     its bank, because FPL's value counts the bank in (every squad that left
     money unspent in Gameweek 1 still reads 100.0 there). Today's prices hung
     on last month's team would be a number nobody ever held. One rule, used by
     the profile, the stats and the pictures alike, so they cannot disagree. */
  C.squadWorth = function (ds, id, gw) {
    if (!ds) return null;
    var h = ((ds.history || {})[id] || {})[gw] || null;
    var bank = h && typeof h.bk === "number" ? h.bk : null;
    if (+gw === +ds.pitchGw) {
      var pk = picksAt(ds, gw), sq = pk && pk[id], els = ds.elements || {};
      if (sq && sq.p && sq.p.length) {
        var sum = 0, ok = true;
        sq.p.forEach(function (t) {
          var e = els[t[0]];
          if (e && typeof e[3] === "number") sum += e[3]; else ok = false;
        });
        if (ok) return { value: sum, bank: bank, now: true };
      }
    }
    if (h && typeof h.v === "number" && h.v > 0) return { value: h.v - (bank || 0), bank: bank, now: false };
    return null;
  };
  // The league's squads in one gameweek by that rule: the average squad and
  // bank, over the managers who have a figure. Kept, as every profile asks.
  var _worth = { key: null, val: null };
  C.leagueWorth = function (ds, gw) {
    if (!ds || !ds.managers) return null;
    var key = (ds.updatedAt || "") + "|" + gw + "|" + ds.pitchGw;
    if (_worth.key === key) return _worth.val;
    var vs = 0, bs = 0, n = 0;
    ds.managers.forEach(function (m) {
      var w = C.squadWorth(ds, m.id, gw);
      if (!w) return;
      vs += w.value; bs += w.bank || 0; n++;
    });
    var out = n ? { average: Math.round(vs / n), averageBank: Math.round(bs / n), count: n } : null;
    _worth = { key: key, val: out };
    return out;
  };
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

    var eoSum = 0, counted = 0;
    ids.forEach(function (mid) {
      var picks = pk[mid].p || [];
      var xi = 0, xiEo = 0;
      picks.forEach(function (t) {
        if (t[1] > 0) { xi++; xiEo += eo[t[0]] || 0; }
      });
      if (!xi) return;
      eoSum += xiEo / xi; counted++;
    });

    var out = {
      eo: eo, managers: n,
      leagueAvgEo: counted ? Math.round((eoSum / counted) * 10) / 10 : 0
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
  // One player's scoring lines for one gameweek, worded the way FPL words
  // them. Provisional bonus is appended while the gameweek is live and FPL
  // has not yet awarded the real thing.
  var BREAK_LABEL = {
    minutes: "Minutes Played", goals_scored: "Goals", assists: "Assists",
    clean_sheets: "Clean Sheets", goals_conceded: "Goals Conceded",
    own_goals: "Own Goals", penalties_saved: "Penalties Saved",
    penalties_missed: "Penalties Missed", yellow_cards: "Yellow Cards",
    red_cards: "Red Cards", saves: "Saves", bonus: "Bonus",
    defensive_contribution: "Defensive Contribution"
  };
  C.playerBreakdown = function (ds, el, gw) {
    var raw = ((ds && ds.breakdown || {})[gw] || {})[el];
    if (!raw || !raw.length) return null;
    var total = 0, hasBonus = false;
    var rows = raw.map(function (r) {
      total += r[2] || 0;
      if (r[0] === "bonus") hasBonus = true;
      var lbl = BREAK_LABEL[r[0]] ||
        (r[0].charAt(0).toUpperCase() + r[0].slice(1)).replace(/_/g, " ");
      return { label: lbl, value: r[1], points: r[2] || 0 };
    });
    var prov = 0;
    if (!hasBonus && C.liveGwId(ds) === +gw) {
      prov = (bonusAt(ds, gw) || {})[el] || 0;
      if (prov) { rows.push({ label: "Bonus (provisional)", value: "", points: prov }); total += prov; }
    }
    return { rows: rows, total: total, provisional: prov > 0 };
  };

  /* A player's season, gameweek by gameweek: what he scored, how long he was
     on the pitch, and who his club played. The breakdown reads this for its
     second tab, so the one gameweek in front of you always has the rest of the
     season behind it. */
  C.playerHistory = function (ds, el) {
    if (!ds || !ds.elements || !ds.elements[el]) return null;
    var club = ds.elements[el][2];
    var lp = ds.livePoints || {}, bd = ds.breakdown || {};
    var gws = Object.keys(lp).map(Number).filter(function (g) { return g > 0; })
      .sort(function (a, b) { return a - b; });
    if (!gws.length) return null;
    var live = C.liveGwId(ds);
    var rows = gws.map(function (g) {
      var lines = (bd[g] || {})[el] || null;
      var mins = 0, goals = 0, assists = 0, bonus = 0;
      if (lines) {
        lines.forEach(function (r) {
          if (r[0] === "minutes") mins += r[1] || 0;
          else if (r[0] === "goals_scored") goals += r[1] || 0;
          else if (r[0] === "assists") assists += r[1] || 0;
          else if (r[0] === "bonus") bonus += r[2] || 0;
        });
      }
      // Provisional bonus is part of what he is on right now, and the gameweek
      // tab counts it, so the season tab has to agree or the two disagree
      // about the same afternoon.
      var prov = (!bonus && live === g) ? ((bonusAt(ds, g) || {})[el] || 0) : 0;
      var pts = (lp[g] || {})[el];
      // How much of the league held him that week. This one really is history:
      // it is counted from that gameweek's own squads, so it says whether the
      // league was on him before he scored or piled in afterwards. FPL's own
      // ownership cannot be shown this way — only today's figure is published,
      // and repeating it down the column would claim it held all season.
      var own = C.leagueOwnership(ds, g);
      var fx = ((ds.gwFixtures || {})[g] || []).filter(function (f) {
        return f[0] === club || f[1] === club;
      }).map(function (f) {
        return { opp: f[0] === club ? f[1] : f[0], home: f[0] === club,
                 started: !!f[2], done: !!(f[3] || f[8]) };
      });
      return { gw: g, pts: (pts == null ? null : pts + prov), mins: mins,
               go: own ? (own.pct[el] == null ? null : own.pct[el]) : null,
               goals: goals, assists: assists, bonus: bonus + prov, prov: prov > 0,
               played: mins > 0, fixtures: fx, blank: !fx.length,
               // nothing to report yet is not the same as a blank: one is a
               // gameweek he has no fixture in, the other has not been played
               ahead: fx.length > 0 && !fx.some(function (x) { return x.started; }) };
    });
    var total = 0, mins = 0, goals = 0, assists = 0;
    rows.forEach(function (r) {
      total += r.pts || 0; mins += r.mins; goals += r.goals; assists += r.assists;
    });
    // What he is today, which is a different kind of fact from the rows above
    // and is labelled as such wherever it is shown.
    var meta = ds.elements[el], pr = ds.prices || {};
    var nowOwn = C.leagueOwnership(ds, +ds.pitchGw);
    return { rows: rows, total: total, mins: mins, goals: goals, assists: assists,
             club: club,
             price: ((pr.now && pr.now[el] != null) ? pr.now[el] : (meta[3] || 0)) / 10,
             start: (meta[6] != null ? meta[6] : meta[3] || 0) / 10,
             owned: (pr.owned && pr.owned[el] != null) ? pr.owned[el] : (meta[4] || 0),
             goOwned: nowOwn ? (nowOwn.pct[el] || 0) : null };
  };

  // Everyone who played one chip in one gameweek, best gameweek score first.
  C.chipPlayers = function (ds, gw, chip) {
    var pk = (ds && ds.picks || {})[gw] || {};
    var mm = managerMap(ds);
    var out = [];
    Object.keys(pk).forEach(function (id) {
      if ((pk[id].c || "") !== chip) return;
      out.push({ id: +id, name: nm(mm, +id), player: pl(mm, +id),
                 score: gwScore(ds, +id, gw) });
    });
    out.sort(function (a, b) { return (b.score || 0) - (a.score || 0); });
    return out;
  };

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
    // Who each club faces this gameweek, from the published real fixtures:
    // club short name -> [{opp, home, started, finished}] (a double gameweek
    // gives a club two entries). Absent for past gameweeks, which is fine —
    // everyone there has played.
    var clubFx = {};
    (((ds.gwFixtures || {})[gw]) || []).forEach(function (f) {
      // over is the final whistle (finished_provisional) — the same moment the
      // scoreboard turns "live" into "Full time" — so a card and the fixture
      // row above it never disagree about whether a match is still on.
      var over = !!(f[3] || f[8]);
      (clubFx[f[0]] = clubFx[f[0]] || []).push({ opp: f[1], home: true, started: !!f[2], finished: !!f[3], over: over });
      (clubFx[f[1]] = clubFx[f[1]] || []).push({ opp: f[0], home: false, started: !!f[2], finished: !!f[3], over: over });
    });
    function build(el, mult, isCap, isVice) {
      var meta = els[el] || ["?", 0, "", 0, 0];
      // While a fixture is in play FPL withholds bonus, so a squad reads up to
      // three points light per bonus-earning player unless it is added back.
      var prov = pb[el] || 0;
      var base = (lp[el] || 0) + prov;
      var fx = clubFx[meta[2]] || [];
      // The card shows the opponent until the player's match kicks off, then
      // the points take over. "Yet to play" is every fixture still unstarted.
      var waiting = fx.length > 0 && fx.every(function (x) { return !x.started; });
      // In play right now: his points are still moving, and the card says so.
      var live = fx.some(function (x) { return x.started && !x.over; });
      var oppText = fx.map(function (x) { return x.opp + (x.home ? " (H)" : " (A)"); }).join(" · ");
      return { el: el, name: meta[0], type: meta[1], team: meta[2], pos: POS[meta[1]] || "",
               pts: base * (mult || 1), base: base, prov: prov,
               price: meta[3] || 0, eo: (eot && eot.eo[el]) || 0,
               opp: oppText, waiting: waiting, live: live,
               // hurt, banned or a doubt, as of now and only for a gameweek
               // still to be played — see C.availability
               flag: C.availability(ds, el, gw),
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

    // Who each new face replaced. The transfer log names both ends of every
    // swap, so a card can be turned over to show the player sold for him and
    // what he went on to score — which is the half of a transfer nobody can
    // see once the deadline passes.
    var swaps = ((ds.moves || {})[gw] || {})[id] || [];
    if (swaps.length) {
      var outFor = {};
      swaps.forEach(function (sw) { outFor[sw[0]] = sw[1]; });
      var all15 = bench.concat(rows[1] || [], rows[2] || [], rows[3] || [], rows[4] || []);
      all15.forEach(function (p) {
        var outEl = outFor[p.el];
        if (outEl == null) return;
        var om = els[outEl] || ["?", 0, "", 0, 0];
        p.inFor = { el: outEl, name: om[0], type: om[1], team: om[2],
                    pts: (lp[outEl] || 0) + (pb[outEl] || 0) };
      });
    }

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
      // live-aware, like the total above these tiles — the raw history row
      // lags all afternoon
      var sc = gwScore(ds, m.id, gw);
      if (sc === null) return;
      sum += sc; n++;
      if (!top || sc > top.pts) top = { id: m.id, name: m.entryName, pts: sc };
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

    // Which of these fifteen is close to a price change. FPL publishes this as
    // a right-now reading with no per-gameweek history, so it belongs on the
    // newest pitch and nowhere else: hung on an older squad it would be today's
    // number under last month's team, which would be a lie told tidily.
    if (+gw === +ds.pitchGw) {
      var moves = priceMoves(ds);
      everyone.forEach(function (p) {
        var m = moves[p.el];
        if (!m) return;
        var mag = Math.abs(m.pct);
        if (mag < MOVE_MIN) return;
        p.move = { pct: m.pct, mag: mag, up: m.pct >= 0,
                   // tonight, as against merely drifting that way
                   soon: m.dueIn === 0 || mag >= 100 };
      });
    }

    // What the squad is worth, and what it would actually fetch. These are two
    // different numbers: FPL hands back only half of a player's rise, rounded
    // down per tenth, while a fall is borne in full.
    //
    // The history row's "value" field is NOT the second number, which is easy
    // to assume and wrong: it is the market value plus the bank. Proof from
    // the live data — 127 squads holding risen players match the sum of
    // current prices exactly, which could not happen if it were a selling
    // value. So the realisable figure is built here, from what each player
    // actually cost, and the fifteen are only trusted when every one of them
    // has a known purchase price. A Free Hit squad is skipped outright: it is
    // borrowed for the week, so nothing in it was bought at all.
    var bank = hrow && hrow.bk != null ? hrow.bk : null;
    var sellValue = null;
    var buyMap = (ds.buys && +ds.buysGw === +gw && (sq.c || "") !== "freehit")
      ? ds.buys[id] : null;
    if (buyMap) {
      var sellSum = 0, complete = everyone.length > 0;
      everyone.forEach(function (p) {
        var buy = buyMap[p.el];
        if (buy == null) { complete = false; return; }
        p.sell = p.price > buy ? buy + Math.floor((p.price - buy) / 2) : p.price;
        sellSum += p.sell;
      });
      if (complete) sellValue = sellSum;
      else everyone.forEach(function (p) { delete p.sell; });
    }

    var worth = C.squadWorth(ds, id, gw), lw = C.leagueWorth(ds, gw);
    var provTotal = 0;
    scoring.forEach(function (p) { provTotal += (p.prov || 0) * p.mult; });
    return { gw: gw, gwName: gwEv ? gwEv.name : ("GW " + gw), live: live, provisional: provTotal,
             chip: sq.c || "", lines: lines, bench: bench,
             total: total, hits: hits, net: net,
             average: n ? Math.round(sum / n) : null, highest: top,
             avgEo: scoring.length ? Math.round((eoSum / scoring.length) * 10) / 10 : 0,
             topEo: topEo || 0, squadValue: worth ? worth.value : valSum, topPrice: topPrice || 0,
             bank: bank, sellValue: sellValue, swaps: swaps.length,
             leagueAvgEo: eot ? eot.leagueAvgEo : 0,
             leagueAvgValue: lw ? lw.average : 0 };
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
        // records come from finished gameweeks only — a half-played
        // afternoon must not become somebody's "worst gameweek"
        var sc = g !== cur ? gwScore(ds, id, g) : null;
        if (sc !== null) {
          if (!best || sc > best.p) best = { gw: g, p: sc };
          if (!worst || sc < worst.p) worst = { gw: g, p: sc };
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
        // the same live-aware scoring every tab uses — FPL's history row lags
        // during a live gameweek, and this header read it raw while the
        // pitches beneath it were already counting the afternoon
        gwPts: gwScore(ds, id, gw),
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
      // the classic table is live-adjusted, so its totals lead the raw
      // history by the gameweek being played — take rank and total from it
      if (+r.id === aId) { A.rank = r.computedRank; if (typeof r.total === "number") A.total = r.total; }
      if (+r.id === bId) { B.rank = r.computedRank; if (typeof r.total === "number") B.total = r.total; }
    });

    // Notional head-to-head: who scored more, gameweek by gameweek.
    var rec = { w: 0, d: 0, l: 0, gws: [] };
    played.forEach(function (g) {
      var xp = gwScore(ds, aId, g), yp = gwScore(ds, bId, g);
      if (xp === null || yp === null) return;
      if (xp > yp) rec.w++; else if (xp < yp) rec.l++; else rec.d++;
      rec.gws.push({ gw: g, a: xp, b: yp });
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
      var sc = gwScore(ds, m.id, gw), wth = C.squadWorth(ds, m.id, gw);
      rows.push({ id: m.id, name: nm(mm, m.id), player: pl(mm, m.id),
                  p: sc === null ? r.p : sc, hits: r.h || 0, bench: gwBench(ds, m.id, gw) || r.b || 0,
                  value: wth ? wth.value : 0, bank: wth && wth.bank != null ? wth.bank : (r.bk || 0),
                  transfers: r.tr || 0 });
    });
    var gwStats = null;
    if (rows.length) {
      var sorted = rows.slice().sort(function (a, b) { return b.p - a.p; });
      var sum = 0, hitTotal = 0, benchTotal = 0, trTotal = 0;
      rows.forEach(function (r) { sum += r.p; hitTotal += r.hits; benchTotal += r.bench; trTotal += r.transfers; });
      var mid = sorted[Math.floor(sorted.length / 2)];
      var avg = Math.round(sum / rows.length);
      gwStats = {
        gw: +gw, count: rows.length,
        top: sorted[0], second: sorted[1] || null, low: sorted[sorted.length - 1],
        average: avg, median: mid ? mid.p : null,
        range: sorted[0].p - sorted[sorted.length - 1].p,
        aboveAvg: rows.filter(function (r) { return r.p > avg; }).length,
        hitTotal: hitTotal, mostHits: best(rows, "hits"),
        benchTotal: benchTotal, mostBench: best(rows, "bench"),
        transfersTotal: trTotal, mostTransfers: best(rows, "transfers"),
        noTransfer: rows.filter(function (r) { return !r.transfers; }).length
      };
      // How the week was spread, not just where its ends were. The quartiles
      // say what a good and a poor week actually looked like; FPL's own
      // average says whether the league as a whole had a good one.
      var at = function (frac) {
        return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * frac))].p;
      };
      gwStats.topQuarter = at(0.25);
      gwStats.bottomQuarter = at(0.75);
      gwStats.benchAvg = Math.round(benchTotal / rows.length);
      var gwEvent = ((ds.bootstrap && ds.bootstrap.events) || []).filter(function (e) {
        return +e.id === +gw;
      })[0];
      // FPL publishes no average until a gameweek finishes; 0 means "not yet".
      gwStats.fplAverage = (gwEvent && gwEvent.average > 0) ? gwEvent.average : null;
      if (gwStats.fplAverage !== null) {
        gwStats.beatFpl = rows.filter(function (r) { return r.p > gwStats.fplAverage; }).length;
      }
      var chipCount = 0, chipKinds = {};
      Object.keys(pk || {}).forEach(function (mid) {
        var c = pk[mid] && pk[mid].c;
        if (c) { chipCount++; chipKinds[c] = (chipKinds[c] || 0) + 1; }
      });
      gwStats.chipsPlayed = chipCount;
      gwStats.chipKinds = chipKinds;

      // The whole league in brackets of equal width, best band first. The
      // width is chosen so the table is readable — six to twelve rows —
      // rather than fixed, because a quiet week and a double gameweek do not
      // span the same range.
      var lowP = sorted[sorted.length - 1].p, highP = sorted[0].p;
      var span = Math.max(1, highP - lowP);
      var width = [2, 5, 10, 20, 25, 50, 100].filter(function (w) {
        return Math.ceil((span + 1) / w) <= 12;
      })[0] || 100;
      var start = Math.floor(lowP / width) * width;
      var buckets = [];
      for (var bLo = start; bLo <= highP; bLo += width) {
        buckets.push({ lo: bLo, hi: bLo + width - 1, n: 0 });
      }
      rows.forEach(function (r) {
        var i = Math.floor((r.p - start) / width);
        if (i >= 0 && i < buckets.length) buckets[i].n++;
      });
      var widest = 0;
      buckets.forEach(function (b) { if (b.n > widest) widest = b.n; });
      buckets.forEach(function (b) {
        b.pct = rows.length ? Math.round((b.n / rows.length) * 100) : 0;
        b.bar = widest ? Math.round((b.n / widest) * 100) : 0;
      });
      gwStats.buckets = buckets.reverse();
      gwStats.bucketWidth = width;
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
        mostBanked: best(withVal, "bank"), count: withVal.length,
        // the newest squads are at today's prices, older ones as FPL recorded
        now: +gw === +ds.pitchGw
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

      // The team of the week: the highest-scoring legal eleven from players
      // anyone in the league holds this gameweek, on the same points the
      // pitches show. One goalkeeper, then whichever of the seven legal
      // shapes (three to five at the back, two to five in midfield, one to
      // three up front) sums highest from the best in each line. A tie on
      // points goes to the more-owned player, so the side is the same on
      // every phone.
      var teamOfWeek = null;
      (function () {
        var byT = { 1: [], 2: [], 3: [], 4: [] };
        ownedList.forEach(function (x) { if (byT[x.type]) byT[x.type].push(x); });
        [1, 2, 3, 4].forEach(function (t) {
          byT[t].sort(function (a, b) {
            return (b.pts - a.pts) || (b.owners - a.owners) || String(a.name).localeCompare(String(b.name));
          });
        });
        if (!byT[1].length) return;
        var sumTop = function (arr, n) { var s = 0; for (var i = 0; i < n; i++) s += arr[i].pts; return s; };
        var bestSum = -1, shape = null;
        for (var d = 3; d <= 5; d++) {
          for (var m = 2; m <= 5; m++) {
            var f = 10 - d - m;
            if (f < 1 || f > 3) continue;
            if (byT[2].length < d || byT[3].length < m || byT[4].length < f) continue;
            var sum = sumTop(byT[2], d) + sumTop(byT[3], m) + sumTop(byT[4], f);
            if (sum > bestSum) { bestSum = sum; shape = { 2: d, 3: m, 4: f }; }
          }
        }
        if (!shape) return;
        var card = function (x, t) {
          return { el: x.el, name: x.name, team: x.team, type: x.type, pos: POSNAME[t],
                   pts: x.pts, price: x.price, eo: x.ownedPct, owners: x.owners,
                   cap: false, vice: false, mult: 1, benched: false };
        };
        var lines = [1, 2, 3, 4].map(function (t) {
          var n = t === 1 ? 1 : shape[t];
          return { pos: POSNAME[t], players: byT[t].slice(0, n).map(function (x) { return card(x, t); }) };
        });
        teamOfWeek = { lines: lines, total: bestSum + byT[1][0].pts,
                       shape: shape[2] + "-" + shape[3] + "-" + shape[4],
                       els: lines.reduce(function (a, ln) { return a.concat(ln.players.map(function (x) { return x.el; })); }, []) };
      })();

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
        // how owned the average starting eleven in the league is, on the
        // same plain ownership the sides above carry, so a side drawn from
        // these squads reads against the same measure
        leagueAvgOwned: (function () {
          var sum = 0, cnt = 0;
          ids.forEach(function (mid) {
            var xi = (pk[mid].p || []).filter(function (t) { return t[1] > 0; });
            if (!xi.length) return;
            var s = 0;
            xi.forEach(function (t) { s += n ? (own[t[0]] || 0) / n * 100 : 0; });
            sum += s / xi.length; cnt++;
          });
          return cnt ? Math.round((sum / cnt) * 10) / 10 : 0;
        })(),
        movedIn: movedIn, movedOut: movedOut, churn: churn,
        mostVice: ownedList.slice().filter(function (x) { return x.vices > 0; })
          .sort(function (a, b) { return b.vices - a.vices; }).slice(0, 5),
        templateXi: templateXi,
        teamOfWeek: teamOfWeek,
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
          var r = h[g], sc = gwScore(ds, m.id, g);
          if (!r || sc === null) return;
          tot += sc; hits += r.h || 0; bench += r.b || 0; tr += r.tr || 0; cnt++;
          if (!hi || sc > hi.p) hi = { gw: g, p: sc };
          if (!lo || sc < lo.p) lo = { gw: g, p: sc };
          if (r.r) { if (firstRank === null) firstRank = r.r; lastRank = r.r; }
          if (!bestGw || sc > bestGw.p) bestGw = { id: m.id, name: nm(mm, m.id), gw: g, p: sc };
          if (!worstGw || sc < worstGw.p) worstGw = { id: m.id, name: nm(mm, m.id), gw: g, p: sc };
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
  // What every manager has won, in one pass.
  //
  // This used to be worked out one manager at a time, and each of those calls
  // rebuilt the classic table, every month, the whole pyramid and the LMS run
  // from scratch: about 17ms a manager, so a league of 245 spent four seconds
  // on a laptop and the better part of half a minute on a phone, with the main
  // thread locked the whole way. The four tables do not depend on which
  // manager is being asked about, so they are built once and walked.
  C.winningsAll = function (ds) {
    var out = {};
    if (!ds || !ds.managers) return out;
    var seat = function (id) {
      return out[id] || (out[id] = { items: [], settled: 0, onTrack: 0, total: 0 });
    };
    (ds.managers || []).forEach(function (m) { seat(+m.id); });
    function add(id, comp, label, amount, settled) {
      if (!amount) return;
      var w = seat(+id);
      w.items.push({ comp: comp, label: label, amount: amount, settled: !!settled });
      if (settled) w.settled += amount; else w.onTrack += amount;
      w.total += amount;
    }

    // Classic only pays out at the end of the season.
    var finished = C.finishedGws(ds);
    var seasonDone = finished.length >= (cfg().totalGameweeks || 38);
    C.classic(ds).forEach(function (r) {
      if (r.prize) add(r.id, "Classic", "#" + r.computedRank + " overall", r.prize, seasonDone);
    });

    // A month pays once every one of its gameweeks is done.
    C.monthly(ds).forEach(function (m) {
      m.rows.forEach(function (r) {
        if (r.prize) add(r.id, "Monthly", (m.label || m.name) + " · #" + r.pos, r.prize, m.complete);
      });
    });

    // A pyramid mini-season pays once its gameweeks are done.
    var fset = {}; finished.forEach(function (g) { fset[g] = true; });
    C.pyramid(ds).seasons.forEach(function (se) {
      var done = (se.gws || []).length > 0 && se.gws.every(function (g) { return fset[g]; });
      se.divisions.forEach(function (dv) {
        dv.rows.forEach(function (r) {
          if (r.prize) add(r.id, "Pyramid", se.name + " · " + dv.name + " · #" + r.pos, r.prize, done);
        });
      });
    });

    // A voluntary league is a season-long table like the classic one, and
    // pays when it does.
    C.voluntaryLeagues(ds).forEach(function (l) {
      var v = C.voluntary(ds, l.key);
      if (!v || !v.loaded) return;
      v.rows.forEach(function (r) {
        if (r.prize) add(r.id, "Voluntary", v.name + " \u00b7 #" + r.computedRank, r.prize, seasonDone);
      });
    });

    // Last Manager Standing pays when a champion exists: the last one left,
    // and the two who went out last — the best placed of the final week's
    // eliminations first.
    var lms = C.lms(ds), lp = cfg().lms.prizes || {};
    if (lms.champion) {
      add(lms.champion.id, "Last Manager", "Champion", lp.champion, true);
      var pod = lms.podium || [];
      if (pod[1]) add(pod[1].id, "Last Manager", "Runner-up", lp.runnerUp, true);
      if (pod[2]) add(pod[2].id, "Last Manager", "Third", lp.third, true);
    }

    // The knockouts pay their winner and runner-up once the final is decided;
    // settled once FPL has checked the final's gameweek.
    ["ucl", "uel"].forEach(function (comp) {
      var B = C.knockout(ds, comp);
      if (!B || !B.champion || !B.prizes) return;
      add(B.champion.id, B.label, "Winner", B.prizes.winner, B.settled);
      if (B.runnerUp) add(B.runnerUp.id, B.label, "Runner-up", B.prizes.runnerUp, B.settled);
    });
    return out;
  };

  // One manager's share of the above. The rules live in one place, so a
  // profile's XP card and the winnings page cannot drift apart.
  C.winnings = function (ds, id) {
    if (!ds || !id) return null;
    var w = C.winningsAll(ds)[+id];
    return w || { items: [], settled: 0, onTrack: 0, total: 0 };
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
  // Where every manager stood in the classic league at the end of each
  // gameweek. FPL's own history carries an overall rank — that is the world's
  // table, not this one — so the league's positions are rebuilt from the
  // running totals it does carry, ordered the way the Classic tab orders them
  // and sharing a position on a tie. Built once per dataset.
  function classicRankByGw(ds) {
    if (ds && ds._crank) return ds._crank;
    var by = {};
    var gws = C.finishedGws(ds);
    var cur = C.currentGw(ds);
    if (cur && gws.indexOf(cur) === -1) gws = gws.concat([cur]);
    gws.forEach(function (g) {
      var rows = [];
      (ds.managers || []).forEach(function (m) {
        var r = (ds.history[m.id] || {})[g];
        if (r && typeof r.t === "number") rows.push({ id: m.id, t: r.t });
      });
      rows.sort(function (a, b) { return b.t - a.t; });
      var map = {};
      for (var i = 0; i < rows.length; ) {
        var j = i;
        while (j + 1 < rows.length && rows[j + 1].t === rows[i].t) j++;
        for (var k = i; k <= j; k++) map[rows[k].id] = i + 1;
        i = j + 1;
      }
      by[g] = { rank: map, of: rows.length };
    });
    if (ds) { try { Object.defineProperty(ds, "_crank", { value: by, enumerable: false }); } catch (e) {} }
    return by;
  }
  C.classicRankByGw = classicRankByGw;

  C.form = function (ds, id, count) {
    if (!ds || !id) return [];
    id = +id;
    var played = C.finishedGws(ds);
    var cur = C.currentGw(ds);
    if (cur && played.indexOf(cur) === -1) played = played.concat([cur]);
    var h = ds.history[id] || {};
    var cr = classicRankByGw(ds);
    var out = [];
    played.forEach(function (g) {
      var sc = gwScore(ds, id, g);
      if (sc === null) return;
      var band = cr[g];
      out.push({ gw: g, p: sc,
                 r: (band && band.rank[id]) || null,
                 of: (band && band.of) || 0 });
    });
    return count ? out.slice(-count) : out;
  };

  /* Facts about the league in one finished gameweek that several badges need
     at once: the highest score, the best armband, and how many squads held
     each player. Every squad is read once here rather than once per badge,
     and the answer is kept until the data changes. */
  var _gwf = { key: null, val: null };
  function gwFacts(ds) {
    var played = C.finishedGws(ds);
    var key = (ds.updatedAt || "") + "|" + played.join(",");
    if (_gwf.key === key) return _gwf.val;
    var out = {};
    played.forEach(function (g) {
      var best = null, worst = null, capBest = null, own = {}, caps = {}, squads = 0;
      var hist = ds.history || {};
      (ds.managers || []).forEach(function (m) {
        var sc = gwScore(ds, m.id, g);
        if (sc === null) return;
        if (best === null || sc > best) best = sc;
        if (worst === null || sc < worst) worst = sc;
      });
      var pk = picksAt(ds, g), lp = liveAt(ds, g) || {};
      if (pk) Object.keys(pk).forEach(function (mid) {
        var p = (pk[mid] || {}).p;
        if (!p || !p.length) return;
        squads++;
        var seen = {}, wore = null, mult = 0;
        p.forEach(function (t) {
          if (!seen[t[0]]) { seen[t[0]] = 1; own[t[0]] = (own[t[0]] || 0) + 1; }
          // The armband as it ended up. A captain who did not play hands it to
          // the vice, and the stored squad carries that as the multiplier, so
          // reading the multiplier reads the armband that actually counted.
          if (t[1] >= 2 && t[1] > mult) { mult = t[1]; wore = t[0]; }
        });
        // Who wore it, so a badge can ask how many others wore the same one.
        if (wore !== null) {
          caps[wore] = (caps[wore] || 0) + 1;
          var pts = lp[wore];
          if (typeof pts === "number" && (capBest === null || pts > capBest)) capBest = pts;
        }
      });
      out[g] = { best: best, worst: worst, capBest: capBest, own: own, caps: caps, squads: squads,
                 lp: lp, picks: pk };
    });
    _gwf = { key: key, val: out };
    return out;
  }

  /* Who won a group and who went up a division: league-wide answers that are
     the same for everybody, so they are worked out once and looked up. */
  var _snf = { key: null, val: null };
  function seasonFacts(ds) {
    var key = (ds.updatedAt || "") + "|" + C.finishedGws(ds).join(",");
    if (_snf.key === key) return _snf.val;
    var groupWins = {}, promos = {}, relegs = {};

    (C.h2h(ds).groups || []).forEach(function (G) {
      if (!G.complete) return;
      var top = (G.table || [])[0];
      if (top) (groupWins[+top.id] || (groupWins[+top.id] = [])).push(G.name);
    });

    var P = C.pyramid(ds);
    var order = {}; (P.divisions || []).forEach(function (d, i) { order[d.key] = i; });
    function divisionOf(season) {
      var r = (P.rosters || {})[season.key] || {}, at = {};
      Object.keys(r).forEach(function (k) {
        (r[k] || []).forEach(function (mid) { at[+mid] = k; });
      });
      return at;
    }
    var seasons = P.seasons || [];
    for (var s = 1; s < seasons.length; s++) {
      // A mini-season that is not over has promoted nobody. The next season's
      // divisions are derived from it provisionally and can still move, and a
      // badge is not given for a standing that is still being played.
      if (!seasons[s - 1].complete) break;
      var was = divisionOf(seasons[s - 1]), now = divisionOf(seasons[s]), name = seasons[s].name;
      Object.keys(now).forEach(function (mid) {
        var a = was[mid], b = now[mid];
        if (a && b && order[b] < order[a]) (promos[mid] || (promos[mid] = [])).push(name);
        if (a && b && order[b] > order[a]) (relegs[mid] || (relegs[mid] = [])).push(name);
      });
    }
    var val = { groupWins: groupWins, promos: promos, relegs: relegs };
    _snf = { key: key, val: val };
    return val;
  }

  // An overall FPL rank in as few characters as a chip has room for.
  function shortRank(n) {
    if (n < 1000) return String(n);
    return (Math.round(n / 100) / 10) + "k";
  }

  // Badges: what a manager has done this season, and where he stands today.
  //
  // An honour is settled and permanent. It is read from finished gameweeks,
  // finished months and finished mini-seasons, it never goes away once it is
  // won, and winning it again adds to the count. A form badge is the
  // opposite: it is true today and can stop being true next week. Those are
  // marked as such, worded in the present tense and drawn differently, so one
  // leaving a profile reads as a change in standing rather than a fault.
  //
  // Each badge carries the gameweeks, months or seasons behind it, so the
  // chip can say exactly what it is for.
  C.badges = function (ds, id) {
    if (!ds || !id || !ds.managers || !ds.managers.length) return [];
    id = +id;
    var honours = [], form = [], blots = [], formBlots = [];
    var played = C.finishedGws(ds);
    var h = (ds.history || {})[id] || {};
    var F = gwFacts(ds), SF = seasonFacts(ds), cr = classicRankByGw(ds);

    function honour(k, label, count, gws, icon, tag, why) {
      honours.push({ k: k, label: label, count: count, gws: gws || [], icon: icon,
                     tag: tag, why: why, form: false, blot: false });
    }
    function now(k, label, count, gws, icon, tag, why) {
      form.push({ k: k, label: label, count: count, gws: gws || [], icon: icon,
                  tag: tag, why: why, form: true, blot: false });
    }
    // A blot is an honour's opposite: settled, permanent, and it stacks. A
    // form blot is a standing that can be climbed out of. Dry and factual,
    // since everyone can read them; each is the mirror of a badge above.
    function blot(k, label, count, gws, icon, tag, why) {
      blots.push({ k: k, label: label, count: count, gws: gws || [], icon: icon,
                   tag: tag, why: why, form: false, blot: true });
    }
    function nowBad(k, label, count, gws, icon, tag, why) {
      formBlots.push({ k: k, label: label, count: count, gws: gws || [], icon: icon,
                       tag: tag, why: why, form: true, blot: true });
    }

    // Which chip was played in which gameweek, from the manager's own record.
    var chipAt = {};
    ((ds.chips || {})[id] || []).forEach(function (c) { chipAt[c.gw] = c.n; });

    /* ---- one pass over the finished gameweeks -------------------------- */
    var tops = [], dbls = [], cents = [], backs = [], arms = [], caps = [],
        diffs = [], cleans = [];
    var spoons = [], blanks = [], falls = [], wasted = [], reckless = [], flops = [];
    played.forEach(function (g, i) {
      var f = F[g] || {}, mine = h[g], pts = gwScore(ds, id, g);
      if (!mine || pts === null) return;
      var sq = f.picks && f.picks[id];

      // The gameweek points net of hits — the number the Classic table's GW
      // column shows, and the one every other score here is settled on.
      if (f.best !== null && f.best !== undefined && pts === f.best) tops.push(g);
      if (pts >= 200) dbls.push(g);
      if (pts >= 100) cents.push(g);
      // and its opposite: the league's lowest, and a week under thirty-five
      if (f.worst !== null && f.worst !== undefined && pts === f.worst) spoons.push(g);
      if (pts < 35) blanks.push(g);

      // Comeback: seventy-five places or more up the Classic table in one
      // gameweek. Fifty places is an ordinary week in a field of this size.
      // Freefall is the same distance the other way.
      if (i > 0) {
        var at = cr[g] && cr[g].rank[id], before = cr[played[i - 1]] && cr[played[i - 1]].rank[id];
        if (at && before && before - at >= 75) backs.push(g);
        if (at && before && at - before >= 75) falls.push(g);
      }

      // Clean sheet: nothing spent on hits and nothing left scoring on the
      // bench. A Bench Boost week cannot waste bench points, so it is not one.
      var chip = chipAt[g] || (sq && sq.c) || "";
      if (chip !== "bboost" && !(mine.h || 0) && !(mine.b || 0)) cleans.push(g);
      // Bench blunder: twenty or more left scoring on the bench, again not on
      // a Bench Boost week. Reckless: eight or more paid in hits in one go.
      if (chip !== "bboost" && (mine.b || 0) >= 20) wasted.push(g);
      if ((mine.h || 0) >= 8) reckless.push(g);

      var pl = sq && sq.p;
      if (!pl || !pl.length) return;

      // The armband that counted, and what it brought in after doubling.
      var capEl = null, capMult = 0;
      pl.forEach(function (t) { if (t[1] >= 2 && t[1] > capMult) { capMult = t[1]; capEl = t[0]; } });
      var capPts = (capEl !== null && typeof f.lp[capEl] === "number") ? f.lp[capEl] : null;
      if (capPts !== null) {
        if (capPts * capMult >= 40) caps.push(g);
        // Captain calamity: the armband brought back two or fewer after
        // doubling — the man scored at most one, or lost points.
        if (capPts * capMult <= 2) flops.push(g);
        // Best armband is for the call, not the haul: the league's top captain
        // when most of the league was somewhere else. Where the best captain
        // was also the obvious one, picking him was not a decision and nobody
        // gets it — which is what keeps this apart from the haul above.
        if (f.capBest !== null && capPts === f.capBest && f.squads &&
            (f.caps[capEl] || 0) / f.squads < 0.25) arms.push(g);
      }

      // Differential: someone in the eleven that fewer than a tenth of the
      // league held, with fifteen points or more. Ownership is counted the
      // way FPL counts its own — squad membership, bench included.
      if (f.squads) {
        var got = false;
        pl.forEach(function (t) {
          if (got || !(t[1] > 0)) return;
          var pts = f.lp[t[0]];
          if (typeof pts !== "number" || pts < 15) return;
          if ((f.own[t[0]] || 0) / f.squads < 0.1) got = true;
        });
        if (got) diffs.push(g);
      }
    });

    /* ---- honours: settled, permanent, and they stack ------------------- */
    var months = [];
    C.monthly(ds).forEach(function (m) {
      if (!m.complete) return;
      var r = (m.rows || []).filter(function (x) { return +x.id === id; })[0];
      if (r && r.pos === 1) months.push(m.label || m.name);
    });
    if (months.length) honour("month", "Manager of the Month", months.length, months, "medal",
      "×" + months.length, "Won the month");

    var groupWins = SF.groupWins[id] || [];
    if (groupWins.length) honour("group", "Group winner", groupWins.length, groupWins, "users",
      "×" + groupWins.length, "Topped a group when the group stage ended");

    var ups = SF.promos[id] || [];
    if (ups.length) honour("promo", "Promoted", ups.length, ups, "steps",
      "×" + ups.length, "Went up a division between mini-seasons");

    if (tops.length) honour("top", "Top scorer", tops.length, tops, "trophy",
      "×" + tops.length, "The league’s highest score of the gameweek");
    if (dbls.length) honour("dbl", "Double ton", dbls.length, dbls, "star",
      "×" + dbls.length, "200 points or more in a gameweek");
    if (cents.length) honour("century", "Century", cents.length, cents, "sparkle",
      "×" + cents.length, "100 points or more in a gameweek");
    if (backs.length) honour("comeback", "Comeback", backs.length, backs, "chart",
      "×" + backs.length, "Up 75 places or more in the Classic table in one gameweek");
    if (arms.length) honour("armband", "Best armband", arms.length, arms, "target",
      "×" + arms.length, "The league’s highest-scoring captain, when under a quarter of the league had him");
    if (caps.length) honour("capt", "Captain fantastic", caps.length, caps, "captain",
      "×" + caps.length, "An armband worth 40 points or more after doubling");
    if (diffs.length) honour("diff", "Differential", diffs.length, diffs, "gem",
      "×" + diffs.length, "Started a player under a tenth of the league owned who scored 15 or more");
    if (cleans.length) honour("clean", "Clean sheet", cleans.length, cleans, "check",
      "×" + cleans.length, "No hits taken and nothing left scoring on the bench");

    /* ---- blots: settled, permanent, and they stack ----------------------- */
    var downs = SF.relegs[id] || [];
    if (downs.length) blot("releg", "Relegated", downs.length, downs, "steps",
      "×" + downs.length, "Went down a division between mini-seasons");
    if (spoons.length) blot("spoon", "Wooden spoon", spoons.length, spoons, "circleDown",
      "×" + spoons.length, "The league’s lowest score of the gameweek");
    if (blanks.length) blot("blank", "Blank", blanks.length, blanks, "cross",
      "×" + blanks.length, "Under 35 points in a gameweek");
    if (falls.length) blot("freefall", "Freefall", falls.length, falls, "down",
      "×" + falls.length, "Down 75 places or more in the Classic table in one gameweek");
    if (flops.length) blot("capflop", "Captain calamity", flops.length, flops, "captain",
      "×" + flops.length, "An armband worth 2 points or fewer after doubling");
    if (wasted.length) blot("benched", "Bench blunder", wasted.length, wasted, "bench",
      "×" + wasted.length, "20 points or more left scoring on the bench");
    if (reckless.length) blot("reckless", "Reckless", reckless.length, reckless, "warn",
      "×" + reckless.length, "8 points or more paid in hits in one gameweek");

    /* ---- form: true today, and it can stop being true ------------------ */
    var row = C.classic(ds).filter(function (r) { return +r.id === id; })[0];
    if (row && row.computedRank === 1) {
      now("leader", "Leader", 1, [], "crown", "1st", "Top of the Classic table");
    } else if (row && row.computedRank <= 10) {
      now("topten", "Top ten", row.computedRank, [], "steady", ordinalOf(row.computedRank),
        "Inside the top ten of the Classic table");
    }

    // Overall FPL rank, from the last finished gameweek FPL has ranked.
    var overall = null;
    for (var j = played.length - 1; j >= 0; j--) {
      var rec = h[played[j]];
      if (rec && rec.r) { overall = rec.r; break; }
    }
    if (overall && overall <= 10000) now("top10k", "Top 10k", overall, [], "globe",
      shortRank(overall), "Inside the top 10,000 of FPL overall");

    // Climbing: a better Classic position than the gameweek before, three or
    // more finished gameweeks running, counted back from the latest.
    var streak = 0;
    for (var i = played.length - 1; i >= 1; i--) {
      var a = cr[played[i]] && cr[played[i]].rank[id];
      var b = cr[played[i - 1]] && cr[played[i - 1]].rank[id];
      if (a && b && a < b) streak++; else break;
    }
    if (streak >= 3) now("climb", "Climbing", streak, played.slice(-streak), "up",
      streak + " GWs", "Up the Classic table " + streak + " gameweeks running");

    /* ---- form blots: true today, and they can be climbed out of ---------- */
    var field = C.classic(ds).length;
    if (row && field > 20 && row.computedRank > field - 10) {
      nowBad("bottomten", "Bottom ten", row.computedRank, [], "circleDown", ordinalOf(row.computedRank),
        "Inside the bottom ten of the Classic table");
    }
    // Sliding: a worse Classic position than the gameweek before, three or
    // more finished gameweeks running — the mirror of Climbing.
    var slide = 0;
    for (var q = played.length - 1; q >= 1; q--) {
      var a2 = cr[played[q]] && cr[played[q]].rank[id];
      var b2 = cr[played[q - 1]] && cr[played[q - 1]].rank[id];
      if (a2 && b2 && a2 > b2) slide++; else break;
    }
    if (slide >= 3) nowBad("slide", "Sliding", slide, played.slice(-slide), "down",
      slide + " GWs", "Down the Classic table " + slide + " gameweeks running");
    // Asleep: no transfer for four finished gameweeks running. The first
    // gameweek has no transfers to make, so it never counts.
    var idle = 0;
    for (var z = played.length - 1; z >= 0; z--) {
      var rz = h[played[z]];
      if (played[z] > 1 && rz && typeof rz.p === "number" && !(rz.tr || 0)) idle++; else break;
    }
    if (idle >= 4) nowBad("asleep", "Asleep", idle, played.slice(-idle), "sleep",
      idle + " GWs", "No transfer for " + idle + " gameweeks running");

    // Survivor: still in Last Manager Standing once a quarter of the field has
    // gone. Before that it is everyone's, and a badge everyone has says
    // nothing.
    var lms = C.lms(ds);
    if (lms && lms.survivors && !lms.eliminatedAt[id] &&
        lms.survivors.some(function (x) { return +x.id === id; })) {
      var total = ds.managers.length, left = lms.survivors.length, gone = total - left;
      if (gone * 4 >= total) now("survivor", "Survivor", left, [], "flame", left + " left",
        "Still standing in Last Manager with " + gone + " of " + total + " out");
    }

    return honours.concat(form, blots, formBlots);
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
    var podAt = (lms.podium || []).map(function (p) { return +p.id; }).indexOf(id);
    if (podAt === 1 || podAt === 2) {
      entry("Last Manager", podAt === 1 ? "runner-up" : "third", podAt + 1,
        podAt === 1 ? (conf.lms.prizes || {}).runnerUp : (conf.lms.prizes || {}).third, true, "in", null, "");
    } else if (elimGw) {
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

    /* UCL — the group stage decides which knockout you land in; once the
       draw is made, the bracket says where you are in it */
    var q = conf.h2h.qualify || { uclPerGroup: 2, uelPerGroup: 2 };
    var ucl = q.uclPerGroup, uel = ucl + (q.uelPerGroup || 0);
    var inBracket = false;
    ["ucl", "uel"].forEach(function (comp) {
      var B = C.knockout(ds, comp);
      if (!B || !B.drawn) return;
      var last = null, lastRound = null;
      B.rounds.forEach(function (r) {
        r.ties.forEach(function (t) {
          if ((t.home && +t.home.id === id) || (t.away && +t.away.id === id)) { last = t; lastRound = r; }
        });
      });
      if (!last) return;
      inBracket = true;
      var won = !!(last.winner && +last.winner.id === id), lost = !!(last.loser && +last.loser.id === id);
      var isFinal = lastRound.index === B.rounds.length - 1;
      var pz = B.prizes || {};
      var prize = isFinal ? (won ? pz.winner : (lost ? pz.runnerUp : 0)) : 0;
      entry("UCL", B.label + " \u00b7 " + lastRound.name + (lost ? " \u00b7 out" : (won && isFinal ? " \u00b7 winner" : "")),
        null, prize || 0, !!(B.settled && isFinal && (won || lost)),
        lost ? "out" : (isFinal && won ? "in" : "alive"), null, "");
    });
    if (!inBracket) C.h2h(ds).groups.forEach(function (g) {
      var t = g.table.filter(function (x) { return +x.id === id; })[0];
      if (!t) return;
      var state = t.pos <= ucl ? "in" : (t.pos <= uel ? "alive" : "out");
      var target = t.pos <= ucl ? ucl : uel;
      entry("UCL", g.name + (t.dest ? " · " + t.dest : ""), t.pos, 0, false, state,
        against(g.table, t.pos, target, function (x) { return x.pts; }),
        (t.pos <= target ? "pts clear of " : "pts off ") + ordinalOf(target));
    });

    /* Voluntary leagues — only the ones this manager is in */
    C.voluntaryLeagues(ds).forEach(function (l) {
      var v = C.voluntary(ds, l.key);
      if (!v || !v.loaded) return;
      var vrow = v.rows.filter(function (x) { return +x.id === id; })[0];
      if (!vrow) return;
      var lastV = v.places.length ? v.places[v.places.length - 1] : 0;
      var inV = lastV ? vrow.computedRank <= lastV : false;
      entry("Voluntary", v.name, vrow.computedRank, vrow.prize, false,
        inV ? "in" : "out",
        lastV ? against(v.rows, vrow.computedRank, lastV, function (x) { return x.total; }) : null,
        lastV ? (inV ? "pts clear of " + ordinalOf(lastV) : "pts off " + ordinalOf(lastV)) : "");
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
    // Once every match's bonus is in and the subs are stored, the points
    // stand and the result is called, as FPL calls it, before the week is
    // checked.
    var live = scored && C.liveGwId(ds) === +f.gw && C.scoredGws(ds).indexOf(+f.gw) === -1;
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
        ties.push({ n: n++, home: home, away: away, fromA: null, fromB: null });
      }
    }

    var rounds = (h.schedule || []).map(function (r, ri) {
      return { key: r.key, name: r.name, gws: r.gws, legs: r.legs, index: ri, ties: [] };
    });
    if (!rounds.length) return null;
    if (drawn) rounds[0].ties = ties;
    // Later rounds are ties between the winners of the ties before them. A
    // side is named once its tie is decided, and reads as "winner of tie N"
    // until then.
    var count = ties.length;
    for (var r2 = 1; r2 < rounds.length; r2++) {
      count = Math.ceil(count / 2);
      var prevR = rounds[r2 - 1];
      for (var t = 0; t < count; t++) {
        rounds[r2].ties.push({
          n: t + 1, home: null, away: null,
          fromA: prevR.ties[t * 2] ? prevR.ties[t * 2].n : null,
          fromB: prevR.ties[t * 2 + 1] ? prevR.ties[t * 2 + 1].n : null,
          prevRound: prevR.name
        });
      }
    }

    /* Scoring a tie. Each leg is a gameweek and each side's score in it is
       the same net gameweek score every table uses. A leg being played is
       shown but not counted; the tie is decided once every one of its
       gameweeks has its points standing. Level on aggregate, the rules run
       the Last Manager tie-breakers over the tie's gameweeks — bench
       points, then goals, clean sheets and assists in the eleven that
       played — then group points, then group score. Level after all of that
       is the organiser's to settle, and the tie says so. */
    var scoredSet = {}; C.scoredGws(ds).forEach(function (g) { scoredSet[g] = 1; });
    var liveGw = C.liveGwId(ds);
    var inGroup = {};
    groups.forEach(function (g) {
      (g.table || []).forEach(function (t2) { inGroup[t2.id] = { pts: t2.pts || 0, gwPts: t2.gwPts || 0 }; });
    });
    function playTie(tie, gws) {
      tie.legs = gws.map(function (gw) {
        var sh = gwScore(ds, tie.home.id, gw), sa = gwScore(ds, tie.away.id, gw);
        return { gw: gw, home: sh, away: sa, scored: !!scoredSet[gw],
                 live: sh != null && liveGw === gw && !scoredSet[gw] };
      });
      var ah = 0, aw = 0, any = false;
      tie.legs.forEach(function (l) { if (l.home != null && l.away != null) { ah += l.home; aw += l.away; any = true; } });
      tie.aggregate = any ? { home: ah, away: aw } : null;
      if (!gws.every(function (g) { return scoredSet[g]; })) return;
      var pick = null, by = null;
      if (ah !== aw) { pick = ah > aw ? "home" : "away"; by = "aggregate"; }
      else {
        var bh = benchSum(ds, tie.home.id, gws), ba = benchSum(ds, tie.away.id, gws);
        if (bh !== ba) { pick = bh > ba ? "home" : "away"; by = "bench points"; }
        else {
          var xh = xiStats(ds, tie.home.id, gws), xa = xiStats(ds, tie.away.id, gws);
          if (xh.goals !== xa.goals) { pick = xh.goals > xa.goals ? "home" : "away"; by = "goals"; }
          else if (xh.cs !== xa.cs) { pick = xh.cs > xa.cs ? "home" : "away"; by = "clean sheets"; }
          else if (xh.assists !== xa.assists) { pick = xh.assists > xa.assists ? "home" : "away"; by = "assists"; }
          else {
            var gh = inGroup[tie.home.id] || {}, ga = inGroup[tie.away.id] || {};
            if ((gh.pts || 0) !== (ga.pts || 0)) { pick = (gh.pts || 0) > (ga.pts || 0) ? "home" : "away"; by = "group points"; }
            else if ((gh.gwPts || 0) !== (ga.gwPts || 0)) { pick = (gh.gwPts || 0) > (ga.gwPts || 0) ? "home" : "away"; by = "group score"; }
          }
        }
      }
      if (pick) { tie.winner = tie[pick]; tie.loser = tie[pick === "home" ? "away" : "home"]; tie.decidedBy = by; }
      else tie.level = true;
    }
    var champion = null, runnerUp = null;
    if (drawn) {
      rounds.forEach(function (r, ri) {
        if (ri > 0) {
          var prev = rounds[ri - 1];
          r.ties.forEach(function (tie) {
            var A = tie.fromA ? prev.ties[tie.fromA - 1] : null, B = tie.fromB ? prev.ties[tie.fromB - 1] : null;
            tie.home = A && A.winner ? A.winner : null;
            tie.away = B && B.winner ? B.winner : null;
            // an odd round: the tie without an opponent goes straight through
            if (tie.home && !tie.fromB) { tie.winner = tie.home; tie.bye = true; }
          });
        }
        r.ties.forEach(function (tie) {
          if (tie.home && tie.away) playTie(tie, r.gws);
          else if (ri === 0 && tie.home && !tie.away) { tie.winner = tie.home; tie.bye = true; }
        });
      });
      var fin = rounds[rounds.length - 1].ties[0];
      if (fin && fin.winner && !fin.bye) { champion = fin.winner; runnerUp = fin.loser || null; }
    }
    var lastGws = rounds[rounds.length - 1].gws || [];

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
      champion: champion, runnerUp: runnerUp,
      // decided once the final's points stand; settled once FPL has checked it
      settled: !!champion && lastGws.every(function (g) { return done[g]; }),
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
  // FPL projects the same percentage forward over the next few price runs, one
  // a day apart. Two readings fall out of that: how fast he is moving, and the
  // first run its own projection has him crossing the line. Both are taken from
  // the projected percentages rather than the hourly rate published beside them,
  // which is counted in transfers and so cannot be shown next to a percentage.
  function fromProjections(proj) {
    var out = { perHour: null, dueIn: null };
    if (!proj || !proj.length) return out;
    // Published as one percentage per run, in run order — but a dataset cached
    // before that carries [offset, percent, likelihood] triples, and a stale
    // copy in the browser's own store is exactly what this would meet.
    var pct = proj.map(function (x) { return (x && x.length) ? x[1] : x; });
    for (var i = 0; i < pct.length; i++) {
      if (Math.abs(pct[i]) >= 100) { out.dueIn = i; break; }
    }
    if (pct.length > 1) {
      var days = pct.length - 1;
      out.perHour = (pct[pct.length - 1] - pct[0]) / (days * 24);
    }
    return out;
  }

  // How close to a price change a player has to be before his card says so.
  // Every one of the 600-odd players carries a reading and the median is 28%,
  // so badging them all would put fifteen numbers on a pitch where, measured
  // across the league, fewer than one in seven squads holds a single player
  // whose price actually moves that night. Half way is where it starts to mean
  // something.
  var MOVE_MIN = 50;

  // FPL's own reading per player, kept as a lookup because a pitch wants
  // fifteen of them and priceTable builds six hundred.
  function priceMoves(ds) {
    if (ds && ds._pmv) return ds._pmv;
    var out = {}, f = (ds && ds.prices && ds.prices.fpl) || null;
    if (f && f.pct) {
      Object.keys(f.pct).forEach(function (id) {
        var pct = f.pct[id];
        if (!isFinite(pct)) return;
        var fwd = fromProjections(f.proj && f.proj[id]);
        out[id] = { pct: pct, dueIn: fwd.dueIn };
      });
    }
    if (ds) { try { Object.defineProperty(ds, "_pmv", { value: out, enumerable: false }); } catch (e) {} }
    return out;
  }

  /* ---- one match, both squads --------------------------------------------
     Every player of the two clubs with what he has scored this gameweek, from
     the same live points and provisional bonus the pitch cards read, so a
     player reads the same number here as on any squad that owns him. Who
     actually featured comes from the stored breakdown — a minutes line is only
     written for a player who has been on the pitch — so the ones who played
     lead and the rest sit under them. Before kick-off nobody has featured and
     the whole squad shows, ordered by price, which is the nearest thing to
     "who matters" that exists before a team sheet.

     A club that plays twice in a gameweek carries its gameweek total here; the
     published points are not split by fixture, and the page says so.  */
  C.matchSheet = function (ds, gw, home, away) {
    if (!ds || !ds.elements || !ds.gwFixtures) return null;
    gw = +gw;
    var fixtures = ds.gwFixtures[gw] || [];
    var f = fixtures.filter(function (x) { return x[0] === home && x[1] === away; })[0];
    if (!f) return null;
    var lp = liveAt(ds, gw), pb = bonusAt(ds, gw), bd = (ds.breakdown || {})[gw] || {};
    var eot = eoTable(ds, gw), names = ds.teamNames || {};
    var POS = { 1: "GK", 2: "DEF", 3: "MID", 4: "FWD" };
    var minutesOf = function (el) {
      var r = (bd[el] || []).filter(function (x) { return x[0] === "minutes"; })[0];
      return r ? +r[1] : null;
    };
    var side = function (club) {
      var players = Object.keys(ds.elements).filter(function (el) {
        return ds.elements[el][2] === club;
      }).map(function (el) {
        var m = ds.elements[el], prov = pb[el] || 0, base = (lp[el] || 0) + prov;
        return { el: +el, name: m[0], type: m[1], pos: POS[m[1]] || "", team: club,
                 pts: base, base: base, prov: prov, price: m[3] || 0, owned: m[4] || 0,
                 eo: (eot && eot.eo[el]) || 0, mins: minutesOf(el) };
      });
      var featured = players.filter(function (p) { return p.mins > 0; });
      var rest = players.filter(function (p) { return !(p.mins > 0); });
      featured.sort(function (a, b) {
        return (b.pts - a.pts) || (b.mins - a.mins) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
      });
      rest.sort(function (a, b) {
        return (b.price - a.price) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
      });
      var games = fixtures.filter(function (x) { return x[0] === club || x[1] === club; }).length;
      var total = 0; featured.forEach(function (p) { total += p.pts; });
      return { club: club, name: names[club] || club, featured: featured, rest: rest,
               total: total, games: games };
    };
    return {
      gw: gw,
      fixture: { home: home, away: away, started: !!f[2], done: !!(f[3] || f[8]),
                 hs: f[4], as: f[5], mins: f[6] || 0, ko: f[7] || null },
      home: side(home), away: side(away)
    };
  };

  /* ---- one footballer, gathered ------------------------------------------
     What a player's own page needs, in one pass. The history, the breakdown
     and the flag already have their own functions and are not repeated here;
     this is the header figures, where he ranks among his position, and the
     fixtures still to come.

     Form and points per match are FPL's own numbers rather than ours. Both
     could be worked out from what we hold, but FPL averages them over its own
     window, and a page showing 8.1 beside the official app's 8.2 is a page
     nobody trusts twice. The rank beside each is ours, because FPL publishes
     no such thing \u2014 it is a straight ordering of every player in that
     position, which is what "1 of 78" means in their app too.              */
  var PROF_POS = { 1: "Goalkeeper", 2: "Defender", 3: "Midfielder", 4: "Forward" };
  var PROF_POS_PL = { 1: "Goalkeepers", 2: "Defenders", 3: "Midfielders", 4: "Forwards" };

  C.playerProfile = function (ds, el, upcoming) {
    if (!ds || !ds.elements || !ds.elements[el]) return null;
    el = +el;
    var m = ds.elements[el], type = m[1], club = m[2];
    var own = C.leagueOwnership(ds);

    // Every player in the same position, so a rank can say what it is out of.
    var peers = [];
    Object.keys(ds.elements).forEach(function (id) {
      if (ds.elements[id][1] === type) peers.push(+id);
    });
    // Ties share a place, as a league table does: two men on 8.2 are both
    // second, and the next is fourth.
    var rankOf = function (pick) {
      var mine = pick(el);
      if (mine == null) return null;
      var better = 0;
      peers.forEach(function (id) {
        var v = pick(id);
        if (v != null && v > mine) better++;
      });
      return { rank: better + 1, of: peers.length };
    };
    var val = function (slot) {
      return function (id) {
        var e = ds.elements[id];
        return e && e[slot] != null ? +e[slot] : null;
      };
    };
    var figure = function (slot, digits) {
      var v = val(slot)(el), r = rankOf(val(slot));
      return { value: v == null ? null : +v.toFixed(digits == null ? 1 : digits),
               rank: r && r.rank, of: r && r.of };
    };

    // Fixtures he has still to play, soonest first.
    var fin = {};
    C.finishedGws(ds).forEach(function (g) { fin[g] = 1; });
    var ahead = [];
    Object.keys(ds.gwFixtures || {}).map(Number).sort(function (a, b) { return a - b; })
      .forEach(function (gw) {
        if (fin[gw]) return;
        (ds.gwFixtures[gw] || []).forEach(function (f) {
          if (f[0] !== club && f[1] !== club) return;
          // a fixture already played is behind him even if its gameweek is not
          // finished, which is every Sunday of a split gameweek
          if (f[3] || f[8]) return;
          var home = f[0] === club;
          ahead.push({ gw: gw, opp: home ? f[1] : f[0], home: home,
                       ko: f[7] || null,
                       // 1 to 5, and 0 where an older publish has no such slot
                       fdr: (home ? f[9] : f[10]) || 0 });
        });
      });

    // What he has scored all season, from our own per-gameweek record: FPL
    // publishes a season total, but ours is the sum of the weeks this app
    // actually holds, so the number agrees with the table underneath it.
    var lp = ds.livePoints || {}, total = 0, any = false;
    Object.keys(lp).forEach(function (g) {
      var v = lp[g][el];
      if (typeof v === "number") { total += v; any = true; }
    });

    return {
      el: el, name: m[0], full: m[5] || m[0], club: club,
      points: any ? total : null,
      pos: PROF_POS[type] || "", posPlural: PROF_POS_PL[type] || "",
      type: type,
      price: (m[3] || 0) / 10, start: (m[6] || 0) / 10,
      owned: m[4] || 0,
      goOwned: own ? (own.pct[el] == null ? null : own.pct[el]) : null,
      managers: own ? own.managers : 0,
      ppm: figure(9), form: figure(8),
      selected: (function () {
        var r = rankOf(val(4));
        return { value: m[4] || 0, rank: r && r.rank, of: r && r.of };
      })(),
      ahead: upcoming ? ahead.slice(0, +upcoming) : ahead
    };
  };

  /* ---- who is hurt, banned or a doubt -------------------------------------
     FPL publishes one snapshot: how a player stands today. There is no history
     of it, so a flag can only ever mean "as of now" \u2014 which is why a finished
     gameweek shows none. A knock picked up in September has nothing to say
     about a pitch from August, and drawing it there would be inventing a past
     that did not happen.

     Two chances are published and they mean different things. "This round" is
     the gameweek being played; "next round" is the one being picked. Before a
     deadline the second is the live question; once the round is under way the
     first is. Reading the wrong one flags the wrong men every Saturday, so the
     gameweek being looked at decides which is read.

     The severity bands are FPL's own, and the app's colours follow them:
     nothing at all for a fit player, yellow at 75, orange at 50 and 25, red
     for out.                                                               */
  C.availability = function (ds, el, gw) {
    if (!ds || !ds.flags) return null;
    var f = ds.flags[el] || ds.flags[String(el)];
    if (!f) return null;
    var status = f[0], news = f[3] || "", since = f[4] || null;

    var chance = null;
    if (gw != null) {
      gw = +gw;
      // A flag is about today. It belongs over the squad owned today — which
      // is the newest one there is, whether or not its gameweek has finished,
      // because that is the eleven a reader is deciding about. Looking back at
      // an earlier gameweek's pitch gets none: a knock picked up in September
      // has nothing to say about a pitch from August, and drawing it there
      // would be inventing a past that did not happen.
      var gws = C.squadGws(ds) || [];
      var latest = gws.length ? +gws[gws.length - 1] : null;
      if (latest != null && gw < latest) return null;
      // In play, the question is whether he is on the pitch; otherwise it is
      // whether to pick him next. FPL answers those with different fields.
      var live = C.liveGwId(ds);
      var playing = live != null && gw === +live;
      chance = playing ? f[1] : f[2];
      if (chance == null) chance = playing ? f[2] : f[1];
    } else {
      chance = f[2] == null ? f[1] : f[2];
    }

    // Out is out, whatever number sits beside it; a suspension has no
    // percentage and neither does a man who is not in the squad at all.
    var level;
    if (chance === 0 || status === "i" || status === "s" ||
        status === "u" || status === "n") level = "out";
    else if (chance === 25 || chance === 50) level = "major";
    else if (chance === 75) level = "minor";
    else if (status === "d") level = "minor";
    else return null;                       // fit, or nothing worth drawing

    return { level: level, status: status, chance: chance, news: news, since: since };
  };

  /* ---- what happened in a match -------------------------------------------
     FPL publishes a stats block against each fixture, split into the home
     side's players and the away side's. That split is the only record that
     survives a double gameweek: a club playing twice in one week has one set
     of gameweek totals and two matches, and nothing in the totals says which
     goal belonged to which. Working events out from a player's club and his
     club's fixture would put both in whichever match came first.

     What FPL does not publish, anywhere, is when. There is no minute against
     any of it, no substitutions and no half-time marker. So this answers what
     happened and cannot answer when, and it does not pair an assist to a goal
     either — the two are separate totals, and inventing the pairing would be
     inventing it.

     An own goal is credited by FPL to the man who put it in, who plays for the
     other side. It is listed here under the side it counted for, so the names
     under a score add up to that score, and it carries its own mark so nobody
     reads it as a transfer.                                                */
  var EV_RANK = { g: 0, a: 1, ps: 2, pm: 3, y: 4, r: 5 };

  C.matchEvents = function (ds, gw, home, away, me) {
    if (!ds || !ds.gwFixtures || !ds.gwEvents) return null;
    gw = +gw;
    var fixtures = ds.gwFixtures[gw] || [], idx = -1;
    for (var i = 0; i < fixtures.length; i++) {
      if (fixtures[i][0] === home && fixtures[i][1] === away) { idx = i; break; }
    }
    if (idx === -1) return null;
    // Events are stored positionally against the fixtures of the same publish,
    // so a shorter list means an older shape rather than a match without them.
    var perGw = ds.gwEvents[gw];
    if (!perGw || !perGw.length) return null;
    var raw = perGw[idx];
    if (!raw || !raw.length) return null;

    var els = ds.elements || {}, f = fixtures[idx];
    var own = C.leagueOwnership(ds, gw);
    var mine = {};
    if (me) {
      var pk = picksAt(ds, gw), sq = pk && pk[+me];
      if (sq && sq.p) sq.p.forEach(function (t) { mine[t[0]] = 1; });
    }

    var sides = { h: [], a: [] };
    raw.forEach(function (e) {
      if (!e || e.length < 3) return;
      var kind = e[1], el = +e[2], n = +e[3] || 1, m = els[el];
      if (!EV_RANK.hasOwnProperty(kind === "o" ? "g" : kind)) return;
      var scoredFor = e[0] === 0 ? "h" : "a";
      if (kind === "o") scoredFor = scoredFor === "h" ? "a" : "h";
      sides[scoredFor].push({
        k: kind === "o" ? "g" : kind,
        own: kind === "o",
        el: el,
        name: m ? m[0] : "Unknown player",
        n: n,
        count: own ? (own.count[el] || 0) : null,
        pct: own ? (own.pct[el] || 0) : null,
        mine: !!mine[el]
      });
    });
    var order = function (x, y) {
      return (EV_RANK[x.k] - EV_RANK[y.k]) ||
             (x.own === y.own ? 0 : x.own ? 1 : -1) ||
             (x.name < y.name ? -1 : x.name > y.name ? 1 : 0);
    };
    sides.h.sort(order); sides.a.sort(order);
    if (!sides.h.length && !sides.a.length) return null;

    // The names under a score should add up to it. When they do not — which
    // happens honestly while a match is in play, because the scoreline moves
    // before the stats behind it do — the page says so rather than letting a
    // reader count the names and doubt the app.
    var goalsIn = function (list) {
      var t = 0;
      list.forEach(function (x) { if (x.k === "g") t += x.n; });
      return t;
    };
    var gh = goalsIn(sides.h), ga = goalsIn(sides.a);
    var known = f[4] != null && f[5] != null;

    return {
      home: sides.h, away: sides.a,
      goals: { home: gh, away: ga },
      tallies: known ? (gh === +f[4] && ga === +f[5]) : null,
      done: !!(f[3] || f[8]),
      managers: own ? own.managers : 0
    };
  };

  /* ---- where everyone landed ---------------------------------------------
     The league's season totals as a distribution rather than a ladder. A
     table of 245 rows says who is where; this says what the field looks like,
     and where any one manager sits inside it.

     Totals are the same ones the Classic table is settled on — hits taken
     off, live gameweek included — so a bucket can never disagree with the
     standings.

     Ordered best band first, like the gameweek table of the same name.

     The bucket width is chosen from the spread rather than fixed: five points
     apart in August and fifty in May would both be useless, so it takes the
     roundest step that keeps the field inside fourteen rows. That holds all
     season — a 60-point spread in August buckets by five, a 1,200-point one
     in May by a hundred, and both come out around a dozen rows. */
  var BUCKET_STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500];

  C.pointsSpread = function (ds) {
    if (!ds || !ds.managers || !ds.managers.length) return null;
    var rows = C.classic(ds);
    var totals = rows.map(function (r) { return r.total || 0; });
    var lo = Math.min.apply(null, totals), hi = Math.max.apply(null, totals);
    var span = hi - lo;
    var width = BUCKET_STEPS[BUCKET_STEPS.length - 1];
    for (var i = 0; i < BUCKET_STEPS.length; i++) {
      // the finest step that still fits on a phone wins: a coarser one hides
      // where the field actually clusters
      if (Math.floor(span / BUCKET_STEPS[i]) + 1 <= 14) { width = BUCKET_STEPS[i]; break; }
    }
    var first = Math.floor(lo / width) * width;
    var last = Math.floor(hi / width) * width;
    var buckets = [];
    for (var v = first; v <= last; v += width) {
      buckets.push({ from: v, to: v + width - 1, n: 0, pct: 0, names: [] });
    }
    var at = function (t) { return Math.floor((t - first) / width); };
    rows.forEach(function (r) {
      var b = buckets[at(r.total || 0)];
      if (b) { b.n++; b.names.push({ id: r.id, name: r.entryName }); }
    });
    var most = 0;
    buckets.forEach(function (b) {
      b.pct = Math.round((b.n / rows.length) * 1000) / 10;
      if (b.n > most) most = b.n;
    });
    // The median is the honest middle of a skewed field, which an average of
    // season totals is not.
    var sorted = totals.slice().sort(function (a, b) { return a - b; });
    var mid = Math.floor(sorted.length / 2);
    var median = sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
    // Best band first, the way the gameweek's own version of this table reads:
    // a league table starts at the top, and so should a picture of one.
    buckets.reverse();
    return { buckets: buckets, width: width, most: most, count: rows.length,
             low: lo, high: hi, median: median,
             leader: { id: rows[0].id, name: rows[0].entryName, total: rows[0].total } };
  };

  /* ---- next gameweek's squad, before the deadline publishes it -----------
     Last settled squad, plus the transfers logged against the coming
     gameweek, applied in the order they were made. A wildcard is thirty-odd
     of those resolving to a completely new fifteen; churn — a player bought
     and sold again the same week — cancels out on its own, because applying
     the moves in order is what a manager actually did.

     What this is: the fifteen he will own. What it is not: the eleven, the
     captain, or the bench order. None of those are in the transfer log, and
     the page says so rather than drawing a formation it cannot know. */
  // The fifteen a manager owns right now, as element ids. Prices move overnight
  // on what is held today, so a transfer already made for the next gameweek
  // counts and the squad that played last gameweek does not: the pending squad
  // wins where there is one. Returns null when we hold no squad for him at all,
  // which the caller must tell apart from an empty one.
  C.mySquadIds = function (ds, id) {
    if (!ds || !id) return null;
    id = +id;
    var pend = C.pendingSquad(ds, id);
    if (pend && pend.squad && pend.squad.length) {
      return pend.squad.map(function (c) { return +c.el; });
    }
    var sq = ds.picks && ds.picks[ds.pitchGw] && ds.picks[ds.pitchGw][id];
    if (sq && sq.p && sq.p.length) return sq.p.map(function (t) { return +t[0]; });
    return null;
  };

  C.pendingSquad = function (ds, id) {
    var p = ds && ds.pending;
    if (!p || !p.gw || !p.moves) return null;
    var base = ds.picks && ds.picks[p.gw - 1] && ds.picks[p.gw - 1][id];
    if (!base || !base.p || !base.p.length) return null;
    var log = p.moves[id] || [];
    if (!log.length) return null;

    var was = base.p.map(function (pk) { return pk[0]; });
    var now = was.slice();
    var applied = 0;
    log.forEach(function (mv) {
      var i = now.indexOf(mv[1]);
      if (i === -1) return;           // out of step with the squad we hold
      now[i] = mv[0]; applied++;
    });
    if (!applied) return null;

    var els = ds.elements || {}, POS = { 1: "GK", 2: "DEF", 3: "MID", 4: "FWD" };
    var moves = priceMoves(ds);
    var wasSet = {}; was.forEach(function (e) { wasSet[e] = 1; });
    var nowSet = {}; now.forEach(function (e) { nowSet[e] = 1; });
    var card = function (el) {
      var m = els[el] || ["?", 0, "", 0, 0];
      // The same reading, and the same threshold, the pitch cards use: a
      // player is only said to be near a price change when he actually is.
      var pm = moves[el], move = null;
      if (pm && isFinite(pm.pct) && Math.abs(pm.pct) >= MOVE_MIN) {
        var mag = Math.abs(pm.pct);
        move = { pct: pm.pct, mag: mag, up: pm.pct >= 0,
                 soon: pm.dueIn === 0 || mag >= 100 };
      }
      return { el: +el, name: m[0], type: m[1], pos: POS[m[1]] || "", team: m[2],
               price: m[3] || 0, owned: m[4] || 0, move: move,
               isNew: !wasSet[el] };
    };
    var squad = now.map(card);
    squad.sort(function (a, b) {
      return (a.type - b.type) || (b.price - a.price) ||
             (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    });
    var ins = now.filter(function (e) { return !wasSet[e]; }).map(card);
    var outs = was.filter(function (e) { return !nowSet[e]; }).map(card);
    var value = 0; squad.forEach(function (c) { value += c.price; });
    return { gw: p.gw, at: p.at, squad: squad, ins: ins, outs: outs,
             // what actually changed, not how many times he changed his mind
             changed: ins.length, logged: log.length, value: value };
  };

  /* ---- gameweek status ---------------------------------------------------
     Where each gameweek has got to, read from the same published flags every
     other page reads, so this can never tell a different story from the
     scoreboard or the tables. Six steps, in the order they actually happen:

       lock    the deadline has passed and squads are set
       ko      at least one match has kicked off
       ft      every match has reached full time
       bonus   FPL has confirmed the bonus on every match
       final   FPL has finalised the gameweek (finished and data-checked)
       squads  we hold the settled squads for it

     The last one is ours, not FPL's, and it is here on purpose: it is the
     difference between FPL being done with a gameweek and this app having
     caught up with it.

     Full time is finished_provisional — the final whistle — which is a
     different moment from bonus being confirmed, and the two are separate
     rows because on a real gameweek they are hours apart. */
  C.GW_STEPS = [
    { k: "lock",   t: "Deadline passed, squads set" },
    { k: "ko",     t: "First match kicked off" },
    { k: "ft",     t: "Every match at full time" },
    { k: "bonus",  t: "Bonus confirmed on every match" },
    { k: "squads", t: "Auto subs stored here" },
    { k: "final",  t: "Gameweek finalised by FPL" }
  ];

  /* The Gameweek tab's tiles, for every gameweek at once: what a tile shows
     for one week, as a series across the season, so a tap on it can draw the
     season. Read through highlights() itself — the same numbers the tiles
     print, never a second arithmetic — and kept for the dataset, since a
     season is thirty-eight of them. */
  var _gws = { key: null, val: null };
  C.SERIES = {
    top:       { label: "Top score",            unit: "pts" },
    low:       { label: "Lowest score",         unit: "pts" },
    average:   { label: "League average",       unit: "pts" },
    topQuarter:{ label: "A good week was",      unit: "pts", note: "the top quarter started here" },
    aboveAvg:  { label: "Beat the average",     unit: "managers" },
    beatFpl:   { label: "Beat FPL\u2019s average", unit: "managers" },
    mostBench: { label: "Most benched",         unit: "pts" },
    benchTotal:{ label: "Benched across the league", unit: "pts" },
    climb:     { label: "Biggest climb",        unit: "places" },
    fall:      { label: "Biggest fall",         unit: "places" },
    potw:      { label: "Player of the week",   unit: "pts" },
    bestCap:   { label: "Best captain",         unit: "pts", note: "after doubling" },
    worstCap:  { label: "Captain to forget",    unit: "pts", note: "after doubling" },
    bestDiff:  { label: "Best differential",    unit: "pts", note: "owned by under 10% of the league" }
  };
  C.gwSeries = function (ds) {
    if (!ds || !ds.bootstrap) return null;
    var gws = (ds.bootstrap.events || []).filter(function (e) { return e.finished || e.is_current; })
      .map(function (e) { return e.id; });
    var key = (ds.updatedAt || "") + "|" + gws.join(",");
    if (_gws.key === key) return _gws.val;
    var live = C.liveGwId(ds);
    var out = {};
    Object.keys(C.SERIES).forEach(function (k) { out[k] = []; });
    gws.forEach(function (g) {
      var H = C.highlights(ds, g);
      var s = H && H.gwStats, q = H && H.squads;
      var pt = function (k, v, who, id) {
        out[k].push({ gw: g, v: (typeof v === "number" ? v : null), who: who || "", id: id || null, live: g === live });
      };
      if (s) {
        pt("top", s.top && s.top.p, s.top && s.top.name, s.top && s.top.id);
        pt("low", s.low && s.low.p, s.low && s.low.name, s.low && s.low.id);
        pt("average", s.average, s.count + " managers");
        pt("topQuarter", s.topQuarter, "bottom quarter " + s.bottomQuarter + " or less");
        pt("aboveAvg", s.aboveAvg, "of " + s.count);
        pt("beatFpl", s.fplAverage === null ? null : s.beatFpl, s.fplAverage === null ? "" : "FPL average " + s.fplAverage);
        pt("mostBench", s.mostBench && s.mostBench.bench, s.mostBench && s.mostBench.name, s.mostBench && s.mostBench.id);
        pt("benchTotal", s.benchTotal, s.benchAvg + " each on average");
        pt("climb", s.biggestClimb ? s.biggestClimb.move : null, s.biggestClimb && s.biggestClimb.name, s.biggestClimb && s.biggestClimb.id);
        pt("fall", s.biggestFall ? s.biggestFall.move : null, s.biggestFall && s.biggestFall.name, s.biggestFall && s.biggestFall.id);
      } else {
        ["top","low","average","topQuarter","aboveAvg","beatFpl","mostBench","benchTotal","climb","fall"].forEach(function (k) { pt(k, null); });
      }
      pt("potw", H && H.potw ? H.potw.pts : null, H && H.potw ? H.potw.name : "");
      pt("bestCap", q && q.bestCaptain ? q.bestCaptain.pts * 2 : null, q && q.bestCaptain ? q.bestCaptain.name : "");
      pt("worstCap", q && q.worstCaptain ? q.worstCaptain.pts * 2 : null, q && q.worstCaptain ? q.worstCaptain.name : "");
      pt("bestDiff", q && q.differentials && q.differentials[0] ? q.differentials[0].pts : null,
         q && q.differentials && q.differentials[0] ? q.differentials[0].name + " \u00b7 " + q.differentials[0].ownedPct + "%" : "");
    });
    _gws = { key: key, val: { gws: gws, series: out } };
    return _gws.val;
  };

  C.gwStatus = function (ds, now) {
    if (!ds || !ds.bootstrap || !ds.bootstrap.events) return null;
    if (!now && ds._gws) return ds._gws;
    var at = now || Date.now();
    var fin = ds.picksFinal || {}, all = ds.gwFixtures || {};
    var live = C.liveGwId(ds), cur = C.currentGw(ds);
    var rows = ds.bootstrap.events.map(function (e) {
      var fx = all[e.id] || [];
      var dl = e.deadline_time ? Date.parse(e.deadline_time) : null;
      // A gameweek with no published fixtures cannot have played any, so the
      // match steps stay open rather than reading as vacuously done.
      var ko = fx.some(function (f) { return f[2]; });
      // The deadline is the one step read off the device's own clock rather
      // than FPL's flags, so a phone set wrong could otherwise show a gameweek
      // being played before it locked. A match that has kicked off settles it.
      var lock = ko || (dl != null && dl <= at);
      var ft = fx.length > 0 && fx.every(function (f) { return f[3] || f[8]; });
      var bonus = fx.length > 0 && fx.every(function (f) { return f[3]; });
      var final = !!(e.finished && e.data_checked);
      var squads = !!fin[e.id];
      var steps = { lock: lock, ko: ko, ft: ft, bonus: bonus, final: final, squads: squads };
      // A gameweek is played across two or three days, and each of those days
      // reaches full time and then has its bonus confirmed on its own. Grouped
      // by the local date of kick-off, which is the day a person watched it.
      var days = [], seen = {};
      fx.forEach(function (f) {
        var d = f[7] ? new Date(f[7]) : null;
        var key = d ? (d.getFullYear() + "-" + d.getMonth() + "-" + d.getDate()) : "tbc";
        var slot = seen[key];
        if (!slot) {
          slot = seen[key] = { key: key, ko: f[7] || null, n: 0, started: 0, ft: 0, bonus: 0 };
          days.push(slot);
        }
        slot.n++;
        if (f[2]) slot.started++;
        if (f[3] || f[8]) slot.ft++;
        if (f[3]) slot.bonus++;
        if (f[7] && (!slot.ko || f[7] < slot.ko)) slot.ko = f[7];
      });
      days.sort(function (a, b) {
        if (!a.ko) return 1;
        if (!b.ko) return -1;
        return a.ko < b.ko ? -1 : a.ko > b.ko ? 1 : 0;
      });
      days.forEach(function (d) {
        d.state = d.bonus === d.n ? "confirmed"
                : d.ft === d.n ? "ft"
                : d.started ? "live" : "ahead";
        d.done = d.state === "confirmed";
      });
      var done = 0;
      C.GW_STEPS.forEach(function (st) { if (steps[st.k]) done++; });
      var kos = fx.map(function (f) { return f[7]; }).filter(Boolean).sort();
      return { gw: e.id, name: e.name || ("Gameweek " + e.id), deadline: e.deadline_time || null,
               firstKo: kos[0] || null, lastKo: kos[kos.length - 1] || null,
               stamps: (ds.gwStamps || {})[e.id] || {},
               fixtures: fx.length, days: days,
               played: fx.filter(function (f) { return f[3] || f[8]; }).length,
               steps: steps, done: done, total: C.GW_STEPS.length,
               live: live === e.id, current: cur === e.id };
    }).sort(function (a, b) { return a.gw - b.gw; });
    var res = { rows: rows, live: live, current: cur,
                at: rows.filter(function (r) { return r.steps.lock && !r.steps.final; })[0] || null };
    if (!now && ds) { try { Object.defineProperty(ds, "_gws", { value: res, enumerable: false }); } catch (e) {} }
    return res;
  };

  /* ---- when each milestone happened, or is expected ----------------------
     Three different kinds of answer, and the page says which is which:

       published  the deadline and the first kick-off, exact, FPL's own
       recorded   we watched it happen, accurate to the ten minutes between
                  updates (see gwStamps in scripts/fetch-data.js)
       expected   not yet, so worked out from what we have watched before

     A match lasts about two hours, so full time is the last kick-off plus
     that. Bonus and finalising are not a fixed wait after the whistle — a
     gameweek ending Sunday teatime had neither by the following dawn — they
     land at a time of day, the morning and the afternoon after. So the
     estimate is the next occurrence of the median time of day we have
     actually recorded, and the number of gameweeks behind it travels with it
     so the page can say how much to trust it.

     With nothing recorded there is no estimate, and the page says nothing
     rather than inventing one. */
  var MATCH_MS = 2 * 3600 * 1000;
  var DAY_MS = 24 * 3600 * 1000;

  function medianTimeOfDay(stamps) {
    // Averaging clock times across midnight is a trap, but every observation
    // of these steps is a daytime one, so a plain median over milliseconds
    // past midnight UTC is honest here.
    var mins = stamps.map(function (iso) {
      var d = new Date(iso);
      return ((d.getUTCHours() * 60 + d.getUTCMinutes()) * 60 + d.getUTCSeconds()) * 1000;
    }).sort(function (a, b) { return a - b; });
    if (!mins.length) return null;
    var mid = Math.floor(mins.length / 2);
    return mins.length % 2 ? mins[mid] : Math.round((mins[mid - 1] + mins[mid]) / 2);
  }
  function nextAt(afterMs, msIntoDay) {
    var d = new Date(afterMs);
    var day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    var t = day + msIntoDay;
    while (t <= afterMs) t += DAY_MS;
    return t;
  }

  C.gwTimes = function (ds, row) {
    if (!ds || !row) return null;
    // A stamp is only honoured while the step it belongs to is still true. FPL
    // can take a flag back — a postponement after the whistle would do it —
    // and a step reading "not yet" beside the time it happened is a worse
    // answer than an estimate.
    var done = row.steps || {}, out = {};
    var stamps = {};
    Object.keys(row.stamps || {}).forEach(function (k) { if (done[k]) stamps[k] = row.stamps[k]; });
    var put = function (k, iso, kind, n) {
      out[k] = { at: iso, kind: kind, basis: n || 0 };
    };
    // What other gameweeks have shown us about the steps we cannot read off a
    // fixture list. This gameweek's own stamps are left out: a step it has
    // already reached is reported, not predicted.
    var seen = { bonus: [], final: [], squads: [] };
    Object.keys(ds.gwStamps || {}).forEach(function (g) {
      if (+g === +row.gw) return;
      var st = ds.gwStamps[g];
      Object.keys(seen).forEach(function (k) { if (st[k]) seen[k].push(st[k]); });
    });

    put("lock", row.deadline, row.deadline ? "published" : null);
    put("ko", row.firstKo, row.firstKo ? "published" : null);
    if (stamps.ft) put("ft", stamps.ft, "recorded");
    else if (row.lastKo) put("ft", new Date(Date.parse(row.lastKo) + MATCH_MS).toISOString(), "expected");
    else put("ft", null, null);

    var whistle = out.ft && out.ft.at ? Date.parse(out.ft.at) : null;
    ["bonus", "final", "squads"].forEach(function (k) {
      if (stamps[k]) { put(k, stamps[k], "recorded"); return; }
      var tod = medianTimeOfDay(seen[k]);
      if (tod == null || whistle == null) { put(k, null, null); return; }
      put(k, new Date(nextAt(whistle, tod)).toISOString(), "expected", seen[k].length);
    });
    return out;
  };

  /* ---- the Premier League table ----------------------------------------
     Built from the same published fixtures the scoreboard and the pitch cards
     read, so the two can never disagree: a result the scoreboard shows is a
     result the table has counted. Nothing extra is fetched for it.

     A match counts once the final whistle has gone — finished_provisional —
     rather than once FPL has folded the bonus in, which is a fantasy
     bookkeeping step and not a football one. A game in play is therefore not
     yet in the table, which is how every league table behaves.

     Order is points, then goal difference, then goals scored. Teams level on
     all three share a position and the next one is skipped, exactly as the
     league publishes it: two teams tied for 19th, and no 20th.  */
  C.plTable = function (ds) {
    if (ds && ds._plt) return ds._plt;
    var all = (ds && ds.gwFixtures) || null;
    if (!all) return null;
    var names = (ds && ds.teamNames) || {};
    var byTeam = {};
    var seat = function (t) {
      return byTeam[t] || (byTeam[t] = { team: t, name: names[t] || t,
        mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, last5: [] });
    };
    // Every club that has a fixture anywhere in the season gets a row, so the
    // table is twenty deep from the first day rather than filling up as clubs
    // happen to play.
    Object.keys(all).forEach(function (gw) {
      (all[gw] || []).forEach(function (f) {
        if (f && f[0]) seat(f[0]);
        if (f && f[1]) seat(f[1]);
      });
    });
    // Chronological, so "last five" means the last five actually played and
    // not the last five the gameweek numbering happens to list.
    var played = [];
    Object.keys(all).forEach(function (gw) {
      (all[gw] || []).forEach(function (f) {
        if (!f || !f[0] || !f[1]) return;
        if (!(f[3] || f[8])) return;                    // not full time yet
        if (f[4] == null || f[5] == null) return;       // no score published
        played.push({ gw: +gw, at: f[7] || "", h: f[0], a: f[1], hs: +f[4], as: +f[5] });
      });
    });
    played.sort(function (x, y) {
      return (x.at < y.at ? -1 : x.at > y.at ? 1 : 0) || (x.gw - y.gw);
    });
    played.forEach(function (m) {
      var H = seat(m.h), A = seat(m.a);
      H.mp++; A.mp++;
      H.gf += m.hs; H.ga += m.as;
      A.gf += m.as; A.ga += m.hs;
      if (m.hs > m.as) { H.w++; A.l++; H.pts += 3; H.last5.push("W"); A.last5.push("L"); }
      else if (m.hs < m.as) { A.w++; H.l++; A.pts += 3; A.last5.push("W"); H.last5.push("L"); }
      else { H.d++; A.d++; H.pts++; A.pts++; H.last5.push("D"); A.last5.push("D"); }
    });
    var rows = Object.keys(byTeam).map(function (t) {
      var r = byTeam[t];
      r.gd = r.gf - r.ga;
      r.last5 = r.last5.slice(-5);
      return r;
    });
    rows.sort(function (a, b) {
      return (b.pts - a.pts) || (b.gd - a.gd) || (b.gf - a.gf) ||
             (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    });
    // Joint where the three ordered measures are all level; alphabetical order
    // decides who is printed first but does not separate them.
    var pos = 0, prev = null;
    rows.forEach(function (r, i) {
      var key = r.pts + "/" + r.gd + "/" + r.gf;
      if (key !== prev) { pos = i + 1; prev = key; }
      r.pos = pos;
      r.joint = false;
    });
    rows.forEach(function (r) {
      var same = rows.filter(function (o) { return o.pos === r.pos; });
      if (same.length > 1) r.joint = true;
    });
    var res = { rows: rows, played: played.length, teams: rows.length };
    if (ds) { try { Object.defineProperty(ds, "_plt", { value: res, enumerable: false }); } catch (e) {} }
    return res;
  };

  /* Every player's season in one table.

     The gameweek points are already published, the breakdowns behind them say
     how long each man was on the pitch, and the league's own squads say who
     owns and captains him here rather than in FPL at large. Ten leaderboards
     read off this one pass, so none of them can disagree with another about
     what a player scored. */
  C.playerStats = function (ds) {
    if (!ds || !ds.elements) return null;
    if (ds._pst) return ds._pst;
    var els = ds.elements;
    var lp = ds.livePoints || {};
    var bd = ds.breakdown || {};
    var pr = ds.prices || {};
    var own = C.leagueOwnership(ds);
    var gws = Object.keys(lp).map(Number).filter(function (g) { return g > 0; })
      .sort(function (a, b) { return a - b; });
    if (!gws.length) return null;
    // Form is the last three gameweeks that exist, so it means something from
    // the third week rather than waiting for a full window.
    var recent = gws.slice(-3);

    // Who captained whom, gameweek by gameweek. A captaincy is worth reporting
    // by what it actually returned, and that differs per gameweek, so the
    // count is kept per gameweek and folded in at the end.
    var capBy = {};
    gws.forEach(function (g) {
      var pk = (ds.picks || {})[g];
      if (!pk) return;
      Object.keys(pk).forEach(function (mid) {
        var sq = pk[mid] && pk[mid].p;
        if (!sq) return;
        for (var i = 0; i < sq.length; i++) {
          if (sq[i][2]) {
            var el = sq[i][0];
            (capBy[el] = capBy[el] || {})[g] = (capBy[el][g] || 0) + 1;
            break;
          }
        }
      });
    });

    var hasNow = !!pr.now;
    var rows = Object.keys(els).map(function (key) {
      var id = +key, meta = els[key] || [];
      var pts = 0, form = 0, mins = 0, bonus = 0, starts = 0, goals = 0, assists = 0;
      var best = null;
      gws.forEach(function (g) {
        var p = (lp[g] || {})[id];
        if (p == null) return;
        pts += p;
        if (recent.indexOf(g) !== -1) form += p;
        if (best == null || p > best.pts) best = { gw: g, pts: p };
        var lines = (bd[g] || {})[id];
        if (!lines) return;
        // A double gameweek gives a man two of every line, so minutes add up
        // but the gameweek itself is still one gameweek played.
        var on = 0;
        lines.forEach(function (ln) {
          if (ln[0] === "minutes") { mins += ln[1] || 0; on += ln[1] || 0; }
          else if (ln[0] === "bonus") bonus += ln[2] || 0;
          else if (ln[0] === "goals_scored") goals += ln[1] || 0;
          else if (ln[0] === "assists") assists += ln[1] || 0;
        });
        if (on > 0) starts++;
      });
      var price = ((hasNow && pr.now[id] != null) ? pr.now[id] : (meta[3] || 0)) / 10;
      var start = (meta[6] != null ? meta[6] : meta[3] || 0) / 10;
      var caps = 0, capReturn = 0;
      var mine = capBy[id];
      if (mine) {
        Object.keys(mine).forEach(function (g) {
          var n = mine[g];
          caps += n;
          capReturn += n * (((lp[g] || {})[id]) || 0);
        });
      }
      return {
        id: id, name: meta[0] || "?", full: meta[5] || "",
        type: meta[1] || 0, pos: PPOS[meta[1]] || "", team: meta[2] || "",
        price: price, start: start, rise: Math.round((price - start) * 10) / 10,
        owned: (pr.owned && pr.owned[id] != null) ? pr.owned[id] : (meta[4] || 0),
        goOwned: own ? (own.pct[id] || 0) : null,
        goCount: own ? (own.count[id] || 0) : null,
        pts: pts, form: form, mins: mins, bonus: bonus, starts: starts,
        goals: goals, assists: assists, ga: goals + assists,
        best: best,
        // Points per million is what he costs you now, not what he cost
        // whoever bought him early — that is the number a transfer turns on.
        ppm: price > 0 ? Math.round((pts / price) * 10) / 10 : null,
        caps: caps,
        capAvg: caps ? Math.round((capReturn / caps) * 10) / 10 : null
      };
    });

    var res = { rows: rows, gws: gws, recent: recent,
                managers: own ? own.managers : 0 };
    try { Object.defineProperty(ds, "_pst", { value: res, enumerable: false }); } catch (e) {}
    return res;
  };

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
    // FPL publishes its own figure for every player: how far along he is, signed,
    // with 100 the line. Ours was a reconstruction of it from transfer counts and
    // tracked it at a correlation of 0.47 — flagging 57 players to change on a
    // night FPL itself named 8. Where the game says, the game is used, and the
    // measured model below stays only for data captured before we read it.
    var fpl = (pr.fpl && pr.fpl.pct) || null;
    var projs = (pr.fpl && pr.fpl.proj) || null;
    // the most recent recorded change per player, so a move that has already
    // happened is shown as fact rather than as pressure
    var last = {};
    ((ds && ds.priceLog) || []).forEach(function (r) { last[r[0]] = r; });
    return Object.keys(els).map(function (id) {
      var meta = els[id] || ["?", 0, "", 0, 0];
      var owned = (pr.owned && pr.owned[id] != null) ? pr.owned[id] : (meta[4] || 0);
      var net = (pr.netSince && pr.netSince[id]) || 0;
      var fplOwners = playing
        ? Math.max(thr.floor || 0, Math.round((owned / 100) * playing)) : 0;
      // Whether the flow behind this player covers the whole run-up to his next
      // change, or only the part since we started watching him. FPL's own
      // figure carries no such doubt.
      var said = fpl && fpl[id] != null && isFinite(fpl[id]) ? fpl[id] : null;
      var sure = said != null || !pr.exact || pr.exact[id] !== 0;
      var mine = (has && fplOwners) ? thr.progressOf(fplOwners, net) : null;
      var move = said != null ? said : mine;
      // FPL will not move a locked price whatever the flow behind it, and says
      // so; and it marks a figure it has not finished working out.
      var lock = (pr.fpl && pr.fpl.lock && pr.fpl.lock[id]) || null;
      var calibrating = !!(pr.fpl && pr.fpl.cal && pr.fpl.cal[id]);
      var fwd = fromProjections(projs && projs[id]);
      return {
        id: +id, name: meta[0], full: meta[5] || "",
        type: meta[1], pos: PPOS[meta[1]] || "", team: meta[2],
        price: ((has && pr.now[id] != null) ? pr.now[id] : (meta[3] || 0)) / 10,
        owned: owned,
        goOwned: own ? (own.pct[id] || 0) : null,
        net: net,
        atLeast: !sure,
        // What the table is ordered by. Once the bars are measured that is how
        // far along his own bar he is, so the order and the bars are the same
        // reading and sorting the column cannot disagree with what it draws.
        // Before then it is the raw flow against his ownership, which orders
        // the two directions on one scale without claiming a distance.
        pressure: move != null ? move
          : ((has && fplOwners && !thr.measured) ? net / fplOwners : null),
        // null, not zero, when there is nothing to work it out from: an empty
        // bar would claim he is going nowhere, which we would not know.
        progress: move,
        // where the figure came from, so the table can say so rather than let
        // a reader assume the game published a number we worked out ourselves
        told: said != null,
        lockedUntil: lock,
        calibrating: calibrating,
        // percentage points an hour, signed the same way the bar is
        perHour: fwd.perHour,
        // 0 tonight, 1 tomorrow, 2 the night after; null if its own projection
        // does not reach the line inside that window
        dueIn: fwd.dueIn
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

  // A rise and a fall are not the same shape, and treating them as one number
  // each was this model's real weakness.
  //
  // Every reading below was graded the same way, and not on the changes it was
  // fitted to: the updater publishes a snapshot every ten minutes, so for each
  // night that prices actually moved there is a snapshot from minutes before it
  // ran. Ranking that snapshot and comparing against the night's real changes
  // is a straight hold-out test, and it is what these numbers are.
  //
  //   A RISE needs a roughly fixed number of net transfers in, whoever owns
  //   him — which is what the ownership fit was groping towards when it landed
  //   on an exponent of -1.03 on the ratio, i.e. count. Ranking on the count
  //   itself put the real risers at the top of the table on every night
  //   measured; across five nights the bar flagged 11 players and 9 of them
  //   rose.
  //
  //   A FALL scales with ownership, but with the three-quarter power, not the
  //   whole. Plain net-per-owner — what this used before — left the typical
  //   faller 38th in the table; the three-quarter power puts him 30th and more
  //   than doubles how often a night's real fallers come out on top, 11% to
  //   24%. Falls remain much the harder half to call: the bar catches a little
  //   under half of them and flags about twice as many players as move. That
  //   is the honest state of it, not a target we are hiding from.
  var FALL_POW = 0.75;
  // FPL publishes ownership to one decimal place, so everyone under 0.05% of
  // the game reads as zero — and about one fall in five lands on such a player,
  // who until now had no bar at all because the sum divided by nothing. Put the
  // middle of that rounding band under them instead.
  var OWN_FLOOR = 0.00025;

  function ownerFloor(ds) {
    var total = Number(ds && ds.prices && ds.prices.total) || 0;
    return total ? Math.round(total * OWN_FLOOR) : 0;
  }

  C.priceThreshold = function (ds) {
    if (ds && ds._thr) return ds._thr;
    var fl = ownerFloor(ds), up = [], down = [];
    ((ds && ds.priceLog) || []).forEach(function (r) {
      // entries logged before the updater kept the pressure carry only 4 fields
      if (!r || r.length < 6) return;
      var net = r[4], owners = Math.max(fl, r[5] || 0);
      if (!owners || !isFinite(net)) return;
      // Each direction is measured in its own units, because each answers to a
      // different thing: a rise to a count, a fall to a count against ownership.
      if (r[2] > r[1]) { if (net > 0) up.push(net); }
      else { if (net < 0) down.push(-net / Math.pow(owners, FALL_POW)); }
    });
    var res = {
      rise: median(up), fall: median(down),
      risen: up.length, fell: down.length,
      floor: fl, fallPow: FALL_POW,
      // Both directions must be measured before a percentage means anything in
      // both: one side alone would leave half the table drawn against nothing
      // while the table claimed to know.
      measured: (up.length + down.length) >= ENOUGH && up.length > 0 && down.length > 0
    };
    res.riseAt = res.measured ? res.rise : null;   // net transfers in
    res.fallAt = res.measured ? res.fall : null;   // net out over owners^0.75
    // The reading a player is judged on, in the units of whichever bar applies
    // to him. Signed, so the sign still says which way he is going.
    res.scoreOf = function (owners, net) {
      if (!net) return 0;
      if (net > 0) return net;                      // a rise answers to the count
      var own = Math.max(fl, owners || 0);          // a fall to the count over ownership
      return own ? net / Math.pow(own, FALL_POW) : null;
    };
    // And how far along that bar he is, as one percentage for both directions
    // so the column means the same thing all the way down.
    res.progressOf = function (owners, net) {
      if (!res.measured) return null;
      var s = res.scoreOf(owners, net);
      if (s == null) return null;
      var at = net > 0 ? res.riseAt : res.fallAt;
      return at ? (s / at) * 100 : null;
    };
    if (ds) { try { Object.defineProperty(ds, "_thr", { value: res, enumerable: false }); } catch (e) {} }
    return res;
  };

    // Changes we have actually recorded, newest first. FPL publishes no history,



  window.GO_COMPUTE = C;
})();
