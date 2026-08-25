/* ==========================================================================
   Store: settings + admin overrides (localStorage) and the pulled dataset
   (IndexedDB, since it can hold ~245 managers x 38 gameweeks). Also handles
   import/export of a single shareable JSON bundle and the throttled refresh
   that populates the dataset from the FPL API.
   ========================================================================== */
(function () {
  "use strict";

  var LS_CONFIG = "go12.config";
  var LS_OVERRIDES = "go12.overrides";
  var IDB_NAME = "go12";
  var IDB_STORE = "kv";
  var DATASET_KEY = "dataset";

  /* ---- tiny IndexedDB kv ------------------------------------------------- */
  function idb() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = function () {
        req.result.createObjectStore(IDB_STORE);
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }
  function idbGet(key) {
    return idb().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction(IDB_STORE, "readonly");
        var r = tx.objectStore(IDB_STORE).get(key);
        r.onsuccess = function () { res(r.result); };
        r.onerror = function () { rej(r.error); };
      });
    });
  }
  function idbSet(key, val) {
    return idb().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction(IDB_STORE, "readwrite");
        tx.objectStore(IDB_STORE).put(val, key);
        tx.oncomplete = function () { res(true); };
        tx.onerror = function () { rej(tx.error); };
      });
    });
  }

  /* ---- deep merge (plain objects only; arrays replaced) ------------------ */
  function merge(base, over) {
    if (over === undefined || over === null) return clone(base);
    if (Array.isArray(base) || Array.isArray(over) || typeof base !== "object" || typeof over !== "object") {
      return clone(over);
    }
    var out = {};
    Object.keys(base).forEach(function (k) { out[k] = clone(base[k]); });
    Object.keys(over).forEach(function (k) {
      out[k] = (k in base) ? merge(base[k], over[k]) : clone(over[k]);
    });
    return out;
  }
  function clone(v) { return (v && typeof v === "object") ? JSON.parse(JSON.stringify(v)) : v; }

  function lsGet(key) {
    try { var s = localStorage.getItem(key); return s ? JSON.parse(s) : null; }
    catch (e) { return null; }
  }
  function lsSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch (e) { return false; }
  }

  /* ---- Store ------------------------------------------------------------ */
  var _dataset = null;      // in-memory cache of the dataset
  var _configOverride = lsGet(LS_CONFIG) || {};
  var _overrides = lsGet(LS_OVERRIDES) || {};

  var STORE = {};

  // The merged config is deep-cloned, which is far too expensive to redo on
  // every read — prize lookups alone ask for it once per manager. Cache it and
  // drop the cache whenever the overrides change. Callers treat it as
  // read-only.
  var _configCache = null;
  STORE.config = function () {
    if (!_configCache) _configCache = merge(window.GO_DEFAULT_CONFIG, _configOverride);
    return _configCache;
  };
  STORE.saveConfig = function (partial) {
    _configOverride = merge(_configOverride, partial);
    lsSet(LS_CONFIG, _configOverride);
    _configCache = null;
    return STORE.config();
  };
  STORE.resetConfig = function () { _configOverride = {}; lsSet(LS_CONFIG, {}); _configCache = null; };

  STORE.overrides = function () { return _overrides; };
  STORE.saveOverrides = function (partial) {
    _overrides = merge(_overrides, partial);
    lsSet(LS_OVERRIDES, _overrides);
    return _overrides;
  };
  // Set a value at a path like ["lms","elim","5"] = [entryIds...]
  STORE.setOverridePath = function (path, value) {
    var root = clone(_overrides), node = root;
    for (var i = 0; i < path.length - 1; i++) {
      if (typeof node[path[i]] !== "object" || node[path[i]] === null) node[path[i]] = {};
      node = node[path[i]];
    }
    if (value === undefined) delete node[path[path.length - 1]];
    else node[path[path.length - 1]] = value;
    _overrides = root; lsSet(LS_OVERRIDES, _overrides);
    return _overrides;
  };

  STORE.dataset = function () { return _dataset; };
  STORE.setDataset = function (ds) {
    _dataset = ds;
    return idbSet(DATASET_KEY, ds).catch(function () { return false; });
  };

  // Load dataset from IndexedDB, else fall back to a committed ./data.json.
  STORE.load = function () {
    return idbGet(DATASET_KEY).then(function (ds) {
      if (ds) { _dataset = ds; return ds; }
      return fetch("./data.json", { cache: "no-store" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (bundle) {
          if (!bundle) return null;
          if (bundle.config) { _configOverride = merge(_configOverride, bundle.config); lsSet(LS_CONFIG, _configOverride); _configCache = null; }
          if (bundle.overrides) { _overrides = merge(_overrides, bundle.overrides); lsSet(LS_OVERRIDES, _overrides); }
          _dataset = bundle.dataset || bundle; // allow bare dataset too
          return _dataset;
        })
        .catch(function () { return null; });
    });
  };

  /* ---- Export / import a single shareable bundle ------------------------ */
  STORE.exportBundle = function () {
    return {
      _kind: "gameon-v12-bundle",
      exportedAt: new Date().toISOString(),
      config: _configOverride,
      overrides: _overrides,
      dataset: _dataset
    };
  };
  STORE.importBundle = function (bundle) {
    if (!bundle) throw new Error("Empty file");
    if (bundle.config) { _configOverride = bundle.config; lsSet(LS_CONFIG, _configOverride); _configCache = null; }
    if (bundle.overrides) { _overrides = bundle.overrides; lsSet(LS_OVERRIDES, _overrides); }
    var ds = bundle.dataset || (bundle.managers ? bundle : null);
    if (ds) return STORE.setDataset(ds);
    return Promise.resolve(true);
  };

  /* ---- Refresh: pull everything from the FPL API ------------------------ */
  // onProgress({phase, done, total, message})
  STORE.refresh = function (onProgress) {
    var cfg = STORE.config();
    var API = window.GO_API;
    var report = onProgress || function () {};
    if (!cfg.classicLeagueId) {
      return Promise.reject(new Error("Set your Classic League ID in Settings first."));
    }

    var ds = { updatedAt: new Date().toISOString(), season: cfg.seasonLabel,
               bootstrap: null, league: null, managers: [], history: {}, h2h: {}, pastSeasons: {}, chips: {},
               elements: null, pitchGw: null, livePoints: null, picks: null };

    report({ phase: "bootstrap", message: "Loading gameweeks…" });
    return API.bootstrap()
      .then(function (bs) {
        ds.bootstrap = {
          events: (bs.events || []).map(function (e) {
            return { id: e.id, name: e.name, finished: e.finished,
                     data_checked: e.data_checked, is_current: e.is_current,
                     is_next: e.is_next, deadline_time: e.deadline_time };
          })
        };
        // Compact element lookup: id -> [web_name, element_type(1-4), team_short].
        var teamShort = {};
        (bs.teams || []).forEach(function (t) { teamShort[t.id] = t.short_name; });
        ds.elements = {};
        (bs.elements || []).forEach(function (el) {
          ds.elements[el.id] = [el.web_name, el.element_type, teamShort[el.team] || "",
                                el.now_cost || 0, parseFloat(el.selected_by_percent) || 0];
        });
        report({ phase: "league", message: "Loading league roster…" });
        return API.classicLeagueAll(cfg.classicLeagueId, function (n) {
          report({ phase: "league", message: "Loaded " + n + " managers…", done: n });
        });
      })
      .then(function (lg) {
        ds.league = { id: cfg.classicLeagueId, name: lg.league ? lg.league.name : "" };
        ds.managers = lg.results.map(function (r) {
          return { id: r.entry, entryName: r.entry_name, playerName: r.player_name,
                   rank: r.rank, lastRank: r.last_rank, total: r.total, eventTotal: r.event_total };
        });
        // Pull per-manager history (the primitive that powers every tab).
        report({ phase: "history", done: 0, total: ds.managers.length,
                 message: "Loading manager histories…" });
        return API.pool(ds.managers, function (m) {
          return API.entryHistory(m.id).then(function (h) {
            var gw = {};
            (h.current || []).forEach(function (c) {
              gw[c.event] = { p: c.points, h: c.event_transfers_cost || 0,
                              b: c.points_on_bench || 0, t: c.total_points,
                              v: c.value || 0, bk: c.bank || 0,
                              tr: c.event_transfers || 0, r: c.overall_rank || 0 };
            });
            ds.history[m.id] = gw;
            if (h.chips && h.chips.length) {
              ds.chips[m.id] = h.chips.map(function (c) { return { n: c.name, gw: c.event }; });
            }
            if (h.past && h.past.length) {
              ds.pastSeasons[m.id] = h.past.map(function (p) {
                return { season: p.season_name, rank: p.rank, total: p.total_points };
              });
            }
          });
        }, 5, function (done, total) {
          report({ phase: "history", done: done, total: total,
                   message: "Loaded " + done + "/" + total + " histories…" });
        });
      })
      .then(function (poolRes) {
        ds._failed = (poolRes && poolRes.failed ? poolRes.failed.length : 0);
        // Optional: H2H group leagues, if configured.
        var ids = cfg.h2hGroupLeagueIds || [];
        if (!ids.length) return;
        report({ phase: "h2h", done: 0, total: ids.length, message: "Loading H2H groups…" });
        return API.pool(ids, function (id) {
          return API.h2hStandingsAll(id).then(function (r) {
            // same trim as the server-side fetcher
            ds.h2h[id] = {
              league: { name: (r.league && r.league.name) || "" },
              results: (r.results || []).map(function (x) {
                return { entry: x.entry, entry_name: x.entry_name, player_name: x.player_name,
                         total: x.total, points_for: x.points_for, matches_won: x.matches_won,
                         matches_drawn: x.matches_drawn, matches_lost: x.matches_lost };
              })
            };
          });
        }, 3, function (done, total) {
          report({ phase: "h2h", done: done, total: total,
                   message: "Loaded " + done + "/" + total + " H2H groups…" });
        });
      })
      .then(function () {
        // Current-gameweek squads: powers the LMS "players played" column and
        // the live football-pitch on each manager's profile. Uses
        // event/{gw}/live (minutes + points) + entry/{id}/event/{gw}/picks for
        // every manager, so any profile can show its squad.
        var events = ds.bootstrap.events || [];
        var curEv = events.filter(function (e) { return e.is_current; })[0]
                 || events.filter(function (e) { return e.is_next; })[0];
        if (!curEv) return;
        var lg = curEv.id;
        ds.pitchGw = lg;
        var inProgress = curEv.is_current && !(curEv.finished && curEv.data_checked);
        // Squads are stored per gameweek. An in-browser refresh only pulls the
        // current one and keeps whatever earlier gameweeks we already hold;
        // the server-side fetcher backfills the rest.
        ds.picksV = 2;
        var old = _dataset && _dataset.picksV === 2 ? _dataset : null;
        ds.picks = old ? merge({}, old.picks || {}) : {};
        ds.livePoints = old ? merge({}, old.livePoints || {}) : {};
        report({ phase: "live", message: "Loading current gameweek…" });
        return API.live(lg).then(function (live) {
          var mins = {};
          ds.livePoints[lg] = {};
          (live.elements || []).forEach(function (el) {
            var st = el.stats || {};
            mins[el.id] = st.minutes || 0;
            ds.livePoints[lg][el.id] = st.total_points || 0;
          });
          ds.picks[lg] = {};
          var targets = ds.managers.map(function (m) { return m.id; });
          report({ phase: "live", done: 0, total: targets.length, message: "Loading squads…" });
          return API.pool(targets, function (id) {
            return API.entryPicks(id, lg).then(function (pk) {
              var list = pk.picks || [];
              ds.picks[lg][id] = {
                c: (pk.active_chip || ""),
                p: list.map(function (p) {
                  return [p.element, p.multiplier, p.is_captain ? 1 : 0, p.is_vice_captain ? 1 : 0];
                })
              };
              if (inProgress) {
                var played = 0, total = 0;
                list.forEach(function (p) {
                  if (p.multiplier > 0) { total += p.multiplier; if ((mins[p.element] || 0) > 0) played += p.multiplier; }
                });
                if (!ds.history[id]) ds.history[id] = {};
                if (!ds.history[id][lg]) ds.history[id][lg] = { p: 0, h: 0, b: 0, t: 0 };
                ds.history[id][lg].pl = played;
                ds.history[id][lg].plt = total || 12;
              }
            }).catch(function () {});
          }, 5, function (done, total) {
            report({ phase: "live", done: done, total: total, message: "Squads " + done + "/" + total + "…" });
          });
        }).catch(function () { /* live is best-effort */ });
      })
      .then(function () {
        return STORE.setDataset(ds).then(function () {
          report({ phase: "done", message: "Done.", dataset: ds });
          return ds;
        });
      });
  };

  window.GO_STORE = STORE;
})();
