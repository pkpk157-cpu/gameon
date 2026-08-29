/* ==========================================================================
   FPL API client (CORS-proxied)
   --------------------------------------------------------------------------
   The official FPL endpoints are public and unauthenticated but send no
   Access-Control-Allow-Origin header, so a browser cannot read them directly.
   Every request is wrapped through a CORS proxy template (see config.proxy).
   Exposes window.GO_API with promise-returning helpers + a small concurrency
   pool so we can pull ~245 manager histories without hammering the proxy.
   ========================================================================== */
(function () {
  "use strict";

  var API = {};

  /* Build the proxied URL for a given FPL path. */
  function proxied(fplUrl, template) {
    if (!template) return fplUrl; // direct (own-origin proxy)
    if (template.indexOf("{urlraw}") !== -1) {
      return template.replace("{urlraw}", fplUrl);
    }
    var enc = encodeURIComponent(fplUrl);
    if (template.indexOf("{url}") !== -1) return template.replace("{url}", enc);
    if (template.indexOf("%s") !== -1) return template.replace("%s", enc);
    return template + enc; // template ends with ?url= etc.
  }

  /* Fetch JSON from an FPL path with retries and proxy fallback. */
  API.getJSON = function (fplPath, opts) {
    opts = opts || {};
    var cfg = window.GO_STORE ? window.GO_STORE.config() : window.GO_DEFAULT_CONFIG;
    var base = cfg.fplBase.replace(/\/$/, "");
    var fplUrl = base + fplPath;

    // Ordered list of proxy templates to try: active first, then alternates.
    var templates = [cfg.proxy.template].concat(cfg.proxy.alternatives || []);
    templates = templates.filter(function (t, i, a) { return a.indexOf(t) === i; });

    var attempts = opts.attempts || 2; // per template
    var timeout = opts.timeout || 20000;

    return tryTemplates(0);

    function tryTemplates(ti) {
      if (ti >= templates.length) {
        return Promise.reject(new Error("All proxies failed for " + fplPath));
      }
      return withRetries(templates[ti], attempts).catch(function () {
        return tryTemplates(ti + 1);
      });
    }

    function withRetries(template, left) {
      return doFetch(proxied(fplUrl, template)).catch(function (err) {
        if (left <= 1) throw err;
        return delay(600).then(function () { return withRetries(template, left - 1); });
      });
    }

    function doFetch(url) {
      var ctrl = ("AbortController" in window) ? new AbortController() : null;
      var t = ctrl ? setTimeout(function () { ctrl.abort(); }, timeout) : null;
      return fetch(url, { signal: ctrl ? ctrl.signal : undefined, cache: "no-store" })
        .then(function (res) {
          if (t) clearTimeout(t);
          if (!res.ok) throw new Error("HTTP " + res.status);
          return res.text();
        })
        .then(function (txt) {
          // Some proxies wrap or prepend noise; be defensive.
          try { return JSON.parse(txt); }
          catch (e) {
            var s = txt.indexOf("{"), a = txt.indexOf("[");
            var start = (s === -1) ? a : (a === -1 ? s : Math.min(s, a));
            if (start > 0) { try { return JSON.parse(txt.slice(start)); } catch (e2) {} }
            throw new Error("Bad JSON from proxy");
          }
        });
    }
  };

  /* ---- Endpoint helpers ------------------------------------------------- */

  API.bootstrap = function () {
    return API.getJSON("/bootstrap-static/");
  };

  API.classicLeaguePage = function (leagueId, page) {
    return API.getJSON("/leagues-classic/" + leagueId + "/standings/?page_standings=" + page);
  };

  // Pull every page of a classic league's standings -> flat results array.
  API.classicLeagueAll = function (leagueId, onProgress) {
    var all = [], meta = null;
    return step(1);
    function step(page) {
      return API.classicLeaguePage(leagueId, page).then(function (data) {
        if (!meta) meta = data.league;
        var res = (data.standings && data.standings.results) || [];
        all = all.concat(res);
        if (onProgress) onProgress(all.length);
        if (data.standings && data.standings.has_next) return step(page + 1);
        return { league: meta, results: all };
      });
    }
  };

  API.entryHistory = function (entryId) {
    return API.getJSON("/entry/" + entryId + "/history/");
  };

  // All fixtures, or one gameweek's fixtures.
  API.fixtures = function (gw, opts) {
    return API.getJSON("/fixtures/" + (gw ? ("?event=" + gw) : ""), opts);
  };

  // Live per-player stats for a gameweek: { elements:[{ id, stats:{ minutes,... } }] }.
  API.live = function (gw, opts) {
    return API.getJSON("/event/" + gw + "/live/", opts);
  };

  // A single player's detailed history.
  API.elementSummary = function (elementId) {
    return API.getJSON("/element-summary/" + elementId + "/");
  };

  // A manager's squad for a gameweek: { picks:[{ element, multiplier, is_captain }], ... }.
  API.entryPicks = function (entryId, gw) {
    return API.getJSON("/entry/" + entryId + "/event/" + gw + "/picks/");
  };

  API.entry = function (entryId) {
    return API.getJSON("/entry/" + entryId + "/");
  };

  API.h2hStandingsPage = function (leagueId, page) {
    return API.getJSON("/leagues-h2h/" + leagueId + "/standings/?page_standings=" + page);
  };

  API.h2hStandingsAll = function (leagueId) {
    var all = [], meta = null;
    return step(1);
    function step(page) {
      return API.h2hStandingsPage(leagueId, page).then(function (data) {
        if (!meta) meta = data.league;
        var res = (data.standings && data.standings.results) || [];
        all = all.concat(res);
        if (data.standings && data.standings.has_next) return step(page + 1);
        return { league: meta, results: all };
      });
    }
  };

  /* ---- Concurrency pool: run tasks N-at-a-time --------------------------- */
  API.pool = function (items, worker, concurrency, onEach) {
    concurrency = Math.max(1, concurrency || 4);
    var i = 0, active = 0, done = 0, results = new Array(items.length), failed = [];
    return new Promise(function (resolve) {
      function next() {
        if (done === items.length) { resolve({ results: results, failed: failed }); return; }
        while (active < concurrency && i < items.length) {
          (function (idx) {
            active++;
            Promise.resolve(worker(items[idx], idx))
              .then(function (r) { results[idx] = r; })
              .catch(function (e) { failed.push({ item: items[idx], error: e }); })
              .then(function () {
                active--; done++;
                if (onEach) onEach(done, items.length, items[idx]);
                next();
              });
          })(i++);
        }
      }
      if (!items.length) resolve({ results: results, failed: failed });
      else next();
    });
  };

  function delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  window.GO_API = API;
})();
