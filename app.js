/* ==========================================================================
   app.js — UI: tabs, rendering for every competition, refresh flow, admin.
   ========================================================================== */
(function () {
  "use strict";

  var S = window.GO_STORE, K = window.GO_COMPUTE;
  var ME_KEY = "go12.me", THEME_KEY = "go12.theme", RIVALS_KEY = "go12.rivals", RIVALS_MAX = 2;
  var FAVS_KEY = "go12.favs";
  var state = { view: "classic", me: lsGet(ME_KEY), monthKey: null, seasonKey: null, group: null, h2hComp: "UCL" };

  /* Minimal line icons (24px, currentColor). */
  var ICONS = {
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    classic: '<path d="M6 4h12v3a6 6 0 0 1-12 0V4Z"/><path d="M6 5H4v1a3 3 0 0 0 3 3M18 5h2v1a3 3 0 0 1-3 3"/><path d="M12 13v3M9 20h6M10 20a2 2 0 0 1 4 0"/>',
    monthly: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 9.5h17M8 3.5v3M16 3.5v3"/><circle cx="8.5" cy="13.5" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="13.5" r="1" fill="currentColor" stroke="none"/>',
    lms: '<path d="M12 3s4 3.5 4 8a4 4 0 0 1-8 0c0-1.6.8-3 1.5-4"/><path d="M12 21a6 6 0 0 0 6-6c0-1-.2-2-.6-2.9"/><path d="M12 21a6 6 0 0 1-6-6"/>',
    pyramid: '<path d="M12 4 4 19h16L12 4Z"/><path d="M7.7 12.5h8.6M6 16h12"/>',
    h2h: '<circle cx="12" cy="12" r="8.5"/><path d="m12 7 3 2.2-1.1 3.5h-3.8L9 9.2 12 7Z"/><path d="m12 7 .0-3M9 9.2 6.2 7.6M14.9 9.2l2.9-1.6M13.9 12.7l1.9 2.5M10.1 12.7 8.2 15.2"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6 19 19M19 5l-1.4 1.4M6.4 17.6 5 19"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/>',
    auto: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18Z" fill="currentColor" stroke="none"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-.6 4"/><path d="M20 4v5h-5"/>',
    download: '<path d="M12 4v10m0 0 4-4m-4 4-4-4"/><path d="M5 19h14"/>',
    upload: '<path d="M12 20V10m0 0 4 4m-4-4-4 4"/><path d="M5 5h14"/>',
    // a checklist: three steps, each ticked off
    steps: '<path d="M4 6.5 5.5 8 8.5 5"/><path d="M4 12.5 5.5 14 8.5 11"/>' +
      '<path d="M4 18.5 5.5 20 8.5 17"/><path d="M12 6.5h8"/><path d="M12 12.5h8"/><path d="M12 18.5h8"/>',
    book: '<path d="M5 4.5A2 2 0 0 1 7 3h11v15H7a2 2 0 0 0-2 2V4.5Z"/><path d="M5 18.5A2 2 0 0 0 7 21h11"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M20 12a8 8 0 0 0-.12-1.36l1.9-1.48-2-3.46-2.24.9a7.9 7.9 0 0 0-2.36-1.36L14.7 3h-4L10.3 5.3a7.9 7.9 0 0 0-2.36 1.36l-2.24-.9-2 3.46 1.9 1.48A8 8 0 0 0 5.48 12a8 8 0 0 0 .12 1.36l-1.9 1.48 2 3.46 2.24-.9a7.9 7.9 0 0 0 2.36 1.36l.4 2.34h4l.4-2.34a7.9 7.9 0 0 0 2.36-1.36l2.24.9 2-3.46-1.9-1.48A8 8 0 0 0 20 12Z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11.2v5M12 7.8h.01"/>',
    coin: '<ellipse cx="12" cy="7.4" rx="7" ry="3"/>' +
      '<path d="M5 7.4v4.3c0 1.66 3.13 3 7 3s7-1.34 7-3V7.4"/>' +
      '<path d="M5 11.7v4.3c0 1.66 3.13 3 7 3s7-1.34 7-3v-4.3"/>',
    person: '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>'
  };
  /* Icons for the stat cards. Same 24x24 stroke language as the bar's, drawn
     to be read at 14px: one idea per glyph, no interior detail that closes up
     at that size. */
  var SICONS = {
    sleep: '<path d="M4 8h6l-6 7h6"/><path d="M14 4h5l-5 6h5"/>',
    star: '<path d="M12 3.6l2.6 5.3 5.8.9-4.2 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.2-4.1 5.8-.9Z"/>',
    trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0Z"/><path d="M8 5.6H5.4A3.4 3.4 0 0 0 8 9M16 5.6h2.6A3.4 3.4 0 0 1 16 9"/><path d="M12 13v4M8.5 20h7"/>',
    chart: '<path d="M4 17h16"/><path d="M7.5 17v-6M12 17v-10M16.5 17v-4"/>',
    up: '<path d="M12 19.4V5.6"/><path d="M5.2 12.4 12 5.6l6.8 6.8"/>',
    down: '<path d="M12 4.6v13.8"/><path d="M5.2 11.6 12 18.4l6.8-6.8"/>',
    check: '<path d="M20 6.5 9.5 17 4 11.5"/>',
    bench: '<path d="M3.5 7.5h17M3.5 11h17"/><path d="M6 11v5.5M18 11v5.5"/>',
    warn: '<path d="M12 4.2 3.3 19.8h17.4Z"/><path d="M12 10.4v4.1M12 17.4h.01"/>',
    swap: '<path d="M4 8.5h12m0 0-3.5-3.5M16 8.5l-3.5 3.5"/><path d="M20 15.5H8m0 0 3.5-3.5M8 15.5l3.5 3.5"/>',
    globe: '<circle cx="12" cy="12" r="8.6"/><path d="M3.4 12h17.2"/><path d="M12 3.4a13 13 0 0 1 0 17.2 13 13 0 0 1 0-17.2Z"/>',
    target: '<circle cx="12" cy="12" r="8.2"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none"/>',
    sparkle: '<path d="M11 3.5l1.7 4.8 4.8 1.7-4.8 1.7L11 16.5 9.3 11.7 4.5 10l4.8-1.7Z"/><path d="M18 15.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7Z"/>',
    captain: '<circle cx="12" cy="12" r="8.4"/><path d="M14.6 9.6a4 4 0 1 0 0 4.8"/>',
    circleDown: '<circle cx="12" cy="12" r="8.4"/><path d="M12 7.8v8.4m0 0 3.2-3.2M12 16.2 8.8 13"/>',
    gem: '<path d="M5.7 5h12.6l2.3 4.7L12 19.4 3.4 9.7Z"/><path d="M3.4 9.7h17.2"/>',
    users: '<circle cx="9.2" cy="8.2" r="3.1"/><path d="M3.3 19.7a5.9 5.9 0 0 1 11.8 0"/><path d="M16 5.9a3.1 3.1 0 0 1 0 4.6M17.2 14.5a5.9 5.9 0 0 1 3.5 5.2"/>',
    tag: '<path d="M10.3 3H3.1v7.2l10.4 10.4a1.5 1.5 0 0 0 2.1 0l4.9-4.9a1.5 1.5 0 0 0 0-2.1Z"/><circle cx="6.8" cy="6.7" r="1.3"/>',
    bank: '<path d="M3 9.6 12 4.2l9 5.4"/><path d="M5.5 11v7.5M10 11v7.5M14 11v7.5M18.5 11v7.5"/><path d="M3 20.4h18"/>',
    steady: '<path d="M4 12h16"/><path d="M7.5 9.4v5.2M12 8.6v6.8M16.5 9.4v5.2"/>',
    shield: '<path d="M12 3.4 5.2 6.2v5.6c0 4 2.7 7.2 6.8 8.6 4.1-1.4 6.8-4.6 6.8-8.6V6.2Z"/>',
    // The winners' marks used to be emoji, which every phone draws from its
    // own emoji font, so the same card wore Apple's trophy on one phone and
    // Google's on the next. Drawn here, they are the same picture everywhere.
    crown: '<path d="M4 8.5 8 12l4-6 4 6 4-3.5-1.5 9.5h-13Z"/><path d="M6 20.5h12"/>',
    cross: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
    medal: '<circle cx="12" cy="15" r="5.2"/><path d="M8.6 10.8 6 3.5h4.2L12 8.4l1.8-4.9H18l-2.6 7.3"/>',
    ball: '<circle cx="12" cy="12" r="8.4"/><path d="m12 8.2 3.1 2.3-1.2 3.7h-3.8l-1.2-3.7Z"/>' +
          '<path d="M12 8.2V3.6M15.1 10.5l4.4-1.4M13.9 14.2l2.7 3.6M10.1 14.2l-2.7 3.6M8.9 10.5 4.5 9.1"/>',
    assist: '<circle cx="17.2" cy="12" r="4.2"/><path d="M2.6 12h7.2M7.1 8.6 10.5 12l-3.4 3.4"/>',
    open: '<path d="M14.5 4H20v5.5M20 4l-7.5 7.5"/>' +
          '<path d="M18 14.2v4.3A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>',
    medal: '<circle cx="12" cy="14.9" r="5.5"/><path d="M8.3 9.6 5.2 3.5h13.6l-3.1 6.1"/>',
    flame: '<path d="M12 4.4c4.2 3.4 6.4 6.4 6.4 9.6a6.4 6.4 0 0 1-12.8 0c0-2 1-3.7 2.3-5 .25 1.8 1.25 2.9 2.25 2.9 1.35 0 1.85-1.45 1.35-3.6-.25-1.45-1.1-2.85-1.5-3.9Z"/>',
    crown: '<path d="M4 18.4h16"/><path d="M4 16 3 7.2l4.6 3.2L12 4.4l4.4 6 4.6-3.2L20 16Z"/>',
    steps: '<path d="M3.4 20h4.3v-5.2H12V9.6h4.3V4.4h4.3"/><path d="M3.4 20h17.2"/>'
  };
  function sicon(name) {
    if (!SICONS[name]) return "";
    return '<svg class="hi-ic" viewBox="0 0 24 24" width="14" height="14" fill="none" ' +
      'stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" ' +
      'aria-hidden="true">' + SICONS[name] + '</svg>';
  }

  // Both sets are drawn on the same 24-square grid, so a name missing from the
  // drawer's own set can be taken from the small one rather than copied into it.
  function svg(name, size) {
    return '<svg viewBox="0 0 24 24" width="' + (size || 24) + '" height="' + (size || 24) +
      '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
      (ICONS[name] || SICONS[name] || "") + '</svg>';
  }

  /* ---- iOS-style colored 3D tile icons for the tab bar ------------------ */
  function starPath(cx, cy, r) {
    var pts = [], inner = r * 0.42;
    for (var i = 0; i < 10; i++) {
      var a = -Math.PI / 2 + i * Math.PI / 5, rad = (i % 2 === 0) ? r : inner;
      pts.push((cx + rad * Math.cos(a)).toFixed(2) + "," + (cy + rad * Math.sin(a)).toFixed(2));
    }
    return "M" + pts.join("L") + "Z";
  }
  function tile(id, c1, c2, glyph) {
    return '<svg viewBox="0 0 30 30" width="30" height="30" class="tile" aria-hidden="true">' +
      '<defs>' +
      '<linearGradient id="t' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + c1 + '"/><stop offset="1" stop-color="' + c2 + '"/></linearGradient>' +
      '<linearGradient id="g' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".55"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></linearGradient>' +
      '</defs>' +
      '<rect x="1.5" y="1.5" width="27" height="27" rx="8.5" fill="url(#t' + id + ')"/>' +
      '<rect x="3" y="2.2" width="24" height="12" rx="7" fill="url(#g' + id + ')"/>' +
      glyph +
      '<rect x="1.5" y="1.5" width="27" height="27" rx="8.5" fill="none" stroke="rgba(255,255,255,.4)" stroke-width=".8"/>' +
      '</svg>';
  }
  // A section's mark: the drawn tile, with the real badge laid over it. If the
  // picture is missing the tile is what stays, which is what the app looked
  // like before the badges arrived.
  //
  // The badges used to be seen arriving. A lazy <img> inside a drawer that is
  // off screen is never fetched, so the first time the drawer opened the reader
  // got the drawn glyph, and the real badge dropped over it a frame or two
  // later — three little icons visibly changing their minds. Both halves of
  // that are fixed here: the three badges are fetched and decoded at boot, and
  // once one of them is ready its tile is drawn without the glyph underneath,
  // so there is nothing left to swap out. Nothing is lost if a fetch fails or
  // the drawer is opened inside the first moment — the glyph is still there,
  // exactly as before.
  var MARK_ART = ["pl-lion.webp", "logo-tile.webp", "logo-tile-inv.webp"];
  var markReady = {};
  function warmMarks() {
    MARK_ART.forEach(function (src) {
      try {
        var im = new Image();
        im.decoding = "async";
        im.onload = function () { markReady[src] = 1; };
        im.src = src;
      } catch (e) {}
    });
  }
  function markTile(id, c1, c2, glyph, src) {
    return '<span class="mi-mark">' + tile(id, c1, c2, markReady[src] ? "" : glyph) +
      '<img class="mi-logo" src="' + src + '" alt="" width="30" height="30" ' +
      'decoding="async"></span>';
  }
  var G_TROPHY = '<path d="M10.2 8h9.6v2.4c0 2.65-2.15 4.8-4.8 4.8s-4.8-2.15-4.8-4.8Z" fill="#fff"/>' +
    '<path d="M10.2 8.9H8.3c0 1.9 1 3.1 2.4 3.5M19.8 8.9h1.9c0 1.9-1 3.1-2.4 3.5" fill="none" stroke="#fff" stroke-width="1.3"/>' +
    '<rect x="14.1" y="15" width="1.8" height="2.8" fill="#fff"/><rect x="11.2" y="17.6" width="7.6" height="2.1" rx=".8" fill="#fff"/>' +
    '<rect x="9.8" y="20" width="10.4" height="2.4" rx=".9" fill="#fff"/>';
  var G_CAL = '<rect x="7.8" y="9" width="14.4" height="13.2" rx="2.6" fill="#fff"/>' +
    '<path d="M7.8 12.4h14.4" stroke="rgba(0,0,0,.16)" stroke-width="1.5"/>' +
    '<rect x="10.8" y="7.4" width="1.6" height="3.2" rx=".8" fill="#fff"/><rect x="17.6" y="7.4" width="1.6" height="3.2" rx=".8" fill="#fff"/>' +
    '<rect x="10.4" y="14.6" width="2" height="2" rx=".4" fill="rgba(0,0,0,.28)"/><rect x="14" y="14.6" width="2" height="2" rx=".4" fill="rgba(0,0,0,.28)"/>' +
    '<rect x="17.6" y="14.6" width="2" height="2" rx=".4" fill="rgba(0,0,0,.28)"/><rect x="10.4" y="18" width="2" height="2" rx=".4" fill="rgba(0,0,0,.28)"/><rect x="14" y="18" width="2" height="2" rx=".4" fill="rgba(0,0,0,.28)"/>';
  var G_PERSON = '<circle cx="15" cy="8.8" r="2.9" fill="#fff"/>' +
    '<path d="M9.6 23c0-4.1 2.4-7.3 5.4-7.3s5.4 3.2 5.4 7.3Z" fill="#fff"/>' +
    '<path d="M15 15.9 12.7 23h4.6Z" fill="#2a2f40"/>' +
    '<rect x="14.5" y="16.3" width="1" height="6.7" fill="#e0b53a"/>';
  var G_PYR = '<path d="M15 7.2 23 22.4H7Z" fill="#fff"/>' +
    '<path d="M11.4 14.6h7.2M9.4 18.4h11.2" stroke="rgba(0,0,0,.2)" stroke-width="1.3"/>';
  var G_BALL = (function () {
    var s = '<circle cx="15" cy="15" r="7.7" fill="#fff"/>';
    s += '<path d="' + starPath(15, 15, 2.1) + '" fill="#0b1440"/>';
    for (var k = 0; k < 8; k++) {
      var a = -Math.PI / 2 + k * Math.PI / 4;
      s += '<path d="' + starPath(15 + 5.3 * Math.cos(a), 15 + 5.3 * Math.sin(a), 1.5) + '" fill="#0b1440"/>';
    }
    return s;
  })();
  // Drawer-only glyphs: a classic football for the Premier League scoreboard
  // and a rising line for the price tracker.
  var G_FOOT = '<circle cx="15" cy="15" r="7.4" fill="#fff"/>' +
    '<path d="M15 12.3l2.6 1.9-1 3h-3.2l-1-3Z" fill="rgba(0,0,0,.3)"/>' +
    '<path d="M15 12.3V7.7M17.6 14.2l4.3-1.5M16.6 17.2l2.7 3.7M13.4 17.2l-2.7 3.7M12.4 14.2 8.1 12.7" fill="none" stroke="rgba(0,0,0,.3)" stroke-width="1.2"/>';
  var G_COINS = '<ellipse cx="15" cy="10.4" rx="7.2" ry="2.8" fill="#fff"/>' +
    '<path d="M7.8 10.4v3c0 1.55 3.22 2.8 7.2 2.8s7.2-1.25 7.2-2.8v-3" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/>' +
    '<path d="M7.8 15.6v3c0 1.55 3.22 2.8 7.2 2.8s7.2-1.25 7.2-2.8v-3" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/>';
  var TILE = {
    classic: tile("cl", "#ffd76a", "#e6a417", G_TROPHY),
    monthly: tile("mo", "#5db4ff", "#2f7bf0", G_CAL),
    lms:     tile("lm", "#525872", "#23283a", G_PERSON),
    pyramid: tile("py", "#b985ff", "#7c3aed", G_PYR),
    h2h:     tile("uc", "#3a4fb0", "#0e1a52", G_BALL)
  };

  /* Section title with an info button that opens the competition's rules page. */
  var TABS = [
    { id: "classic", label: "Classic", icon: "classic" },
    { id: "monthly", label: "MoM", icon: "monthly" },
    { id: "lms",     label: "LMS",     icon: "lms" },
    { id: "pyramid", label: "Pyramid", icon: "pyramid" },
    { id: "h2h",     label: "UCL",     icon: "h2h" }
  ];

  /* ---- tiny DOM/util helpers ------------------------------------------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  // Write into a panel that may already have been replaced. A control's
  // handler outlives the markup it was bound to — a live refresh or a change
  // of tab rebuilds the page under it — and a redraw aimed at a panel that is
  // no longer there should be a no-op, not a thrown error on a live screen.
  function fill(sel, root, html) {
    var el = $(sel, root);
    if (el) el.innerHTML = html;
    return el;
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function num(n) { if (n == null || isNaN(n)) return "—"; return Number(n).toLocaleString("en-US"); }
  // Experience points. Bare inside a table whose column head already says XP;
  // xpa() carries the unit for anything standing on its own. Plain grouping —
  // nothing about these figures should read as a currency.
  function xp(n) { return num(n); }
  function xpa(n) { return n == null || isNaN(n) ? "\u2014" : num(n) + " XP"; }
  // A club's crest from the mirrored set that sits beside the photographs.
  // One that has not been fetched takes itself out through the same listener
  // as a missing face, and the name beside it stands alone.
  function crest(short) {
    if (!short) return "";
    return '<img class="crest" src="photos/badge-' + esc(short) + '.webp" alt="" width="18" height="18" ' +
      'loading="lazy" decoding="async">';
  }
  function lsGet(k) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  // Rivals: up to three managers pinned from their profiles, kept on this
  // device only. Ids that no longer name a manager are dropped when read, so
  // a manager who leaves the league leaves the list with him.
  function rivals() {
    var v = lsGet(RIVALS_KEY);
    return Array.isArray(v) ? v.map(Number).filter(function (x) { return x > 0; }).slice(0, RIVALS_MAX) : [];
  }
  function isRival(id) { return rivals().indexOf(+id) !== -1; }
  // Returns "added", "removed", or "full".
  function toggleRival(id) {
    id = +id;
    var r = rivals();
    var at = r.indexOf(id);
    if (at !== -1) { r.splice(at, 1); lsSet(RIVALS_KEY, r); return "removed"; }
    if (r.length >= RIVALS_MAX) return "full";
    r.push(id); lsSet(RIVALS_KEY, r); return "added";
  }
  // Starred players, kept on this device only. Unlike rivals there is no cap:
  // a watchlist is the reader's own business and fifteen or fifty are both
  // reasonable. Ids are held as numbers so a star survives the player being
  // renamed, and a player who leaves the game simply stops appearing in a
  // table that no longer lists him.
  function favs() {
    var v = lsGet(FAVS_KEY);
    return Array.isArray(v) ? v.map(Number).filter(function (x) { return x > 0; }) : [];
  }
  function isFav(el) { return favs().indexOf(+el) !== -1; }
  // Returns "added" or "removed".
  function toggleFav(el) {
    el = +el;
    var f = favs(), at = f.indexOf(el);
    if (at !== -1) { f.splice(at, 1); lsSet(FAVS_KEY, f); return "removed"; }
    f.push(el); lsSet(FAVS_KEY, f); return "added";
  }
  function ordinal(n) { var s = ["th","st","nd","rd"], v = n % 100; return n + (s[(v-20)%10] || s[v] || s[0]); }
  function monthLabel(m) {
    var late = { jan:1, feb:1, mar:1, apr:1, may:1, jun:1, jul:1 };
    var yr = (S.config().seasonStartYear || 2025) + (late[m.key] ? 1 : 0);
    return m.name.slice(0, 3) + "-" + ("0" + (yr % 100)).slice(-2);
  }
  // gw -> "done" | "live" | "upcoming"
  function gwStatusFn(ds) {
    var st = {};
    ((ds.bootstrap && ds.bootstrap.events) || []).forEach(function (e) {
      st[e.id] = (e.finished && e.data_checked) ? "done" : (e.is_current ? "live" : "upcoming");
    });
    return function (gw) { return st[gw] || "upcoming"; };
  }
  // Colored GW chips + a compact legend/summary of done/live/upcoming counts.
  function gwChips(gws, statusFn) {
    var chips = gws.map(function (g) {
      var s = statusFn(g);
      return '<span class="gwchip ' + s + '" title="' + s + '">' + g + '</span>';
    }).join("");
    // No legend: a green chip is a played gameweek, a grey one is to come,
    // and counting them up in a line beneath said nothing the row above had
    // not. The chips keep their titles for anyone who hovers.
    return '<div class="gwchips">' + chips + '</div>';
  }

  function toast(msg) {
    var t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("show"); }, 2600);
  }
  // An open overlay owns one history entry, so the phone's Back button (or
  // gesture) closes it instead of leaving the page — the way native apps do.
  var swallowPop = false;
  function pushOverlay() { try { history.pushState({ goOverlay: 1 }, ""); } catch (e) {} }
  function popOverlay() {
    if (history.state && history.state.goOverlay) {
      swallowPop = true;
      try { history.back(); } catch (e) { swallowPop = false; }
    }
  }
  // Closing an overlay in order to navigate must not go through popOverlay:
  // history.back() lands asynchronously, after the new hash is set, and would
  // undo the very navigation it precedes. Instead the overlay's spare history
  // entry is rewritten into the destination, so Back from there still returns
  // to the page the overlay was opened over. replaceState fires no hashchange,
  // hence the manual syncFromHash.
  function navFromOverlay(hash) {
    if (history.state && history.state.goOverlay) {
      try {
        history.replaceState(null, "", "#" + hash);
        syncFromHash();
        return;
      } catch (e) {}
    }
    location.hash = hash;
  }
  /* Nothing behind an overlay should move. Holding the page by overflow alone
     sends some browsers back to the top the moment the hold is released, so
     where it was is remembered and put back. One function decides, called from
     every open and every close, so two overlays closing in either order cannot
     leave the page locked. */
  var lockedAt = 0;
  function syncLock() {
    var root = document.documentElement;
    var want = sheetOpen(), on = root.classList.contains("ovl");
    if (want === on) return;
    if (want) {
      lockedAt = window.pageYOffset || root.scrollTop || 0;
      root.classList.add("ovl");
    } else {
      root.classList.remove("ovl");
      try { window.scrollTo(0, lockedAt); } catch (e) {}
    }
  }

  function modal(title, bodyHtml) {
    var was = $("#modalBack").classList.contains("show");
    $("#modalTitle").textContent = title; $("#modalBody").innerHTML = bodyHtml;
    $("#modalBack").classList.add("show");
    if (!was) pushOverlay();
    syncLock();
    return $("#modalBody");
  }
  // What one gameweek was made of: FPL's own lines, in FPL's own order.
  function bdGwPanel(ds, el, gw, mult) {
    var B = K.playerBreakdown(ds, el, gw);
    if (!B) {
      var h = K.playerHistory(ds, el);
      var row = h && h.rows.filter(function (r) { return r.gw === +gw; })[0];
      // Nothing stored is three different things, and saying which is the
      // difference between an app that looks broken and one that is waiting.
      var why = !row ? "No points breakdown is stored for Gameweek " + gw + "."
        : row.blank ? esc(ds.elements[el][2]) + " had no fixture in Gameweek " + gw + "."
        : row.ahead ? "Gameweek " + gw + " has not kicked off yet."
        : "He did not feature in Gameweek " + gw + ".";
      return '<div class="callout">' + why + '</div>';
    }
    return '<table class="t bdtbl"><thead><tr><th>Type</th>' +
      '<th class="num">Value</th><th class="num">Points</th></tr></thead><tbody>' +
      B.rows.map(function (r) {
        return '<tr><td>' + esc(r.label) + '</td><td class="num">' + esc(String(r.value)) + '</td>' +
          '<td class="num"><b>' + r.points + ' pt' + (Math.abs(r.points) === 1 ? '' : 's') + '</b></td></tr>';
      }).join("") +
      '<tr class="bdtotal"><td>Total Points</td><td></td><td class="num"><b>' + B.total +
      ' pts</b></td></tr>' +
      (mult > 1 ? '<tr class="bdtotal"><td>' + (mult === 3 ? 'Triple Captain (×3)' : 'Captain (×2)') +
        '</td><td></td><td class="num"><b>' + (B.total * mult) + ' pts</b></td></tr>' : '') +
      '</tbody></table>' +
      (B.provisional ? '<div class="note" style="margin-top:10px">Bonus is provisional until FPL finalises the fixture.</div>' : '');
  }

  // The season behind it. Every gameweek, what he played and what it returned,
  // and each row opens that gameweek on the other tab.
  // What the page's figures mean, on the page rather than in a sheet over it.
  function playerHelp() {
    var h = helpList("What he is today", [
      ["Price", "What he costs to buy now, and how far that has moved since the season " +
        "began. Prices only change overnight."],
      ["Pnts/Match", "FPL's own points per match, and where that puts him among every " +
        "player in his position."],
      ["Form", "FPL's own form figure \u2014 its average over its own recent window, so this " +
        "page agrees with the official app rather than arguing with it by a tenth."],
      ["Owned by FPL", "The share of every squad in the game that holds him, as it stands " +
        "today. FPL publishes no history of it, so it cannot be shown week by week."],
      ["Game On", "How many of this league's squads hold him now \u2014 the one figure the " +
        "official app cannot show you."]
    ]);
    h += helpList("What he has done, and what is ahead", [
      ["Result", "His club's score, his side first."],
      ["Points", "What he scored. A <b>*</b> means provisional bonus is still part of it, " +
        "because FPL has not confirmed the bonus for that fixture."],
      ["Any result row", "Tap it to see what that gameweek was made of."],
      ["FDR", "FPL's fixture difficulty rating, 1 for a kind match and 5 for a brutal one. " +
        "A dash means the rating had not been published when this data was taken."]
    ]);
    return h;
  }
  function closeModal(fromPop) {
    var was = $("#modalBack").classList.contains("show");
    $("#modalBack").classList.remove("show");
    if (was && fromPop !== true) popOverlay();
    syncLock();
  }

  /* ---- profile sheet --------------------------------------------------- */
  function isAdmin() {
    try { if (/[?&]admin(=|&|$)/.test(location.search)) lsSet("go12.admin", true); } catch (e) {}
    return !!lsGet("go12.admin");
  }

  // Two sheets, split by what you came for. This one is *you*: who you are
  // first, then your things, then the league's, then anything administrative,
  // and last where the numbers came from. It hangs off its own control on the
  // right of the bar, beside the refresh button, because it is the one people
  // reach for with a name in mind. The burger keeps navigation and the two
  // settings — see openMenu.
  function openProfile(opts) {
    var ds = S.dataset();
    var admin = isAdmin();
    var me = state.me && ds ? K.managerMap(ds)[+state.me] : null;
    var editing = (opts && opts.edit) || !me;
    var roster = ds && ds.managers ? ds.managers.slice().sort(function (x, y) {
      return String(x.entryName || "").localeCompare(String(y.entryName || ""));
    }) : [];

    // 1 — identity
    var h = '<div class="profile-hd">';
    if (me) {
      h += '<div class="av">' + esc((me.entryName || "?").trim().slice(0, 1).toUpperCase()) + '</div>' +
        '<div class="idwrap"><div class="who">' + esc(me.entryName) + '</div>' +
        '<div class="sub">' + esc(me.playerName) + '</div></div>' +
        '<button class="linkbtn" id="pfEdit">' + (editing ? "Cancel" : "Change") + '</button>';
    } else {
      h += '<div class="av">' + svg("person", 22) + '</div>' +
        '<div class="idwrap"><div class="who">Who are you?</div>' +
        '<div class="sub">Pick your team to see it highlighted</div></div>';
    }
    h += '</div>';

    if (editing) {
      h += '<datalist id="meOpts">' + roster.map(function (m) {
        return '<option value="' + esc(mgrLabel(m)) + '"></option>';
      }).join("") + '</datalist>';
      h += '<div class="field" style="margin-bottom:14px">' +
        '<div style="display:flex;gap:8px"><input class="in" id="pfMe" list="meOpts" autocomplete="off" ' +
        'spellcheck="false" placeholder="Type your team or name" value="' +
        esc(me ? mgrLabel(me) : "") + '">' +
        '<button class="btn primary" id="pfMeSave">Save</button></div>' +
        '<div class="note" style="margin-top:6px">Highlights you across every tab. ' +
        'Leave it empty to clear.</div></div>';
    }

    // 2 — your things. One row wants no heading over it: "My profile" already
    // says whose it is. Comparing yourself with someone used to be a second row
    // here, which only ever meant Head to head with your own name already in the
    // first box — so that is what Head to head does now, and one errand is one
    // entry rather than two.
    if (me) {
      h += '<div class="menu">' + menuItem("pfMine", "person", "My profile") + '</div>';
    }

    // 3 — the stats, one entry per tab, each saying what it holds: "Gameweek"
    // and "Picks" on their own told nobody which was the returns and which
    // the selections.
    h += '<div class="menu"><div class="lab-sm">Stats &amp; highlights</div>' +
      menuSub("pfStGw", "chart", "Gameweek returns", "Scores, bench, movement, captains, team of the week, eliminations") +
      menuSub("pfStPicks", "captain", "Gameweek selections", "Template XI, captains, transfers and chips before the deadline") +
      menuSub("pfStValue", "tag", "Squad values", "Richest squads, the bank, and the best value") +
      menuSub("pfStSeason", "trophy", "Season", "Where everyone has landed over the year") +
      menuSub("pfStFame", "star", "All time", "Past seasons and best-ever finishes") +
      '</div>';

    // 4 — the league
    h += '<div class="menu"><div class="lab-sm">League</div>' +
      menuItem("pfWinnings", "coin", "Winnings") +
      menuItem("pfCompare", "h2h", "Head to head") +
      menuItem("pfRules", "book", "Game rules") +
      '</div>';

    // 4 — the footballers, as two errands rather than one page with a toggle:
    // a price check and a look at form are different questions, and asking
    // either took a tab hop through the other.
    h += '<div class="menu"><div class="lab-sm">Players</div>' +
      menuItem("pfPrices", "tag", "Price changes") +
      menuItem("pfPlayers", "chart", "Player stats") +
      '</div>';

    // 5 — admin, for whoever runs the league
    if (admin) {
      h += '<div class="menu"><div class="lab-sm">Admin</div>' +
        menuItem("pfRefresh", "refresh", "Refresh from FPL") +
        menuItem("pfSettings", "gear", "League settings") +
        '<div class="divider"></div>' +
        menuItem("pfExport", "download", "Export data file") +
        menuItem("pfImport", "upload", "Import data file") +
        '</div>';
    }

    // 6 — where the numbers came from
    // During a live gameweek, say plainly whether the two-minute feed is
    // answering. Without this a dead proxy looks exactly like a quiet
    // afternoon — both simply show the last publish, growing older.
    var liveLine = "";
    if (ds && K.liveGwId(ds) && S.liveState) {
      var lst = S.liveState();
      if (lst.at) liveLine = '<br>Live feed: answering \u00b7 ' + esc(agoText(Date.now() - lst.at));
      else if (lst.tried) liveLine = '<br><span class="warn">Live feed: not answering (' +
        esc(lst.err || "no reply") + '). Scores follow the 10-minute publish.</span>';
      else liveLine = '<br>Live feed: starting up';
    }
    h += '<div class="pffoot">' +
      (ds ? ('<span title="' + esc(new Date(ds.updatedAt).toLocaleString()) + '">Updated ' +
             esc(agoText(Date.now() - Date.parse(ds.updatedAt))) + '</span>' +
             " · " + num(ds.managers.length) + " managers" + liveLine)
          : "Standings not loaded yet") +
      (admin ? '<br><span class="warn">Admin mode is on for this device.</span>' : '') +
      '</div>';

    h += drawerCrest();
    $("#youBody").innerHTML = h;
    if (!$("#youBack").classList.contains("show")) pushOverlay();
    $("#youBack").classList.add("show");
    syncLock();

    function go(hash) { closeProfile(true); navFromOverlay(hash); }
    [["pfStGw", "gw"], ["pfStPicks", "picks"], ["pfStValue", "value"], ["pfStSeason", "season"], ["pfStFame", "fame"]].forEach(function (x) {
      $("#" + x[0]).addEventListener("click", function () { go("stats/" + x[1]); });
    });
    $("#pfWinnings").addEventListener("click", function () { go("winnings"); });
    // Arriving from here, the first side is you — the comparison anyone opening
    // this has in mind. Only the first: whoever you were looking at last is
    // worth keeping in the second box, and if that was you, the page picks
    // somebody else rather than sitting you opposite yourself. Reaching Head to
    // head from a rival's page still fills in both names from that page.
    $("#pfCompare").addEventListener("click", function () {
      if (state.me) state.cmpA = state.me;
      go("compare");
    });
    $("#pfRules").addEventListener("click", function () { go("rules"); });
    $("#pfPrices").addEventListener("click", function () { go("prices"); });
    $("#pfPlayers").addEventListener("click", function () { go("prices/stats"); });
    if (me) {
      $("#pfMine").addEventListener("click", function () { go("profile/" + state.me); });
      $("#pfEdit").addEventListener("click", function () { openProfile({ edit: !editing }); });
    }
    if (editing) {
      var save = function () {
        var txt = $("#pfMe").value.trim();
        if (!txt) { state.me = null; lsSet(ME_KEY, null); toast("Cleared"); render(); openProfile({ edit: true }); return; }
        var found = resolveMgr(txt, roster);
        if (!found) { toast("No team matches that name"); return; }
        state.me = found.id; lsSet(ME_KEY, state.me);
        toast("Saved — you're highlighted"); render(); openProfile();
      };
      $("#pfMeSave").addEventListener("click", save);
      $("#pfMe").addEventListener("keydown", function (e) { if (e.key === "Enter") save(); });
    }

    if (admin) {
      $("#pfRefresh").addEventListener("click", function () { closeProfile(); startRefresh(); });
      $("#pfSettings").addEventListener("click", function () { go("settings"); });
      $("#pfExport").addEventListener("click", function () {
        var bundle = S.exportBundle();
        if (!bundle.dataset) { toast("Nothing to export — refresh first"); return; }
        download("data.json", JSON.stringify(bundle)); toast("Exported data.json");
      });
      $("#pfImport").addEventListener("click", function () { importFile(function () { closeProfile(); }); });
    }
  }
  function closeProfile(fromPop) {
    var was = $("#youBack").classList.contains("show");
    $("#youBack").classList.remove("show");
    if (was && fromPop !== true) popOverlay();
    syncLock();
  }

  // The crest at the foot of a sheet. It sits at the bottom whatever the
  // sheet holds, and is decoration: no link, nothing for a reader to reach.
  function drawerCrest() {
    return '<div class="sheetcrest" aria-hidden="true"><img src="logo-splash.webp" alt="" width="88" height="88" ' +
      'loading="lazy" decoding="async"></div>';
  }

  // The burger: where you are going, and the two things you set and forget.
  // Everything about you or the league lives under the control on the right.
  function openMenu() {
    var theme = getTheme();
    var h = sectionList();

    h += '<div class="menu"><div class="lab-sm">Appearance</div>' +
      '<div class="seg" id="pfTheme">' +
      segBtn("system", "auto", "System", theme) +
      segBtn("light", "sun", "Light", theme) +
      segBtn("dark", "moon", "Dark", theme) +
      '</div></div>';

    // Under the theme because it is something you look up when a score seems
    // wrong, not every visit.
    h += '<div class="menu">' +
      menuItem("pfGwStatus", "steps", "Gameweek status") +
      '</div>';

    h += drawerCrest();
    $("#menuBody").innerHTML = h;
    $all(".menuitem", $("#menuBody")).forEach(function (b) {
      b.addEventListener("click", function () {
        closeMenu(true);
        navFromOverlay(b.getAttribute("data-go"));
      });
    });
    if (!$("#menuBack").classList.contains("show")) pushOverlay();
    $("#menuBack").classList.add("show");
    syncLock();

    $all("#pfTheme button").forEach(function (b) {
      b.addEventListener("click", function () { applyTheme(b.getAttribute("data-th")); openMenu(); });
    });
    $("#pfGwStatus").addEventListener("click", function () {
      closeMenu(true); navFromOverlay("gwstatus");
    });
  }
  function closeMenu(fromPop) {
    var was = $("#menuBack").classList.contains("show");
    $("#menuBack").classList.remove("show");
    if (was && fromPop !== true) popOverlay();
    syncLock();
  }
  function segBtn(val, icon, label, cur) {
    return '<button data-th="' + val + '" class="' + (cur === val ? "on" : "") + '">' + svg(icon, 16) + label + '</button>';
  }
  function menuItem(id, icon, label) {
    return '<button id="' + id + '">' + svg(icon, 19) + esc(label) + '</button>';
  }
  // An item with a line under it saying what the page holds.
  function menuSub(id, icon, label, hint) {
    return '<button id="' + id + '" class="withhint">' + svg(icon, 19) +
      '<span class="mtx">' + esc(label) + '<span class="mh">' + esc(hint) + '</span></span></button>';
  }
  function importFile(after) {
    var inp = document.createElement("input");
    inp.type = "file"; inp.accept = "application/json"; inp.style.display = "none";
    inp.addEventListener("change", function (e) {
      var f = e.target.files[0]; if (!f) return;
      var rd = new FileReader();
      rd.onload = function () {
        try { S.importBundle(JSON.parse(rd.result)).then(function () { toast("Imported"); updateDataState(); render(); if (after) after(); }); }
        catch (err) { toast("Invalid file"); }
      };
      rd.readAsText(f);
    });
    document.body.appendChild(inp); inp.click();
    setTimeout(function () { document.body.removeChild(inp); }, 60000);
  }

  /* ====================================================================== */
  /* Player prices                                                          */
  /* ====================================================================== */
  // "Garcia" should find "García", and "erling" should find Haaland. Strip the
  // accents once per player and keep the full name alongside the short one FPL
  // prints, so the search matches the name people actually know.
  function plain(t) {
    t = String(t || "").toLowerCase();
    return t.normalize ? t.normalize("NFD").replace(/[\u0300-\u036f]/g, "") : t;
  }
  function haystack(r) {
    if (r._h == null) r._h = plain(r.name + " " + r.full + " " + r.pos + " " + r.team);
    return r._h;
  }

  // String.prototype.localeCompare builds a collator on every call, which on 600
  // players is most of the cost of a sort. One shared collator, and one key per
  // row rather than three comparisons, keeps every tap the same speed.
  var COLL = (function () {
    try { return new Intl.Collator(undefined, { sensitivity: "base", numeric: true }); }
    catch (e) { return { compare: function (a, b) { return a < b ? -1 : a > b ? 1 : 0; } }; }
  })();
  function sortKey(r) {
    if (r._k == null) r._k = r.name + "\u0000" + r.team + "\u0000" + r.pos;
    return r._k;
  }

  // How far along he is towards his price moving, as a bar. Full means he is at
  // the level where changes have actually been seen to happen; over full means
  // he is past it and should go tonight. Negative is the same journey the other
  // way — being sold rather than bought.
  // Two things this column can honestly say, depending on whether the level at
  // which prices actually move has been measured yet.
  //
  //   measured   — how far along he is towards moving, as a percentage of it
  //   not yet    — how hard he is being bought or sold next to everyone else
  //
  // The header names whichever it is, so one bar never means two things at
  // once. A player who moved before we started watching carries only the flow
  // since then, so his figure is a floor and is marked with a >= sign.
  function progressCell(r, scale) {
    var val = scale ? r.pressure : r.progress;
    if (val == null) return '<span class="move flat">\u2013</span>';
    var up = val >= 0, mag = Math.abs(val);
    var fill, label;
    if (scale) {
      // relative to the busiest player in the table, so the bar is an ordering
      // and carries no number it cannot stand behind
      fill = scale ? Math.min(100, (mag / scale) * 100) : 0;
      label = "";
    } else {
      fill = Math.min(100, mag);
      // Past a point the exact multiple stops meaning anything and only costs
      // column width — a player at ten times the level is going either way.
      label = (r.atLeast ? "\u2265" : "") + (up ? "" : "\u2212") +
        (mag > 999 ? "999+" : mag.toFixed(0) + "%");
    }
    var cls = "prog " + (up ? "up" : "down") +
      (!scale && mag >= 100 ? " full" : "") + (r.atLeast ? " floor" : "") +
      (scale ? " bare" : "");
    return '<span class="' + cls + '"><i style="width:' + Math.max(2, fill).toFixed(0) + '%"></i>' +
      (label ? '<b>' + label + '</b>' : '') + '</span>';
  }

  // How fast he is moving, in the same percentage points the bar is drawn in,
  // and coloured the same way — up towards a rise, down towards a fall.
  function rateCell(r) {
    if (r.perHour == null) return '<span class="rate flat">\u2013</span>';
    var up = r.perHour >= 0, v = Math.abs(r.perHour);
    return '<span class="rate ' + (up ? 'up' : 'down') + '">' +
      (up ? '+' : '\u2212') + (v < 10 ? v.toFixed(2) : v.toFixed(1)) + '</span>';
  }
  // When FPL's own projection has him crossing the line. Prices move once a
  // night, so this is a count of nights: a dash means its projection does not
  // reach the line inside the three it publishes. Both wordings are rendered
  // and the stylesheet picks whichever the screen can afford.
  var DUE_LONG = ["Tonight", "Tomorrow", "2 days"], DUE_SHORT = ["Tngt", "Tmrw", "2d"];
  function dueCell(r) {
    var i = r.dueIn;
    if (i == null || i < 0 || i >= DUE_LONG.length) return '<span class="due flat">\u2013</span>';
    return '<span class="due' + (i === 0 ? ' soon' : '') + '">' +
      '<b class="lw">' + DUE_LONG[i] + '</b><b class="sw">' + DUE_SHORT[i] + '</b></span>';
  }

  function starSvg() {
    return '<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">' +
      '<path d="M12 3.7l2.54 5.15 5.68.83-4.11 4.01.97 5.66L12 16.68l-5.08 2.67.97-5.66' +
      '-4.11-4.01 5.68-.83Z"/></svg>';
  }
  // A face on the left the way the leaderboards have one, and a star on the
  // right. The star is the only control in the row, so it takes the click; the
  // photograph is decoration and the browser is told so.
  function priceRows(rows, tracked, scale, forward, favSet) {
    return rows.map(function (r) {
      var dir = progressCell(r, scale);
      var starred = !!(favSet && favSet[r.id]);
      return '<tr><td class="name"><span class="nwrap">' + faceBox(r.id, r.name, "sm") +
        '<span class="ntxt"><span class="who">' + esc(r.name) + '</span>' +
        '<span class="mgr">' + esc(r.pos) + ' \u00b7 ' + esc(r.team) + '</span></span>' +
        '<button type="button" class="favstar' + (starred ? ' on' : '') + '" data-fav="' + r.id +
        '" aria-pressed="' + (starred ? 'true' : 'false') +
        '" aria-label="' + (starred ? 'Unstar ' : 'Star ') + esc(r.name) + '">' + starSvg() + '</button>' +
        '</span></td>' +
        '<td class="num c-price"><b>' + r.price.toFixed(1) + '</b></td>' +
        '<td class="num c-fpl">' + r.owned.toFixed(1) + '%</td>' +
        '<td class="num c-go">' + (r.goOwned == null ? '\u2013'
            : '<b>' + r.goOwned.toFixed(1) + '%</b>') + '</td>' +
        (tracked ? '<td class="num c-move">' + dir + '</td>' : '') +
        (forward ? '<td class="num c-rate">' + rateCell(r) + '</td>' +
                   '<td class="num c-due">' + dueCell(r) + '</td>' : '') + '</tr>';
    }).join("");
  }

  /* ---- the season's leaderboards ---------------------------------------
     Ten small tables off one pass of C.playerStats, all obeying the same
     position filter, so "most points" and "most points in each position" are
     the same page rather than two. Each board says its own rule underneath:
     the ones that filter — differentials, the ones not paying off — are only
     honest if the threshold they used is on screen with them. */
  var PS_TOP = 8, PS_OWNED = 10, PS_DIFF = 5, PS_DEAR = 6.5;

  function psMoney(v) { return "£" + Number(v).toFixed(1); }
  function psGo(r) { return r.goOwned == null ? "–" : r.goOwned.toFixed(1) + "%"; }
  function psSigned(v) {
    if (!v) return '<span class="move flat">–</span>';
    return '<span class="move ' + (v > 0 ? "up" : "down") + '">' + Math.abs(v).toFixed(1) + '</span>';
  }
  function psTop(list, cmp) { return list.slice().sort(cmp).slice(0, PS_TOP); }

  function psCard(b, list) {
    var rows = b.f(list);
    var h = '<div class="section-title"><h2>' + esc(b.t) + '</h2><div class="rule"></div></div>' +
      '<div class="card"><div class="tablewrap"><table class="t psbtbl"><thead><tr>' +
      '<th class="pos" aria-label="Position in this list">#</th><th class="name">Player</th>' +
      b.c.map(function (c) { return '<th class="num">' + esc(c[0]) + '</th>'; }).join("") +
      '</tr></thead><tbody>';
    if (!rows.length) {
      h += '<tr><td class="psnone" colspan="' + (b.c.length + 2) + '">' +
        'Nobody here meets this yet.</td></tr>';
    } else {
      h += rows.map(function (r, i) {
        return '<tr data-el="' + r.id + '"><td class="pos">' + (i + 1) + '</td>' +
          '<td class="name"><span class="nwrap">' + faceBox(r.id, r.name, "sm") +
          '<span class="ntxt"><span class="who">' + esc(r.name) + '</span>' +
          '<span class="mgr">' + esc(r.pos) + ' · ' + esc(r.team) + '</span></span></span></td>' +
          b.c.map(function (c) { return '<td class="num">' + c[1](r) + '</td>'; }).join("") + '</tr>';
      }).join("");
    }
    return h + '</tbody></table></div><div class="note psnote">' + b.n + '</div></div>';
  }

  function psBoards(st) {
    var n = st.recent.length;
    var span = n > 1 ? "GW" + st.recent[0] + "–" + st.recent[n - 1] : "GW" + st.recent[0];
    return [
      { t: "Most points", n: "Everything scored so far, bonus included.",
        c: [["Pts", function (r) { return "<b>" + num(r.pts) + "</b>"; }],
            ["£", function (r) { return psMoney(r.price); }],
            ["GO", psGo]],
        f: function (l) { return psTop(l, function (a, b) { return b.pts - a.pts || b.ga - a.ga; }); } },

      { t: "Points per £m", n: "Points divided by what he costs today. What a place in your squad " +
          "is returning, rather than what it returned to whoever bought him early.",
        c: [["Per £m", function (r) { return "<b>" + r.ppm.toFixed(1) + "</b>"; }],
            ["Pts", function (r) { return num(r.pts); }],
            ["£", function (r) { return psMoney(r.price); }]],
        f: function (l) {
          return psTop(l.filter(function (r) { return r.mins > 0 && r.ppm != null; }),
            function (a, b) { return b.ppm - a.ppm || b.pts - a.pts; });
        } },

      { t: "Goals and assists", n: "Goal involvements, however they were shared out.",
        c: [["G+A", function (r) { return "<b>" + num(r.ga) + "</b>"; }],
            ["G", function (r) { return num(r.goals); }],
            ["A", function (r) { return num(r.assists); }]],
        f: function (l) {
          return psTop(l.filter(function (r) { return r.ga > 0; }),
            function (a, b) { return b.ga - a.ga || b.goals - a.goals || b.pts - a.pts; });
        } },

      { t: "Biggest haul", n: "The best single gameweek anyone has put together.",
        c: [["Pts", function (r) { return "<b>" + num(r.best.pts) + "</b>"; }],
            ["When", function (r) { return "GW" + r.best.gw; }],
            ["£", function (r) { return psMoney(r.price); }]],
        f: function (l) {
          return psTop(l.filter(function (r) { return r.best && r.best.pts > 0; }),
            function (a, b) { return b.best.pts - a.best.pts || b.pts - a.pts; });
        } },

      { t: "In form", n: "The last " + n + " gameweek" + (n === 1 ? "" : "s") + " — " + span + ".",
        c: [["Last " + n, function (r) { return "<b>" + num(r.form) + "</b>"; }],
            ["Season", function (r) { return num(r.pts); }],
            ["£", function (r) { return psMoney(r.price); }]],
        f: function (l) {
          return psTop(l.filter(function (r) { return r.form > 0; }),
            function (a, b) { return b.form - a.form || b.pts - a.pts; });
        } },

      { t: "Not paying off", n: "In at least " + PS_OWNED + "% of Game On squads and costing " +
          psMoney(PS_DEAR) + " or more, fewest points first. Cheap players left out on purpose: " +
          "a bench defender on two points has not let anyone down.",
        c: [["Pts", function (r) { return "<b>" + num(r.pts) + "</b>"; }],
            ["GO", psGo],
            ["£", function (r) { return psMoney(r.price); }]],
        f: function (l) {
          return psTop(l.filter(function (r) {
            return r.goOwned != null && r.goOwned >= PS_OWNED && r.price >= PS_DEAR;
          }), function (a, b) { return a.pts - b.pts || b.goOwned - a.goOwned; });
        } },

      { t: "Differentials", n: "In no more than " + PS_DIFF + "% of Game On squads, most points first " +
          "— what the rest of the league has been missing.",
        c: [["Pts", function (r) { return "<b>" + num(r.pts) + "</b>"; }],
            ["GO", psGo],
            ["£", function (r) { return psMoney(r.price); }]],
        f: function (l) {
          return psTop(l.filter(function (r) {
            return r.goOwned != null && r.goOwned <= PS_DIFF && r.pts > 0;
          }), function (a, b) { return b.pts - a.pts || a.goOwned - b.goOwned; });
        } },

      { t: "Most captained", n: "Armbands handed out across the league all season, and what the " +
          "average one of them came back with.",
        c: [["Armbands", function (r) { return "<b>" + num(r.caps) + "</b>"; }],
            ["Each", function (r) { return r.capAvg == null ? "–" : r.capAvg.toFixed(1); }],
            ["GO", psGo]],
        f: function (l) {
          return psTop(l.filter(function (r) { return r.caps > 0; }),
            function (a, b) { return b.caps - a.caps || (b.capAvg || 0) - (a.capAvg || 0); });
        } },

      { t: "Biggest risers", n: "How far a price has climbed since the season began.",
        c: [["Change", function (r) { return psSigned(r.rise); }],
            ["Now", function (r) { return psMoney(r.price); }],
            ["GO", psGo]],
        f: function (l) {
          return psTop(l.filter(function (r) { return r.rise > 0; }),
            function (a, b) { return b.rise - a.rise || (b.goOwned || 0) - (a.goOwned || 0); });
        } },

      { t: "Biggest fallers", n: "And how far one has dropped. A player you hold at a price below " +
          "what you paid sells back for less than he cost.",
        c: [["Change", function (r) { return psSigned(r.rise); }],
            ["Now", function (r) { return psMoney(r.price); }],
            ["GO", psGo]],
        f: function (l) {
          return psTop(l.filter(function (r) { return r.rise < 0; }),
            function (a, b) { return a.rise - b.rise || (b.goOwned || 0) - (a.goOwned || 0); });
        } }
    ];
  }

  function renderPlayerBoards(host, ds) {
    var st = ds ? K.playerStats(ds) : null;
    if (!st || !st.rows.length) {
      host.innerHTML =
        '<div class="callout">The season’s player numbers arrive with the next data sync.</div>';
      return;
    }
    if (!state.psPos) state.psPos = "all";
    var poss = { all: "All positions", 1: "Goalkeepers", 2: "Defenders", 3: "Midfielders", 4: "Forwards" };
    host.innerHTML =
      '<div class="pickrow"><select class="in narrow" id="psPos">' +
      Object.keys(poss).map(function (k) {
        return '<option value="' + k + '"' + (k === state.psPos ? " selected" : "") + '>' +
          esc(poss[k]) + '</option>';
      }).join("") + '</select></div>' +
      '<div class="statlead">' + num(st.gws.length) + ' gameweek' + (st.gws.length === 1 ? '' : 's') +
      ' played · GO is his share of Game On’s ' + num(st.managers) + ' squads</div>' +
      '<div id="psPanel"></div>';

    var boards = psBoards(st);
    var draw = function () {
      var list = state.psPos === "all" ? st.rows
        : st.rows.filter(function (r) { return String(r.type) === state.psPos; });
      fill("#psPanel", host, boards.map(function (b) { return psCard(b, list); }).join(""));
    };
    $("#psPos", host).addEventListener("change", function () { state.psPos = this.value; draw(); });
    // Tap a player for his own page, as the pitch cards do.
    $("#psPanel", host).addEventListener("click", function (e) {
      var tr = e.target.closest && e.target.closest("tr[data-el]");
      if (tr) location.hash = "player/" + tr.getAttribute("data-el") + "/" + ds.pitchGw;
    });
    draw();
  }

  // Prices and the season's leaderboards used to share a toggle here, from the
  // days when one menu entry led to both and you had to cross between them.
  // They are two entries now, so the toggle was a control that only ever took
  // you where you had not asked to go, above the thing you had asked for. The
  // Premier League keeps its own (plHead) because that section really is one
  // entry with two views.

  function renderPrices(host, ds) {
    var rows = ds ? K.priceTable(ds) : null;
    if (!rows || !rows.length) {
      host.innerHTML = '<div class="callout">No player list in this data yet.</div>';
      return;
    }
    // Prices and both ownerships are published already; which way a price is
    // moving only exists once the updater has been recording it. The very first
    // capture has the record but nothing to compare it against — every row would
    // read as a dash, which looks broken rather than early, so hold the column
    // back until there is genuinely something to put in it.
    var thr = K.priceThreshold(ds);
    // Whether these figures are FPL's own, published per player, or the ones we
    // work out ourselves from transfer flow for data captured before we read
    // FPL's. Either way they are percentages of the same line, so the column
    // says Progress; what changes is whether a caveat belongs under it.
    var told = rows.some(function (r) { return r.told; });
    // Before the threshold is known the bar is scaled to the strongest pressure
    // in the whole list, not the filtered view, so filtering or searching never
    // changes how far along anyone looks.
    var scale = (told || thr.measured) ? 0 : rows.reduce(function (m, r) {
      return Math.max(m, Math.abs(r.pressure || 0));
    }, 0);
    // Nothing to say yet: on the very first capture there is no threshold and
    // no flow either, and a column of dashes reads as broken rather than early.
    var tracked = rows.some(function (r) { return r.pressure != null; }) &&
      (told || thr.measured || scale > 0);
    if (!state.pricePos) state.pricePos = "all";

    // Each column knows how to order itself and which way round it should read
    // the first time you tap it: names run A to Z, numbers put the biggest
    // first, since that is what anyone opening this table came to see.
    var COLS = [
      { k: "name",  t: "Player",  first: 1,
        cmp: function (a, b) { return COLL.compare(a.name, b.name); } },
      { k: "price", t: "Price", s: "\u00a3", num: 1, first: -1, cls: "c-price",
        cmp: function (a, b) { return a.price - b.price; } },
      // Stands down on a phone so the name can carry a face and a star; every
      // other FPL app shows this number, and GO beside it is the one that does
      // not exist anywhere else.
      { k: "owned", t: "FPL",     num: 1, first: -1, cls: "c-fpl",
        cmp: function (a, b) { return a.owned - b.owned; } },
      { k: "go",    t: "Game On", s: "GO", num: 1, first: -1, cls: "c-go",
        cmp: function (a, b) { return (a.goOwned || 0) - (b.goOwned || 0); } }
    ];
    if (tracked) COLS.push({ k: "move", t: (told || thr.measured) ? "Progress" : "Pressure",
      s: (told || thr.measured) ? "Prog" : "", num: 1, first: -1, cls: "c-move",
      cmp: function (a, b) { return (a.pressure || 0) - (b.pressure || 0); } });
    // Only FPL's own figures carry a rate and a projection; our measured model
    // has neither, and empty columns would say we had lost them rather than
    // never had them.
    var forward = told && rows.some(function (r) { return r.perHour != null || r.dueIn != null; });
    if (forward) {
      // Also stands down on a phone. Progress says how far along he is and Time
      // says when it lands; the hourly rate is the arithmetic between them, and
      // it is the one of the three a thumb can do without.
      COLS.push({ k: "rate", t: "Per hr", s: "/hr", num: 1, first: -1, cls: "c-rate",
        cmp: function (a, b) { return (a.perHour || 0) - (b.perHour || 0); } });
      // soonest first, and everyone FPL does not expect to move sits behind them
      COLS.push({ k: "due", t: "Time", num: 1, first: 1, cls: "c-due",
        cmp: function (a, b) {
          return (a.dueIn == null ? 99 : a.dueIn) - (b.dueIn == null ? 99 : b.dueIn);
        } });
    }

    var colOf = function (k) {
      for (var i = 0; i < COLS.length; i++) if (COLS[i].k === k) return COLS[i];
      return null;
    };
    // A column that has gone away (Moving, before there is movement) must not
    // leave the table sorted by something it can no longer show a header for.
    if (!colOf(state.priceSort)) { state.priceSort = "price"; state.priceDir = 0; }
    if (!state.priceDir) state.priceDir = colOf(state.priceSort).first;

    // Six hundred players is the right list for finding a transfer and the
    // wrong one for the question most people open this page with, which is
    // whether anything they own is about to move tonight. This narrows the
    // table rather than navigating anywhere, so it belongs on the page in a
    // way the old Prices/Stats toggle did not.
    if (["all", "mine", "favs"].indexOf(state.prWho) === -1) state.prWho = "all";
    var poss = { all: "All", 1: "GK", 2: "DEF", 3: "MID", 4: "FWD" };
    var WHO = [["all", "All players", "All"], ["mine", "My team", "Mine"], ["favs", "Favourites", "Starred"]];
    var h = '<div class="pseg psegwide three" role="tablist" id="prWho">' +
      WHO.map(function (t) {
        // Two wordings, the short one for a phone that cannot hold three full
        // labels without squeezing them into nonsense.
        return '<button type="button" role="tab" data-who="' + t[0] + '"' +
          (state.prWho === t[0] ? ' class="on" aria-selected="true"' : ' aria-selected="false"') +
          '><span class="lw">' + esc(t[1]) + '</span><span class="sw">' + esc(t[2]) + '</span></button>';
      }).join("") + '</div>' +
      '<div class="pickrow">' +
      '<select class="in narrow" id="prPos">' + Object.keys(poss).map(function (k) {
        return '<option value="' + k + '"' + (k === state.pricePos ? ' selected' : '') + '>' + esc(poss[k]) + '</option>';
      }).join("") + '</select>' +
      searchBox("prSearch") + '</div>';
    h += '<div id="prPanel"></div>';
    host.innerHTML = h;

    // An empty table has several reasons now, and naming the wrong one reads as
    // a fault rather than a filter doing its job.
    function emptyWhy() {
      var q = $("#prSearch", host) && $("#prSearch", host).value.trim();
      if (state.prWho === "mine" && !mineSet) return "We do not have your squad yet. It arrives with the next sync after a deadline.";
      if (state.prWho === "favs" && !favSet.n) return "No players starred yet. Tap the star beside a name in All players to keep an eye on him.";
      if (state.prWho === "mine") return "Nobody in your team matches that.";
      if (state.prWho === "favs") return "None of your starred players matches that.";
      return q ? "No player matches that search." : "No players to show.";
    }

    // Whoever he is today, and whoever he is watching. Read once per render
    // rather than once per keystroke.
    var mineSet = null;
    if (state.me) {
      var mineIds = K.mySquadIds(ds, state.me);
      if (mineIds) { mineSet = {}; mineIds.forEach(function (e) { mineSet[e] = 1; }); }
    }
    var favSet = { n: 0 };
    var readFavs = function () {
      favSet = { n: 0 };
      favs().forEach(function (e) { favSet[e] = 1; favSet.n++; });
    };
    readFavs();

    $all('[data-who]', host).forEach(function (b) {
      b.addEventListener("click", function () {
        var want = b.getAttribute("data-who");
        if (want === "mine" && !state.me) {
          toast("Pick your team first");
          openProfile({ edit: true });
          return;
        }
        if (want === state.prWho) return;
        state.prWho = want;
        $all('[data-who]', host).forEach(function (x) {
          var on = x.getAttribute("data-who") === want;
          x.classList.toggle("on", on);
          x.setAttribute("aria-selected", on ? "true" : "false");
        });
        draw();
      });
    });

    // Starring is one row's business: repaint that star rather than the six
    // hundred rows around it, which would cost the reader their place in the
    // list. The exception is the starred list itself, where the row he just
    // unstarred has to leave.
    $("#prPanel", host).addEventListener("click", function (e) {
      var btn = e.target.closest && e.target.closest("[data-fav]");
      if (!btn) return;
      var el = +btn.getAttribute("data-fav");
      var was = toggleFav(el);
      readFavs();
      if (state.prWho === "favs") { draw(); return; }
      var on = was === "added";
      btn.classList.toggle("on", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      btn.setAttribute("aria-label", (on ? "Unstar " : "Star ") +
        btn.getAttribute("aria-label").replace(/^(Un)?[Ss]tar /, ""));
    });

    // Every player is in the table, so nobody is unreachable by scrolling. But
    // six hundred rows are six hundred rows of layout, and the browser will not
    // paint a half-built table: the reader gets a screenful first and the rest
    // arrives behind it, a hundred at a time, while they are already reading.
    var FIRST = 24, CHUNK = 100, gen = 0, pendRaf = 0, pendTo = 0;
    function stopFill() {
      if (pendRaf) { cancelAnimationFrame(pendRaf); pendRaf = 0; }
      if (pendTo) { clearTimeout(pendTo); pendTo = 0; }
    }
    // requestAnimationFrame runs *before* the frame it belongs to is styled,
    // laid out and painted. Queueing the rest of the rows there put all six
    // hundred into the same layout as the first batch, so the split bought
    // nothing: the screen stayed empty for a second and a half and then the
    // whole table appeared at once. A timeout started from inside that frame
    // runs after it has been painted, which is what "the rest can follow" was
    // meant to mean all along.
    function afterPaint(fn) {
      stopFill();
      pendRaf = requestAnimationFrame(function () {
        pendRaf = 0;
        pendTo = setTimeout(function () { pendTo = 0; fn(); }, 0);
      });
    }
    var draw = function () {
      gen++;
      stopFill();
      var list = rows.slice();
      if (state.prWho === "mine") list = mineSet ? list.filter(function (r) { return mineSet[r.id]; }) : [];
      if (state.prWho === "favs") list = list.filter(function (r) { return favSet[r.id]; });
      if (state.pricePos !== "all") list = list.filter(function (r) { return String(r.type) === state.pricePos; });
      // Search all 600-odd players, not just the ones on screen. Filtering the
      // rendered rows used to hide anyone the current sort had pushed down.
      var q = plain($("#prSearch", host) ? $("#prSearch", host).value : "").trim();
      if (q) list = list.filter(function (r) { return haystack(r).indexOf(q) !== -1; });
      var col = colOf(state.priceSort), dir = state.priceDir;
      // Ties fall back to name, then club, then position — all three folded into
      // one key — so the two players called Davies always sit in the same order
      // however you arrived at the table, rather than in whatever order the
      // last sort happened to leave them.
      list.sort(function (a, b) {
        return (col.cmp(a, b) * dir) || COLL.compare(sortKey(a), sortKey(b));
      });

      var head = COLS.map(function (c) {
        var on = c.k === state.priceSort;
        var arrow = on ? (dir === 1 ? "\u2191" : "\u2193") : "";
        // Two wordings where a header has a short one, so a narrow screen can
        // drop to it rather than push the last column off the edge. The full
        // name is the label either way, so what is read out never shortens.
        return '<th class="sortable' + (c.num ? " num" : "") + (c.cls ? " " + c.cls : "") + (on ? " sorted" : "") +
          '" data-sort="' + c.k + '" role="button" tabindex="0" aria-label="' + esc(c.t) +
          '" aria-sort="' + (on ? (dir === 1 ? "ascending" : "descending") : "none") + '">' +
          (c.s ? '<span class="lw">' + esc(c.t) + '</span><span class="sw">' + esc(c.s) + '</span>'
               : esc(c.t)) + '<span class="sarrow">' + arrow + '</span></th>';
      }).join("");

      var panel = $("#prPanel", host);
      if (!panel) return; // the screen moved on while a control was being used
      // "freeze" alone, as the league tables use it: .card carries overflow:hidden
      // and wins on order, which left the rows unreachable by any gesture even
      // though scrollTop still moved them from script.
      panel.innerHTML = '<div class="freeze"><table class="t pricetbl"><thead><tr>' +
        head + '</tr></thead><tbody>' + priceRows(list.slice(0, FIRST), tracked, scale, forward, favSet) + '</tbody></table></div>' +
        (list.length ? '' : '<div class="callout nohits">' + esc(emptyWhy()) + '</div>') +
        (tracked && !told && !thr.measured
          ? '<div class="koline">Pressure orders who is being bought and sold hardest. ' +
            'It becomes a distance to a price change once we have seen a night of real ' +
            'changes to measure the level against.</div>'
          : '');

      if (list.length > FIRST) {
        var mine = gen, body = $("tbody", panel), at = FIRST;
        // While rows are still arriving the table is not yet the whole list.
        // Saying so out loud costs an attribute and saves anything that reads
        // this table — a test, or a future affordance — from having to guess
        // at how busy the machine is.
        panel.setAttribute("data-filling", "1");
        var done = function () { if (panel) panel.removeAttribute("data-filling"); };
        var fill = function () {
          // A tap or a keystroke while this was queued has already redrawn the
          // table; appending the rest of a list nobody is looking at any more
          // would mix two sorts together. isConnected rather than parentNode
          // because a replaced panel leaves its old table whole but detached,
          // which the parent check could not tell from a live one.
          if (mine !== gen || !body.isConnected) { done(); return; }
          // Views are kept rather than thrown away, so leaving this one for
          // another would otherwise have left six hundred rows laying
          // themselves out behind a page the reader had already moved on to.
          // Stopping is safe: coming back here renders the table again.
          if (!host.classList.contains("active")) { done(); return; }
          var end = Math.min(list.length, at + CHUNK);
          body.insertAdjacentHTML("beforeend", priceRows(list.slice(at, end), tracked, scale, forward, favSet));
          at = end;
          if (at < list.length) afterPaint(fill); else done();
        };
        afterPaint(fill);
      }

      var hit = function (th) {
        var k = th.getAttribute("data-sort");
        // Same column reverses; a new one starts the way that column reads best.
        if (k === state.priceSort) state.priceDir = -state.priceDir;
        else { state.priceSort = k; state.priceDir = colOf(k).first; }
        draw();
      };
      $all("th.sortable", panel).forEach(function (th) {
        th.addEventListener("click", function () { hit(th); });
        th.addEventListener("keydown", function (e) {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); hit(th); }
        });
      });
    };
    $("#prPos", host).addEventListener("change", function () { state.pricePos = this.value; draw(); });
    var prSearched = false;
    $("#prSearch", host).addEventListener("input", function () {
      if (!prSearched && this.value.trim()) { prSearched = true; track("price-search", true); }
      draw();
    });
    draw();
  }

  /* ---- the Premier League scoreboard ------------------------------------ */
  // Every match of a gameweek, with arrows to page through the season: the
  // kick-off time until a game starts, then the live score with the minute,
  // then the final score. The rows ride the same published fixtures the pitch
  // cards use, so the live poll keeps them ticking between full syncs.
  // Won, drawn, lost as a run of five, newest last — the shape of a team's form
  // before any of the numbers are read.
  function plForm(last5) {
    if (!last5 || !last5.length) return '<span class="l5"></span>';
    var pad = 5 - last5.length, out = "";
    last5.forEach(function (r) {
      var t = r === "W" ? "won" : r === "L" ? "lost" : "drew";
      out += '<i class="l5r ' + r.toLowerCase() + '" title="' + t + '">' +
        (r === "W" ? "\u2713" : r === "L" ? "\u2715" : "\u2013") + '</i>';
    });
    while (pad-- > 0) out += '<i class="l5r none"></i>';
    return '<span class="l5" role="img" aria-label="last ' + last5.length + ': ' +
      last5.join(", ") + '">' + out + '</span>';
  }

  // Fixtures or table: one head for both, so the toggle does not jump.
  function plHead(tab) {
    return '<div class="pseg psegwide" role="tablist">' +
      '<button type="button" role="tab" data-pl="fixtures"' +
        (tab === "fixtures" ? ' class="on" aria-selected="true"' : ' aria-selected="false"') + '>Fixtures</button>' +
      '<button type="button" role="tab" data-pl="table"' +
        (tab === "table" ? ' class="on" aria-selected="true"' : ' aria-selected="false"') + '>Table</button>' +
      '</div>';
  }
  function plWire(host, ds) {
    var all = (ds && ds.gwFixtures) || {};
    $all('[data-pl]', host).forEach(function (b) {
      b.addEventListener("click", function () {
        if (b.getAttribute("data-pl") === "table") { location.hash = "pl/table"; return; }
        var gws = Object.keys(all).map(Number).sort(function (x, y) { return x - y; });
        // ds is read defensively a line above because this wiring is also put
        // on the "no fixtures yet" page, which is what a device with no data
        // at all gets. The handler has to be as careful as the line above it:
        // tapping Fixtures there used to throw rather than do nothing.
        var gw = (ds && ds.pitchGw && all[ds.pitchGw]) ? +ds.pitchGw : gws[gws.length - 1];
        location.hash = gw ? "pl/" + gw : "pl";
      });
    });
  }

  // The table, from the same fixtures the scoreboard draws. Eleven columns is
  // more than a phone has, so the ones that can be worked out from the rest —
  // won, drawn, lost, and the goals either way — step back as the screen
  // narrows. Played, goal difference and points never do.
  function renderPlTable(host, ds) {
    var t = K.plTable(ds);
    if (!t || !t.rows.length) {
      host.innerHTML = plHead("table") +
        '<div class="callout">The season’s fixtures arrive with the next data sync — the table builds itself from them.</div>';
      plWire(host, ds);
      return;
    }
    var COLS = [
      ["mp", "Played", "Pl"], ["w", "Won", "W"], ["d", "Drawn", "D"], ["l", "Lost", "L"],
      ["gf", "Goals for", "GF"], ["ga", "Goals against", "GA"],
      ["gd", "Goal difference", "GD"], ["pts", "Points", "Pts"]
    ];
    var h = plHead("table") + '<div class="card">' +
      '<div class="hd"><h3>Standings</h3>' +
      '<button type="button" class="hinfo" id="plWhat" aria-label="How this table is worked out">' +
      svg("info", 16) + '</button>' +
      '<span class="sub">' + num(t.played) + ' match' + (t.played === 1 ? '' : 'es') +
      ' counted</span></div>' +
      '<div class="freeze"><table class="t pltbl">' +
      '<thead><tr><th class="pos" aria-label="Position">#</th><th class="name">Club</th>' +
      COLS.map(function (c) {
        return '<th class="num c-' + c[0] + '" aria-label="' + esc(c[1]) + '">' + esc(c[2]) + '</th>';
      }).join("") + '<th class="num c-l5" aria-label="Last five results">Last 5</th></tr></thead><tbody>';
    t.rows.forEach(function (r) {
      // Three go down, which is fixed; four is the smallest number of European
      // places, which is not — so the band marks where a club sits and leaves
      // the prize to the caption.
      var band = r.pos <= 4 ? " top" : (r.pos > t.teams - 3 ? " drop" : "");
      h += '<tr class="plrow' + band + '"><td class="pos">' + r.pos + '</td>' +
        '<td class="name"><span class="who">' + crest(r.team) + esc(r.name) + '</span></td>' +
        COLS.map(function (c) {
          var v = r[c[0]];
          if (c[0] === "gd" && v > 0) v = "+" + v;
          return '<td class="num c-' + c[0] + (c[0] === "pts" ? " pts" : "") + '">' + v + '</td>';
        }).join("") +
        '<td class="num c-l5">' + plForm(r.last5) + '</td></tr>';
    });
    h += '</tbody></table></div></div>';
    host.innerHTML = h;
    plWire(host, ds);
    $("#plWhat", host).addEventListener("click", function () {
      modal("How this table works", plHelp(t));
    });
  }

  /* What used to sit in small print under the table, with room to say it
     properly: how the order is settled, where the numbers come from, and what
     the marked rows at either end do and do not claim. */
  function plHelp(t) {
    var h = helpList("How the order is settled", [
      ["Points", "Three for a win, one for a draw. The column the table is sorted on."],
      ["Goal difference", "Goals scored less goals conceded. It separates clubs level on points."],
      ["Goals scored", "It separates clubs still level after goal difference."],
      ["Still level on all three", "They share the place rather than being split by an order the " +
        "rules do not set, so two clubs can both be 4th and the next club is 6th."]
    ]);
    h += helpList("Where the numbers come from", [
      ["The results themselves", "Every column is worked out here from the matches on the Fixtures " +
        "page — the same ones this app publishes — rather than copied from a table somewhere else."],
      ["When a match counts", "From the final whistle. A match being played is not in these numbers " +
        "yet, however far into it we are." +
        (t && t.played != null ? " " + num(t.played) + " match" + (t.played === 1 ? " has" : "es have") +
          " counted so far." : "")],
      ["Last 5", "The last five matches a club has actually played, oldest on the left: " +
        "\u2713 won, \u2013 drew, \u2715 lost."]
    ]);
    h += helpList("The marked rows", [
      ["The top four", "Four is the smallest number of places that has gone to European competition, " +
        "and how many there really are changes from season to season. The mark shows where a club " +
        "sits; it does not promise what that place wins."],
      ["The bottom three", "The relegation places. That number is fixed, so these are the three going down."]
    ]);
    return h;
  }

  function renderPl(host, ds) {
    if (state.plMatch) return renderMatch(host, ds);
    if (state.plTab === "table") return renderPlTable(host, ds);
    var all = (ds && ds.gwFixtures) || {};
    var gws = Object.keys(all).map(Number).sort(function (a, b) { return a - b; });
    if (!gws.length) {
      host.innerHTML = plHead("fixtures") +
        '<div class="callout">The gameweek’s fixtures arrive with the next data sync — check back in a few minutes.</div>';
      plWire(host, ds);
      return;
    }
    // The address picks the gameweek; without one, open on the current one.
    var gw = state.plGw && all[state.plGw] ? +state.plGw
           : (ds.pitchGw && all[ds.pitchGw] ? +ds.pitchGw : gws[gws.length - 1]);
    var at = gws.indexOf(gw);
    var rows = (all[gw] || []).slice();
    var names = ds.teamNames || {};
    var full = function (s) { return names[s] || s; };
    rows.sort(function (a, b) {
      var x = a[7] || "9999", y = b[7] || "9999";
      return x < y ? -1 : x > y ? 1 : 0;
    });
    // grouped by day, the way every fixtures page reads
    var groups = [], cur = null;
    rows.forEach(function (f) {
      var d = f[7] ? new Date(f[7]) : null;
      var label = d ? d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })
                    : "Date to be confirmed";
      if (!cur || cur.label !== label) { cur = { label: label, fx: [] }; groups.push(cur); }
      cur.fx.push(f);
    });
    // A day on which every match has finished does not need "Full time"
    // under each of them — the scores are final and the caption was saying
    // so ten times over. The caption stays while a day is still mixed, where
    // it tells the finished matches from the live and the unplayed.
    var isDone = function (f) { return !!f[3] || !!f[8]; };
    var h = plHead("fixtures") + '<div class="plnav">' +
      '<button type="button" class="gwarr" id="plPrev" aria-label="Earlier gameweek"' + (at > 0 ? '' : ' disabled') + '>‹</button>' +
      '<h2>Gameweek ' + gw + '</h2>' +
      '<button type="button" class="gwarr" id="plNext" aria-label="Later gameweek"' + (at < gws.length - 1 ? '' : ' disabled') + '>›</button>' +
      '</div>';
    groups.forEach(function (g) {
      var quiet = g.fx.length > 0 && g.fx.every(isDone);
      h += '<div class="card"><div class="plday">' + esc(g.label) + '</div>' +
        '<div class="fxwrap"><div class="fxgrp">' +
        g.fx.map(function (f) { return plFixtureRow(f, full, gw, quiet); }).join("") + '</div></div></div>';
    });
    host.innerHTML = h;
    var flip = function (step) { return function () {
      var to = gws[at + step];
      if (to != null) location.hash = "pl/" + to;
    }; };
    $("#plPrev", host).addEventListener("click", flip(-1));
    $("#plNext", host).addEventListener("click", flip(1));
    // every fixture is a doorway to its match
    $all("[data-plfx]", host).forEach(function (el) {
      el.addEventListener("click", function () { location.hash = "pl/" + el.getAttribute("data-plfx"); });
    });
    plWire(host, ds);
  }

  // One fixture as a row: the kick-off time until it starts, the live score
  // with the minute, then the final score. finished_provisional is full time on
  // the pitch — the whistle has gone even while FPL still folds the bonus in —
  // so it reads Full time. Given a gameweek the row is a link to its match.
  function plFixtureRow(f, full, tapGw, quiet) {
    var started = !!f[2], done = !!f[3] || !!f[8];
    var hs = f[4], as = f[5], mins = f[6] || 0, ko = f[7] ? new Date(f[7]) : null;
    var pill, cap = "";
    if (!started) {
      var t = ko ? ko.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "TBC";
      pill = '<div class="fxsc ahead"><span class="fxv">' + esc(t) + '</span></div>';
    } else if (hs == null || as == null) {
      // a dataset cached before scores were published: the next sync fills them
      pill = '<div class="fxsc ahead"><span class="fxv">–</span></div>';
      cap = done ? (quiet ? "" : "Full time") : "In play";
    } else {
      pill = '<div class="fxsc"><span class="fxp">' + hs + '</span><span class="fxp">' + as + '</span></div>';
      cap = done ? (quiet ? "" : "Full time") : '<span class="golive">' + (mins ? mins + "′ · " : "") + 'live</span>';
    }
    var tap = tapGw ? ' tap" data-plfx="' + tapGw + "/" + esc(f[0]) + "-" + esc(f[1]) +
      '" role="link" tabindex="0" aria-label="' + esc(full(f[0])) + ' v ' + esc(full(f[1])) + ', open the match' : '';
    return '<div class="fx' + (started ? "" : " ahead") + tap + '">' +
      '<div class="fxs l"><span class="fxm">' + crest(f[0]) + esc(full(f[0])) + '</span></div>' + pill +
      '<div class="fxs r"><span class="fxm">' + esc(full(f[1])) + crest(f[1]) + '</span></div>' +
      (cap ? '<div class="fxw">' + cap + '</div>' : "") + '</div>';
  }

  /* ---- one match ---------------------------------------------------------
     The two squads side by side, each player with what he has scored this
     gameweek, from the same points and provisional bonus the pitch cards use.
     Points, ownership or value on every row, the way a profile's pitch offers
     them; tap a player for his breakdown. Who featured leads; the rest fold
     away underneath. Before kick-off the whole squad shows and points wait. */
  function renderMatch(host, ds) {
    var m = state.plMatch, sheet = K.matchSheet(ds, m.gw, m.home, m.away);
    if (!sheet) {
      host.innerHTML = plHead("fixtures") +
        '<div class="callout">That match is not in Gameweek ' + m.gw + '’s fixtures.</div>';
      plWire(host, ds);
      return;
    }
    var metric = METRICS[state.plMetric] ? state.plMetric : "pts";
    var fx = sheet.fixture, names = ds.teamNames || {};
    var full = function (k) { return names[k] || k; };
    var f = [m.home, m.away, fx.started ? 1 : 0, fx.done ? 1 : 0, fx.hs, fx.as, fx.mins, fx.ko, fx.done ? 1 : 0];

    var h = '<div class="card mhead"><div class="fxwrap"><div class="fxgrp">' +
      plFixtureRow(f, full, null) + '</div></div></div>';
    h += matchEventsHtml(ds, m.gw, m.home, m.away);
    h += '<div class="psegrow"><div class="pseg sm">' + Object.keys(METRICS).map(function (k) {
      return '<button type="button"' + (metric === k ? ' class="on"' : '') +
        ' data-metric="' + k + '">' + esc(METRICS[k]) + '</button>';
    }).join("") + '</div></div>';

    var anyProv = false;
    var rowOf = function (p, dim) {
      if (p.prov) anyProv = true;
      var v = metric === "pts" ? (fx.started ? num(p.pts) : "–") : metricOf(p, metric);
      return '<div class="mrow' + (dim ? ' dim' : '') + '" data-el="' + p.el + '" data-mult="1"' +
        ' role="button" tabindex="0">' +
        '<span class="mn">' + esc(p.name) + '</span><span class="mpos">' + esc(p.pos) + '</span>' +
        '<span class="mv">' + v + '</span></div>';
    };
    var col = function (sd) {
      var c = '<div class="card mcol"><div class="mclub"><b>' + esc(sd.name) + '</b>' +
        (fx.started && metric === "pts" ? '<span class="mtot">' + num(sd.total) + ' pts</span>' : '') + '</div>';
      // Before kick-off every score on the sheet is a dash, so a points order
      // has nothing to stand on: whoever the sheet happened to list first read
      // as though he were leading something. The squad goes in price order
      // instead, as one list, which a reader can follow and which is what the
      // rest of the sheet was already sorted by.
      if (!fx.started) {
        return c + sd.featured.concat(sd.rest).sort(function (a, b) {
          return (b.price - a.price) ||
                 (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
        }).map(function (p) { return rowOf(p, false); }).join("") + '</div>';
      }
      c += sd.featured.map(function (p) { return rowOf(p, false); }).join("");
      if (sd.rest.length) {
        c += '<details class="mrest"><summary>Did not feature · ' + sd.rest.length + '</summary>' +
          sd.rest.map(function (p) { return rowOf(p, true); }).join("") + '</details>';
      }
      return c + '</div>';
    };
    // data-bgw tells the breakdown modal which gameweek a tapped row belongs to
    h += '<div class="mcols" data-bgw="' + m.gw + '">' + col(sheet.home) + col(sheet.away) + '</div>';

    var notes = [];
    if (!fx.started) notes.push("Not kicked off yet — points appear from kick-off. Until then each squad is in price order.");
    else if (!fx.done) notes.push("In play: points move as the match does, bonus included as it stands.");
    if (anyProv && fx.started) notes.push("Bonus is provisional until FPL confirms it.");
    [sheet.home, sheet.away].forEach(function (sd) {
      if (sd.games > 1) notes.push(sd.name + " plays " + sd.games + " matches this gameweek; these are gameweek points, which FPL does not split by match.");
    });
    if (notes.length) h += '<div class="koline">' + notes.map(esc).join(" ") + '</div>';

    host.innerHTML = h;
    $(".psegrow", host).addEventListener("click", function (e) {
      var b = e.target.closest("[data-metric]");
      if (!b) return;
      state.plMetric = b.getAttribute("data-metric");
      renderMatch(host, ds);
    });
  }

  /* ---- what happened in the match ----------------------------------------
     Who scored, who set them up, who was booked — FPL's own per-fixture
     record, so a double gameweek puts each goal in the match it belongs to
     rather than in whichever of the two came first.

     It is deliberately not a timeline. FPL publishes no minute against any
     event, no substitutions and no half-time marker, so the shape most match
     pages use — a clock running down the middle — could only be drawn by
     making the times up. What it does have that no other FPL app does is how
     many of our own 245 owned the man, which is the reason anyone in this
     league cares who scored.                                              */
  var EV_TAG = { g: "", a: "assist", pm: "pen missed", ps: "pen saved", y: "", r: "" };
  function evMark(e) {
    if (e.k === "y" || e.k === "r") {
      return '<svg class="evcard ' + e.k + '" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">' +
        '<rect x="7.5" y="3.5" width="9" height="17" rx="2.2"/></svg>';
    }
    if (e.k === "a") return svg("assist", 15);
    if (e.k === "ps") return svg("shield", 15);
    return svg("ball", 15);
  }
  function evRow(e, mgrs) {
    var tag = e.own ? "o.g." : EV_TAG[e.k];
    var what = e.own ? "Own goal" : e.k === "g" ? "Goal" : e.k === "a" ? "Assist"
             : e.k === "y" ? "Yellow card" : e.k === "r" ? "Red card"
             : e.k === "pm" ? "Penalty missed" : "Penalty saved";
    var says = what + (e.n > 1 ? " \u00d7" + e.n : "") + " \u2014 " + e.name +
      (e.count ? ", owned by " + e.count + " of " + mgrs : "") + (e.mine ? ", in your squad" : "");
    return '<div class="mevrow ' + e.k + (e.own ? ' og' : '') + (e.mine ? ' mine' : '') +
      '" data-el="' + e.el + '" role="button" tabindex="0" aria-label="' + esc(says) + '">' +
      '<span class="mevi">' + evMark(e) + '</span>' +
      '<span class="mevn"><span class="who">' + esc(e.name) + '</span>' +
      (e.n > 1 ? '<i class="mevx">\u00d7' + e.n + '</i>' : '') +
      (tag ? '<i class="mevt">' + esc(tag) + '</i>' : '') + '</span>' +
      (e.count ? '<span class="mevo" aria-hidden="true">' + num(e.count) + '</span>' : '') +
      '</div>';
  }
  function matchEventsHtml(ds, gw, home, away) {
    var ev = K.matchEvents(ds, gw, home, away, state.me);
    if (!ev) return "";
    var side = function (list) {
      return list.length
        ? list.map(function (e) { return evRow(e, ev.managers); }).join("")
        : '<div class="mevnone">\u2013</div>';
    };
    var note = "FPL publishes who, not when \u2014 there are no minutes in its data. " +
      "The number is how many of our " + ev.managers + " owned him.";
    // Counting the names under a score and getting a different number is the
    // kind of thing that makes a reader stop trusting the whole page, so say
    // which way it is rather than leaving them to wonder.
    if (ev.tallies === false) {
      note = (ev.done
        ? "These do not add up to the score yet \u2014 FPL's record of the match is still settling. "
        : "The scoreline moves before the record behind it, so a goal can appear here a few minutes late. ")
        + note;
    }
    return '<div class="card mev" data-bgw="' + gw + '">' +
      '<div class="mevhd">Match events</div>' +
      '<div class="mevcols"><div class="mevside">' + side(ev.home) + '</div>' +
      '<div class="mevside r">' + side(ev.away) + '</div></div>' +
      '<div class="note mevnote">' + esc(note) + '</div></div>';
  }

  /* ====================================================================== */
  /* One footballer's own page                                              */
  /* ====================================================================== */
  /* The tap-up sheet answers "what did he score"; this answers "should I own
     him". Same player, different question, so it is a page with an address
     rather than a sheet over whatever you were looking at.

     Three figures across the top, each with where he stands among his own
     position, then what is behind him and what is ahead of him, then every
     match either way. Form and points per match are FPL's own numbers so the
     page agrees with the official app; the rank beside them is ours, because
     FPL publishes no such thing.                                          */

  // 1 is a kind fixture and 5 a brutal one, coloured as the official app does.
  function fdrChip(n) {
    if (!n) return '<span class="fdr none" title="Difficulty not published">–</span>';
    return '<span class="fdr f' + n + '" role="img" aria-label="Difficulty ' + n +
      ' of 5">' + n + '</span>';
  }
  // One box of the rail: what it is, the number, and the line that gives the
  // number its meaning. The subtext is trusted markup, never a reader's text.
  function ppBox(lab, val, sub) {
    return '<div class="pprbox"><div class="pprl">' + esc(lab) + '</div>' +
      '<div class="pprv">' + esc(val) + '</div>' +
      '<div class="pprs">' + (sub || "") + '</div></div>';
  }
  // The six matches either side of now: what he did, then what is coming.
  function profStrip(hist, ahead) {
    var done = (hist ? hist.rows : []).filter(function (r) { return !r.ahead && !r.blank; }).slice(-3);
    var next = (ahead || []).slice(0, 3);
    if (!done.length && !next.length) return "";
    var cell = function (gw, opp, home, body, cls) {
      return '<div class="pstcell' + (cls ? " " + cls : "") + '">' +
        '<div class="pstgw">GW' + gw + '</div>' +
        '<div class="pstcr">' + crest(opp) + '</div>' +
        '<div class="pstopp">' + esc(opp) + ' <i>(' + (home ? "H" : "A") + ')</i></div>' +
        '<div class="pstv">' + body + '</div></div>';
    };
    var h = '<div class="card pstrip"><div class="pstwrap">';
    done.forEach(function (r) {
      var f = r.fixtures[0] || { opp: "–", home: true };
      h += cell(r.gw, f.opp, f.home,
        r.pts == null ? '<span class="dash">–</span>'
          : '<b>' + num(r.pts) + '</b> pt' + (Math.abs(r.pts) === 1 ? '' : 's'), "was");
    });
    next.forEach(function (f) {
      h += cell(f.gw, f.opp, f.home, fdrChip(f.fdr), "next");
    });
    return h + '</div></div>';
  }

  function renderPlayer(host, ds) {
    var el = state.playerId;
    if (!ds || !ds.elements || !el || !ds.elements[el]) {
      host.innerHTML = '<div class="callout">That player is not in this data.</div>';
      return;
    }
    var P = K.playerProfile(ds, el), hist = K.playerHistory(ds, el);
    var flag = K.availability(ds, el, null);

    var h = flagBanner(flag);

    // 1 — who he is
    h += '<div class="card pphead">' + faceBox(el, P.name, "xl") +
      '<div class="ppwho"><div class="ppos">' + esc(P.pos) + '</div>' +
      '<h2>' + esc(P.full) + '</h2>' +
      '<div class="ppclub">' + crest(P.club) + esc((ds.teamNames || {})[P.club] || P.club) + '</div>' +
      '</div>' +
      '<button type="button" class="hinfo ppinfo" id="ppWhat" aria-label="What these figures mean">' +
      svg("info", 17) + '</button></div>';

    // 2 — the four numbers, as a rail.
    //
    // They were three figures in a hard third-each grid with a price card above
    // them. A third of a phone is about a hundred points, and "Owned by FPL" is
    // a long label to put in it above a number and a rank: the labels crowded
    // the dividers and the text ran into itself. A rail gives each box its own
    // room and scrolls when four will not fit, which is the honest answer to
    // not enough width — crushing them was not.
    var moved = Math.round((P.price - P.start) * 10) / 10;
    h += '<div class="card pprail"><div class="pprwrap">' +
      ppBox("Total points", P.points == null ? "\u2013" : num(P.points),
        P.ppm.value == null ? "this season" : P.ppm.value.toFixed(1) + " per match") +
      // Short subtexts on purpose: four boxes on a phone is ninety points each,
      // and a sentence in there is what pushes the fourth off the screen.
      ppBox("Price", psMoney(P.price),
        moved ? '<b class="' + (moved > 0 ? "up" : "down") + '">' + Math.abs(moved).toFixed(1) + '</b> so far'
              : "unchanged") +
      ppBox("Owned by FPL", P.owned.toFixed(1) + "%", "of all squads") +
      ppBox("Owned by GO", P.goOwned == null ? "\u2013" : P.goOwned.toFixed(1) + "%",
        P.goOwned == null ? "no squads yet"
          : num(Math.round((P.goOwned / 100) * P.managers)) + " of " + num(P.managers)) +
      '</div></div>';

    // 4 — recent form and what is coming
    h += profStrip(hist, P.ahead);

    // 5 — every match, behind and ahead
    var tab = state.ppTab === "fixtures" ? "fixtures" : "results";
    h += '<div class="pseg psegwide ppseg" role="tablist" id="ppSeg">' +
      '<button type="button" role="tab" data-pp="results"' +
        (tab === "results" ? ' class="on" aria-selected="true"' : ' aria-selected="false"') + '>Results</button>' +
      '<button type="button" role="tab" data-pp="fixtures"' +
        (tab === "fixtures" ? ' class="on" aria-selected="true"' : ' aria-selected="false"') + '>Fixtures</button>' +
      '</div><div class="card"><div id="ppPanel"></div></div>';

    host.innerHTML = h;

    var panel = $("#ppPanel", host);
    var paint = function () {
      panel.innerHTML = tab === "fixtures" ? ppFixtures(P) : ppResults(ds, el, hist);
    };
    $("#ppWhat", host).addEventListener("click", function () {
      modal("What these mean", playerHelp());
    });
    $all("[data-pp]", host).forEach(function (b) {
      b.addEventListener("click", function () {
        var want = b.getAttribute("data-pp");
        if (want === tab) return;
        tab = state.ppTab = want;
        $all("[data-pp]", host).forEach(function (x) {
          var on = x.getAttribute("data-pp") === want;
          x.classList.toggle("on", on);
          x.setAttribute("aria-selected", on ? "true" : "false");
        });
        paint();
      });
    });
    // A row opens its own gameweek underneath it rather than over the page:
    // the question "where did those twelve points come from" is asked of a row
    // while reading the column, and a sheet would take the column away.
    panel.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("[data-ppgw]");
      if (!b) return;
      var gw = b.getAttribute("data-ppgw");
      var open = panel.querySelector('.ppexp[data-for="' + gw + '"]');
      $all(".ppexp", panel).forEach(function (x) { if (x !== open) x.remove(); });
      $all("[data-ppgw]", panel).forEach(function (x) {
        if (x !== b) x.classList.remove("open");
      });
      if (open) { open.remove(); b.classList.remove("open"); return; }
      b.classList.add("open");
      var row = document.createElement("tr");
      row.className = "ppexp";
      row.setAttribute("data-for", gw);
      row.innerHTML = '<td colspan="5">' + bdGwPanel(ds, el, +gw, 1) + '</td>';
      b.parentNode.insertBefore(row, b.nextSibling);
    });
    paint();

    // The gameweek the reader tapped, opened and brought into view. Cleared
    // once used: coming back here later should not keep reopening a row from a
    // journey that is over.
    if (state.playerGw) {
      var want = panel.querySelector('[data-ppgw="' + state.playerGw + '"]');
      state.playerGw = null;
      if (want) {
        want.click();
        var card = want.closest(".card");
        if (card) card.scrollIntoView({ block: "center", behavior: "instant" in window ? "instant" : "auto" });
      }
    }
  }

  // What he has done: every gameweek played, newest first, each opening its
  // own points breakdown underneath.
  function ppResults(ds, el, hist) {
    var rows = (hist ? hist.rows : []).filter(function (r) { return !r.ahead; })
      .slice().reverse();
    if (!rows.length) return '<div class="callout">No gameweeks have been played yet.</div>';
    var fx = ds.gwFixtures || {}, club = ds.elements[el][2];
    // His side's score first, and the pill coloured by how his side did —
    // green for a win, red for a loss, plain for a draw — as FPL's own page
    // colours it. A match still in play is not a result and stays plain.
    var scoreOf = function (gw, opp, home) {
      var f = (fx[gw] || []).filter(function (x) {
        return (x[0] === club && x[1] === opp) || (x[1] === club && x[0] === opp);
      })[0];
      if (!f || f[4] == null || f[5] == null) return { text: "", cls: "" };
      var us = home ? f[4] : f[5], them = home ? f[5] : f[4];
      var over = f[3] || f[8];
      return { text: us + " - " + them, cls: !over ? "" : us > them ? " win" : us < them ? " loss" : " draw" };
    };
    return '<table class="t pptbl"><thead><tr>' +
      '<th class="gw">GW</th><th>Opponent</th><th class="sc">Result</th>' +
      '<th class="pt">Points</th><th class="more" aria-label="More"></th>' +
      '</tr></thead><tbody>' + rows.map(function (r) {
        var f = r.fixtures[0];
        var opp = r.blank ? '<span class="bdblank">no fixture</span>'
          : '<span class="nwrap">' + crest(f.opp) + esc(f.opp) +
            '<i class="bdha">' + (f.home ? "H" : "A") + '</i></span>';
        var sc = r.blank ? { text: "", cls: "" } : scoreOf(r.gw, f.opp, f.home);
        var pts = r.pts == null ? '<span class="bdblank">–</span>'
          : '<b>' + num(r.pts) + '</b>' + (r.prov ? '<i class="bdprov" title="includes provisional bonus">*</i>' : '');
        return '<tr' + (r.blank ? '' : ' data-ppgw="' + r.gw + '" role="button" tabindex="0"') + '>' +
          '<td class="gw">' + r.gw + '</td><td class="name">' + opp + '</td>' +
          '<td class="sc"><span class="ppsc' + sc.cls + '">' + esc(sc.text) + '</span></td>' +
          '<td class="pt">' + pts + '</td>' +
          '<td class="more">' + (r.blank ? '' : '<i class="ppmore" aria-hidden="true">+</i>') + '</td></tr>';
      }).join("") + '</tbody></table>';
  }

  // What is ahead: date, gameweek, who, and how hard FPL rates it.
  function ppFixtures(P) {
    if (!P.ahead.length) return '<div class="callout">No fixtures left this season.</div>';
    return '<table class="t pptbl ppfx"><thead><tr>' +
      '<th>Date</th><th class="gw">GW</th><th>Opponent</th>' +
      '<th class="fd" aria-label="Fixture difficulty rating">FDR</th>' +
      '</tr></thead><tbody>' + P.ahead.map(function (f) {
        // Two lines rather than one long one: "Sat, 10 Oct, 02:00 PM" across a
        // phone leaves no room for the rating beside it, and the day and the
        // time are read for different reasons anyway.
        var d = f.ko ? new Date(f.ko) : null;
        var when = d
          ? '<b>' + esc(d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })) +
            '</b><span>' + esc(d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })) + '</span>'
          : '<b>–</b>';
        return '<tr><td class="ppwhen">' + when + '</td>' +
          '<td class="gw">' + f.gw + '</td>' +
          '<td class="name"><span class="nwrap">' + crest(f.opp) + esc(f.opp) +
          '<i class="bdha">' + (f.home ? "H" : "A") + '</i></span></td>' +
          '<td class="fd">' + fdrChip(f.fdr) + '</td></tr>';
      }).join("") + '</tbody></table>';
  }

  /* ---- gameweek status ---------------------------------------------------
     Every gameweek and how far along it is. A gameweek does not simply end:
     the whistle goes, then FPL confirms bonus, then it finalises the points,
     and those are hours apart. When a score looks wrong the honest answer is
     usually that one of these steps has not happened yet, so this page shows
     which. Green is done, red is not yet — red on a gameweek that has not
     been played is simply the future, not a fault. */
  // A moment, told the way a person would: the weekday, the date and the time.
  function whenText(iso) {
    return new Date(iso).toLocaleString(undefined,
      { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  }
  // What each step actually does, in a line under it: whose move it is, FPL's
  // or ours, and what it changes in the app. The full account is behind the
  // information button; this is the part worth having in view.
  var STEP_WHAT = {
    lock:   "FPL locks every squad. We read all of them and the new gameweek appears here.",
    ko:     "Points and ranks move every ten minutes or so. Bonus is provisional; auto subs not yet.",
    ft:     "Every player\u2019s points are in apart from bonus. Nothing is settled yet.",
    bonus:  "FPL\u2019s official bonus replaces the provisional one, usually the next morning.",
    squads: "FPL has made its auto subs. We re-read every squad, so the eleven shown is the eleven that played.",
    final:  "FPL signs the week off, usually early the next afternoon. LMS, months and groups settle."
  };
  function stepRow(st, on, when) {
    var line = "";
    if (when && when.at) {
      line = '<span class="gwwhen' + (when.kind === "expected" ? ' est' : '') + '">' +
        (when.kind === "expected" ? "Expected " : "") + esc(whenText(when.at)) + '</span>';
    }
    var what = STEP_WHAT[st.k] ? '<span class="gwwhat">' + esc(STEP_WHAT[st.k]) + '</span>' : '';
    return '<div class="gwstep' + (on ? ' on' : '') + '">' +
      '<i class="gwmark" aria-hidden="true">' + sicon(on ? "check" : "cross") + '</i>' +
      '<span class="gwlab">' + esc(st.t) + line + what + '</span>' +
      '<span class="gwyn">' + (on ? "Done" : "Not yet") + '</span></div>';
  }
  function renderGwStatus(host, ds) {
    var st = ds ? K.gwStatus(ds) : null;
    if (!st || !st.rows.length) {
      // No published calendar: nothing has milestones yet, and an empty table
      // would read as though every step had failed.
      host.innerHTML = '<div class="callout">No gameweeks have been published yet. ' +
        'Once FPL publishes the season\u2019s calendar every gameweek appears here ' +
        'with how far along it is.</div>';
      return;
    }
    var steps = K.GW_STEPS;
    var dayOf = function (iso) {
      if (!iso) return "";
      return new Date(iso).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
    };

    // The gameweek that is actually in flight leads, spelled out in words —
    // the table below is quick to scan but only once you know the columns.
    var focus = st.at;
    if (!focus) {
      var done = st.rows.filter(function (r) { return r.steps.final; });
      focus = done.length ? done[done.length - 1] : st.rows[0];
    }
    var times = K.gwTimes(ds, focus) || {};
    var h = '<div class="card"><div class="hd"><h3>' + esc(focus.name) + '</h3>' +
      '<button type="button" class="hinfo" id="gwWhat" aria-label="What these mean">' +
      svg("info", 16) + '</button>' +
      '<span class="sub">' + focus.done + ' of ' + focus.total + ' done</span></div>' +
      '<div class="gwsteps">' + steps.map(function (x) {
        return stepRow(x, focus.steps[x.k], times[x.k]);
      }).join("") + '</div>' +
      (focus.fixtures
        ? '<div class="gwfoot">' + focus.played + ' of ' + focus.fixtures + ' matches at full time' +
          (focus.deadline ? ' \u00b7 deadline ' + esc(dayOf(focus.deadline)) : '') + '</div>'
        : '') +
      '</div>';

    // The gameweek is played across two or three days and each of them clears
    // on its own, so a day that is settled says so rather than being hidden
    // inside a gameweek that is not.
    var DAY_STATE = { confirmed: "Confirmed", ft: "Awaiting bonus", live: "In play", ahead: "To come" };
    if (focus.days && focus.days.length) {
      h += '<div class="card"><div class="hd"><h3>Match days</h3>' +
        '<span class="sub">' + focus.days.filter(function (d) { return d.done; }).length +
        ' of ' + focus.days.length + ' confirmed</span></div>' +
        focus.days.map(function (d) {
          return '<div class="gwday' + (d.done ? ' on' : '') + '">' +
            '<div class="gwdn"><b>' + esc(d.ko
              ? new Date(d.ko).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" })
              : "Date to be confirmed") + '</b>' +
            '<span class="gwdm">' + d.n + ' match' + (d.n === 1 ? '' : 'es') +
            (d.state === "live" ? ' \u00b7 ' + d.ft + ' at full time' : '') + '</span></div>' +
            '<span class="gwpill">' + esc(DAY_STATE[d.state] || d.state) + '</span></div>';
        }).join("") + '</div>';
    }

    // The detail of what each step and each status means lives behind the
    // information button: it is worth reading once, not on every visit.
    var basis = 0;
    Object.keys(times).forEach(function (k) {
      if (times[k].kind === "expected" && times[k].basis > basis) basis = times[k].basis;
    });
    h += '<div class="note gwnote">A score can be right and still not be final. ' +
      'Tap <b>\u24d8</b> for what each step and status means.</div>';

    host.innerHTML = h;
    $("#gwWhat", host).addEventListener("click", function () { modal("What these mean", gwHelp(basis)); });
  }

  /* What the page is actually claiming, in one place. Written to be read once:
     the six steps in the order they happen, what a match day's badge means,
     and — the part people ask about — which times are FPL's, which we watched,
     and which are worked out from what we watched. */
  // A titled run of term-and-meaning pairs: how every help sheet in the app is
  // laid out, so they all read the same way.
  function helpList(title, rows) {
    return '<h4 class="gwh4">' + esc(title) + '</h4><dl class="gwdl">' +
      rows.map(function (r) {
        return '<dt>' + esc(r[0]) + '</dt><dd>' + r[1] + '</dd>';
      }).join("") + '</dl>';
  }

  function gwHelp(basis) {
    var list = helpList;
    var h = list("The gameweek, step by step", [
      ["Deadline passed", "FPL locks every squad: no transfer, captain or chip can change for this gameweek. " +
        "Within the next half hour this app reads all " + "the league\u2019s squads \u2014 it takes longest at the deadline, " +
        "when everyone\u2019s app is asking FPL at once \u2014 and the Classic bar, the profiles and the Picks tab switch to the new gameweek."],
      ["First match kicked off", "From here this app reads FPL about every ten minutes. Player points, Classic totals and ranks, " +
        "the month\u2019s table and the pyramid\u2019s mini-season all move live. Bonus is provisional, worked out from the same bps FPL uses, " +
        "and marked with a *. Automatic substitutions have not happened: a benched player\u2019s points count for nobody until FPL finalises."],
      ["Every match at full time", "The last whistle has gone. Every player\u2019s points are in apart from bonus. Nothing is settled: " +
        "no elimination, no month, no group result, no XP."],
      ["Bonus confirmed", "FPL awards the official bonus on every match, in practice the morning after the last match. " +
        "It replaces the provisional bonus and the * goes. Almost always the same numbers, but only now are they FPL\u2019s."],
      ["Auto subs stored here", "With the bonus in, FPL makes its automatic substitutions. Within ten minutes this app re-reads every squad, " +
        "so the eleven shown is the eleven that played, substitutes in, and the pitch and the points agree with FPL\u2019s."],
      ["Gameweek finalised by FPL", "FPL checks the week and signs it off: points final, overall ranks updated. This season that has landed " +
        "early in the afternoon after the last match; the Expected time above is worked from the gameweeks watched so far. Only now do the " +
        "competitions that need a closed gameweek settle: the week\u2019s LMS elimination (its tie-breakers count the playing XI), a month once " +
        "its last gameweek is closed, UCL group results, and the pyramid at the end of its season. XP moves from on course to settled only " +
        "when a competition finishes."]
    ]);
    h += list("Who moves when", [
      ["Classic", "Moves live through the gameweek, provisional bonus included. Final once FPL finalises."],
      ["Manager of the Month", "The table moves live. A month is won only when its last gameweek is finalised."],
      ["Last Manager Standing", "Nothing moves during the week. The elimination is decided when FPL finalises the gameweek."],
      ["Pyramid", "Mini-season totals move live. Promotion and relegation are decided when the season\u2019s last gameweek is finalised."],
      ["UCL", "A gameweek counts in the group tables once its bonus is in and the subs are stored, as FPL counts it; while it is in play the matches show live scores and no result. The stage is complete only once FPL has checked every week."]
    ]);
    h += list("A match day's badge", [
      ["Confirmed", "Every match that day is done and its bonus is official."],
      ["Awaiting bonus", "Every match that day has finished, but FPL has not confirmed the bonus."],
      ["In play", "At least one match that day is still being played."],
      ["To come", "None of that day's matches have kicked off."]
    ]);
    h += list("Where the times come from", [
      ["The deadline and kick-off", "FPL's own published times. Exact."],
      ["Times without <i>Expected</i>", "Steps we watched happen. This app reads FPL every ten minutes, so these are right to within ten minutes."],
      ["Times marked <i>Expected</i>", basis
        ? "Not happened yet, so worked out from the " + num(basis) + " gameweek" +
          (basis === 1 ? "" : "s") + " we have watched so far. A guide, not a promise, and it sharpens each week."
        : "Not happened yet. Nothing is shown until we have watched a gameweek go through the same step, so there is nothing here to work from."]
    ]);
    h += '<div class="note">Why a gameweek does not simply end: the whistle, the bonus and ' +
      'the finalising are three separate moments, and in practice they are hours apart. ' +
      'A day of it can be completely settled while another has not kicked off, which is why ' +
      'the match days are listed on their own.</div>';
    return h;
  }

  /* ---- winnings ---------------------------------------------------------
     Only what is actually won. A competition pays when it finishes, so a
     month that has been played is money in the bank and a classic table that
     is still moving is not — the same settled flag every profile already
     shows, so this page and a manager's own XP card can never disagree.
     Ordered most first; level amounts share a place. */
  function renderWinnings(host, ds) {
    if (!ds || !ds.managers || !ds.managers.length) { host.innerHTML = emptyState(); return; }
    var all = K.winningsAll(ds);
    var rows = ds.managers.map(function (m) {
      var w = all[+m.id] || { items: [], settled: 0, onTrack: 0 };
      return { id: m.id, name: m.entryName, who: m.playerName || "", amount: w.settled,
               onTrack: w.onTrack,
               items: w.items.filter(function (i) { return i.settled; }) };
    }).filter(function (x) { return x.amount > 0; })
      .sort(function (a, b) { return (b.amount - a.amount) || COLL.compare(a.name, b.name); });

    if (!rows.length) {
      // Nothing is settled yet, which is a state worth naming rather than an
      // empty page: it says what has to happen before anyone appears here.
      var waiting = ds.managers.reduce(function (n, m) {
        return n + (((all[+m.id] || {}).onTrack > 0) ? 1 : 0);
      }, 0);
      host.innerHTML = '<div class="card"><div class="bd">' +
        '<div class="wnone"><b>Nothing is settled yet.</b>' +
        '<p>A competition pays out when it finishes — a month when its last gameweek is played, ' +
        'the Pyramid when its mini-season ends, Classic and Last Manager Standing at the end of ' +
        'the season. Until then the standings still move.</p>' +
        (waiting ? '<p>' + num(waiting) + ' manager' + (waiting === 1 ? " is" : "s are") +
          ' in an XP place as it stands. Their tabs show where they are.</p>' : "") +
        '</div></div></div>';
      return;
    }

    var pot = rows.reduce(function (n, r) { return n + r.amount; }, 0);
    // Joint on equal amounts, and the next place skipped, as everywhere else.
    var pos = 0, prev = null;
    rows.forEach(function (r, i) {
      if (r.amount !== prev) { pos = i + 1; prev = r.amount; }
      r.pos = pos;
    });

    var h = '<div class="pcards">' +
      pcard("Settled", xpa(pot), rows.length + (rows.length === 1 ? " manager" : " managers") + " paid so far") +
      pcard("Biggest", xpa(rows[0].amount), rows[0].name) +
      '</div>';
    h += '<div class="card"><div class="freeze"><table class="t wintbl"><thead><tr>' +
      '<th class="pos" aria-label="Position">#</th><th class="name">Manager</th>' +
      '<th class="num">Won</th></tr></thead><tbody>';
    rows.forEach(function (r) {
      h += '<tr' + (isMe(r.id) ? ' class="me"' : "") + ' data-entry="' + r.id + '">' +
        '<td class="pos">' + r.pos + '</td>' +
        '<td class="name"><span class="who">' + esc(r.name) + '</span>' +
        '<div class="mgr">' + esc(r.who) + '</div>' +
        '<div class="wfor">' + r.items.map(function (it) {
          return '<span class="wtag"><b>' + esc(it.comp) + '</b> ' + esc(it.label) +
            ' <i>' + xpa(it.amount) + '</i></span>';
        }).join("") + '</div></td>' +
        '<td class="num"><span class="prize">' + xpa(r.amount) + '</span>' +
        (r.onTrack ? '<div class="mgr">+' + xpa(r.onTrack) + ' on track</div>' : '') +
        '</td></tr>';
    });
    h += '</tbody></table></div>' +
      '<div class="note" style="padding:10px 14px">Only competitions that have finished. Anything still being played is on ' +
      'its own tab until its last gameweek is done.</div></div>';
    host.innerHTML = h;
  }

  /* ---- the section menu -------------------------------------------------- */
  // Sections, shown above everything the gear used to hold — one menu, not two.
  function sectionList() {
    var here = state.view;
    // Coming back should land where the reader left, not always on Classic.
    var backTo = TABS.map(function (t) { return t.id; }).indexOf(state.backView) === -1
      ? "classic" : state.backView;
    var items = [
      { k: "pl", go: "pl", t: "Premier League", s: "Live scores and results, match by match",
        i: markTile("mpl", "#9d5bd2", "#43146e", G_FOOT, "pl-lion.webp") },
      { k: "league", go: backTo, t: "Game On tournament", s: "Classic, MoM, LMS, Pyramid and UCL",
        i: markTile("mgo", "#ffd76a", "#e6a417", G_TROPHY, "logo-tile.webp") },
      { k: "vol", go: "vol", t: "Game On Voluntary", s: "Five side leagues and prizes",
        i: markTile("mvo", "#ff9f4a", "#d1521c", G_COINS, "logo-tile-inv.webp") }
    ];
    // Prices and player stats are not a section of the league — they are
    // reference, about footballers rather than managers — so they live in the
    // profile sheet with the other lookups instead of here.
    var inLeague = here !== "prices" && here !== "pl" && here !== "vol";
    return '<div class="menu"><div class="lab-sm">Sections</div>' +
      '<div class="menulist">' + items.map(function (it) {
        var on = (it.k === "league") ? inLeague : (here === it.k);
        return '<button type="button" class="menuitem' + (on ? " on" : "") + '" data-go="' + it.go + '">' +
          '<span class="mi-i">' + it.i + '</span>' +
          '<span class="mi-t">' + esc(it.t) + '</span>' +
          '<span class="mi-s">' + esc(it.s) + '</span></button>';
      }).join("") + '</div></div>';
  }

  /* ---- staying current -------------------------------------------------- */
  // The updater publishes every half hour through match windows, so an app left
  // open would otherwise sit on whatever it loaded at boot — the deadline would
  // tick down while the points stood still. Poll for a newer publish and swap it
  // in where the reader already is, so nobody has to think about refreshing.
  var AUTO_LIVE_MS = 120000, AUTO_IDLE_MS = 900000, AUTO_MIN_GAP = 20000;
  var autoTimer = null, autoBusy = false, autoLast = 0;

  function sheetOpen() {
    return $("#modalBack").classList.contains("show") ||
           $("#menuBack").classList.contains("show") ||
           $("#youBack").classList.contains("show");
  }

  // Swapping the data re-renders the view, which must not interrupt someone
  // mid-thought: not while a sheet is up, and not while they are typing into a
  // search box, where a rebuild would eat the keystroke and the caret with it.
  function busyReading() {
    if (sheetOpen()) return true;
    var el = document.activeElement;
    return !!(el && el !== document.body && el.closest && el.closest("main.wrap") &&
              /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName));
  }

  // Re-rendering rebuilds the table, which would otherwise throw the reader
  // back to the top of it.
  function keepPlace(fn) {
    var y = window.scrollY || 0;
    var fz = $(".view.active .freeze");
    var inner = fz ? fz.scrollTop : 0;
    fn();
    var fz2 = $(".view.active .freeze");
    if (fz2) fz2.scrollTop = inner;
    window.scrollTo(0, y);
  }

  // Live movement. A re-render rebuilds the table; without this a rank change
  // is a row that was here and is now there, and a score that ticked up is a
  // number that is simply different. Rows are measured by manager before the
  // rebuild and again after, and each one that moved slides from its old
  // place to its new one; a number cell that changed rolls to its new value
  // and its row glows for a moment; a pitch card whose points changed flashes.
  // Nothing here touches what is shown — the final text is whatever the
  // render wrote — and under reduced motion only the glow remains.
  function reducedMotion() {
    try { return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; }
    catch (e) { return false; }
  }
  function liveSnapshot() {
    var host = $(".view.active");
    if (!host) return null;
    var rows = {}, cards = {};
    $all("table.t tbody tr", host).forEach(function (tr) {
      var n = tr.querySelector("[data-entry]");
      if (!n) return;
      var id = n.getAttribute("data-entry");
      rows[id] = { top: tr.getBoundingClientRect().top,
                   nums: $all("td.num", tr).map(function (td) { return td.textContent; }) };
    });
    $all(".pcard[data-el]", host).forEach(function (c) {
      var p = c.querySelector(".ppts");
      if (p) cards[c.getAttribute("data-el") + "/" + (c.closest(".col") ? "b" : "a")] = p.textContent;
    });
    return { rows: rows, cards: cards };
  }
  // Counts the digits up from one value to the other, then writes the exact
  // final text the render produced. Only a cell that is nothing but a number
  // (or a number in bold) is rolled; anything richer just bumps.
  function rollNumber(td, before) {
    var t = td.querySelector("b") || td;
    if (t.children.length) return;
    var to = parseFloat(String(t.textContent).replace(/[^\d.\-\u2212]/g, "").replace("\u2212", "-"));
    var from = parseFloat(String(before).replace(/[^\d.\-\u2212]/g, "").replace("\u2212", "-"));
    if (isNaN(to) || isNaN(from) || to === from || Math.abs(to - from) > 500) return;
    var finalText = t.textContent, start = null, D = 520;
    var whole = finalText.indexOf(".") === -1;
    function step(ts) {
      if (!start) start = ts;
      var k = Math.min(1, (ts - start) / D);
      var e = 1 - Math.pow(1 - k, 3);
      var v = from + (to - from) * e;
      t.textContent = whole ? num(Math.round(v)) : v.toFixed(1);
      if (k < 1) requestAnimationFrame(step); else t.textContent = finalText;
    }
    requestAnimationFrame(step);
  }
  function liveMotion(fn) {
    var before = null;
    try { before = liveSnapshot(); } catch (e) { before = null; try { console.warn("live motion (before):", e); } catch (e2) {} }
    fn();
    if (!before) return;
    try {
      var host = $(".view.active");
      if (!host) return;
      var quiet = reducedMotion();
      $all("table.t tbody tr", host).forEach(function (tr) {
        var n = tr.querySelector("[data-entry]");
        if (!n) return;
        var was = before.rows[n.getAttribute("data-entry")];
        if (!was) return;
        var nums = $all("td.num", tr), changed = false;
        nums.forEach(function (td, i) {
          if (was.nums[i] !== undefined && was.nums[i] !== td.textContent) {
            changed = true;
            td.classList.add("livebump");
            if (!quiet) rollNumber(td, was.nums[i]);
          }
        });
        if (changed) tr.classList.add("livetick");
        var dy = was.top - tr.getBoundingClientRect().top;
        if (!quiet && Math.abs(dy) > 1 && Math.abs(dy) < 4000) {
          tr.style.transition = "none";
          tr.style.transform = "translateY(" + dy + "px)";
          tr.classList.add("livemove");
          // next frame: let it slide home
          requestAnimationFrame(function () {
            requestAnimationFrame(function () {
              tr.style.transition = "";
              tr.style.transform = "";
            });
          });
        }
      });
      $all(".pcard[data-el]", host).forEach(function (c) {
        var p = c.querySelector(".ppts");
        if (!p) return;
        var was = before.cards[c.getAttribute("data-el") + "/" + (c.closest(".col") ? "b" : "a")];
        if (was !== undefined && was !== p.textContent) c.classList.add("livetick");
      });
    } catch (e) { try { console.warn("live motion:", e); } catch (e2) {} /* decoration; the render already stands */ }
  }

  // Returns true when newer data arrived and was shown. A request that never
  // settles — which a patchy mobile connection will produce sooner or later —
  // must not leave the loop wedged, so give up on one and let the next tick try.
  function autoCheck() {
    if (autoBusy || document.hidden || busyReading()) return Promise.resolve(false);
    autoBusy = true;
    autoLast = Date.now();
    var before = (S.dataset() || {}).updatedAt;
    var gaveUp = new Promise(function (_, rej) { setTimeout(function () { rej(new Error("timeout")); }, 20000); });
    return Promise.race([S.reload(), gaveUp]).then(function (ds) {
      autoBusy = false;
      if (!ds || ds.updatedAt === before) { updateBanner(); return false; }
      if (busyReading()) return false; // they started while it was in flight
      liveMotion(function () { keepPlace(render); });
      return true;
    }, function () { autoBusy = false; return false; });
  }

  // Points only move during a gameweek; the rest of the week a quarter-hourly
  // look is more than enough.
  function autoEvery() {
    var ds = S.dataset();
    return (ds && K.liveGwId(ds)) ? AUTO_LIVE_MS : AUTO_IDLE_MS;
  }

  function scheduleAuto() {
    clearTimeout(autoTimer);
    autoTimer = setTimeout(function () { autoCheck().then(scheduleAuto, scheduleAuto); }, autoEvery());
  }

  // The live overlay: while a gameweek is being played, refresh the moving
  // numbers through the league's proxy every couple of minutes, between the
  // updater's half-hourly publishes. Failures change nothing and the loop
  // simply idles when no gameweek is live.
  var LIVE_MS = window.__LIVE_MS || 120000;
  var liveTimer = null, liveBusy = false, liveLast = 0;
  // How soon after one poll a return to the app may ask for another.
  var LIVE_GAP = window.__LIVE_GAP || 20000;
  function scheduleLive() {
    clearTimeout(liveTimer);
    liveTimer = setTimeout(tickLive, LIVE_MS);
  }
  function tickLive() {
    var ds = S.dataset();
    if (liveBusy || document.hidden || busyReading() || !ds || !K.liveGwId(ds)) { scheduleLive(); return; }
    liveBusy = true; liveLast = Date.now();
    S.liveOverlay().then(function (changed) {
      liveBusy = false;
      if (changed && !busyReading()) liveMotion(function () { keepPlace(render); });
      scheduleLive();
    }, function () { liveBusy = false; scheduleLive(); });
  }

  // Coming back to the app is when the numbers are most likely stale: phones
  // suspend timers the moment it goes into the background.
  function onForeground() {
    if (document.hidden) { clearTimeout(autoTimer); clearTimeout(liveTimer); return; }
    updateBanner();
    // A phone suspends timers the moment the app goes behind the lock screen,
    // so the live loop can come back arbitrarily far behind — or never fire at
    // all. Waking it here is the difference between opening the app mid-match
    // and seeing the score, or watching the last publish grow old for two
    // minutes. The gap keeps a flurry of app switches down to one poll.
    if (Date.now() - liveLast >= LIVE_GAP) tickLive(); else scheduleLive();
    if (Date.now() - autoLast < AUTO_MIN_GAP) { scheduleAuto(); return; }
    autoCheck().then(scheduleAuto, scheduleAuto);
  }

  // Pull to refresh. The bar's refresh button went because the app already
  // refreshes itself on every timer and every return to the foreground; what
  // is left is the moment someone is sitting on an open page and wants to
  // know now. The gesture every phone already knows does that: pull down
  // from the top of a page, and the same publish check and live poll the app
  // runs on its own run at once. The toast afterwards says what happened —
  // "Updated", or "Up to date" with the age, or that nothing new has been
  // published and how long that has been so. Sheets, an input being typed
  // in, and a table scrolled inside its own frame all sit the gesture out.
  function refreshNow() {
    var ds = S.dataset();
    var live = ds && K.liveGwId(ds);
    var pub = autoCheck();
    var lv = Promise.resolve(false);
    if (live && !liveBusy && !busyReading()) {
      liveBusy = true; liveLast = Date.now();
      lv = S.liveOverlay().then(function (c) {
        liveBusy = false;
        if (c && !busyReading()) liveMotion(function () { keepPlace(render); });
        return !!c;
      }, function () { liveBusy = false; return false; });
    }
    return Promise.all([pub, lv]).then(function (r) {
      updateBanner();
      if (r[0] || r[1]) return "Updated";
      var d2 = S.dataset();
      var age = d2 && d2.updatedAt ? Date.now() - Date.parse(d2.updatedAt) : null;
      if (age !== null && !isNaN(age) && age > 30 * 60 * 1000) return "Nothing new published \u2014 not synced for " + spanText(age);
      return "Up to date" + (age !== null && !isNaN(age) ? " \u00b7 synced " + agoText(age) : "");
    });
  }
  function setupPull() {
    if (!("ontouchstart" in window)) return;
    var el = document.createElement("div");
    el.id = "ptr"; el.setAttribute("aria-hidden", "true");
    el.innerHTML = '<span class="ptrin">' + svg("refresh", 18) + '<i>Pull to refresh</i></span>';
    document.body.appendChild(el);
    var icon = el.querySelector("svg"), label = el.querySelector("i");
    var startY = null, dist = 0, pulling = false, busy = false;
    // Short travel: the page itself does not move, so the pill stays near
    // the bar rather than riding down over the first rows.
    var THRESH = 56, MAX = 76;
    function atTop(t) {
      if ((window.scrollY || 0) > 0) return false;
      var sc = t && t.closest && t.closest(".freeze");
      return !(sc && sc.scrollTop > 0);
    }
    function draw() {
      var k = Math.min(1, dist / THRESH);
      el.style.transform = "translate(-50%," + Math.round(dist) + "px)";
      el.style.opacity = String(Math.min(1, k * 1.3));
      icon.style.transform = "rotate(" + Math.round(k * 270) + "deg)";
      label.textContent = k >= 1 ? "Release to refresh" : "Pull to refresh";
      el.classList.toggle("armed", k >= 1);
    }
    function reset() {
      el.classList.remove("show", "armed", "busy");
      el.style.transform = ""; el.style.opacity = ""; icon.style.transform = "";
    }
    document.addEventListener("touchstart", function (e) {
      if (busy || e.touches.length !== 1 || sheetOpen() || busyReading() || !atTop(e.target)) { startY = null; return; }
      startY = e.touches[0].clientY; dist = 0; pulling = false;
    }, { passive: true });
    document.addEventListener("touchmove", function (e) {
      if (startY === null) return;
      var dy = e.touches[0].clientY - startY;
      if (dy <= 0 && !pulling) { startY = null; return; }
      if ((window.scrollY || 0) > 0) { startY = null; if (pulling) { pulling = false; reset(); } return; }
      pulling = true;
      dist = Math.min(MAX, Math.max(0, dy) * 0.45);
      el.classList.add("show");
      draw();
    }, { passive: true });
    function done() {
      if (!pulling) { startY = null; return; }
      var go = dist >= THRESH;
      startY = null; pulling = false;
      if (!go) { reset(); return; }
      busy = true;
      el.classList.add("busy"); label.textContent = "Refreshing\u2026";
      el.style.transform = "translate(-50%," + THRESH + "px)";
      refreshNow().then(function (msg) { toast(msg); }, function () { toast("Could not refresh"); })
        .then(function () { busy = false; reset(); });
    }
    document.addEventListener("touchend", done, { passive: true });
    document.addEventListener("touchcancel", done, { passive: true });
  }

  /* ---- boot ------------------------------------------------------------ */
  // The header and the tab bar are content-sized — icon metrics, the safe-area
  // inset, and the device's own text scaling all move them. The fill-mode
  // height was working off two hardcoded guesses (56 and 66) against real
  // heights of 60 and 70, which left the last row of every table sitting a few
  // pixels under the tab bar. Measure them instead, and again whenever the
  // window changes shape.
  function measureChrome() {
    var bar = $("header.topbar") || $(".topbar");
    var nav = $("nav.navbar") || $(".navbar");
    var r = document.documentElement;
    if (bar) r.style.setProperty("--topbar-h", Math.round(bar.getBoundingClientRect().height) + "px");
    if (nav) r.style.setProperty("--nav-h", Math.round(nav.getBoundingClientRect().height) + "px");
  }

  function boot() {
    warmMarks();
    setupPull();
    window.addEventListener("scroll", profileSpy, { passive: true });
    buildNav();
    measureChrome();
    var remeasure = function () { measureChrome(); };
    window.addEventListener("resize", remeasure);
    window.addEventListener("orientationchange", remeasure);
    if (window.visualViewport) window.visualViewport.addEventListener("resize", remeasure);
    isAdmin(); // persist ?admin flag on first visit
    // There was a refresh button here. It re-fetched data.json and said either
    // "Updated" or "Already up to date" — but the app already re-checks every
    // two minutes while a gameweek is live, every fifteen otherwise, and again
    // every single time it comes back to the foreground, which is what a phone
    // does on every unlock and every app switch. That left it useful only to
    // someone sitting on an open screen who wanted to shave under two minutes
    // off a wait.
    //
    // And it was worst where it looked most useful: when the bar says "not
    // synced for 9h" the staleness is the updater's, not the device's, so the
    // button re-fetched the same old file and answered "Already up to date",
    // which reads as a contradiction of the warning beside it.
    $("#barBack").addEventListener("click", function () {
      if (state.view === "rules" && state.rulesBack) { location.hash = state.rulesBack; return; }
      goBack();
    });
    $("#barInfo").innerHTML = svg("info", 18);
    $("#barMenu").innerHTML = svg("menu", 19);
    $("#barMenu").addEventListener("click", function () { openMenu(); });
    $("#barYou").innerHTML = svg("person", 19);
    $("#barYou").addEventListener("click", function () { openProfile(); });
    $("#cmpMe").addEventListener("click", function () {
      // Nobody can be compared against until the reader has said who they
      // are, so send them to do that rather than opening a half-empty page.
      if (!state.me) { toast("Pick your team first"); openProfile({ edit: true }); return; }
      state.cmpA = state.me; state.cmpB = +state.profileId;
      location.hash = "compare";
    });
    $("#rvToggle").addEventListener("click", function () {
      var r = toggleRival(state.profileId);
      if (r === "full") { toast("You already have " + RIVALS_MAX + " rivals \u2014 unpin one first"); return; }
      toast(r === "added" ? "Pinned as a rival" : "Rival unpinned");
      paintRivalPill();
    });
    // Tap a player anywhere a pitch is drawn: his own page, opened on the
    // gameweek that was tapped. There used to be a sheet here holding a points
    // breakdown and a season table, which is most of what the page does and
    // less of it — so the sheet went and the page took the tap.
    document.addEventListener("click", function (e) {
      var card = e.target.closest && e.target.closest(".pcard[data-el], .mrow[data-el], .mevrow[data-el]");
      if (!card) return;
      var host = card.closest("[data-bgw]");
      if (!host) return;
      location.hash = "player/" + card.getAttribute("data-el") + "/" + host.getAttribute("data-bgw");
    });
    $("#modalClose").addEventListener("click", function () { closeModal(); });
    window.addEventListener("popstate", function () {
      if (swallowPop) { swallowPop = false; return; }
      if ($("#modalBack").classList.contains("show")) { closeModal(true); return; }
      if ($("#youBack").classList.contains("show")) { closeProfile(true); return; }
      if ($("#menuBack").classList.contains("show")) { closeMenu(true); }
    });
    $("#modalBack").addEventListener("click", function (e) { if (e.target === $("#modalBack")) closeModal(); });
    $("#menuBack").addEventListener("click", function (e) { if (e.target === $("#menuBack")) closeMenu(); });
    $("#youBack").addEventListener("click", function (e) { if (e.target === $("#youBack")) closeProfile(); });
    document.addEventListener("click", function (e) {
      if (!e.target.closest) return;
      var b = e.target.closest("[data-rules]");
      if (b) { location.hash = "rules/" + b.getAttribute("data-rules"); return; }
      var cg = e.target.closest("[data-chipgo]");
      if (cg) { location.hash = "chips/" + cg.getAttribute("data-chipgw") + "/" + cg.getAttribute("data-chipgo"); return; }
      var tr = e.target.closest("[data-trend]");
      if (tr) { openTrend(tr.getAttribute("data-trend")); return; }
      var n = e.target.closest("[data-entry]");
      if (!n) {
        // Only the name cell carries the link, but a row is what people aim
        // at — on a phone the name is a third of its width, on a tablet less,
        // so tapping the rank or the points looked like the app had frozen.
        // Any part of a row that names a manager now opens them.
        var tr = e.target.closest("tr");
        if (tr && !e.target.closest("button, a, input, select, label")) n = tr.querySelector("[data-entry]");
      }
      if (n) { location.hash = "profile/" + n.getAttribute("data-entry"); }
    });
    window.addEventListener("hashchange", syncFromHash);
    // keep the deadline in the bar honest without re-rendering the view
    setInterval(function () { if (!$("#menuBack").classList.contains("show")) updateBanner(); }, 60000);

    // Automatic updates. visibilitychange covers tabbing away and back; pageshow
    // catches a restore from the back/forward cache, which is how iOS returns a
    // page it had frozen; focus covers a window regaining it without either.
    document.addEventListener("visibilitychange", onForeground);
    // A photograph that does not arrive must leave no trace: no broken-image
    // icon, no gap where a face should be. error does not bubble, so this
    // listens in the capture phase; taking the img out uncovers the jersey or
    // the initials that were behind it the whole time. One listener for every
    // face in the app, whatever draws it.
    document.addEventListener("error", function (e) {
      var t = e.target;
      if (t && t.tagName === "IMG" && t.classList && t.classList.contains("facepic")) {
        if (t.parentNode) {
          t.parentNode.classList.remove("hasface");
          t.parentNode.removeChild(t);
        }
      }
      if (t && t.tagName === "IMG" && t.classList &&
          (t.classList.contains("crest") || t.classList.contains("mi-logo"))) {
        // A section badge that has failed is not ready any more, whatever it
        // managed at boot. Forgetting it here means the next time the drawer is
        // drawn the glyph comes back underneath, rather than a bare tile.
        if (t.classList.contains("mi-logo")) delete markReady[t.getAttribute("src")];
        if (t.parentNode) t.parentNode.removeChild(t);
      }
    }, true);
    // And one that has arrived should be the only thing there. These are
    // cut-outs on a transparent background, so the jersey behind a man showed
    // through around his head; the fallback only earns its place when there is
    // nothing in front of it. Hidden rather than removed, because the jersey
    // is what gives the slot its height and the card must not move. Marked on
    // load rather than up front: until the picture is really on screen the
    // jersey is still the thing being looked at.
    document.addEventListener("load", function (e) {
      var t = e.target;
      if (t && t.tagName === "IMG" && t.classList && t.classList.contains("facepic") &&
          t.naturalWidth > 0 && t.parentNode) {
        t.parentNode.classList.add("hasface");
      }
    }, true);

    window.addEventListener("pageshow", function (e) { if (e.persisted) onForeground(); });
    window.addEventListener("focus", onForeground);

    // The opening screen leaves once the first standings are drawn — or, if
    // the load fails or hangs, after a few seconds regardless, so it can
    // never sit in front of the empty state that explains what is wrong.
    var splashTimer = setTimeout(hideSplash, 6000);
    S.load().then(function () {
      syncFromHash();
      updateDataState();
      scheduleAuto();
      // Ask the live feed straight away rather than after a first full
      // interval — during a match those two minutes are the whole point.
      tickLive();
      clearTimeout(splashTimer);
      hideSplash();
    }, function () { clearTimeout(splashTimer); syncFromHash(); hideSplash(); });
  }
  function hideSplash() {
    var sp = $("#splash");
    if (!sp || sp.classList.contains("gone")) return;
    sp.classList.add("gone");
    var drop = function () { if (sp.parentNode) sp.parentNode.removeChild(sp); };
    sp.addEventListener("transitionend", drop);
    setTimeout(drop, 600);
  }

  function buildNav() {
    var nav = $("#navbar");
    nav.innerHTML = TABS.map(function (t) {
      return '<button class="navitem" data-tab="' + t.id + '">' + (TILE[t.id] || svg(t.icon)) + '<span>' + esc(t.label) + '</span></button>';
    }).join("");
    $all(".navitem", nav).forEach(function (b) {
      b.addEventListener("click", function () { location.hash = b.getAttribute("data-tab"); });
    });
  }

  // The address before this one, so a page opened from somewhere can go back to
  // it. Only the player page uses it; everything else has a tab to return to.
  var lastHash = null;

  function syncFromHash() {
    var h = (location.hash || "#classic").replace("#", "");
    var parts = h.split("/");
    var view = parts[0];
    var known = TABS.map(function (t) { return t.id; })
      .concat(["rules", "settings", "profile", "compare", "stats", "prices", "chips", "pl",
               "winnings", "gwstatus", "vol", "player"]);
    if (known.indexOf(view) === -1) {
      // A bookmark or a cached hash for a view that no longer exists: show the
      // league, and correct the address so a reload does not repeat the detour.
      view = "classic"; parts = [view];
      if (location.hash && location.hash !== "#classic") {
        try { history.replaceState(null, "", "#classic"); } catch (e) { }
      }
    }
    // Remember only a place worth coming back to: the same list the back arrow
    // uses, so adding a sub-view can never make it point at itself.
    if (SUB_VIEWS.indexOf(view) === -1) state.backView = view;
    // A player can be opened from a match, a leaderboard, a pitch or a price
    // table, and back has to mean the page he was opened from. backView holds
    // only the five tabs, so it would have dropped a reader arriving from a
    // match onto Classic — which the sheet never did, being an overlay over
    // the page rather than a page of its own.
    if (view === "player" && state.view !== "player") {
      state.playerFrom = (state.view === "pl" && state.plMatch)
        ? "pl/" + state.plMatch.gw + "/" + state.plMatch.home + "-" + state.plMatch.away
        : (lastHash || null);
      // and how far down that page he was tapped, so back lands there and
      // not at the top of it
      state.playerFromY = window.scrollY || 0;
    }
    // Coming back from a player to the page he was opened from — by the bar's
    // arrow or the phone's own back — returns to the spot he was tapped at.
    var backFromPlayer = state.view === "player" && state.playerFrom && h === state.playerFrom ? state.playerFromY : null;
    state.view = view;
    if (view === "monthly" && parts[1]) state.monthKey = parts[1];
    if (view === "pyramid" && parts[1]) state.seasonKey = parts[1];
    if (view === "profile") state.profileId = parts[1] || null;
    if (view === "chips") { state.chipsGw = +parts[1] || null; state.chipsKey = parts[2] || null; }
    if (view === "prices") state.prTab = parts[1] === "stats" ? "stats" : "prices";
    if (view === "stats" && parts[1]) state.statsTab = parts[1];
    if (view === "vol" && parts[1]) state.volKey = parts[1];
    if (view === "player") {
      state.playerId = +parts[1] || null;
      // Arriving from a card means "what did he do in *that* gameweek", so the
      // page opens with that row already open rather than making the reader
      // find it again. Read once and cleared, so later taps are free.
      state.playerGw = +parts[2] || null;
    }
    if (view === "pl") {
      state.plTab = parts[1] === "table" ? "table" : "fixtures";
      state.plGw = +parts[1] || null;
      var mm = /^([A-Z]{3})-([A-Z]{3})$/.exec(parts[2] || "");
      state.plMatch = (mm && state.plGw) ? { gw: state.plGw, home: mm[1], away: mm[2] } : null;
    }
    state.rulesTopic = (view === "rules") ? (parts[1] || null) : state.rulesTopic;
    track(view === "rules" && parts[1] ? "/rules/" + parts[1] : "/" + view);
    // Never remember a player page as somewhere to go back to, or two taps in
    // a row would send the reader round in a circle.
    if (view !== "player") lastHash = h;
    render();
    if (backFromPlayer) {
      try { window.scrollTo(0, backFromPlayer); } catch (e) {}
      state.playerFromY = 0;
    }
  }

  // Fill mode sizes the wrap to the screen and lets one table scroll inside it.
  // The body's bottom padding exists to clear the fixed tab bar, and in fill
  // mode it is pure overhang — but the two must be switched together. They were
  // not: the knockout bracket turns fill off so it can scroll the page, and the
  // body was left with no room, which cut the last tie under the bar.
  function setFill(on) {
    var wrap = $("main.wrap");
    if (wrap) wrap.classList.toggle("fill", !!on);
    document.body.classList.toggle("fill", !!on);
  }

  function setActiveView() {
    $all(".navitem").forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-tab") === state.view); });
    $all(".view").forEach(function (v) { v.classList.toggle("active", v.getAttribute("data-view") === state.view); });
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
    var fill = ["classic", "monthly", "lms", "pyramid", "h2h", "vol"].indexOf(state.view) !== -1 ||
      (state.view === "prices" && state.prTab !== "stats");
    setFill(fill);
    updateBanner();
  }

  var VIEW_META = {
    classic: { t: "Classic League", topic: "classic" },
    monthly: { t: "Manager of the Month", topic: "monthly" },
    chips: { t: "Chip played" },
    lms:     { t: "Last Manager Standing", topic: "lms" },
    pyramid: { t: "Pyramid", topic: "pyramid" },
    h2h:     { t: "Game On UCL", topic: "h2h" },
    rules:   { t: "Rules" },
    settings:{ t: "Settings" },
    profile: { t: "Profile" },
    compare: { t: "Head to head" },
    stats:   { t: "Stats & highlights" },
    // Two errands on one view: the bar names whichever is open, so arriving
    // from either item in the profile sheet lands on a page that agrees with
    // the thing that was tapped.
    prices:  { t: "Price changes" },
    pl:      { t: "Premier League" },
    winnings:{ t: "Winnings" },
    gwstatus:{ t: "Gameweek status" },
    vol:     { t: "Game On Voluntary", topic: "voluntary" },
    // the bar carries his name, so the page body never repeats it
    player:  { t: "Player" }
  };
  // Sub-views carry a back arrow in the bar; a profile also puts the manager's
  // team and name there, so the page body never repeats them.
  var SUB_VIEWS = ["profile", "rules", "compare", "stats", "settings", "prices", "chips", "pl",
                   "winnings", "gwstatus", "vol", "player"];
  function updateBanner() {
    var m = VIEW_META[state.view] || { t: "Game On V12" };
    var title = m.t, sub = "";
    if (state.view === "profile" && state.profileId) {
      var ds = S.dataset();
      var who = ds && K.managerMap(ds)[+state.profileId];
      // a manager's own name — escaped, it is not ours to trust as markup
      if (who) { title = who.entryName; sub = esc(who.playerName); }
    }
    if (state.view === "prices" && state.prTab === "stats") title = "Player stats";
    // Each stats page carries its own name in the bar, as the tab row is gone
    if (state.view === "stats") {
      var stTab = STAT_TABS.filter(function (t) { return t.k === state.statsTab; })[0];
      if (stTab) title = stTab.label;
    }
    // A player's page carries his name and club in the bar, as a manager's does
    if (state.view === "player" && state.playerId) {
      var pm = (S.dataset() || {}).elements;
      pm = pm && pm[state.playerId];
      if (pm) { title = pm[0]; sub = esc((pm[2] || "") + " \u00b7 " + (PPOS_LBL[pm[1]] || "")); }
    }
    // How old the numbers are belongs on every page, not just the competition
    // tabs: a table is only as true as its last sync, and the page that says
    // so cannot be the one page you happen not to be on. Competition tabs also
    // carry the deadline, which they have the room for; on a very narrow
    // screen the sync half drops rather than truncating it.
    if (!sub) {
      var ds2 = S.dataset();
      // While a gameweek is being played the bar names IT, not the next
      // deadline — a weekend of "GW3 in 6d" over live GW2 tables reads wrong.
      var liveNow = ds2 ? K.liveGwId(ds2) : null;
      if (TABS.some(function (t) { return t.id === state.view; })) {
        if (liveNow) {
          sub += '<span>GW' + liveNow + ' live</span>';
        } else {
          var dl = ds2 ? K.nextDeadline(ds2) : null;
          if (dl) sub += '<span>GW' + dl.gw + ' ' + esc(untilText(dl.msLeft)) + '</span>';
        }
      }
      if (ds2 && ds2.updatedAt) {
        // During live play the overlay refreshes the moving numbers between
        // publishes — the age shown is whichever source answered last, so a
        // working live feed never reads as a stale app.
        var syncTs = Date.parse(ds2.updatedAt);
        var la = (liveNow && S.liveAt) ? S.liveAt() : null;
        var ts = (la && la > syncTs) ? la : syncTs;
        var age = Date.now() - ts;
        // The updater publishes every ten minutes. Half an hour without one is
        // not a quiet afternoon, it is something broken, and a table nobody
        // has told you is old is worse than no table.
        var stale = age > 30 * 60 * 1000;
        // The warning is the one thing this line must never lose, and on a
        // 360 phone "GW5 in 2d 22h · not synced for 40m" loses exactly the
        // warning. While the numbers are stale the deadline gives way to it.
        if (stale) sub = "";
        sub += '<span class="syncago' + (stale ? ' stale' : '') + '">' +
          (sub ? ' \u00b7 ' : '') +
          (stale ? 'not synced for ' + esc(spanText(age))
                 : ((la && la > syncTs) ? 'live ' : 'synced ') + esc(agoText(age))) +
          '</span>';
      }
    }
    $("#barTitle").textContent = title;
    var subEl = $("#barSub");
    subEl.innerHTML = sub;
    subEl.style.display = sub ? "" : "none";

    var back = $("#barBack");
    back.style.display = SUB_VIEWS.indexOf(state.view) === -1 ? "none" : "";

    var info = $("#barInfo");
    if (m.topic) { info.style.display = ""; info.setAttribute("data-rules", m.topic); }
    else { info.style.display = "none"; info.removeAttribute("data-rules"); }

    // Beside the name: Compare and Rival on somebody else's page, and on
    // your own the one word that says so.
    var pills = $("#barPills");
    var onProfile = state.view === "profile" && state.profileId && !!(S.dataset() || {}).managers;
    var onOther = onProfile && !isMe(state.profileId);
    pills.style.display = onProfile ? "" : "none";
    $("#cmpMe").style.display = onOther ? "" : "none";
    $("#rvToggle").style.display = onOther ? "" : "none";
    $("#youPill").style.display = onProfile && !onOther ? "" : "none";
    if (onOther) paintRivalPill();
    // The pill row makes the bar taller, and the sticky strips below sit on
    // the bar's measured height — so measure again whenever it may have changed.
    measureChrome();
  }
  // The rival pill carries its own state: lit while he is one of yours.
  function paintRivalPill() {
    var b = $("#rvToggle");
    if (!b) return;
    var on = isRival(state.profileId);
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", on ? "true" : "false");
    b.title = on ? "One of your rivals \u2014 tap to unpin" : "Keep an eye on this manager";
  }
  function goBack() {
    // A match was opened from a list of fixtures; that is where back leads.
    if (state.view === "pl" && state.plMatch) { location.hash = "pl/" + state.plMatch.gw; return; }
    // And a player was opened from wherever he was tapped.
    if (state.view === "player" && state.playerFrom) {
      // the origin stays set until the hash sync has used it for the scroll
      location.hash = state.playerFrom;
      return;
    }
    location.hash = state.backView || "classic";
  }

  function updateDataState() { /* data freshness now lives in the profile sheet */ }

  /* ---- theme ----------------------------------------------------------- */
  function getTheme() { var t = lsGet(THEME_KEY); return (t === "light" || t === "dark") ? t : "system"; }
  function applyTheme(pref) {
    if (pref === "system") { document.documentElement.removeAttribute("data-theme"); localStorage.removeItem(THEME_KEY); }
    else { document.documentElement.setAttribute("data-theme", pref); lsSet(THEME_KEY, pref); }
  }

  /* ---- render dispatch ------------------------------------------------- */
  function render() {
    setActiveView();
    var host = $('.view[data-view="' + state.view + '"]');
    if (!host) return;
    var ds = S.dataset();
    // the lion in the corner learns the page and the data; he never touches either
    if (window.GO_THEO) window.GO_THEO.sync({ ds: ds, me: state.me, view: state.view });

    if (state.view === "settings") return renderSettings(host);
    if (state.view === "rules") return renderRules(host);
    if (state.view === "compare") return renderCompare(host, S.dataset());
    if (state.view === "chips") return renderChips(host, S.dataset());
    if (state.view === "stats") return renderStats(host, S.dataset());
    if (state.view === "prices") {
      return state.prTab === "stats" ? renderPlayerBoards(host, S.dataset())
                                     : renderPrices(host, S.dataset());
    }
    if (state.view === "pl") return renderPl(host, S.dataset());
    if (state.view === "winnings") return renderWinnings(host, S.dataset());
    if (state.view === "gwstatus") return renderGwStatus(host, S.dataset());
    if (state.view === "vol") return renderVoluntary(host, S.dataset());
    if (state.view === "player") return renderPlayer(host, S.dataset());

    if (!ds || !ds.managers || !ds.managers.length) {
      host.innerHTML = emptyState();
      var b = $("#emptyCta", host); if (b) b.addEventListener("click", function () { location.hash = "settings"; });
      var r = $("#emptyRefresh", host); if (r) r.addEventListener("click", startRefresh);
      var rl = $("#emptyReload", host); if (rl) rl.addEventListener("click", function () { location.reload(); });
      return;
    }

    if (state.view === "profile") return renderProfile(host, ds, state.profileId);
    if (state.view === "classic") return renderClassic(host, ds);
    if (state.view === "monthly") return renderMonthly(host, ds);
    if (state.view === "lms") return renderLms(host, ds);
    if (state.view === "h2h") return renderH2h(host, ds);
    if (state.view === "pyramid") return renderPyramid(host, ds);
  }

  function emptyState() {
    if (!isAdmin()) {
      return '<div class="empty"><img class="big" src="logo-splash.webp" alt="" width="120" height="120"></div>' +
        '<h3>Game On V12</h3>' +
        '<p class="note">Standings haven\'t loaded yet. Please check back shortly.</p>' +
        '<div class="btnrow" style="justify-content:center;margin-top:16px">' +
        '<button class="btn" id="emptyReload">Reload</button></div></div>';
    }
    var cfg = S.config();
    var hasId = !!cfg.classicLeagueId;
    return '<div class="empty"><img class="big" src="logo-splash.webp" alt="" width="120" height="120"></div>' +
      '<h3>Welcome to Game On V12</h3>' +
      '<p class="note">' + (hasId
        ? 'League ID is set. Pull the latest data from FPL to populate every tab.'
        : 'First, add your <b>Classic League ID</b> in Settings, then refresh.') + '</p>' +
      '<div class="btnrow" style="justify-content:center;margin-top:16px">' +
      (hasId ? '<button class="btn primary" id="emptyRefresh">' + svg("refresh", 16) + 'Refresh from FPL</button>' : '') +
      '<button class="btn" id="emptyCta">Open Settings</button>' +
      '</div></div>';
  }

  /* ====================================================================== */
  /* HOME                                                                   */
  /* ====================================================================== */
  function stat(k, l) { return '<div class="stat"><div class="k">' + esc(k) + '</div><div class="l">' + esc(l) + '</div></div>'; }

  // Hide table rows that do not match a query. Works on whatever a panel has
  // rendered, so it survives the panel being redrawn.
  function filterRows(container, q) {
    if (!container) return;
    q = String(q || "").toLowerCase().trim();
    var shown = 0, rows = container.querySelectorAll("tbody tr");
    Array.prototype.forEach.call(rows, function (tr) {
      var hit = !q || tr.textContent.toLowerCase().indexOf(q) !== -1;
      tr.style.display = hit ? "" : "none";
      if (hit) shown++;
    });
    var note = container.querySelector(".nohits");
    if (q && !shown && !note) {
      note = document.createElement("div");
      note.className = "callout nohits";
      note.textContent = "No manager matches that search.";
      container.appendChild(note);
    } else if ((!q || shown) && note) { note.remove(); }
  }
  function searchBox(id) {
    return '<input class="in srch" id="' + id + '" type="search" autocomplete="off" placeholder="Search\u2026">';
  }

  /* ====================================================================== */
  /* CLASSIC                                                                */
  /* ====================================================================== */
  // FPL's standings endpoint goes down now and then, usually around a
  // deadline. The updater keeps publishing through it on the roster it already
  // had, so the app never goes dark — but a table that quietly holds an old
  // number is exactly the thing this league cannot have, so say it plainly.
  function heldNote(ds) {
    if (!ds || !ds.rosterAsOf) return '';
    var age = Date.now() - Date.parse(ds.rosterAsOf);
    return '<div class="callout warn-callout"><b>FPL\u2019s standings have not ' +
      'answered for ' + esc(spanText(age)) + '.</b> Totals and positions here are ' +
      'worked out from each manager\u2019s own gameweek history, which is still ' +
      'updating \u2014 so they are current. The move column is from the last ' +
      'standings we had, and catches up when FPL comes back.</div>';
  }

  function renderClassic(host, ds) {
    var rows = K.classic(ds);
    var h = heldNote(ds);

    h += '<label class="field" style="margin-bottom:12px">' +
      '<input class="in" id="classicSearch" placeholder="Search manager or team…"></label>';

    h += '<div class="freeze"><table class="t classictbl"><thead><tr>' +
      '<th class="num">#</th><th>Team</th><th class="num">GW</th><th class="num">Total</th><th class="num c-xp">XP</th>' +
      '</tr></thead><tbody id="classicBody">' + classicRows(rows) + '</tbody></table></div>';

    host.innerHTML = h;
    var search = $("#classicSearch", host);
    search.addEventListener("input", function () {
      var q = search.value.toLowerCase().trim();
      var filtered = !q ? rows : rows.filter(function (r) {
        return (r.entryName + " " + r.playerName).toLowerCase().indexOf(q) !== -1;
      });
      fill("#classicBody", host, classicRows(filtered));
    });
  }

  function classicRows(rows) {
    return rows.map(function (r) {
      // The move sits under the rank rather than in a column of its own:
      // that column was the fifth of six and never made it onto a phone
      // screen, so the table scrolled sideways to reach a number that fits
      // in ten points under the one it describes. No line at all for no move.
      var mv = r.move > 0 ? '<div class="mvu up">' + r.move + '</div>'
             : r.move < 0 ? '<div class="mvu down">' + Math.abs(r.move) + '</div>'
             : '';
      var rc = r.computedRank <= 3 ? "rk" + r.computedRank : "";
      // Managers still level after months won share the place and the XP,
      // so say so rather than showing an order the table cannot justify.
      var eq = r.tiedWith > 1
        ? '<span class="jt" title="Level with ' + (r.tiedWith - 1) + ' other' +
          (r.tiedWith > 2 ? 's' : '') + ' — XP shared">=</span>' : '';
      return '<tr' + (isMe(r.id) ? ' class="me"' : '') + '>' +
        '<td class="num"><span class="rankcell">' + eq + '<span class="r ' + rc + '">' + r.computedRank + '</span></span>' + mv + '</td>' +
        '<td class="name" data-entry="' + r.id + '"><span class="who">' + esc(r.entryName) + '</span><div class="mgr">' + esc(r.playerName) + '</div></td>' +
        '<td class="num">' + num(r.eventTotal) + '</td>' +
        '<td class="num"><b>' + num(r.total) + '</b></td>' +
        '<td class="num c-xp">' + (r.prize ? '<span class="prize">' + xp(r.prize) + '</span>' : '') + '</td>' +
        '</tr>';
    }).join("");
  }

  function voluntaryPrizeCard(cfg) {
    var V = cfg.voluntaryPrizes || {};
    var order = cfg.voluntaryOrder || Object.keys(V);
    return order.filter(function (k) { return V[k]; }).map(function (k) {
      var l = V[k];
      var rows = Object.keys(l.prizes).map(Number).sort(function (a, b) { return a - b; })
        .map(function (place) {
          return '<tr><td>' + ordinal(place) + ' place</td><td class="num">' + xp(l.prizes[place]) + '</td></tr>';
        }).join("");
      return '<div class="card"><div class="hd"><h3>' + esc(l.name) + '</h3>' +
        '<span class="sub">' + num(l.entries) + ' entries \u00b7 ' + xp(l.fee) + ' in \u00b7 ' +
        xp(l.pot) + ' pot</span></div>' +
        '<div class="bd"><table class="prizetable">' + rows + '</table></div></div>';
    }).join("");
  }

  function prizeReferenceCard() {
    var p = S.config().classicPrizes;
    var rows = '';
    Object.keys(p.exact).forEach(function (k) {
      rows += '<tr><td>' + ordinal(+k) + ' place</td><td class="num">' + xp(p.exact[k]) + '</td></tr>';
    });
    (p.ranges || []).forEach(function (r) {
      var label = r.from === r.to ? ordinal(r.from) : (ordinal(r.from) + " – " + ordinal(r.to));
      rows += '<tr><td>' + label + '</td><td class="num">' + xp(r.amount) + '</td></tr>';
    });
    return '<div class="card"><div class="hd"><h3>XP breakdown</h3></div><div class="bd">' +
      '<table class="prizetable">' + rows + '</table></div></div>';
  }

  /* ====================================================================== */
  /* MONTHLY                                                                */
  /* ====================================================================== */
  function renderMonthly(host, ds) {
    var months = K.monthly(ds);
    var active = months.filter(function (m) { return m.played > 0; });
    var cur = state.monthKey && months.some(function (m) { return m.key === state.monthKey; })
      ? state.monthKey
      : (active.length ? active[active.length - 1].key : months[0].key);
    state.monthKey = cur;

    var statusFn = gwStatusFn(ds);
    var h = '';
    h += '<div class="pickrow"><select class="in narrow" id="monthSel">' +
      months.map(function (m) {
        return '<option value="' + m.key + '"' + (m.key === cur ? " selected" : "") + '>' + esc(m.label || monthLabel(m)) + '</option>';
      }).join("") + '</select>' + searchBox("monthSearch") +
      '<div class="pickmeta" id="monthMeta"></div></div>';
    h += '<div id="monthPanel"></div>';

    host.innerHTML = h;
    var draw = function () {
      var M = months.filter(function (m) { return m.key === state.monthKey; })[0];
      fill("#monthMeta", host, gwChips(M.gws, statusFn));
      fill("#monthPanel", host, monthPanel(M));
      filterRows($("#monthPanel", host), $("#monthSearch", host).value);
    };
    $("#monthSel", host).addEventListener("change", function () { state.monthKey = this.value; draw(); });
    $("#monthSearch", host).addEventListener("input", function () {
      filterRows($("#monthPanel", host), this.value);
    });
    draw();
  }

  function monthPanel(M) {
    if (!M) return '';
    if (!M.rows.length) { return '<div class="callout">No gameweeks scored yet for this month.</div>'; }
    var h = '';

    h += '<div class="freeze"><table class="t monthtbl"><thead><tr><th class="num">#</th><th>Team</th><th class="num">Points</th><th class="num c-bench">Bench</th><th class="num">XP</th></tr></thead><tbody>';
    h += M.rows.map(function (r) {
      var rc = r.pos <= 3 ? "rk" + r.pos : "";
      return '<tr' + (isMe(r.id) ? ' class="me"' : '') + '><td class="num"><span class="r ' + rc + '">' + r.pos + '</span></td>' +
        '<td class="name" data-entry="' + r.id + '"><span class="who">' + esc(r.entryName) + '</span><div class="mgr">' + esc(r.playerName) + '</div></td>' +
        '<td class="num"><b>' + num(r.score) + '</b></td><td class="num c-bench">' + num(r.bench) + '</td>' +
        '<td class="num">' + (r.prize ? '<span class="prize">' + xp(r.prize) + '</span>' : '') + '</td></tr>';
    }).join("");
    h += '</tbody></table></div>';
    return h;
  }

  /* ====================================================================== */
  /* LMS                                                                    */
  /* ====================================================================== */
  function renderLms(host, ds) {
    var lms = K.lms(ds);
    var cfg = S.config();
    var started = ds.managers.length;

    var h = '';


    if (lms.champion) {
      var pod = lms.podium || [];
      h += '<div class="card" style="margin-top:14px;border-color:var(--gold)"><div class="bd" style="text-align:center">' +
        '<div class="champcrown">' + svg("crown", 40) + '</div><h3 style="margin:6px 0"><span data-entry="' + lms.champion.id + '" role="button" tabindex="0">' + esc(lms.champion.name) + '</span></h3>' +
        '<div class="note">The Last Manager Standing</div>' +
        (pod.length > 1 ? '<div class="podium">' +
          (pod[1] ? '<span class="pill"><b data-entry="' + pod[1].id + '" role="button" tabindex="0">' + esc(pod[1].name) + '</b> runner-up' + (pod[1].gw ? ' \u00b7 out GW' + pod[1].gw : '') + '</span>' : '') +
          (pod[2] ? '<span class="pill"><b data-entry="' + pod[2].id + '" role="button" tabindex="0">' + esc(pod[2].name) + '</b> third' + (pod[2].gw ? ' \u00b7 out GW' + pod[2].gw : '') + '</span>' : '') +
          '</div>' : '') +
        '</div></div>';
    } else if (lms.undecided) {
      // Every gameweek checked and still more than one alive: the last
      // eliminations came down to a tie the rules could not break.
      h += '<div class="callout warn-callout" style="margin-top:14px"><b>' + num(lms.survivorsCount) +
        ' managers are still standing after GW' + cfg.totalGameweeks + '.</b> They finished level on every ' +
        'tie-breaker in the last gameweek, so the champion is the league\u2019s to name: ' +
        esc(lms.survivors.map(function (s) { return s.name; }).join(", ")) + '.</div>';
    }

    // Gameweek dropdown — Live GW first, then finished GWs (review past weeks).
    var gwOpts = [];
    if (lms.live) gwOpts.push({ key: "live", label: "GW " + lms.live.gw + " · Live", week: lms.live, live: true });
    lms.perGw.slice().reverse().forEach(function (w) {
      gwOpts.push({ key: String(w.gw), label: "GW " + w.gw, week: w, live: false });
    });

    if (!gwOpts.length) {
      h += '<div class="callout" style="margin-top:14px">The season hasn\'t kicked off yet — nobody is eliminated until GW1 is finalised. All ' + started + ' managers are still in.</div>';
      host.innerHTML = h;
      return;
    }

    var curKey = (state.lmsGw && gwOpts.some(function (o) { return o.key === state.lmsGw; })) ? state.lmsGw : gwOpts[0].key;
    state.lmsGw = curKey;
    var byKey = function (k) { return gwOpts.filter(function (o) { return o.key === k; })[0]; };
    // The four cards said what this row already says: the picker names the
    // gameweek, and started is alive plus out. What is left rides along with
    // the picker instead of costing a row of its own.
    h += '<div class="pickrow lmsrow"><select class="in narrow" id="lmsGwSel">' +
      gwOpts.map(function (o) {
        return '<option value="' + o.key + '"' + (o.key === curKey ? ' selected' : '') + '>' + esc(o.label) + '</option>';
      }).join("") + '</select>' + searchBox("lmsSearch") +
      '<span class="lmscount"><b>' + num(lms.survivorsCount) + '</b> alive' +
      '<span class="gone"> \u00b7 <b>' + num(started - lms.survivorsCount) + '</b> out</span></span>' +
      '</div>';
    h += '<div id="lmsGwPanel"></div>';

    host.innerHTML = h;
    var drawLms = function () {
      var o = byKey(state.lmsGw);
      var panel = $("#lmsGwPanel", host);
      // A tie the rules cannot break is the league's to settle, not the app's.
      // Say who is level and how many places are waiting on it rather than
      // quietly eliminating whoever happened to sort first.
      var u = o.week && o.week.unresolved;
      var note = "";
      if (u) {
        note = '<div class="callout warn-callout"><b>' + u.managers.length +
          ' managers are level on every tie-breaker</b> — same score, same bench ' +
          'points, same goals, clean sheets and assists in the eleven that played. ' +
          esc(String(u.places)) + (u.places === 1 ? ' place is' : ' places are') +
          ' waiting on it, and carry into the next gameweek along with its own. ' +
          'Nobody here has been eliminated: ' +
          esc(u.managers.map(function (m) { return m.name; }).join(", ")) + '.</div>';
      }
      panel.innerHTML = note + lmsGwTable(o.week, { live: o.live });
      filterRows(panel, $("#lmsSearch", host).value);
    };
    $("#lmsGwSel", host).addEventListener("change", function () { state.lmsGw = this.value; drawLms(); });
    $("#lmsSearch", host).addEventListener("input", function () {
      filterRows($("#lmsGwPanel", host), this.value);
    });
    drawLms();
  }

  function gridTable(rows) {
    var body = rows.map(function (r) {
      var cls = r.eliminated === null ? "" : (r.eog === 1 ? "champ" : "now");
      var elim = r.eliminated === null ? '<span class="note">' + r.expected + '</span>' : '<b>' + r.eliminated + '</b>';
      return '<tr class="' + cls + '"><td>GW' + r.gw + '</td><td class="num">' + r.sog + '</td>' +
        '<td class="num">' + elim + '</td><td class="num">' + (r.eog === 1 ? '<span class="wmark gold">' + sicon("trophy") + '</span>1' : r.eog) + '</td></tr>';
    }).join("");
    return '<div class="card"><div class="tablewrap"><table class="t"><thead><tr><th>GW</th><th class="num">SOG</th><th class="num">Out</th><th class="num">EOG</th></tr></thead><tbody>' + body + '</tbody></table></div></div>';
  }
  function prizeTile(label, amount, icon, tone) {
    return '<div class="stat"><div class="k">' + xpa(amount) + '</div><div class="l">' +
      (icon ? '<span class="wmark ' + (tone || "") + '">' + sicon(icon) + '</span>' : '') + esc(label) + '</div></div>';
  }

  function lmsGwTable(g, opts) {
    if (!g) return '';
    opts = opts || {};
    var rows = (g.table || []).map(function (r) {
      var red = r.eliminated || r.atRisk;
      var nameCls = red ? "who out-name" : "who";
      var played = (r.played == null) ? '<span class="note">—</span>' : (r.played + '/' + (r.playedTotal || 12));
      return '<tr class="' + (red ? "gone" : "") + (isMe(r.id) ? " me" : "") + '">' +
        '<td class="name" data-entry="' + r.id + '"><span class="' + nameCls + '">' + esc(r.name) + '</span><div class="mgr">' + esc(r.player) + '</div></td>' +
        '<td class="num"><b>' + num(r.score) + '</b></td>' +
        '<td class="num">' + played + '</td>' +
        '<td class="num c-hits">' + (r.hit ? '−' + r.hit : '0') + '</td>' +
        '<td class="num c-bench">' + num(r.bench) + '</td></tr>';
    }).join("");
    return '<div class="freeze"><table class="t lmstbl"><thead><tr><th>Team</th><th class="num">GW pts</th><th class="num">Played</th><th class="num c-hits">Hits</th><th class="num c-bench">Bench</th></tr></thead><tbody>' +
      rows + '</tbody></table></div>';
  }

  /* ====================================================================== */
  /* H2H (Game On UCL)                                                      */
  /* ====================================================================== */
  function renderH2h(host, ds) {
    var h2h = K.h2h(ds);
    var cfg = S.config();
    if (state.group == null) {
      var mg = myGroupIndex(h2h.groups);
      if (mg >= 0) state.group = mg;
    }
    if (state.group == null || state.group >= h2h.groups.length) state.group = 0;

    // No stage dropdown. The tab is the group stage until every group
    // gameweek is played, then it becomes the knockouts by itself; the
    // finished group stage stays reachable through a small archive chip in
    // the corner, and a matching chip leads back.
    var done = {}; K.finishedGws(ds).forEach(function (g) { done[g] = true; });
    var gs = (cfg.h2h.groupStageGws || []);
    var koTime = gs.length > 0 && gs.every(function (g) { return done[g]; });
    if (!koTime) state.h2hArchive = false;
    var showGroups = !koTime || state.h2hArchive;

    var hasFx = K.hasFixtures(ds);
    if (state.h2hMode !== "matches" || !hasFx) state.h2hMode = "standings";
    if (state.koComp !== "uel") state.koComp = "ucl";

    var h = koTime
      ? '<div class="archrow"><button type="button" class="archbtn" id="archBtn">' +
        (showGroups ? '&larr; Back to knockouts' : 'Group stage archive') +
        '</button></div>'
      : '';
    h += '<div class="pickrow"><span id="stageExtra"></span>' +
      '<div class="pickmeta" id="stageMeta"></div></div>';
    h += '<div id="grpPanel"></div>';
    host.innerHTML = h;

    function draw() {
      var extra = $("#stageExtra", host), meta = $("#stageMeta", host), panel = $("#grpPanel", host);
      setFill(showGroups);
      extra.className = "col";
      if (showGroups) {
        var groups = h2h.groups || [];
        var matches = state.h2hMode === "matches";
        // the two-way slider, then that mode's own pickers beneath it
        var seg = hasFx
          ? '<div class="seg" role="tablist">' +
            '<button type="button" class="segb' + (matches ? ' active' : '') + '" data-mode="matches" role="tab" aria-selected="' + matches + '">Matches</button>' +
            '<button type="button" class="segb' + (!matches ? ' active' : '') + '" data-mode="standings" role="tab" aria-selected="' + !matches + '">Standings</button></div>'
          : '';
        if (matches) {
          var gws = K.fixtureGws(ds);
          if (!state.fxGw || gws.indexOf(+state.fxGw) === -1) {
            // Open on the first gameweek that has not finished: the live one
            // while matches are on, otherwise the upcoming one — who you face
            // next is the question this stage exists to answer. Once the
            // whole schedule is done, the last gameweek stands.
            var doneFx = {};
            K.finishedGws(ds).forEach(function (g) { doneFx[g] = true; });
            state.fxGw = gws.filter(function (g) { return !doneFx[g]; })[0] || gws[gws.length - 1];
          }
          // One group at a time reads best, and it is the same group on both
          // panels: the one picked for the standings opens here, and a group
          // picked here follows the reader to the standings. "All groups"
          // stays on the list for anyone who wants the whole gameweek at once.
          if (state.fxGroup == null || state.fxGroup === "") state.fxGroup = String(state.group);
          else if (state.fxGroup !== "all" && +state.fxGroup !== state.group) state.fxGroup = String(state.group);
          extra.innerHTML = seg + '<div class="segsub">' +
            '<select class="in narrow" id="fxGw">' + gws.map(function (g) {
              return '<option value="' + g + '"' + (+g === +state.fxGw ? ' selected' : '') +
                '>GW ' + g + '</option>';
            }).join("") + '</select>' +
            '<select class="in narrow grow" id="fxGroup">' +
            '<option value="all"' + (state.fxGroup === "all" ? ' selected' : '') + '>All groups</option>' +
            groups.map(function (g, i) {
              return '<option value="' + i + '"' + (String(i) === String(state.fxGroup) ? ' selected' : '') +
                '>' + esc(g.name) + '</option>';
            }).join("") + '</select></div>';
          meta.textContent = "";
          var drawFx = function () {
            panel.innerHTML = fixturesPanel(ds,
              +state.fxGw, state.fxGroup === "all" ? null : +state.fxGroup);
            $all("[data-entry]", panel).forEach(function (el) {
              el.addEventListener("click", function () {
                location.hash = "profile/" + el.getAttribute("data-entry");
              });
            });
          };
          $("#fxGw", host).addEventListener("change", function () { state.fxGw = +this.value; drawFx(); });
          $("#fxGroup", host).addEventListener("change", function () {
            state.fxGroup = this.value;
            if (state.fxGroup !== "all") state.group = +state.fxGroup;
            drawFx();
          });
          drawFx();
        } else {
          extra.innerHTML = seg + '<div class="segsub">' +
            '<select class="in narrow grow" id="grpSel">' + groups.map(function (g, i) {
              return '<option value="' + i + '"' + (i === state.group ? ' selected' : '') + '>' + esc(g.name) + '</option>';
            }).join("") + '</select></div>';
          meta.textContent = "GW " + h2h.groupGwsPlayed + "/" + h2h.groupGwsTotal;
          panel.innerHTML = groupPanel(groups[state.group] || groups[0], cfg);
          $("#grpSel", host).addEventListener("change", function () {
            state.group = +this.value;
            state.fxGroup = String(state.group);
            panel.innerHTML = groupPanel(groups[state.group], cfg);
          });
        }
        $all(".segb", extra).forEach(function (btn) {
          btn.addEventListener("click", function () {
            if (state.h2hMode === btn.getAttribute("data-mode")) return;
            state.h2hMode = btn.getAttribute("data-mode");
            if (state.h2hMode === "matches") track("h2h-matches", true);
            draw();
          });
        });
        return;
      }

      // Knockouts: the same slider shape picks the competition, and the
      // round picker sits beneath it, exactly as the group stage reads.
      var B = K.knockout(ds, state.koComp);
      var kseg = '<div class="seg" role="tablist">' +
        '<button type="button" class="segb' + (state.koComp === "ucl" ? ' active' : '') + '" data-comp="ucl" role="tab" aria-selected="' + (state.koComp === "ucl") + '">UCL knockouts</button>' +
        '<button type="button" class="segb' + (state.koComp === "uel" ? ' active' : '') + '" data-comp="uel" role="tab" aria-selected="' + (state.koComp === "uel") + '">UEL knockouts</button></div>';
      meta.textContent = "";
      if (!B) {
        extra.innerHTML = kseg;
        panel.innerHTML = '<div class="callout">No knockout draw yet.</div>';
      } else {
        // Five rounds stacked one under another is a long scroll to reach the
        // final. Pick a round the way the group stage picks a group.
        var ri = koRoundIndex(ds, B);
        extra.innerHTML = kseg + '<div class="segsub">' +
          '<select class="in narrow grow" id="koRoundSel">' + B.rounds.map(function (r, i) {
            return '<option value="' + i + '"' + (i === ri ? ' selected' : '') + '>' + esc(r.name) + '</option>';
          }).join("") + '</select></div>';
        panel.innerHTML = bracketPanel(B, state.koRound);
        $("#koRoundSel", host).addEventListener("change", function () {
          state.koRound = +this.value;
          panel.innerHTML = bracketPanel(B, state.koRound);
        });
      }
      $all(".segb", extra).forEach(function (btn) {
        btn.addEventListener("click", function () {
          if (state.koComp === btn.getAttribute("data-comp")) return;
          state.koComp = btn.getAttribute("data-comp");
          draw();
        });
      });
    }
    var arch = $("#archBtn", host);
    if (arch) arch.addEventListener("click", function () {
      state.h2hArchive = !state.h2hArchive;
      renderH2h(host, ds);
    });
    draw();
  }

  // The knockout path, round by round. Ties nobody has reached yet name the
  // ties they come from rather than inventing teams.
  // Open on the round the competition has actually reached rather than always
  // the first, and remember whatever the reader picks after that.
  function koRoundIndex(ds, B) {
    if (state.koRound != null && B.rounds[state.koRound]) return state.koRound;
    var done = {};
    K.finishedGws(ds).forEach(function (g) { done[g] = true; });
    var i = 0;
    for (; i < B.rounds.length; i++) {
      var gws = B.rounds[i].gws || [];
      var over = gws.length && gws.every(function (g) { return done[g]; });
      if (!over) break;
    }
    state.koRound = Math.min(i, B.rounds.length - 1);
    return state.koRound;
  }

  function bracketPanel(B, idx) {
    var h = "";
    if (!B.drawn) {
      h += '<div class="callout" style="margin-bottom:12px"><b>The ' + esc(B.label) +
        ' draw has not been made.</b> It is made when the group stage ends in GW' +
        (B.groupEndsGw || (B.startsGw - 1)) + ' — ' +
        (B.gwsLeft === 1 ? 'one gameweek to go' : num(B.gwsLeft) + ' gameweeks to go') +
        '. The rounds and their gameweeks are below.</div>';
    }
    // The final decided: the winner and the runner-up, and whether the money
    // has settled or waits on FPL's check of the last gameweek.
    if (B.champion) {
      h += '<div class="card" style="margin-bottom:12px;border-color:var(--gold)"><div class="bd" style="text-align:center">' +
        '<div class="champcrown">' + svg("crown", 40) + '</div>' +
        '<h3 style="margin:6px 0"><span data-entry="' + B.champion.id + '" role="button" tabindex="0">' + esc(B.champion.name) + '</span></h3>' +
        '<div class="note">' + esc(B.label) + ' winner' +
        (B.runnerUp ? ' · runner-up <b data-entry="' + B.runnerUp.id + '" role="button" tabindex="0">' + esc(B.runnerUp.name) + '</b>' : '') +
        (B.settled ? '' : ' · XP settles when FPL checks the gameweek') + '</div></div></div>';
    }
    if (B.prizes) {
      h += '<div class="korow"><span class="pill gold">Winner ' + xpa(B.prizes.winner) + '</span>' +
        '<span class="pill">Runner-up ' + xpa(B.prizes.runnerUp) + '</span></div>';
    }
    var only = B.rounds[idx] ? [B.rounds[idx]] : B.rounds;
    h += only.map(function (r) {
      if (!r.ties.length) {
        return '<div class="koline">GW ' + r.gws.join("–") +
          (r.legs === 2 ? ' · two legs' : ' · one leg') + '</div>' +
          '<div class="card"><div class="bd"><div class="note" style="text-align:center;padding:6px 0">' +
          'Waiting on the draw</div></div></div>';
      }
      var body = r.ties.map(function (t) {
        var live = (t.legs || []).some(function (l) { return l.live; });
        var cls = 'tie' + (t.winner ? ' decided' : '') + (live ? ' live' : '') + (t.level ? ' level' : '');
        var note = '';
        if (t.winner && t.decidedBy && t.decidedBy !== "aggregate") note = 'Level on aggregate — decided on ' + esc(t.decidedBy);
        else if (t.level) note = 'Level on everything the rules hold — the league settles it';
        else if (t.bye) note = 'No opponent — goes through';
        return '<div class="' + cls + '"><span class="tn">' + t.n + '</span>' +
          '<div class="ts">' + koSide(t, "home") + koSide(t, "away") + '</div></div>' +
          (note ? '<div class="tienote">' + note + '</div>' : '');
      }).join("");
      var n = r.ties.length;
      return '<div class="koline">' + n + (n === 1 ? ' tie' : ' ties') +
        ' · GW ' + r.gws.join("–") + (r.legs === 2 ? ' · two legs' : '') + '</div>' +
        '<div class="card"><div class="bd kobody">' + body + '</div></div>';
    }).join("");
    return h;
  }
  // One side of a tie: the manager, where he came from, and his score in
  // each leg with the aggregate — or the tie he has to win to be here.
  function koSide(t, which) {
    var s = t[which];
    if (!s) {
      var from = which === "home" ? t.fromA : t.fromB;
      return '<div class="side pending"><span class="nm">' + (from ? 'Winner of tie ' + from : '—') + '</span></div>';
    }
    // just the group's letter — the full name does not fit beside a team
    var m = /group\s+([A-Za-z0-9]+)/i.exec(s.group || "");
    var badge = (m ? m[1].toUpperCase() : "?") + " #" + s.place;
    var won = t.winner && t.winner.id === s.id, lost = t.loser && t.loser.id === s.id;
    var sc = '';
    if (t.legs && t.legs.length) {
      var parts = t.legs.map(function (l) {
        var v = l[which];
        return v == null ? '–' : num(v);
      });
      // the aggregate only once there is more than one leg to add up
      var played = t.legs.filter(function (l) { return l.home != null && l.away != null; }).length;
      var agg = (t.aggregate && played > 1) ? num(t.aggregate[which]) : null;
      sc = '<span class="sc">' + parts.join(' · ') + (agg != null ? ' <b>' + agg + '</b>' : '') + '</span>';
    }
    return '<div class="side' + (isMe(s.id) ? ' me' : '') + (won ? ' w' : '') + (lost ? ' l' : '') +
      '" data-entry="' + s.id + '"><span class="nm">' + esc(s.name) + '</span>' +
      '<span class="sd">' + esc(badge) + '</span>' + sc + '</div>';
  }

  // A gameweek's fixtures. A played tie shows both scores with the winner
  // marked; one still to come shows the two names and nothing else, because
  // nothing else is known yet.
  function fixturesPanel(ds, gw, groupIndex) {
    var list = K.fixtures(ds, gw, groupIndex);
    if (!list.length) {
      return '<div class="callout">No fixtures for GW' + gw + '.</div>';
    }
    var byGroup = {}, order = [];
    list.forEach(function (f) {
      if (!byGroup[f.group]) { byGroup[f.group] = []; order.push(f.group); }
      byGroup[f.group].push(f);
    });
    // Manager on top, team beneath, mirrored either side of the score — the
    // shape the official app uses, which everyone in the league already reads.
    var side = function (t, which) {
      return '<div class="fxs ' + which + '"' +
        (t.known ? ' data-entry="' + t.id + '" role="button" tabindex="0"' : '') + '>' +
        '<span class="fxm">' + esc(t.average ? "AVERAGE" : (t.player || t.name)) + '</span>' +
        '<span class="fxt">' + esc(t.average ? "Gameweek average" : t.name) + '</span></div>';
    };
    return '<div class="freeze"><div class="fxwrap">' + order.map(function (gname) {
      var rows = byGroup[gname].map(function (f) {
        var pill = f.played
          ? '<div class="fxsc"><span class="fxp' + (f.result === "b" ? " lost" : "") + '">' + num(f.a.score) + '</span>' +
            '<span class="fxp' + (f.result === "a" ? " lost" : "") + '">' + num(f.b.score) + '</span></div>'
          : '<div class="fxsc ahead"><span class="fxv">V</span></div>';
        var mine = isMe(f.a.id) || isMe(f.b.id);
        return '<div class="fx' + (f.played ? "" : " ahead") + (mine ? " mine" : "") + '">' +
          side(f.a, "l") + pill + side(f.b, "r") +
          '<div class="fxw">Gameweek ' + f.gw +
            (f.live ? " \u00b7 live" : (f.played && f.result === "draw" ? " \u00b7 draw" : "")) + '</div>' +
          '</div>';
      }).join("");
      return (groupIndex == null ? '<div class="fxg">' + esc(gname) + '</div>' : '') +
        '<div class="fxgrp">' + rows + '</div>';
    }).join("") + '</div></div>';
  }

  function groupPanel(g, cfg) {
    if (!g) return '';
    var rows = g.table.map(function (t) {
      var pill = t.dest === "UCL" ? '<span class="pill ucl">UCL</span>' : t.dest === "UEL" ? '<span class="pill uel">UEL</span>' : '';
      var zone = t.dest === "UCL" ? "zone-top" : "";
      // The UCL/UEL tag rides on the manager's line rather than the team's,
      // where it wrapped every row to three lines and made this the tallest
      // table in the app for a word the row tint was already saying.
      return '<tr class="' + zone + (isMe(t.id) ? ' me' : '') + '"><td class="num">' + t.pos + '</td>' +
        '<td class="name" data-entry="' + t.id + '"><span class="who">' + esc(t.name) + '</span><div class="mgr">' + esc(t.player) + (pill ? ' ' + pill : '') + '</div></td>' +
        '<td class="num c-w">' + t.w + '</td><td class="num c-d">' + t.d + '</td><td class="num c-l">' + t.l + '</td>' +
        '<td class="num"><b>' + t.pts + '</b></td><td class="num">' + num(t.gwPts) + '</td></tr>';
    }).join("");
    return '<div class="freeze"><table class="t grptbl"><thead><tr><th class="num">#</th><th>Team</th><th class="num c-w">W</th><th class="num c-d">D</th><th class="num c-l">L</th><th class="num">Pts</th><th class="num">GW pts</th></tr></thead><tbody>' +
      rows + '</tbody></table></div>';
  }

  /* ====================================================================== */
  /* PYRAMID                                                                */
  /* ====================================================================== */
  function renderPyramid(host, ds) {
    var pyr = K.pyramid(ds);
    var cur = state.seasonKey && pyr.seasons.some(function (s) { return s.key === state.seasonKey; })
      ? state.seasonKey : (function () {
        var active = pyr.seasons.filter(function (s) { return s.played > 0; });
        return active.length ? active[active.length - 1].key : pyr.seasons[0].key;
      })();
    state.seasonKey = cur;

    var h = '';

    var cfg = S.config();
    var divKeys = pyr.divisions.map(function (d) { return d.key; });
    var curDiv = (state.pyrDiv && divKeys.indexOf(state.pyrDiv) >= 0) ? state.pyrDiv : null;
    if (!curDiv) {
      // open on the division my team sits in for the season being shown
      var seaNow = pyr.seasons.filter(function (x) { return x.key === state.seasonKey; })[0];
      curDiv = myDivKey(seaNow) || divKeys[0];
    }
    state.pyrDiv = curDiv;

    h += '<div class="selrow">' +
      '<label class="field"><select class="in" id="pyrSeason" aria-label="Mini season">' +
        pyr.seasons.map(function (s) {
          return '<option value="' + s.key + '"' + (s.key === cur ? ' selected' : '') + '>' + esc(s.name) + '</option>';
        }).join("") + '</select></label>' +
      '<label class="field"><select class="in" id="pyrDiv" aria-label="Division">' +
        pyr.divisions.map(function (d) {
          return '<option value="' + d.key + '"' + (d.key === curDiv ? ' selected' : '') + '>' + esc(d.name) + '</option>';
        }).join("") + '</select></label>' +
      '</div>';

    h += '<div class="pickmeta" id="pyrMeta"></div>';
    h += '<div id="pyrPanel"></div>';

    host.innerHTML = h;
    var statusFn = gwStatusFn(ds);

    function draw() {
      var SEA = pyr.seasons.filter(function (s) { return s.key === state.seasonKey; })[0];
      var div = SEA.divisions.filter(function (d) { return d.key === state.pyrDiv; })[0];
      fill("#pyrMeta", host, gwChips(SEA.gws, statusFn));
      // A mini-season nobody has played yet has no table — everyone would sit
      // level on nothing, in an order that means nothing. Say it has not
      // started and say when it does.
      if (!SEA.played) {
        fill("#pyrPanel", host,
          '<div class="callout"><b>' + esc(SEA.name) + ' has not started.</b><br>' +
          'It runs GW\u00a0' + SEA.gws[0] + '\u2013' + SEA.gws[SEA.gws.length - 1] +
          '. Divisions are set by how ' +
          (SEA.key === "s2" ? "Mini Season 1" : "the mini-season before it") +
          ' finishes, so the table appears once its first gameweek is played.</div>');
        return;
      }
      fill("#pyrPanel", host, divisionCard(div, cfg));
    }
    $("#pyrSeason", host).addEventListener("change", function () { state.seasonKey = this.value; draw(); });
    $("#pyrDiv", host).addEventListener("change", function () { state.pyrDiv = this.value; draw(); });
    draw();
  }

  function divisionCard(div, cfg) {
    var pcfg = cfg.pyramid;
    // There is nowhere above Elite and nowhere below Conference, so those two
    // do not carry the marker for the direction that does not exist for them.
    var order = (pcfg.divisions || []).map(function (d) { return d.key; });
    var at = order.indexOf(div.key);
    var canRise = at > 0;
    var canFall = at !== -1 && at < order.length - 1;
    var body = div.rows.map(function (r) {
      var top = canRise && r.pos <= pcfg.promoteCount;
      var bot = canFall && r.pos > div.rows.length - pcfg.relegateCount;
      var zone = top ? "zone-top" : (bot ? "zone-bot" : "");
      // Promotion and relegation are said by the row's tint and a bar at its
      // edge, the way "you" is; the arrow pill that used to follow the name
      // said the same thing a second time and pushed long names into an
      // ellipsis to do it.
      var rc = r.pos <= 3 ? "rk" + r.pos : "";
      return '<tr class="' + zone + (isMe(r.id) ? ' me' : '') + '"><td class="num"><span class="r ' + rc + '">' + r.pos + '</span></td>' +
        '<td class="name" data-entry="' + r.id + '"><span class="who">' + esc(r.name) + '</span><div class="mgr">' + esc(r.player) + '</div></td>' +
        '<td class="num"><b>' + num(r.score) + '</b></td><td class="num">' +
        (r.prize ? '<span class="prize">' + xp(r.prize) + '</span>' : '') + '</td></tr>';
    }).join("");
    if (!div.rows.length) return '<div class="callout">No managers assigned to this division.</div>';
    return '<div class="freeze"><table class="t"><thead><tr><th class="num">#</th><th>Team</th><th class="num">Points</th><th class="num">XP</th></tr></thead><tbody>' + body + '</tbody></table></div>';
  }

  /* ====================================================================== */
  /* RULES                                                                  */
  /* ====================================================================== */
  function renderRules(host) {
    var cfg = S.config();
    var topic = state.rulesTopic;
    if (topic && topic !== "all") {
      var R = compRules(topic, cfg);
      if (R) return renderCompRules(host, R);
    }

    // The whole picture, reached from the menu — no competition to return to,
    // so the bar's back arrow falls through to the last tab.
    state.rulesBack = null;
    host.innerHTML = overviewRules(cfg);
    $all("[data-topic]", host).forEach(function (b) {
      b.addEventListener("click", function () {
        location.hash = "rules/" + b.getAttribute("data-topic");
      });
    });
  }

  /* ---- what every competition is worth ---------------------------------- */
  // Read off the prize tables rather than written down anywhere, so the pot
  // always agrees with what the tables actually pay.
  function potTotals(cfg) {
    var sum = function (o) {
      return Object.keys(o || {}).reduce(function (t, k) { return t + (+o[k] || 0); }, 0);
    };
    var classic = sum(cfg.classicPrizes.exact);
    (cfg.classicPrizes.ranges || []).forEach(function (r) {
      classic += (r.to - r.from + 1) * r.amount;
    });
    var monthly = (cfg.months || []).reduce(function (t, m) { return t + sum(m.prizes); }, 0);
    var lms = sum(cfg.lms.prizes);
    var perSeason = (cfg.pyramid.divisions || []).reduce(function (t, d) { return t + sum(d.prizes); }, 0);
    var pyramid = perSeason * (cfg.pyramid.seasons || []).length;
    var hp = cfg.h2h.prizes;
    var h2h = hp.ucl.winner + hp.ucl.runnerUp + hp.uel.winner + hp.uel.runnerUp;
    return { classic: classic, monthly: monthly, lms: lms, pyramid: pyramid,
             pyramidPerSeason: perSeason, h2h: h2h,
             total: classic + monthly + lms + pyramid + h2h };
  }

  function overviewRules(cfg) {
    var pot = potTotals(cfg);
    var n = cfg.expectedManagers || 245;
    var comps = [
      { k: "classic", amt: pot.classic, paid: "Top 45 places" },
      { k: "monthly", amt: pot.monthly, paid: "Top 3, every month" },
      { k: "lms",     amt: pot.lms,     paid: "Last three standing" },
      { k: "pyramid", amt: pot.pyramid, paid: "Top 3 per division, three times" },
      { k: "h2h",     amt: pot.h2h,     paid: "Both finals" }
    ].map(function (c) {
      var R = compRules(c.k, cfg) || {};
      c.name = R.name || c.k; c.lede = R.lede || "";
      return c;
    });
    var most = comps.reduce(function (m, c) { return Math.max(m, c.amt); }, 1);

    var h = '<div class="section-title"><h2>' + esc(cfg.seasonLabel || "The season") +
      '</h2><div class="rule"></div><span class="chip">Rules</span></div>';
    h += '<div class="rulelede">Five competitions running off one Fantasy Premier League team. ' +
      'This is how each of them decides who progresses and where you finish.</div>';

    h += '<div class="grid cols-4 ovstats">' +
      '<div class="stat"><div class="k">' + num(n) + '</div><div class="l">Managers</div></div>' +
      '<div class="stat"><div class="k">' + cfg.totalGameweeks + '</div><div class="l">Gameweeks</div></div>' +
      '<div class="stat"><div class="k">' + comps.length + '</div><div class="l">Competitions</div></div>' +
      '<div class="stat"><div class="k">' + xp(pot.total) + '</div><div class="l">Total XP</div></div>' +
      '</div>';

    /* how the XP is shared */
    h += '<div class="section-title"><h2>How the XP is shared</h2><div class="rule"></div></div>';
    h += '<div class="card"><div class="bd"><div class="potlist">' + comps.map(function (c) {
      return '<button type="button" class="potrow" data-topic="' + c.k + '">' +
        '<span class="pr-n">' + esc(c.name) + '</span>' +
        '<span class="pr-bar"><i style="width:' + Math.max(3, (c.amt / most) * 100).toFixed(1) + '%"></i></span>' +
        '<span class="pr-a">' + xp(c.amt) + '</span>' +
        '<span class="pr-p">' + esc(c.paid) + '</span>' +
        '</button>';
    }).join("") + '</div>' +
      '<div class="note" style="margin-top:12px">Totals are added up from the XP tables themselves, ' +
      'so they always agree with what each competition actually awards. Tap one to read its rules.</div>' +
      '</div></div>';

    /* the rules behind all of them */
    h += '<div class="section-title"><h2>Rules that apply everywhere</h2><div class="rule"></div></div>';
    h += '<div class="card"><div class="bd"><ul class="rulelist">' +
      everywhereRules().map(function (x) { return '<li>' + x + '</li>'; }).join("") +
      '</ul></div></div>';

    /* one line each, then the way in */
    h += '<div class="section-title"><h2>The five competitions</h2><div class="rule"></div></div>';
    h += comps.map(function (c) {
      return '<button type="button" class="compcard" data-topic="' + c.k + '">' +
        '<span class="cc-h"><span class="cc-n">' + esc(c.name) + '</span>' +
        '<span class="cc-a">' + xp(c.amt) + '</span></span>' +
        '<span class="cc-s">' + c.lede + '</span>' +
        '<span class="cc-go">Read the rules \u2192</span></button>';
    }).join("");

    /* the side leagues: their own money, so not in the totals above */
    var vp = cfg.voluntaryPrizes || {};
    var vTotal = Object.keys(vp).reduce(function (t, k) { return t + (+vp[k].pot || 0); }, 0);
    if (vTotal) {
      h += '<div class="section-title"><h2>Voluntary leagues</h2><div class="rule"></div>' +
        '<span class="chip">separate pots</span></div>';
      h += '<button type="button" class="compcard" data-topic="voluntary">' +
        '<span class="cc-h"><span class="cc-n">Game On Voluntary</span>' +
        '<span class="cc-a">' + xp(vTotal) + '</span></span>' +
        '<span class="cc-s">Five side leagues entered separately and played on the same team. ' +
        'Not part of the total above.</span>' +
        '<span class="cc-go">Read the rules \u2192</span></button>';
    }

    /* the league's own wording, kept verbatim */
    h += '<div class="section-title"><h2>As written by the league</h2><div class="rule"></div></div>';
    h += '<div class="card"><div class="bd"><ol class="verbatim">' +
      (cfg.rules || []).map(function (r) {
        return '<li><b>' + esc(r.title) + '</b><span>' + esc(r.body) + '</span></li>';
      }).join("") + '</ol></div></div>';

    h += '<div class="section-title"><h2>Manager of the Month XP</h2><div class="rule"></div></div>' + monthlyPrizeCard(cfg);
    h += '<div class="section-title"><h2>Pyramid XP</h2><div class="rule"></div><span class="chip">per mini-season</span></div>' +
      pyramidPrizeCard(cfg) +
      '<div class="note" style="margin:8px 2px 0">' + xpa(pot.pyramidPerSeason) +
      ' a mini-season, awarded ' + (cfg.pyramid.seasons || []).length + ' times across the season.</div>';

    // Two different things, and the credit should not run them together: the
    // league is Lasil's, the app is PK's.
    h += '<div class="section-title"><h2>About</h2><div class="rule"></div></div>';
    h += '<div class="card"><div class="bd">' +
      '<div class="credit"><div class="cr-l">The league</div>' +
      '<div class="cr-b"><b>Game On</b> is a Fantasy Premier League league system ' +
      'created by <b>Lasil Dias</b>. ' +
      esc(cfg.version ? ("V" + cfg.version) : (cfg.seasonLabel || "This")) +
      ' is this season\u2019s edition.</div></div>' +
      '<div class="credit"><div class="cr-l">The app</div>' +
      '<div class="cr-b">This tracker was brought to life by <b>PK</b>.</div></div>' +
      '<div class="note" style="line-height:1.7;margin-top:12px">' +
      'Player and scoring data \u00a9 the Fantasy Premier League. ' +
      'Not affiliated with, endorsed by, or connected to the Premier League or FPL.' +
      '</div>' +
      '<div class="note" style="line-height:1.7;margin-top:10px">' +
      'The app counts which tabs are opened and how long it is on screen, and where a phone has ' +
      '"Highlight my team" set, the organiser can see who uses it and when. ' +
      'Switch it off for your phone under Settings \u2192 Usage counter.' +
      '</div></div></div>';
    return h;
  }

  // A rules page is a lede, then blocks. A block is prose, a list of rules, or
  // an ordered tie-break chain — the chain is numbered because the order is the
  // rule, and its last step is the one that applies when nothing separates them.
  function ruleBlock(b) {
    var body;
    if (b.list) {
      body = '<ul class="rulelist">' + b.list.map(function (x) {
        return '<li>' + x + '</li>';
      }).join("") + '</ul>';
    } else if (b.chain) {
      body = '<ol class="rulechain">' + b.chain.map(function (x, i) {
        var last = i === b.chain.length - 1;
        return '<li' + (last ? ' class="end"' : '') + '><span class="rc-t">' + x.t + '</span>' +
          '<span class="rc-s">' + x.s + '</span></li>';
      }).join("") + '</ol>';
    } else {
      body = '<div class="note" style="color:var(--ink-soft);font-size:13.5px;line-height:1.65">' + b.body + '</div>';
    }
    return '<div class="card"><div class="hd"><h3>' + esc(b.h) + '</h3></div>' +
      '<div class="bd">' + body + '</div></div>';
  }

  function renderCompRules(host, R) {
    state.rulesBack = R.back;
    var h = '<div class="section-title"><h2>' + esc(R.name) + '</h2><div class="rule"></div><span class="chip">Rules</span></div>';
    if (R.lede) h += '<div class="rulelede">' + R.lede + '</div>';
    R.blocks.forEach(function (b) { h += ruleBlock(b); });
    if (R.extra) { h += R.extra; }
    h += '<div class="card"><div class="hd"><h3>Applies to every competition</h3></div><div class="bd">' +
      '<ul class="rulelist">' + everywhereRules().map(function (x) {
        return '<li>' + x + '</li>';
      }).join("") + '</ul></div></div>';
    host.innerHTML = h;
  }

  // The four rules that sit behind all five competitions, so each page can end
  // with them rather than each one restating a quarter of them.
  function everywhereRules() {
    return [
      '<b>One team per manager</b>, entered into all five competitions. The same squad and the same score feed every table.',
      '<b>Points are FPL\u2019s own</b>, and <b>transfer hits are deducted</b> in every competition here.',
      '<b>The playing XI means the eleven who eventually played</b> \u2014 after FPL applies its automatic substitutions, not the eleven originally picked. Under Bench Boost all fifteen count.',
      '<b>A captain\u2019s goal counts once.</b> The multiplier doubles points; goals, clean sheets and assists are counts of things that happened.'
    ];
  }

  function compRules(topic, cfg) {
    var g = cfg.h2h.groupStageGws, kn = cfg.h2h.knockout;
    var gwSpan = function (a) { return "GW\u00a0" + a[0] + "\u2013" + a[a.length - 1]; };
    var n = cfg.expectedManagers || 245;

    if (topic === "classic") return {
      name: "Classic League", back: "classic",
      lede: "The season-long table. Every manager, all " + cfg.totalGameweeks +
        " gameweeks, highest total wins.",
      extra: prizesBlock(prizeReferenceCard()),
      blocks: [
        { h: "How you progress", list: [
          "Ranked on your <b>total points across the season</b>, net of hits.",
          "Nobody is eliminated \u2014 the table simply stands at GW\u00a0" + cfg.totalGameweeks + ".",
          "The <b>top 45 places</b> earn XP."
        ] },
        { h: "If two managers finish level", chain: [
          { t: "Months won", s: "Whoever has won more monthly competitions finishes ahead." },
          { t: "Share the place and split the XP",
            s: "Still level, and they take the same joint position. The XP for all the tied places is pooled and divided evenly, with any remainder going to the higher places." }
        ] }
      ] };

    if (topic === "monthly") return {
      name: "Manager of the Month", back: "monthly",
      lede: "Ten separate mini-competitions, one per calendar month from August to May. Top three in each earn XP.",
      extra: prizesBlock(monthlyPrizeCard(cfg)),
      blocks: [
        { h: "How you progress", list: [
          "Your score for a month is the <b>sum of your gameweek scores in that month</b>, hits included.",
          "Each month stands alone \u2014 nothing carries between them.",
          "Gameweeks are assigned to months by <b>the real fixture deadline dates</b>, so a month follows the actual calendar rather than a fixed guess."
        ] },
        { h: "If two managers finish level in a month", chain: [
          { t: "Points on the bench", s: "More bench points across the month\u2019s gameweeks finishes ahead." },
          { t: "Goals in the playing XI", s: "Then more goals across those gameweeks." },
          { t: "Clean sheets in the playing XI", s: "Then more clean sheets." },
          { t: "Assists in the playing XI", s: "Then more assists." }
        ] }
      ] };

    if (topic === "lms") return {
      name: "Last Manager Standing", back: "lms",
      lede: "Every gameweek, the lowest scorers among the survivors go out. It runs the full " +
        cfg.totalGameweeks + " gameweeks and ends with one manager left from " + n + ".",
      extra: prizesBlock(lmsPrizeCard(cfg)) + lmsGridCard(cfg),
      blocks: [
        { h: "How you progress", list: [
          "Your score is <b>that gameweek alone</b>, including hits. It resets every week \u2014 nothing accumulates.",
          "The <b>lowest scorers among the managers still alive</b> are eliminated. How many go depends on the gameweek \u2014 see the elimination grid below.",
          "Once you are out, you are out. There is no re-entry.",
          "A gameweek <b>never eliminates the last manager standing</b>. However many places are due, one is always left."
        ] },
        { h: "If survivors are level on score", chain: [
          { t: "Points on the bench", s: "More bench points survives." },
          { t: "Goals in the playing XI", s: "More goals survives." },
          { t: "Clean sheets in the playing XI", s: "More clean sheets survives." },
          { t: "Assists in the playing XI", s: "More assists survives." },
          { t: "Carry the tie forward",
            s: "Still level on all four, and none of the tied managers goes out this week. The places they were level for are added to next gameweek\u2019s eliminations, on top of its own." }
        ] }
      ] };

    if (topic === "pyramid") return {
      name: "The Pyramid Battle", back: "pyramid",
      lede: "Four divisions, three mini-seasons. Win your division, or climb into a better one for the next.",
      extra: pyramidVisualCard() + prizesBlock(pyramidPrizeCard(cfg)),
      blocks: [
        { h: "How you progress", list: [
          "All " + n + " managers are split across four divisions: <b>" +
            cfg.pyramid.divisions.map(function (d) { return esc(d.name); }).join(", ") + "</b>.",
          "The season runs as <b>three mini-seasons</b>, each scored independently: " +
            cfg.pyramid.seasons.map(function (x) { return "<b>" + gwSpan(x.gws) + "</b>"; }).join(", ") +
            ". The gameweeks in between count for nothing here.",
          "Your score in a mini-season is the sum of your gameweek scores in it, <b>hits included</b>.",
          "Between mini-seasons the <b>top " + cfg.pyramid.promoteCount + " of each division go up</b> and the <b>bottom " +
            cfg.pyramid.relegateCount + " go down</b>.",
          "The <b>top three in every division</b> earn XP at the end of every mini-season."
        ] },
        { h: "If two managers finish level in a division", chain: [
          { t: "The last gameweek of the mini-season", s: "Higher score in that gameweek finishes ahead." },
          { t: "Points on the bench", s: "Then more bench points \u2014 in that final gameweek alone." },
          { t: "Goals in the playing XI", s: "Then more goals in that gameweek." },
          { t: "Clean sheets, then assists", s: "Then more clean sheets, and then more assists, in that gameweek." }
        ] }
      ] };

    if (topic === "voluntary") return {
      name: "Game On Voluntary", back: "vol",
      lede: "Five side leagues, each entered separately and played on the same team you " +
        "already have. Season-long tables, highest total wins, every pot given out in full.",
      extra: prizesBlock(voluntaryPrizeCard(cfg)),
      blocks: [
        { h: "How you progress", list: [
          "Each league is a league of its own on FPL. Its table is the game\u2019s own: ranked on " +
            "your <b>total points across the season</b>, net of hits.",
          "Nobody is eliminated \u2014 the table stands at GW\u00a0" + cfg.totalGameweeks + ".",
          "A league\u2019s pot is its entry fee times its entries, and <b>every rupee of it is " +
            "awarded</b> to the places below."
        ] },
        { h: "If two managers finish level", chain: [
          { t: "Share the place and split the XP",
            s: "They take the same joint position. The XP for all the tied places is pooled and " +
               "divided evenly, with any remainder going to the higher places." }
        ] }
      ] };

    if (topic === "h2h") return {
      name: "Game On UCL", back: "h2h",
      lede: "A head-to-head competition run like the Champions League: " + cfg.h2h.groupCount +
        " groups, then a knockout bracket, with a second bracket for the teams who just miss out.",
      extra: prizesBlock(h2hPrizeCard(cfg)),
      blocks: [
        { h: "Group stage", list: [
          "<b>" + cfg.h2h.groupCount + " groups of " + cfg.h2h.perGroup + "</b> \u2014 " +
            (cfg.h2h.expectedManagers || cfg.h2h.groupCount * cfg.h2h.perGroup) +
            " managers \u2014 playing head-to-head across <b>" + gwSpan(g) + "</b>.",
          "Each week you are drawn against one manager in your group. <b>Higher gameweek score wins.</b>",
          "<b>Win " + cfg.h2h.pointsWin + ", draw " + cfg.h2h.pointsDraw + ", loss " + cfg.h2h.pointsLoss +
            ".</b> Groups are ordered on points, then on total gameweek points scored.",
          "<b>Top " + cfg.h2h.qualify.uclPerGroup + " in each group</b> go into the UCL knockout. <b>Third and fourth</b> go into the UEL knockout."
        ] },
        { h: "Knockout stage", list: kn.map(function (k) {
          return "<b>" + esc(k.name) + "</b> \u2014 GW\u00a0" + k.gws.join(" & ") +
            (k.legs === 2 ? ", two legs on aggregate" : ", a single gameweek");
        }) },
        { h: "If a knockout tie is level", chain: [
          { t: "The Last Manager tie-breakers", s: "Bench points, then goals, then clean sheets, then assists in the playing XI." },
          { t: "Group stage points", s: "More points won in the group stage goes through." },
          { t: "Group stage score", s: "Higher total score across the group stage goes through." }
        ] }
      ] };

    return null;
  }

  function prizesBlock(card) {
    return '<div class="section-title"><h2>XP</h2><div class="rule"></div></div>' + card;
  }
  function pyramidVisualCard() {
    return '<div class="section-title"><h2>The pyramid</h2><div class="rule"></div></div>' +
      '<div class="card"><div class="bd"><div class="pyr">' +
      '<div class="lvl elite">ELITE<small>promotion top · most XP</small></div>' +
      '<div class="lvl championship">CHAMPIONSHIP</div>' +
      '<div class="lvl challenger">CHALLENGER</div>' +
      '<div class="lvl conference">CONFERENCE<small>climb up · top 5 promoted, bottom 5 relegated</small></div>' +
      '</div><div class="note" style="margin-top:12px">Division rosters are auto-assigned by overall league rank at the start; the organiser can set the real Season-1 rosters in Settings → Admin. Seasons 2 & 3 then follow promotion / relegation automatically.</div>' +
      '</div></div>';
  }
  function lmsGridCard(cfg) {
    var start = cfg.expectedManagers || 245, running = start, rows = [];
    for (var gw = 1; gw <= cfg.totalGameweeks; gw++) {
      var exp = cfg.lms.elimPerGw[gw] || 0;
      rows.push({ gw: gw, sog: running, eliminated: null, expected: exp, eog: running - exp });
      running -= exp;
    }
    var mid = Math.ceil(rows.length / 2);
    return '<div class="section-title"><h2>Elimination grid</h2><div class="rule"></div><span class="chip">SOG=start · EOG=end</span></div>' +
      '<div class="lmsgrid">' + gridTable(rows.slice(0, mid)) + gridTable(rows.slice(mid)) + '</div>';
  }
  // 1,2,3 -> "GW 1-3"; 1,2,5 -> "GW 1, 2, 5". A month that lost a gameweek to a
  // rearranged fixture should look different from one that did not.
  function gwRange(gws) {
    if (!gws || !gws.length) return "\u2014";
    var runs = [], start = gws[0], prev = gws[0];
    for (var i = 1; i <= gws.length; i++) {
      if (i < gws.length && gws[i] === prev + 1) { prev = gws[i]; continue; }
      runs.push(start === prev ? String(start) : (start + "\u2013" + prev));
      start = prev = gws[i];
    }
    return "GW " + runs.join(", ");
  }

  function monthlyPrizeCard(cfg) {
    // The gameweeks a month owns are worked out from the real fixture deadlines,
    // so read them back from the computed months rather than from the config's
    // placeholder calendar — otherwise this table and the Monthly tab disagree
    // about which gameweeks August is, and the tab is the one that is right.
    var ds = S.dataset(), derived = {};
    if (ds) {
      try {
        (K.monthly(ds) || []).forEach(function (m) { derived[m.key] = m.gws; });
      } catch (e) { /* fall back to the config below */ }
    }
    var rows = cfg.months.map(function (m) {
      var gws = derived[m.key] || m.gws;
      return '<tr><td>' + esc(m.name) + '</td><td class="num prize">' + xp(m.prizes[1]) + '</td>' +
        '<td class="num">' + xp(m.prizes[2]) + '</td><td class="num">' + xp(m.prizes[3]) + '</td>' +
        '<td class="note">' + gwRange(gws) + '</td></tr>';
    }).join("");
    return '<div class="card"><div class="tablewrap"><table class="t"><thead><tr><th>Month</th><th class="num">1st</th><th class="num">2nd</th><th class="num">3rd</th><th>Gameweeks</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
  }
  function pyramidPrizeCard(cfg) {
    var rows = cfg.pyramid.divisions.map(function (d) {
      return '<tr><td>' + esc(d.name) + '</td><td class="num prize">' + xp(d.prizes[1]) + '</td><td class="num">' + xp(d.prizes[2]) + '</td><td class="num">' + xp(d.prizes[3]) + '</td></tr>';
    }).join("");
    return '<div class="card"><div class="tablewrap"><table class="t"><thead><tr><th>Division</th><th class="num">1st</th><th class="num">2nd</th><th class="num">3rd</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
  }
  function lmsPrizeCard(cfg) {
    var p = cfg.lms.prizes;
    return '<div class="grid cols-3">' + prizeTile("Champion", p.champion, "trophy", "gold") + prizeTile("Runner-up", p.runnerUp, "medal", "silver") + prizeTile("3rd place", p.third, "medal", "bronze") + '</div>';
  }
  function h2hPrizeCard(cfg) {
    var p = cfg.h2h.prizes;
    return '<div class="grid cols-4">' + prizeTile("UCL Winner", p.ucl.winner) + prizeTile("UCL Runner-up", p.ucl.runnerUp) +
      prizeTile("UEL Winner", p.uel.winner) + prizeTile("UEL Runner-up", p.uel.runnerUp) + '</div>';
  }

  /* ====================================================================== */
  /* PROFILE (per-manager, opened by tapping a name)                        */
  /* ====================================================================== */
  // Compact competition card on a profile.
  function pcard(label, big, sub) {
    return '<div class="pc"><div class="pcl">' + esc(label) + '</div>' +
      '<div class="pcv">' + esc(big) + '</div>' +
      (sub ? '<div class="pcs">' + esc(sub) + '</div>' : '') + '</div>';
  }
  /* ---- squad pitch (FPL-style) ----------------------------------------- */

  // Outfield kits: [body, sleeve, stripe?] by FPL team short name.
  var KITS = {
    ARS: ["#ef0107", "#ffffff"], AVL: ["#670e36", "#95bfe5"],
    BHA: ["#0057b8", "#0057b8", "#ffffff"], BOU: ["#da291c", "#111111", "#111111"],
    BRE: ["#e30613", "#ffffff", "#ffffff"], BUR: ["#6c1d45", "#83d3f0"],
    CHE: ["#034694", "#034694"], COV: ["#6ecef5", "#6ecef5"],
    CRY: ["#1b458f", "#c4122e", "#c4122e"], EVE: ["#003399", "#003399"],
    FUL: ["#f2f2f2", "#111111"], HUL: ["#f5a12d", "#111111", "#111111"],
    IPS: ["#3a64a3", "#ffffff"], LEE: ["#f2f2f2", "#f2f2f2"],
    LIV: ["#c8102e", "#c8102e"], MCI: ["#6cabdd", "#6cabdd"],
    MUN: ["#da291c", "#da291c"], NEW: ["#241f20", "#241f20", "#ffffff"],
    NFO: ["#dd0000", "#dd0000"], SHU: ["#ee2737", "#111111", "#111111"],
    SOU: ["#d71920", "#ffffff", "#ffffff"], SUN: ["#eb172b", "#eb172b", "#ffffff"],
    TOT: ["#f2f2f2", "#131f49"], WHU: ["#7a263a", "#1bb1e7"],
    WOL: ["#fdb913", "#231f20"], LEI: ["#003090", "#003090"],
    NOR: ["#fff200", "#00a650"], IPW: ["#3a64a3", "#ffffff"]
  };
  var GK_KITS = [["#c8f560", "#111111"], ["#ff7ac8", "#3a1030"], ["#1f9e8f", "#0c3f3a"], ["#2b2b3a", "#8a8a99"], ["#ff9d3c", "#5a2a00"]];
  var _jid = 0;

  function kitFor(team, type) {
    if (type === 1) { // keepers wear their own thing — stable per club
      var s = String(team || "");
      var n = 0; for (var i = 0; i < s.length; i++) n = (n * 31 + s.charCodeAt(i)) >>> 0;
      return GK_KITS[n % GK_KITS.length];
    }
    return KITS[team] || ["#8f8fa3", "#6f6f83"];
  }

  // A little shirt: body + contrast sleeves, optional vertical stripes.
  /* ---- the voluntary leagues ---------------------------------------------
     Five side leagues played on the same team a manager already has in the
     classic league. Tabs and a table; everything about the league itself is
     behind the information button beside them. */
  function volRows(v) {
    return v.rows.map(function (r) {
      var rc = r.computedRank <= 3 ? "rk" + r.computedRank : "";
      var eq = r.tiedWith > 1
        ? '<span class="jt" title="Level with ' + (r.tiedWith - 1) + ' other' +
          (r.tiedWith > 2 ? 's' : '') + ' \u2014 the XP is shared">=</span>' : '';
      return '<tr' + (isMe(r.id) ? ' class="me"' : '') + ' data-entry="' + r.id + '">' +
        '<td class="num"><span class="rankcell">' + eq +
        '<span class="r ' + rc + '">' + r.computedRank + '</span></span></td>' +
        '<td class="name"><span class="who">' + esc(r.entryName || r.name) + '</span>' +
        '<div class="mgr">' + esc(r.name) + '</div></td>' +
        '<td class="num c-gw">' + num(r.eventTotal) + '</td>' +
        '<td class="num"><b>' + num(r.total) + '</b></td>' +
        '<td class="num">' + (r.prize ? '<span class="prize">' + xp(r.prize) + '</span>' : '') + '</td>' +
        '</tr>';
    }).join("");
  }

  function renderVoluntary(host, ds) {
    var leagues = K.voluntaryLeagues(ds);
    if (!leagues.length) {
      host.innerHTML = '<div class="callout">No voluntary leagues are set up.</div>';
      return;
    }
    if (!state.volKey || !leagues.some(function (l) { return l.key === state.volKey; })) {
      state.volKey = leagues[0].key;
    }
    // The tabs and the table are both direct children of the view, because
    // fill mode gives the table the rest of the screen and scrolls it inside
    // itself — the same way the classic league's table works.
    var head = '<div class="volhead">' +
      '<div class="pseg sm volseg" role="tablist">' +
      leagues.map(function (l) {
        return '<button type="button" role="tab" data-vol="' + l.key + '"' +
          (l.key === state.volKey ? ' class="on" aria-selected="true"' : ' aria-selected="false"') +
          ' aria-label="' + esc(l.name) + '">' + esc(l.short) + '</button>';
      }).join("") + '</div></div>';
    host.innerHTML = head + '<div id="volPanel"></div>';

    var draw = function () {
      var v = ds ? K.voluntary(ds, state.volKey) : null;
      $all("[data-vol]", host).forEach(function (b) {
        var on = b.getAttribute("data-vol") === state.volKey;
        b.classList.toggle("on", on);
        b.setAttribute("aria-selected", on ? "true" : "false");
      });
      var panel = $("#volPanel", host);
      if (!v || !v.loaded) {
        panel.innerHTML = '<div class="callout">This table arrives with the next data sync.</div>';
        return;
      }
      panel.innerHTML = '<div class="freeze"><table class="t voltbl"><thead><tr>' +
        '<th class="num">#</th><th>Team</th><th class="num c-gw">GW</th>' +
        '<th class="num">Total</th><th class="num">XP</th>' +
        '</tr></thead><tbody id="volBody">' + volRows(v) + '</tbody></table></div>';
    };

    $(".volseg", host).addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("[data-vol]");
      if (!b) return;
      state.volKey = b.getAttribute("data-vol");
      try { history.replaceState(null, "", "#vol/" + state.volKey); } catch (e2) {}
      draw();
    });
    draw();
  }

  /* ---- faces -------------------------------------------------------------
     A photograph where we have one, and something that looks deliberate where
     we do not. Every face is drawn into a box that is already the right size
     with its fallback already inside it, so a picture that never arrives -- a
     new signing, a man the league never photographed, a first visit with no
     signal -- changes nothing about the layout. The picture is decoration; the
     thing underneath it is the page.

     The photographs are our own copies under photos/, named by the league's
     photo code, which follows a player between seasons where an element id
     does not. A dataset published before this existed carries no code at all
     and simply gets the fallback. */
  var PPOS_LBL = { 1: "Goalkeeper", 2: "Defender", 3: "Midfielder", 4: "Forward" };
  function faceCode(el) {
    var ds = S.dataset();
    var m = ds && ds.elements && ds.elements[el];
    var c = m && m[7];
    return (typeof c === "number" && c > 0) ? c : 0;
  }
  // Photographs whose player has changed club since the shot was taken. They
  // are named after the player, so a transfer leaves him in the old shirt;
  // until the league publishes a new one he wears the jersey the app draws.
  var _hidden = null, _hiddenFor = null;
  function faceHidden(code) {
    var ds = S.dataset();
    if (!ds) return false;
    if (_hiddenFor !== ds) {
      _hidden = {};
      (ds.faceHide || []).forEach(function (c) { _hidden[String(c)] = 1; });
      _hiddenFor = ds;
    }
    return !!_hidden[String(code)];
  }
  function facePic(el, cls) {
    var code = faceCode(el);
    if (!code || faceHidden(code)) return "";
    return '<img class="facepic' + (cls ? " " + cls : "") + '" src="photos/p' + code +
      '.webp" alt="" loading="lazy" decoding="async">';
  }
  /* ---- hurt, banned or a doubt -------------------------------------------
     One mark, three shades, and nothing at all for a fit player. The shape
     changes with the shade as well as the colour \u2014 a full triangle for a man
     who is out, a hollow one for a doubt \u2014 because a red mark and an amber one
     are the same mark to a good many people.                                */
  function flagWords(f) {
    if (f.status === "s") return "Suspended";
    if (f.status === "u" || f.status === "n") return "Unavailable";
    if (f.chance === 0) return "Out";
    if (f.chance != null) return f.chance + "% chance of playing";
    return f.status === "i" ? "Injured" : "A doubt";
  }
  function flagMark(f, name) {
    var says = (name ? name + ": " : "") + flagWords(f);
    return '<i class="pflag ' + f.level + '" role="img" aria-label="' + esc(says) +
      '" title="' + esc(says) + '">' +
      '<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">' +
      '<path d="M12 3.6 22 20.4H2Z"/>' +
      '<path class="bang" d="M12 9.6v4.4" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/>' +
      '<circle class="bang" cx="12" cy="17.2" r="1.15"/></svg></i>';
  }
  // The same thing said in full, across the top of a player's sheet: what FPL
  // says, and when it said it. The date is not decoration — a fortnight-old
  // "knock" is a different thing from this morning's, and a flag quietly out
  // of date would have somebody transfer out a man who trained on Friday.
  function flagBanner(f) {
    if (!f) return "";
    var when = "";
    if (f.since) {
      var age = Date.now() - Date.parse(f.since);
      if (age === age && age > 0) when = ' \u00b7 FPL said so ' + agoText(age);
    }
    return '<div class="pflagbar ' + f.level + '" role="status">' +
      '<svg class="pfi" viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">' +
      '<path d="M12 3.6 22 20.4H2Z" fill="currentColor"/>' +
      '<path d="M12 9.6v4.4" stroke="var(--pflag-ink)" stroke-width="2.1" stroke-linecap="round"/>' +
      '<circle cx="12" cy="17.2" r="1.15" fill="var(--pflag-ink)"/></svg>' +
      '<span class="pft">' + esc(f.news || flagWords(f)) + esc(when) + '</span></div>';
  }

  // Two letters: one looks like a mistake and three do not fit.
  function initialsOf(name) {
    var p = String(name || "").split(/[\s.\-'\u2019]+/).filter(Boolean);
    if (!p.length) return "?";
    return (p.length > 1 ? p[0].charAt(0) + p[p.length - 1].charAt(0)
                         : p[0].slice(0, 2)).toUpperCase();
  }
  // A face for a table row: initials underneath, photograph over them.
  function faceBox(el, name, cls) {
    return '<span class="face' + (cls ? " " + cls : "") + '" aria-hidden="true">' +
      '<i>' + esc(initialsOf(name)) + '</i>' + facePic(el) + '</span>';
  }

  function jersey(team, type) {
    var k = kitFor(team, type), body = k[0], sleeve = k[1], stripe = k[2];
    var id = "jk" + (++_jid);
    var shirt = "M16,3 L11,4.6 L3,11 L8.6,18.2 L12.6,14.6 L12.6,39 L31.4,39 L31.4,14.6 " +
                "L35.4,18.2 L41,11 L33,4.6 L28,3 C26.4,6.6 17.6,6.6 16,3 Z";
    var out = '<svg class="jsy" viewBox="0 0 44 42" aria-hidden="true">';
    if (stripe) out += '<defs><clipPath id="' + id + '"><path d="' + shirt + '"/></clipPath></defs>';
    out += '<path d="' + shirt + '" fill="' + body + '"/>';
    if (stripe) {
      out += '<g clip-path="url(#' + id + ')">' +
        '<rect x="14.2" y="0" width="3.4" height="42" fill="' + stripe + '"/>' +
        '<rect x="20.3" y="0" width="3.4" height="42" fill="' + stripe + '"/>' +
        '<rect x="26.4" y="0" width="3.4" height="42" fill="' + stripe + '"/></g>';
    }
    out += '<path d="M11,4.6 L3,11 L8.6,18.2 L12.6,14.6 L12.6,5.6 Z" fill="' + sleeve + '"/>' +
           '<path d="M33,4.6 L41,11 L35.4,18.2 L31.4,14.6 L31.4,5.6 Z" fill="' + sleeve + '"/>' +
           '<path d="' + shirt + '" fill="none" stroke="rgba(0,0,0,.30)" stroke-width="1.1"/>' +
           '</svg>';
    return out;
  }

  // What each player card shows: gameweek points, effective ownership, price.
  var METRICS = { pts: "Points", eo: "Ownership", val: "Value" };
  function metricOf(p, metric) {
    if (metric === "eo") return p.eo + "%";
    if (metric === "val") return "£" + (Math.round(p.price) / 10).toFixed(1) + "m";
    return num(p.pts);
  }

  // One player: shirt card with a white name bar and a value bar underneath.
  function pp(p, showPos, metric, swapped) {
    // Turned over: the player this one replaced, and what he scored after
    // leaving. The card keeps its shape so the eleven still reads as a team.
    if (swapped && p.inFor) {
      var out = p.inFor;
      return '<div class="pcell">' +
        (showPos ? '<div class="pposlbl">' + esc(p.pos) + '</div>' : '') +
        '<div class="pcard gone" data-el="' + out.el + '" data-mult="1" role="button" tabindex="0">' +
          '<i class="pb out">OUT</i>' +
          '<div class="pshirt">' + jersey(out.team, out.type) + facePic(out.el) + '</div>' +
          '<div class="pname">' + esc(out.name) + '</div>' +
          '<div class="ppts">' + num(out.pts) + '</div>' +
          '<div class="psub">for ' + esc(p.name) + '</div>' +
        '</div></div>';
    }
    var badge = p.cap ? '<i class="pb cap">C</i>' : (p.vice ? '<i class="pb vice">V</i>' : "");
    if (p.star && metric !== "eo" && metric !== "val") badge += '<i class="pb star"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6l2.9 6 6.6 1-4.8 4.6 1.1 6.6-5.8-3.1-5.8 3.1 1.1-6.6L2.5 9.6l6.6-1Z"/></svg></i>';
    // How close his price is to moving, in the corner the top-scorer star
    // leaves free in this view. Filled means it goes tonight, outlined means he
    // is drifting that way; the percent sign is dropped because the arrow and
    // the colour have already said what the number is a percentage of, and
    // those six pixels are what let three digits sit on a 320px phone.
    if (metric === "val" && p.move) {
      var mv = p.move, mvn = Math.round(mv.mag);
      badge += '<i class="pmv ' + (mv.up ? "up" : "down") + (mv.soon ? " soon" : "") + (mvn > 99 ? " w3" : "") +
        '" role="img" aria-label="' + mvn + '% of the way to a price ' +
        (mv.up ? "rise" : "fall") + (mv.soon ? ", expected tonight" : "") + '">' +
        '<b>' + (mv.up ? "\u25b2" : "\u25bc") + '</b>' + mvn + '</i>';
    }
    // Before his match kicks off a player's card names the opponent — MUN (A)
    // — the way the official app does; the points take the slot the moment
    // the fixture starts.
    // While his match is in play the points bar lights up, as the official
    // app's does, so a glance says whose score is still moving.
    var footer, ptsView = !metric || metric === "pts";
    if (ptsView && p.waiting && p.opp) {
      footer = '<div class="ppts opp">' + esc(p.opp) + '</div>';
    } else {
      footer = '<div class="ppts' + (ptsView ? (p.live ? ' live' : '') : ' alt') + '"' +
        (ptsView && p.live ? ' title="In play"' : '') + '>' + esc(metricOf(p, metric)) + '</div>';
    }
    // Hurt, banned or a doubt: a mark in the corner and the name bar taking the
    // colour of how bad it is, the way the official app does it, so a squad can
    // be read for trouble at a glance without reading a word. A fit player
    // draws nothing at all, which is nine cards in ten.
    // The corner it sits in is the one nothing else wants: captain is top left,
    // the top-scorer star and the price chip are top right, and the bottom of
    // the shirt slot is empty on every card in every view. It also puts the
    // mark against the name bar it tints, so the two read as one thing.
    var flag = p.flag ? flagMark(p.flag, p.name) : "";
    return '<div class="pcell">' +
      (showPos ? '<div class="pposlbl">' + esc(p.pos) + '</div>' : '') +
      '<div class="pcard' + (p.inFor ? ' came' : '') + '" data-el="' + p.el + '" data-mult="' + (p.mult || 0) + '" role="button" tabindex="0">' + badge +
        '<div class="pshirt">' + jersey(p.team, p.type) + facePic(p.el) + flag + '</div>' +
        '<div class="pname' + (p.flag ? ' flagged ' + p.flag.level : '') + '">' + esc(p.name) + '</div>' +
        footer +
        // his selling price, when FPL would give back less than he now costs.
        // A glyph rather than a word: fifteen cards saying "sells" is a wall
        // of text on a phone, and the line above the pitch spells it out once.
        (metric === "val" && p.sell != null && p.sell !== p.price
          ? '<div class="psub" title="Sells for ' + mval(p.sell) + '" aria-label="Sells for ' + mval(p.sell) + '">' +
            '<span aria-hidden="true">\u21b3</span>' + mval(p.sell) + '</div>' : '') +
      '</div></div>';
  }

  /* The turf, seen from behind the near goal the way the official app draws
     it. Every figure is a per-mille of the pitch's width or height, measured
     off that app's pitch: the far touchline 7.3% down spanning 82% of the
     width, the touchlines meeting the sides 47% down, the 18-yard box 66% of
     the width and 8.5% deep, the six-yard box 35% and 3.7%, the goal 17% of
     the width standing from 2.2% down to the line, halfway at 60%, the circle
     40% wide and 19% tall. Stretched over the pitch, so the same picture at
     any size; the strokes do not stretch with it. The hoarding along the far
     end is HTML, not part of the drawing, so the crests on it keep their
     shape; the goal is HTML too, so it can stand in front of the board. */
  var TURF = null;
  // Two pitches on one page — a profile after the stats, the compare view —
  // must not share gradient ids, so the cached markup carries a placeholder
  // and each pitch gets its own.
  var _turfN = 0;
  function turfSvg() {
    return turfTemplate().replace(/__t__/g, "t" + (++_turfN));
  }
  function turfTemplate() {
    if (TURF) return TURF;
    var T0 = 73;
    var hw = function (y) { return 410 + 0.2267 * (y - T0); };
    var trap = function (f, y1, y2) {
      return "M" + (500 - hw(y1) * f) + " " + y1 + " L" + (500 - hw(y2) * f) + " " + y2 +
             " L" + (500 + hw(y2) * f) + " " + y2 + " L" + (500 + hw(y1) * f) + " " + y1 + " Z";
    };
    // mowing bands, each a little deeper than the one beyond it
    var edges = [73, 150, 232, 325, 425, 530, 640, 760, 885, 1000], bands = "";
    for (var k = 0; k + 1 < edges.length; k += 2) {
      bands += '<rect x="0" y="' + edges[k] + '" width="1000" height="' + (edges[k + 1] - edges[k]) + '" fill="rgba(0,0,0,.055)"/>';
    }
    TURF = '<svg class="pturf" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">' +
      '<defs>' +
        '<linearGradient id="turfgrass-__t__" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0" stop-color="#1e9349"/><stop offset=".55" stop-color="#27a957"/>' +
          '<stop offset=".86" stop-color="#31b965"/><stop offset="1" stop-color="#eef8f2"/></linearGradient>' +
        '<linearGradient id="turffade-__t__" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0" stop-color="#eef8f2" stop-opacity="0"/><stop offset="1" stop-color="#eef8f2"/></linearGradient>' +
      '</defs>' +
      '<rect x="0" y="0" width="1000" height="1000" fill="url(#turfgrass-__t__)"/>' + bands +
      '<g fill="none" stroke="rgba(255,255,255,.72)" stroke-width="2.2" vector-effect="non-scaling-stroke">' +
        '<path d="M' + (500 - hw(T0)) + ' ' + T0 + ' L' + (500 - hw(1000)) + ' 1000 M' + (500 + hw(T0)) + ' ' + T0 +
          ' L' + (500 + hw(1000)) + ' 1000 M' + (500 - hw(T0)) + ' ' + T0 + ' L' + (500 + hw(T0)) + ' ' + T0 + '"/>' +
        '<path class="box18" d="' + trap(0.66, T0, 158) + '"/>' +
        '<path class="box6" d="' + trap(0.35, T0, 110) + '"/>' +
        '<path d="M372 158 A128 27 0 0 0 628 158"/>' +
        '<path class="halfway" d="M' + (500 - hw(603)) + ' 603 L' + (500 + hw(603)) + ' 603"/>' +
        '<ellipse class="circle" cx="500" cy="603" rx="198" ry="97"/>' +
      '</g>' +
      '<ellipse cx="500" cy="150" rx="5" ry="3" fill="rgba(255,255,255,.75)"/>' +
      '<ellipse cx="500" cy="603" rx="5" ry="3" fill="rgba(255,255,255,.75)"/>' +
      '<rect x="0" y="880" width="1000" height="120" fill="url(#turffade-__t__)"/>' +
      '</svg>';
    return TURF;
  }

  function pitchHtml(pit, metric, swapped) {
    // Every card on a pitch is the same size, and the size is whatever the
    // busiest line can carry: a 3-5-2 with five across otherwise drew a
    // midfield of narrower cards than the two men in front of it. The bench
    // takes the same width so the whole team reads as one set of cards.
    // Each row is sized for itself: five in a line is the only row that cannot
    // hold a full-size card on a phone, and it alone gives ground, buying a
    // little back out of its gap; the rows above and below stay full size.
    var geom = '--across:' + (Math.min(pit.bench.length, 4) || 1);
    var h = '<div class="pitch" style="' + geom + '"><div class="pmark">' + turfSvg() +
      '<div class="phoard"><img src="logo-tile.webp" alt="" width="128" height="128" decoding="async">' +
      '<img src="logo-tile.webp" alt="" width="128" height="128" decoding="async"></div>' +
      '<div class="pgoal"></div></div>';
    h += pit.lines.map(function (ln) {
      if (!ln.players.length) return "";
      return '<div class="prow' + (ln.players.length >= 5 ? ' five' : '') + '" style="--across:' + ln.players.length + '">' +
        ln.players.map(function (p) { return pp(p, false, metric, swapped); }).join("") + '</div>';
    }).join("");
    h += '</div>';
    if (pit.bench.length) {
      h += '<div class="pbench" style="' + geom + '">' +
        pit.bench.map(function (p) { return pp(p, true, metric, swapped); }).join("") + '</div>';
    }
    return h;
  }

  var CHIP_NAME = { bboost: "Bench Boost", "3xc": "Triple Captain", freehit: "Free Hit", wildcard: "Wildcard" };

  // The whole squad block: gameweek picker, the three stats, Pitch/List and the
  // squad itself. Re-rendered in place whenever the gameweek or mode changes.
  // The three stats above a squad change with the metric being shown.
  function pitchStats(pit, metric) {
    var left, mid, right, midLabel, leftLabel, rightLabel, hiId = null, midSub = "";
    if (metric === "eo") {
      leftLabel = "League avg"; left = pit.leagueAvgEo + "%";
      midLabel = "Average EO"; mid = pit.avgEo + "%";
      rightLabel = "Most owned"; right = pit.topEo + "%";
    } else if (metric === "val") {
      leftLabel = "League avg"; left = mval(pit.leagueAvgValue);
      midLabel = "Squad value"; mid = mval(pit.squadValue);
      // what the squad would fetch today — FPL keeps half of every rise
      if (pit.sellValue != null && pit.sellValue !== pit.squadValue) {
        midSub = "\u21b3 Sells for " + mval(pit.sellValue);
      }
      rightLabel = "In the bank"; right = pit.bank == null ? "—" : mval(pit.bank);
    } else {
      leftLabel = "Average"; left = pit.average === null ? "—" : num(pit.average);
      midLabel = "Total Pts" + (pit.hits ? ' <span class="hit">−' + num(pit.hits) + '</span>' : '');
      mid = num(pit.net);
      rightLabel = 'Highest <span class="arw">›</span>';
      right = pit.highest ? num(pit.highest.pts) : "—";
      hiId = pit.highest ? pit.highest.id : null;
    }
    var rightOpen = hiId
      ? '<div class="pstat hi" data-entry="' + hiId + '" role="button" tabindex="0">'
      : '<div class="pstat">';
    return '<div class="pstats' + (metric === "val" ? ' money' : '') + '">' +
      '<div class="pstat"><div class="v">' + esc(left) + '</div><div class="l">' + leftLabel + '</div></div>' +
      '<div class="pstat main"><div class="v">' + esc(mid) + '</div>' +
        (midSub ? '<div class="sub">' + esc(midSub) + '</div>' : '') +
        '<div class="l">' + midLabel + '</div></div>' +
      rightOpen + '<div class="v">' + esc(right) + '</div><div class="l">' + rightLabel + '</div></div>' +
      '</div>' +
      // FPL-wide "selected by" lives on the prices tab; the pitch counts the
      // league. Comparing the two without this line has already confused one
      // reader, and 245 will read it.
      (metric === "eo" ? '<div class="note" style="margin:2px 2px 8px">Ownership here is within ' +
        'Game On\u2019s 245 managers. FPL-wide ownership is in Price changes.</div>' : '');
  }

  /* The squad a manager will own next gameweek, rebuilt from the transfers he
     has logged. Shown as a list rather than a pitch on purpose: the transfer
     log names who is in and who is out, and says nothing about the eleven,
     the captain or the bench order, so drawing a formation would be inventing
     three things to display one. */
  function pendingHtml(pd) {
    var GROUP = [[1, "Goalkeepers"], [2, "Defenders"], [3, "Midfielders"], [4, "Forwards"]];
    var badge = function (c) {
      if (!c.move) return "";
      var n = Math.round(c.move.mag);
      return '<i class="pdmv ' + (c.move.up ? "up" : "down") + (c.move.soon ? " soon" : "") +
        '" role="img" aria-label="' + n + '% of the way to a price ' +
        (c.move.up ? "rise" : "fall") + (c.move.soon ? ", expected tonight" : "") + '">' +
        (c.move.up ? "\u25b2" : "\u25bc") + n + '</i>';
    };
    var row = function (c) {
      return '<div class="pdrow' + (c.isNew ? ' fresh' : '') + '">' +
        '<span class="pdn">' + esc(c.name) + (c.isNew ? '<b class="pdnew">In</b>' : '') + '</span>' +
        '<span class="pdt">' + esc(c.team) + '</span>' +
        badge(c) +
        '<span class="pdp">' + mval(c.price) + '</span></div>';
    };
    var h = '<div class="pendhd"><b>Gameweek ' + pd.gw + ' squad</b>' +
      '<span class="pill">Provisional</span></div>';
    h += '<div class="pendmeta">' + num(pd.changed) + ' change' + (pd.changed === 1 ? '' : 's') +
      ' from the Gameweek ' + (pd.gw - 1) + ' squad \u00b7 ' + mval(pd.value) + ' of players' +
      (pd.at ? ' \u00b7 transfers read ' + esc(agoText(Date.now() - Date.parse(pd.at))) : '') +
      '</div>';
    GROUP.forEach(function (g) {
      var men = pd.squad.filter(function (c) { return c.type === g[0]; });
      if (!men.length) return;
      h += '<div class="pdgrp"><div class="lab-sm">' + esc(g[1]) + '</div>' +
        men.map(row).join("") + '</div>';
    });
    if (pd.ins.length) {
      h += '<div class="pdio"><div class="lab-sm">Changes</div>' +
        pd.ins.map(function (c, i) {
          var out = pd.outs[i];
          return '<div class="pdswap"><span class="pdin">' + esc(c.name) + '</span>' +
            '<span class="pdarr">\u2190</span>' +
            '<span class="pdout">' + esc(out ? out.name : "\u2014") + '</span></div>';
        }).join("") + '</div>';
    }
    h += '<div class="note pendnote">Rebuilt from the ' + num(pd.logged) + ' transfer' +
      (pd.logged === 1 ? '' : 's') + ' logged so far, so it changes as more are made and ' +
      'is not final until the deadline. FPL does not publish anyone\u2019s team between ' +
      'deadlines, and the transfer log does not name the eleven, the captain or the bench ' +
      'order \u2014 only who is in and who is out.</div>';
    return h;
  }

  function mountPitch(box, ds, id, gw, metric, swapped) {
    // Between a gameweek settling and the next deadline a manager can already
    // own a different fifteen. The switch says which squad you are looking at,
    // and the official one is what it opens on.
    var pd = K.pendingSquad(ds, id);
    if (pd && state.pitchPending) {
      box.removeAttribute("data-bgw");
      box.innerHTML = whenSwitch(pd, true) + pendingHtml(pd);
      wireWhen(box, ds, id, gw, metric, swapped, pd);
      return;
    }
    var gws = K.squadGws(ds);
    if (!gws.length) return;
    gw = gw || gws[gws.length - 1];
    if (gws.indexOf(+gw) === -1) gw = gws[gws.length - 1];
    var pit = K.managerPitch(ds, id, gw);
    if (!pit) {
      box.innerHTML = '<div class="callout">No squad recorded for this gameweek.</div>';
      return;
    }
    if (!METRICS[metric]) metric = "pts";
    // Turning the cards over only makes sense for the gameweek being shown,
    // so changing gameweek turns them back.
    swapped = !!swapped && !!pit.swaps;
    state.pitchGw = +gw; state.pitchMetric = metric;

    var h = '<div class="pgwline">';
    h += '<select class="in gwsel" id="pitchGwSel" aria-label="Gameweek">' + gws.map(function (g) {
      return '<option value="' + g + '"' + (+g === +gw ? ' selected' : '') + '>Gameweek ' + g + '</option>';
    }).join("") + '</select>';
    h += (pit.live ? ' <span class="pill live">Live</span>' : '') +
      (pit.chip ? ' <span class="pill gold">' + esc(CHIP_NAME[pit.chip] || pit.chip) + '</span>' : '');
    h += '</div>';

    h += pitchStats(pit, metric);
    // Bonus is not confirmed until a fixture is finalised, and a clean sheet
    // held at 60 minutes can still be lost — say so rather than letting a
    // score quietly move.
    if (pit.provisional) {
      h += '<div class="provnote">Includes <b>' + num(pit.provisional) +
        '</b> provisional bonus \u00b7 bonus and clean sheets can still change while matches are on</div>';
    }

    h += '<div class="psegrow">';
    h += '<div class="pseg sm">' + Object.keys(METRICS).map(function (k) {
      return '<button type="button"' + (metric === k ? ' class="on"' : '') + ' data-metric="' + k + '">' + esc(METRICS[k]) + '</button>';
    }).join("") + '</div>';
    h += '</div>';
    // A transfer has two halves and the squad only ever shows one. This turns
    // the new faces over to the players they replaced, and what those went on
    // to score — offered only when there was a transfer to show.
    if (pit.swaps) {
      h += '<button type="button" class="swapbtn' + (swapped ? ' on' : '') + '" id="pitchSwap">' +
        (swapped ? 'Back to the squad' : 'Show ' + num(pit.swaps) + ' transfer' + (pit.swaps === 1 ? '' : 's')) +
        '</button>';
    }

    box.setAttribute("data-bgw", gw);
    h += pitchHtml(pit, metric, swapped);
    box.innerHTML = (pd ? whenSwitch(pd, false) : "") + h;
    if (pd) wireWhen(box, ds, id, gw, metric, swapped, pd);

    $("#pitchGwSel", box).addEventListener("change", function () {
      mountPitch(box, ds, id, +this.value, metric, false);
    });
    $(".psegrow", box).addEventListener("click", function (e) {
      var b = e.target.closest("button[data-metric]");
      if (b) mountPitch(box, ds, id, gw, b.getAttribute("data-metric"), swapped);
    });
    var swapBtn = $("#pitchSwap", box);
    if (swapBtn) swapBtn.addEventListener("click", function () {
      mountPitch(box, ds, id, gw, metric, !swapped);
    });
  }

  // Official is what FPL has published; Next is what the transfer log says is
  // coming. Never opens on the reconstruction.
  function whenSwitch(pd, onPending) {
    return '<div class="psegrow"><div class="pseg sm" id="pitchWhen">' +
      '<button type="button"' + (onPending ? '' : ' class="on"') + ' data-when="official">Official</button>' +
      '<button type="button"' + (onPending ? ' class="on"' : '') + ' data-when="next">GW' + pd.gw +
      ' \u00b7 ' + num(pd.changed) + '</button></div></div>';
  }
  function wireWhen(box, ds, id, gw, metric, swapped, pd) {
    var row = $("#pitchWhen", box);
    if (!row) return;
    row.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-when]");
      if (!b) return;
      state.pitchPending = b.getAttribute("data-when") === "next";
      mountPitch(box, ds, id, gw, metric, swapped);
    });
  }

  function h2hStat(label, value) {
    return '<div class="h2hst"><div class="hv">' + num(value) + '</div>' +
      '<div class="hl">' + esc(label) + '</div></div>';
  }

  function renderProfile(host, ds, id) {
    if (!id) { host.innerHTML = '<div class="callout">No manager selected.</div>'; return; }
    var P = K.managerProfile(ds, id);
    // The manager's team and name live in the top bar, so they are not
    // repeated here. One compact card per competition.
    // Compare and Rival now sit in the bar beside his name; this page keeps
    // only the note that says when it is your own.
    // The season in one card comes first; then, on your own page, your
    // rivals if you have pinned any; then everything else.
    var h = snapshotHtml(ds, id);
    if (isMe(id)) h += rivalsHtml(ds, id);
    // Badges are won, not listed: with none there is nothing to say, so
    // nothing is said.
    var B = K.badges(ds, id);
    if (B.length) h += '<div class="badges">' + B.map(badgeHtml).join("") + '</div>';

    // One section per competition, and how near the places each one is.
    var W = K.winnings(ds, id);
    var PS = K.prizeStatus(ds, id);
    h += psect("xp", "XP");
    h += '<div class="pcards">';
    h += pcard("Won", xpa(W.settled), W.settled ? "locked in" : "nothing settled yet");
    h += pcard("On track for", xpa(W.onTrack), W.onTrack ? "if it ended today" : "outside the XP places");
    h += '</div>';

    if (PS.length) {
      h += '<div class="card"><div class="tablewrap"><table class="t prizetbl"><tbody>';
      h += PS.map(function (e) {
        var pill = e.state === "in" ? '<span class="pill up">in the places</span>'
                 : e.state === "alive" ? '<span class="pill">still in</span>'
                 : '<span class="pill out">out</span>';
        var dist = "";
        if (e.gap !== null && e.gap !== undefined) {
          // "off 3rd" already says behind; a minus sign on top reads as a negative score
          dist = (e.state === "in" ? "+" : "") + num(Math.abs(e.gap)) + " " + esc(e.gapLabel);
        }
        return '<tr><td class="pcomp"><b>' + esc(e.comp) + '</b>' +
            '<div class="mgr">' + esc(e.where) + '</div></td>' +
          '<td class="num ppos">' + (e.pos ? "#" + e.pos : "\u2014") + '</td>' +
          '<td class="pstate">' + pill + (dist ? '<div class="mgr">' + dist + '</div>' : '') + '</td>' +
          '<td class="num">' + (e.prize ? '<span class="prize">' + xpa(e.prize) + '</span>' : '') + '</td></tr>';
      }).join("");
      h += '</tbody></table></div>';
      h += '<div class="note" style="padding:10px 14px">Only a finished competition is settled — ' +
        'everything else moves until its last gameweek is played.</div></div>';
    }

    // All four chips, with the gameweek each was played.
    var chips = K.managerChips(ds, id);
    h += psect("chips", "Chips");
    h += '<div class="chipgrid">' + chips.map(function (c) {
      return '<div class="chipcard' + (c.used ? ' used' : '') + '">' +
        '<div class="cn">' + esc(c.label) + '</div>' +
        '<div class="cg">' + (c.used ? c.gws.map(function (g) { return "GW" + g; }).join(", ") : "unused") + '</div>' +
        '</div>';
    }).join("") + '</div>';

    // Form — the shape of their season.
    var fm = K.form(ds, id);
    if (fm.length) {
      h += psect("form", "Form");
      h += '<div class="card"><div class="bd" id="formBox">' + formChart(fm) + '</div></div>';
    }

    // Squad on a football pitch, steppable through every gameweek played.
    var gws = K.squadGws(ds);
    if (gws.length && K.managerPitch(ds, id, gws[gws.length - 1])) {
      h += psect("squad", "Squad");
      h += '<div class="card pitchcard"><div class="bd" id="pitchBox"></div></div>';
    }

    // The three reference tables fold closed: they are checked once a
    // season, and open they pushed the squad off the first two screens.
    if (P.monthly.length) {
      var momTable = function (rows) {
        return '<div class="card"><div class="tablewrap"><table class="t"><thead><tr><th>Month</th><th class="num">Pos</th><th class="num">Points</th><th class="num">XP</th></tr></thead><tbody>' +
          rows.map(function (m) {
            return '<tr><td>' + esc(m.label || m.name) + '</td><td class="num">' + m.pos + '</td><td class="num">' + num(m.score) + '</td>' +
              '<td class="num">' + (m.prize ? '<span class="prize">' + xp(m.prize) + '</span>' : '') + '</td></tr>';
          }).join("") + '</tbody></table></div></div>';
      };
      var momWon = P.monthly.filter(function (m) { return m.prize; }).length;
      h += pfold("month", "Manager of the Month",
        P.monthly.length + (P.monthly.length === 1 ? " month" : " months") + (momWon ? " \u00b7 " + momWon + " paid" : ""),
        momTable(P.monthly), momTable(P.monthly.slice(-1)));
    }

    // Every head-to-head this manager has played and has left, in the same
    // shape as the fixtures tab.
    var R = K.h2hRecord(ds, id);
    if (R) {
      var h2hDone = {};
      K.finishedGws(ds).forEach(function (g) { h2hDone[g] = 1; });
      var h2hRow = function (r) {
          var pill = r.played
            ? '<div class="fxsc"><span class="fxp' + (r.result === "L" ? " lost" : "") + '">' + num(r.me.score) + '</span>' +
              '<span class="fxp' + (r.result === "W" ? " lost" : "") + '">' + num(r.opp.score) + '</span></div>'
            : '<div class="fxsc ahead"><span class="fxv">V</span></div>'; // live: result is null, so neither side dims
          return '<div class="fx' + (r.played ? "" : " ahead") + '">' +
            '<div class="fxs l"><span class="fxm">' + esc(r.me.player || r.me.name) + '</span>' +
            '<span class="fxt">' + esc(r.me.name) + '</span></div>' + pill +
            '<div class="fxs r"' + (r.opp.known ? ' data-entry="' + r.opp.id + '" role="button" tabindex="0"' : '') + '>' +
            '<span class="fxm">' + esc(r.opp.average ? "AVERAGE" : (r.opp.player || r.opp.name)) + '</span>' +
            '<span class="fxt">' + esc(r.opp.average ? "Gameweek average" : r.opp.name) + '</span></div>' +
            '<div class="fxw">Gameweek ' + r.gw +
              (r.live ? " \u00b7 live" : (r.result === "D" ? " \u00b7 draw" : "")) + '</div></div>';
      };
      // A whole season of fixtures is a long scroll past everything beneath
      // it. Open on this gameweek's match alone; the rest unfold on demand.
      var h2hCur = R.rows.filter(function (r) { return !h2hDone[r.gw]; })[0] || R.rows[R.rows.length - 1];
      var h2hRest = R.rows.filter(function (r) { return r !== h2hCur; });
      h += pfold("h2h", "Head-to-head", "W" + R.w + " D" + R.d + " L" + R.l,
        '<div class="card"><div class="h2hsum">' +
        h2hStat("Played", R.played) + h2hStat("W", R.w) + h2hStat("D", R.d) +
        h2hStat("L", R.l) + h2hStat("Points", R.pts) + h2hStat("For", R.pointsFor) +
        '</div><div class="fxwrap"><div class="fxgrp">' + h2hRow(h2hCur) + '</div>' +
        (h2hRest.length ? '<div class="fxgrp" id="h2hRest" hidden>' + h2hRest.map(h2hRow).join("") + '</div>' +
          '<button type="button" class="fxtoggle" id="h2hAll">Show all ' + R.rows.length + ' fixtures</button>' : '') +
        '</div></div>',
        '<div class="card"><div class="fxwrap"><div class="fxgrp">' + h2hRow(h2hCur) + '</div></div></div>');
    }

    var past, pastPeek = "";
    if (P.past && P.past.length) {
      var pastRows = P.past.slice().reverse(); // newest first
      var pastTable = function (rows) {
        return '<div class="card"><div class="tablewrap"><table class="t"><thead><tr><th>Season</th><th class="num">Overall rank</th><th class="num">Points</th></tr></thead><tbody>' +
          rows.map(function (x) {
            return '<tr><td>' + esc(x.season) + '</td><td class="num">' + num(x.rank) + '</td><td class="num">' + num(x.total) + '</td></tr>';
          }).join("") + '</tbody></table></div></div>';
      };
      past = pastTable(pastRows);
      pastPeek = pastTable(pastRows.slice(0, 1));
    } else {
      past = '<div class="callout">No past-season history for this manager (new to FPL, or not yet synced).</div>';
    }
    h += pfold("past", "Past seasons (FPL)",
      (P.past && P.past.length) ? P.past.length + (P.past.length === 1 ? " season" : " seasons") : "none", past, pastPeek);

    host.innerHTML = h;
    mountProfileChips(host);
    // The row a closed section shows is a doorway to the rest of it — except
    // where it carries something of its own, like an opponent's name.
    host.addEventListener("click", function (e) {
      var pk = e.target.closest && e.target.closest(".pfoldpeek");
      if (!pk || e.target.closest("[data-entry], button, a, input, select, label")) return;
      var d = document.getElementById(pk.getAttribute("data-for"));
      if (d) d.open = true;
    });

    // A badge opens a small bubble under itself saying what it is for and
    // which gameweeks earned it; tapping it again, another badge, or
    // anywhere else closes it.
    var bd = $(".badges", host);
    if (bd) bd.addEventListener("click", function (e) {
      var btn = e.target.closest(".badge");
      if (!btn) return;
      var open = btn.getAttribute("aria-expanded") === "true";
      closeBubble();
      if (!open) openBubble(btn, bd);
    });
    var rvBox = $("#rivalsBox", host);
    if (rvBox) rvBox.addEventListener("click", function (e) {
      var c = e.target.closest("[data-cmp]");
      if (!c) return;
      e.stopPropagation();
      state.cmpA = +id; state.cmpB = +c.getAttribute("data-cmp");
      location.hash = "compare";
    });
    var h2hBtn = $("#h2hAll", host);
    if (h2hBtn) h2hBtn.addEventListener("click", function () {
      var rest = $("#h2hRest", host);
      rest.hidden = !rest.hidden;
      this.textContent = rest.hidden ? ("Show all " + (R ? R.rows.length : "") + " fixtures")
                                     : "Show this gameweek only";
    });
    var box = $("#pitchBox", host);
    if (box) mountPitch(box, ds, id, state.pitchGw, state.pitchMetric);
    var fbox = $("#formBox", host);
    if (fbox) fbox.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-series]");
      if (!b) return;
      var k = b.getAttribute("data-series"), show = formShown();
      // the last series on cannot be switched off: an empty chart says nothing
      if (show[k] && !Object.keys(show).filter(function (o) { return o !== k && show[o]; }).length) return;
      show[k] = !show[k];
      fbox.innerHTML = formChart(K.form(ds, id));
    });
  }

  // The rivals strip on your own profile. Each row is the rival against you:
  // the gap this gameweek and the gap on the season, in your favour when
  // positive. Live numbers come from the same rows the Classic table draws.
  // The season in one card, at the top of every profile: the figures a
  // manager asks about first, in the order they ask. Ranks are never written
  // with an "=" — a shared place says so in words underneath.
  function snapshotHtml(ds, id) {
    var S = K.snapshot(ds, id);
    if (!S) return "";
    var mv = function (d) {
      return d > 0 ? ' <b class="move up">' + num(d) + '</b>' : d < 0 ? ' <b class="move down">' + num(-d) + '</b>' : '';
    };
    var h = '<div class="card snap">';
    h += '<div class="snaphead">' +
      '<div class="snapstat"><div class="v">' + num(S.total) + '</div><div class="l">Total points</div></div>' +
      '<div class="snapstat"><div class="v">' + (S.gwPoints == null ? "\u2013" : num(S.gwPoints)) + '</div>' +
        '<div class="l">' + (S.gw ? "GW" + S.gw : "This week") +
        (S.leagueAvg == null ? '' : ' \u00b7 avg ' + num(S.leagueAvg)) + '</div></div>' +
      '</div>';
    // Two lines, FPL's rank first: the label, the number, and how it moved
    // since last gameweek. No arrow when it did not move.
    var rank = function (k, v, d) {
      return '<div class="snaprank"><span class="k">' + k + '</span><b class="n">' + v + '</b>' + mv(d) + '</div>';
    };
    h += '<div class="snapranks">' +
      (S.overall == null ? '' : rank("Overall", num(S.overall), S.overallMove || 0)) +
      rank("GO", ordinal(S.rank), S.move) +
      '</div>';
    var tiles = [];
    if (S.hits != null) {
      tiles.push(pcard("Hits", S.hits ? "\u2212" + num(S.hits) : "0",
        S.transfers === 1 ? "1 transfer" : num(S.transfers) + " transfers"));
    }
    if (S.bench != null) tiles.push(pcard("On the bench", num(S.bench), "points left there"));
    if (S.best) tiles.push(pcard("Best week", num(S.best.points), "GW" + S.best.gw));
    if (S.leading) {
      tiles.push(pcard("Off the top", "Leading", S.tied ? "shared 1st" : (S.lead == null ? "" : "by " + num(S.lead))));
    } else {
      tiles.push(pcard("Off the top", num(S.behindLeader),
        S.tied ? "shared " + ordinal(S.rank)
               : (S.above && S.above.rank > 1 ? num(S.above.gap) + " off " + ordinal(S.above.rank) : ordinal(S.rank) + " place")));
    }
    tiles.push(pcard("Chips", S.chipPlays ? num(S.chipPlays) + " played" : "None yet", S.chipPlays ? S.chipNames : "all in hand"));
    if (S.value != null) tiles.push(pcard("Squad", mval(S.value), S.bank == null ? "" : mval(S.bank) + " in the bank"));
    h += '<div class="snapgrid">' + tiles.join("") + '</div></div>';
    return h;
  }

  function rivalsHtml(ds, meId) {
    // The section exists only once a rival is pinned; before that the
    // button on other people's profiles is the whole feature.
    var ids = rivals();
    var h = psect("rivals", "Rivals");
    if (!ids.length) return "";
    var rows = K.classic(ds), by = {};
    rows.forEach(function (r) { by[+r.id] = r; });
    var me = by[+meId];
    if (!me) return "";
    // You and your rivals as one short table, in the order the Classic
    // table has you — so who is ahead is the order, not a sum to do.
    var set = ids.map(function (rid) { return rid === +meId ? null : by[rid]; })
      .filter(function (r) { return !!r; });
    if (!set.length) return ""; // every pin was someone gone, or you
    set.push(me);
    set.sort(function (a, b) { return (a.computedRank - b.computedRank) || (a.order - b.order); });
    var live = K.liveGwId(ds);
    var gwLabel = "GW" + (live || K.currentGw(ds) || "");
    var body = set.map(function (r) {
      var mine = +r.id === +meId;
      return '<tr' + (mine ? ' class="me"' : '') + '>' +
        '<td class="num"><span class="r">' + r.computedRank + '</span></td>' +
        '<td class="name" data-entry="' + r.id + '"><span class="who">' + esc(r.entryName) + '</span>' +
          '<div class="mgr">' + esc(r.playerName) + '</div></td>' +
        '<td class="num">' + num(r.eventTotal) + '</td>' +
        '<td class="num"><b>' + num(r.total) + '</b></td>' +
        '<td class="rvact">' + (mine ? '' :
          '<button type="button" class="rvcmp" data-cmp="' + r.id + '" aria-label="Compare with ' +
          esc(r.entryName) + '">' + svg("h2h", 16) + '</button>') + '</td></tr>';
    }).join("");
    return h + '<div class="card"><div class="tablewrap" id="rivalsBox"><table class="t rvtbl"><thead><tr>' +
      '<th class="num">#</th><th>Team</th><th class="num">' + esc(gwLabel) + '</th><th class="num">Total</th><th></th>' +
      '</tr></thead><tbody>' + body + '</tbody></table></div></div>';
  }

  // A profile section: a title the chip row can find and jump to.
  function psect(key, label) {
    return '<div class="section-title" id="ps-' + key + '" data-ps="' + esc(label) + '">' +
      '<h2>' + esc(label) + '</h2><div class="rule"></div></div>';
  }
  // A folded section: the same title as a summary, closed until tapped, with
  // a short hint of what is inside.
  function pfold(key, label, hint, inner, peek) {
    return '<details class="pfold" id="ps-' + key + '" data-ps="' + esc(label) + '">' +
      '<summary><div class="section-title"><h2>' + esc(label) + '</h2><div class="rule"></div>' +
      (hint ? '<span class="chip">' + esc(hint) + '</span>' : '') +
      '<span class="caret" aria-hidden="true"></span></div></summary>' +
      '<div class="pfoldbody">' + inner + '</div></details>' +
      // A closed <details> hides everything inside it, so the row it still
      // shows lives next to it and steps aside when the section opens.
      (peek ? '<div class="pfoldpeek" data-for="ps-' + key + '">' + peek + '</div>' : '');
  }
  // The chip row at the top of a profile: one chip per section, sticky under
  // the bar, jumping to the section and following the scroll.
  function chipOffset() {
    var bar = $("header.topbar"), row = $("#profChips");
    return (bar ? bar.getBoundingClientRect().height : 0) + (row ? row.getBoundingClientRect().height : 0);
  }
  function mountProfileChips(host) {
    var secs = $all("[data-ps]", host);
    if (secs.length < 3) return;
    var row = document.createElement("div");
    row.className = "pchipsbar"; row.id = "profChips";
    row.innerHTML = '<div class="tabrow">' + secs.map(function (el) {
      var short = { "Manager of the Month": "Month", "Head-to-head": "H2H", "Past seasons (FPL)": "Past" };
      var label = el.getAttribute("data-ps");
      return '<button type="button" class="tabbtn" data-go="' + el.id + '">' + esc(short[label] || label) + '</button>';
    }).join("") + '</div>';
    host.insertBefore(row, host.firstChild);
    row.addEventListener("click", function (e) {
      var b = e.target.closest("[data-go]");
      if (!b) return;
      var el = document.getElementById(b.getAttribute("data-go"));
      if (!el) return;
      if (el.tagName === "DETAILS") el.open = true; // you asked for it, so show it
      var top = el.getBoundingClientRect().top + (window.scrollY || 0) - chipOffset() - 6;
      window.scrollTo({ top: Math.max(0, top), behavior: reducedMotion() ? "auto" : "smooth" });
    });
    profileSpy();
  }
  // Which section is under the chip row right now; that chip lights and is
  // scrolled into view. No-op away from a profile.
  var spyPending = false;
  function profileSpy() {
    if (spyPending) return;
    spyPending = true;
    requestAnimationFrame(function () {
      spyPending = false;
      if (state.view !== "profile") return; // the row stays in its hidden view
      var row = $("#profChips");
      if (!row) return;
      var secs = $all("[data-ps]", row.parentNode);
      if (!secs.length) return;
      var line = chipOffset() + 14, cur = secs[0];
      secs.forEach(function (el) { if (el.getBoundingClientRect().top <= line) cur = el; });
      // at the very bottom the last section is the one being read even if
      // its title never reaches the line
      var atEnd = (window.innerHeight + (window.scrollY || 0)) >= (document.documentElement.scrollHeight - 2);
      if (atEnd) cur = secs[secs.length - 1];
      $all(".tabbtn", row).forEach(function (b) {
        var on = b.getAttribute("data-go") === cur.id;
        if (on !== b.classList.contains("on")) {
          b.classList.toggle("on", on);
          if (on) {
            // Only move the strip when the lit chip cannot be seen: recentring
            // on every section made the row fidget under the thumb.
            var strip = b.parentNode;
            var l = b.offsetLeft - strip.scrollLeft, r = l + b.offsetWidth;
            if (l < 8 || r > strip.clientWidth - 8) {
              var want = b.offsetLeft - (strip.clientWidth - b.offsetWidth) / 2;
              strip.scrollTo({ left: Math.max(0, want), behavior: reducedMotion() ? "auto" : "smooth" });
            }
          }
        }
      });
    });
  }

  function closeBubble() {
    var b = $(".bbubble");
    if (b && b.parentNode) b.parentNode.removeChild(b);
    $all(".badge[aria-expanded=true]").forEach(function (x) { x.setAttribute("aria-expanded", "false"); });
    document.removeEventListener("click", bubbleAway, true);
  }
  function bubbleAway(e) {
    if (e.target.closest && (e.target.closest(".bbubble") || e.target.closest(".badge"))) return;
    closeBubble();
  }
  function openBubble(btn, wrap) {
    var b = document.createElement("div");
    b.className = "bbubble";
    b.setAttribute("role", "note");
    b.textContent = btn.getAttribute("data-why") || "";
    wrap.appendChild(b);
    btn.setAttribute("aria-expanded", "true");
    // Under the chip, its arrow on the chip's middle, and never past the row's
    // own edges.
    var wr = wrap.getBoundingClientRect(), br = btn.getBoundingClientRect();
    var mid = br.left + br.width / 2 - wr.left;
    var w = Math.min(b.offsetWidth, wr.width);
    var left = Math.max(0, Math.min(wr.width - w, mid - w / 2));
    b.style.left = left + "px";
    b.style.top = (br.bottom - wr.top + 8) + "px";
    b.style.setProperty("--arrow", Math.max(12, Math.min(w - 12, mid - left)) + "px");
    setTimeout(function () { document.addEventListener("click", bubbleAway, true); }, 0);
  }

  // One badge chip: icon, name, and the count or standing behind it. The
  // bubble says what it is for and which gameweeks, months or seasons earned
  // it. A form badge is outlined rather than filled and reads in the present
  // tense, because it is where the manager stands today and can go away.
  function badgeHtml(b) {
    var what = b.tag || ("\u00d7" + b.count);
    var when = b.gws && b.gws.length
      ? " \u00b7 " + b.gws.map(function (g) {
          return typeof g === "number" ? "GW" + g : g;
        }).join(", ")
      : "";
    var why = (b.form ? "Right now: " : "") + b.why + when;
    return '<button type="button" class="badge' + (b.form ? " form" : "") + (b.blot ? " blot" : "") +
      '" aria-expanded="false" data-why="' + esc(why) + '">' +
      sicon(b.icon) + esc(b.label) + '<b>' + esc(what) + '</b></button>';
  }
  // The same badges as one line of text, for a table cell.
  function badgeText(ds, id) {
    var B = K.badges(ds, id);
    return B.length ? B.map(function (b) {
      return b.label + (b.tag ? " " + b.tag : "");
    }).join(", ") : "none";
  }

  /* ====================================================================== */
  /* STATS & HIGHLIGHTS                                                     */
  /* ====================================================================== */
  // Squad values arrive in tenths of a million.
  function mval(tenths) { return "£" + (Math.round(tenths) / 10).toFixed(1) + "m"; }

  // A headline card: big number, caption, and who it belongs to.
  // A card that carries a series key opens that figure across every gameweek;
  // the manager it names is reachable from there. Otherwise a card that names
  // a manager opens his profile.
  function hcard(label, big, who, id, sub, icon, series) {
    return '<div class="hcard' + (series ? ' trend' : '') + '"' +
      (series ? ' data-trend="' + series + '" role="button" tabindex="0"'
              : (id ? ' data-entry="' + id + '" role="button" tabindex="0"' : '')) + '>' +
      '<div class="hl">' + sicon(icon) + '<span>' + esc(label) + '</span></div>' +
      '<div class="hv">' + esc(big) + '</div>' +
      (who ? '<div class="hw">' + esc(who) + '</div>' : '') +
      (sub ? '<div class="hs">' + esc(sub) + '</div>' : '') + '</div>';
  }
  // A ranked mini-list of players or managers.
  function hlist(title, items, fmt, note) {
    if (!items || !items.length) return "";
    return '<div class="hlist"><div class="lab-sm">' + esc(title) + '</div>' +
      items.map(function (x, i) {
        var f = fmt(x);
        return '<div class="hrow' + (isMe(f.id) ? ' me' : '') + '"' + (f.id ? ' data-entry="' + f.id + '"' : '') + '>' +
          '<span class="hi">' + (i + 1) + '</span>' +
          '<span class="hn">' + esc(f.name) + (f.tag ? ' <span class="htag">' + esc(f.tag) + '</span>' : '') + '</span>' +
          '<span class="hp">' + esc(f.val) + '</span></div>';
      }).join("") +
      (note ? '<div class="note" style="margin-top:6px">' + esc(note) + '</div>' : '') + '</div>';
  }

  /* ---- the gameweek as a picture ------------------------------------------
     One image of the league's gameweek, drawn to look like the app so it can
     go straight into the group chat: the template XI on the pitch, who was
     captained, who the differentials were, what moved, and the week's
     headlines. Drawn on a canvas rather than photographed from the page,
     because a screenshot of a phone is a screenshot of a phone — this is the
     same picture on every device, and the faces, crests and logo are our own
     files so the canvas stays clean enough to save.                         */
  var SHARE_W = 540;   // drawn at 2x: 1080 wide, as tall as the picture needs

  // The theme's own colours, read from the page so the picture follows the
  // theme the phone is showing rather than a copy of it kept here.
  function shareTheme() {
    var cs = getComputedStyle(document.documentElement);
    var v = function (k, fb) { var x = cs.getPropertyValue(k); x = x && x.trim(); return x || fb; };
    var dark = cs.getPropertyValue("color-scheme").trim() === "dark";
    return {
      dark: dark,
      ink: v("--ink", "#191922"), soft: v("--ink-soft", "#54545f"), faint: v("--ink-faint", "#5f5f6d"),
      head: v("--head-ink", "#37003c"), accent: v("--accent", "#d0004f"), gold: v("--gold", "#a9791a"),
      glass: dark ? "rgba(38,38,52,.62)" : "rgba(255,255,255,.62)",
      border: dark ? "rgba(255,255,255,.14)" : "rgba(255,255,255,.8)",
      line: v("--line", "rgba(20,20,45,.10)"), chip: v("--chip", "rgba(20,20,45,.05)"),
      font: v("--sans", "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif")
    };
  }

  function shareImg(src) {
    return new Promise(function (res) {
      var im = new Image();
      var done = false, fin = function (ok) { if (done) return; done = true; res(ok ? im : null); };
      im.onload = function () { fin(true); }; im.onerror = function () { fin(false); };
      setTimeout(function () { fin(false); }, 6000);
      im.src = src;
    });
  }

  // Everything the picture says, gathered first so drawing is one pass with
  // no choices left in it. Null when the gameweek has nothing to picture.
  // Two pictures, one per tab. "picks" is the gameweek before a ball is
  // kicked: what the league chose. "gw" is what those choices returned. Each
  // gathers everything first so drawing is one pass with no choices in it.
  // Null when the gameweek has nothing to picture; a string when there is a
  // reason to give instead.
  function shareModel(ds, gw, kind) {
    var H = K.highlights(ds, gw);
    if (!H || !H.squads) return null;
    var sq = H.squads, g = H.gwStats, n = sq.managers || 0;
    var pct = function (c) { return n ? Math.round((c / n) * 100) + "%" : ""; };
    var ev = ((ds.bootstrap || {}).events || []).filter(function (e) { return +e.id === +gw; })[0];
    var scored = !!(g && g.top && g.top.p > 0);
    var final = !!(ev && ev.finished && ev.data_checked);
    var status = final ? "Final" : (H.live ? (scored ? "Live" : "Deadline passed") : "");
    var base = { gw: gw, gwName: H.gwName, league: (ds.league && ds.league.name) || "Game On", n: n, status: status };
    var cols = [], tiles = [];

    if (kind === "picks") {
      // what the league chose, before anything scored
      if (sq.mostCaptained.length) {
        cols.push({ title: "Most captained", rows: sq.mostCaptained.map(function (x) {
          return { name: x.name, val: pct(x.caps) }; }) });
      }
      if (sq.movedIn && sq.movedIn.length) {
        cols.push({ title: "Brought in", rows: sq.movedIn.map(function (x) {
          return { name: x.name, val: num(x.count) }; }) });
      } else if (sq.mostOwned.length) {
        cols.push({ title: "Most owned", rows: sq.mostOwned.map(function (x) {
          return { name: x.name, val: x.ownedPct + "%" }; }) });
      }
      if (sq.movedOut && sq.movedOut.length) {
        cols.push({ title: "Moved out", rows: sq.movedOut.map(function (x) {
          return { name: x.name, val: num(x.count) }; }) });
      } else if (sq.ownershipLeaders.length) {
        cols.push({ title: "Effective ownership", note: "counts captaincy", rows: sq.ownershipLeaders.map(function (x) {
          return { name: x.name, val: x.eo + "%" }; }) });
      }
      var chipKeys = Object.keys(sq.chips || {});
      var chips = chipKeys.map(function (c) { return { name: CHIP_NAME[c] || c, n: sq.chips[c] }; })
        .sort(function (a, b) { return b.n - a.n; });
      tiles.push({ l: "Different captains", v: num(sq.distinctCaptains), w: "across the league" });
      if (g) {
        var dealt = g.count - g.noTransfer;
        tiles.push({ l: "Transfers", v: num(g.transfersTotal), w: dealt ? (num(dealt) + " managers moved") : "nobody moved" });
        tiles.push({ l: "Hits taken", v: g.hitTotal ? "−" + num(g.hitTotal) : "0", w: g.hitTotal ? "points paid" : "no hits taken" });
        tiles.push({ l: "Same squad", v: num(g.noTransfer), w: pct(g.noTransfer) + " of the league" });
      } else {
        if (sq.mostOwned[0]) tiles.push({ l: "Most owned", v: sq.mostOwned[0].ownedPct + "%", w: sq.mostOwned[0].name });
        if (sq.ownershipLeaders[0]) tiles.push({ l: "Highest EO", v: sq.ownershipLeaders[0].eo + "%", w: sq.ownershipLeaders[0].name });
        if (sq.mostVice[0]) tiles.push({ l: "Most vice-captained", v: num(sq.mostVice[0].vices), w: sq.mostVice[0].name });
      }
      base.file = "gameon-gw" + gw + "-picks.png";
      base.title = "Gameweek " + gw + " picks";
      base.sub = H.gwName + " picks · " + num(n) + " squads" + (status ? " · " + status : "");
      base.pitch = { title: "The template XI", metric: "eo", lines: sq.templateXi,
        note: "The most-owned player in each position, with how much of the league has him" };
      base.chips = chips;
      base.cols = cols.slice(0, 3); base.tiles = tiles.slice(0, 4);
      return base;
    }

    // the three pictures with no pitch: squad money, the season, the years before
    if (kind === "value") {
      var v = H.value;
      if (!v) return "Squad values appear after the next data refresh";
      var flat = v.richest.value === v.poorest.value;
      var vals = ds.managers.map(function (m) {
        var r = (ds.history[m.id] || {})[gw];
        return r && r.v > 0 ? { name: m.entryName, v: r.v, bk: r.bk || 0 } : null;
      }).filter(Boolean);
      var span = Math.max(1, v.richest.value - v.poorest.value);
      base.hero = { title: "Most valuable teams", rows: vals.slice().sort(function (a, b) { return b.v - a.v; }).slice(0, 8)
        .map(function (x) { return { name: x.name, sub: mval(x.bk) + " in the bank", val: mval(x.v), frac: flat ? 1 : (x.v - v.poorest.value) / span }; }),
        note: flat ? "Every squad is still at its starting value" : num(v.count) + " squads from " + mval(v.poorest.value) + " to " + mval(v.richest.value) };
      if (sq.bestValue.length) {
        cols.push({ title: "Best value", note: "points per £m this week", rows: sq.bestValue.map(function (x) {
          return { name: x.name, tag: mval(x.price), val: String(x.value) }; }) });
      }
      if (sq.priciest.length) {
        cols.push({ title: "Priciest owned", rows: sq.priciest.map(function (x) {
          return { name: x.name, val: mval(x.price) }; }) });
      }
      var banked = vals.filter(function (x) { return x.bk > 0; }).sort(function (a, b) { return b.bk - a.bk; }).slice(0, 5);
      if (banked.length) {
        cols.push({ title: "Most in the bank", rows: banked.map(function (x) { return { name: x.name, val: mval(x.bk) }; }) });
      }
      if (flat) {
        tiles.push({ l: "Squad value", v: mval(v.average), w: "identical across " + num(v.count) + " squads" });
        tiles.push({ l: "In the bank", v: mval(v.averageBank), w: "on average" });
      } else {
        tiles.push({ l: "Richest squad", v: mval(v.richest.value), w: v.richest.name });
        tiles.push({ l: "League average", v: mval(v.average), w: mval(v.averageBank) + " in the bank" });
        tiles.push({ l: "Leanest squad", v: mval(v.poorest.value), w: v.poorest.name });
        if (v.mostBanked && v.mostBanked.bank > 0) tiles.push({ l: "Most in the bank", v: mval(v.mostBanked.bank), w: v.mostBanked.name });
      }
      base.file = "gameon-gw" + gw + "-value.png";
      base.title = "Gameweek " + gw + " values";
      base.sub = H.gwName + " squad values · " + num(v.count) + " squads";
      base.cols = cols.slice(0, 3); base.tiles = tiles.slice(0, 4);
      return base;
    }

    if (kind === "season") {
      var se = H.season;
      if (!se) return "No gameweeks scored yet";
      var sp = K.pointsSpread(ds);
      if (sp && sp.buckets.length) {
        base.hero = { title: "Where everyone landed", plain: true, rows: sp.buckets.slice(0, 12).map(function (b) {
            return { name: num(b.from) + "–" + num(b.to), val: num(b.n), frac: sp.most ? b.n / sp.most : 0 }; }),
          note: num(sp.count) + " managers, " + num(sp.low) + " to " + num(sp.high) + " points · median " + num(sp.median) + " · bands of " + num(sp.width) };
      }
      var table = K.classic(ds);
      cols.push({ title: "Classic top five", note: "hits taken off", rows: table.slice(0, 5).map(function (r) {
        return { name: r.entryName, val: num(r.total) }; }) });
      var bests = [];
      ds.managers.forEach(function (m) {
        var hh = ds.history[m.id] || {};
        Object.keys(hh).forEach(function (g) {
          var r = hh[g]; if (!r || typeof r.p !== "number") return;
          var sc = K.gwScore(ds, m.id, +g);
          bests.push({ name: m.entryName, gw: +g, p: sc === null ? r.p : sc });
        });
      });
      bests.sort(function (a, b) { return b.p - a.p; });
      if (bests.length) {
        cols.push({ title: "Best gameweeks", rows: bests.slice(0, 5).map(function (x) {
          return { name: x.name, tag: "GW" + x.gw, val: num(x.p) }; }) });
      }
      var wAll = K.winningsAll(ds);
      var purse = ds.managers.map(function (m) {
        var w = wAll[+m.id] || { settled: 0, total: 0 };
        return { name: m.entryName, settled: w.settled, total: w.total };
      }).filter(function (x) { return x.total > 0; })
        .sort(function (a, b) { return (b.total - a.total) || (b.settled - a.settled); });
      if (purse.length) {
        cols.push({ title: "On course to win", note: "XP, nothing settled yet", rows: purse.slice(0, 5).map(function (x) {
          return { name: x.name, val: num(x.total) }; }) });
      }
      if (se.bestGw) tiles.push({ l: "Best gameweek", v: num(se.bestGw.p), w: se.bestGw.name + " · GW" + se.bestGw.gw });
      if (se.worstGw) tiles.push({ l: "Lowest gameweek", v: num(se.worstGw.p), w: se.worstGw.name + " · GW" + se.worstGw.gw });
      if (se.bestAvg) tiles.push({ l: "Best average", v: num(se.bestAvg.avg), w: se.bestAvg.name });
      if (se.steadiest) tiles.push({ l: "Most consistent", v: num(se.steadiest.spread), w: se.steadiest.name });
      if (se.biggestClimb && se.biggestClimb.climb > 0) tiles.push({ l: "Biggest riser", v: num(se.biggestClimb.climb), w: se.biggestClimb.name });
      if (se.mostHits && se.mostHits.hits > 0) tiles.push({ l: "Most hits", v: "−" + num(se.mostHits.hits), w: se.mostHits.name });
      if (se.mostBench && se.mostBench.bench > 0) tiles.push({ l: "Most benched", v: num(se.mostBench.bench), w: se.mostBench.name });
      if (se.mostTransfers && se.mostTransfers.transfers > 0) tiles.push({ l: "Most transfers", v: num(se.mostTransfers.transfers), w: se.mostTransfers.name });
      tiles.push({ l: "Never took a hit", v: num(se.cleanest), w: "managers" });
      base.file = "gameon-season.png";
      base.title = "Season so far";
      base.sub = "Season so far · " + num(se.gws) + " gameweek" + (se.gws === 1 ? "" : "s") + " · " + num(ds.managers.length) + " managers";
      base.cols = cols.slice(0, 3); base.tiles = tiles.slice(0, 8);
      return base;
    }

    if (kind === "fame") {
      var pa = H.past;
      if (!pa) return "Past-season history appears after the next data refresh";
      var mm = K.managerMap(ds), careers = [];
      // "2021/22" reads as "21/22" beside a name in a column this narrow
      var yr = function (sn) { return String(sn || "").replace(/^20(\d\d)\/(\d\d)$/, "$1/$2"); };
      Object.keys(ds.pastSeasons || {}).forEach(function (id) {
        var arr = ds.pastSeasons[id], m = mm[+id];
        if (!m || !arr || !arr.length) return;
        var sum = arr.reduce(function (s, x) { return s + (x.total || 0); }, 0);
        careers.push({ name: m.entryName, seasons: arr.length, career: sum });
      });
      careers.sort(function (a, b) { return b.career - a.career; });
      var top = careers[0] ? careers[0].career : 1;
      if (careers.length) {
        base.hero = { title: "Most career points", rows: careers.slice(0, 8).map(function (x) {
            return { name: x.name, sub: x.seasons + " season" + (x.seasons === 1 ? "" : "s"), val: num(x.career), frac: x.career / top }; }),
          note: "Every past season added up, " + num(pa.players) + " managers with a history" };
      }
      if (pa.topRanks.length) {
        cols.push({ title: "Best ever finish", note: "overall FPL rank", rows: pa.topRanks.map(function (x) {
          return { name: x.name, tag: yr(x.bestRank.season), val: num(x.bestRank.rank) }; }) });
      }
      if (pa.topScores.length) {
        cols.push({ title: "Highest season", rows: pa.topScores.map(function (x) {
          return { name: x.name, tag: yr(x.bestPts.season), val: num(x.bestPts.total) }; }) });
      }
      if (pa.veterans.length) {
        cols.push({ title: "Most seasons", rows: pa.veterans.map(function (x) {
          return { name: x.name, val: num(x.seasons) }; }) });
      }
      tiles.push({ l: "Top 10k finishes", v: num(pa.topTen), w: pa.topTen === 1 ? "manager has one" : "managers have one" });
      if (pa.topRanks[0]) tiles.push({ l: "Best ever finish", v: num(pa.topRanks[0].bestRank.rank), w: pa.topRanks[0].name });
      if (pa.topAvg[0]) tiles.push({ l: "Best avg season", v: num(pa.topAvg[0].avg), w: pa.topAvg[0].name });
      tiles.push({ l: "Played before", v: num(pa.players), w: "of " + num(ds.managers.length) + " managers" });
      base.file = "gameon-alltime.png";
      base.title = "All time";
      base.sub = "All time · " + num(pa.players) + " managers have played FPL before";
      base.cols = cols.slice(0, 3); base.tiles = tiles.slice(0, 4);
      return base;
    }

    // the gameweek's returns: nothing to say before anything has scored
    if (!scored) return "No scores yet for " + H.gwName + " — try the Picks picture";
    var tw = sq.teamOfWeek;
    if (sq.topScorers.length) {
      cols.push({ title: "Top scorers", note: "held in the league", rows: sq.topScorers.map(function (x) {
        return { name: x.name, val: num(x.pts) }; }) });
    }
    if (sq.mostCaptained.length) {
      cols.push({ title: "Captain returns", note: "share who captained him", rows: sq.mostCaptained.map(function (x) {
        return { name: x.name, tag: pct(x.caps), val: num(x.pts * 2) }; }) });
    }
    if (sq.differentials.length) {
      cols.push({ title: "Differentials", note: "under 10% owned", rows: sq.differentials.map(function (x) {
        return { name: x.name, tag: x.ownedPct + "%", val: num(x.pts) }; }) });
    } else if (sq.bestValue.length) {
      cols.push({ title: "Best value", note: "points per £m", rows: sq.bestValue.map(function (x) {
        return { name: x.name, val: String(x.value) }; }) });
    }
    tiles.push({ l: "Top score", v: num(g.top.p), w: g.top.name });
    tiles.push({ l: "Lowest score", v: num(g.low.p), w: g.low.name });
    tiles.push({ l: "League average", v: num(g.average), w: g.fplAverage !== null ? ("FPL average " + num(g.fplAverage)) : (num(g.count) + " managers") });
    if (H.potw) tiles.push({ l: "Player of the week", v: num(H.potw.pts), w: H.potw.name });
    else if (g.mostBench && g.mostBench.bench > 0) tiles.push({ l: "Most benched", v: num(g.mostBench.bench), w: g.mostBench.name });
    base.file = "gameon-gw" + gw + ".png";
    base.title = "Gameweek " + gw;
    base.sub = H.gwName + " · " + num(g.count) + " managers" + (status ? " · " + status : "");
    base.pitch = tw ? { title: "Team of the week", metric: "pts", lines: tw.lines,
        note: "The best eleven anyone in the league held, a " + tw.shape + " worth " + num(tw.total) + " points" }
      : { title: "The template XI", metric: "pts", lines: sq.templateXi,
        note: "The most-owned player in each position, and what he scored" };
    base.cols = cols.slice(0, 3); base.tiles = tiles.slice(0, 4);
    return base;
  }

  // Draws the picture. Resolves with the canvas.
  function shareDraw(ds, gw, kind) {
    var poster = kind === "lms";
    var M = poster ? shareLmsModel(ds, gw) : shareModel(ds, gw, kind);
    if (!M) return Promise.reject(new Error("nothing to draw"));
    if (typeof M === "string") return Promise.reject(new Error(M));
    var T = shareTheme();
    var players = [];
    ((M.pitch && M.pitch.lines) || []).forEach(function (ln) { ln.players.forEach(function (p) { players.push(p); }); });
    var loads = [shareImg("logo-tile.webp")].concat(players.map(function (p) {
      var code = faceCode(p.el);
      return (!code || faceHidden(code)) ? Promise.resolve(null) : shareImg("photos/p" + code + ".webp");
    }));
    return Promise.all(loads).then(function (imgs) {
      var logo = imgs[0], faces = {};
      players.forEach(function (p, i) { faces[p.el] = imgs[i + 1]; });
      var cv = document.createElement("canvas");
      cv.width = SHARE_W * 2; cv.height = (poster ? shareLmsHeight(M) : shareHeight(M)) * 2;
      var c = cv.getContext("2d");
      c.scale(2, 2);
      if (poster) shareLmsPaint(c, M, T, logo); else sharePaint(c, M, T, logo, faces);
      cv.shareModel = M;
      return cv;
    });
  }

  // How tall the picture is: the sections it has, stacked. A picture with a
  // pitch keeps the phone's own 9:16; the others are as tall as they need.
  function shareHeight(M) {
    var y = 116;
    if (M.pitch) y += (M.chips ? 384 : 410) + 62 + 12;
    if (M.hero) y += 62 + M.hero.rows.length * 30 + 10 + 12;
    if (M.cols && M.cols.length) y += (M.chips ? 214 : 226) + (M.chips ? 10 : 12);
    if (M.chips) y += 46 + 10;
    var th = M.chips ? 80 : 84, rows = Math.ceil((M.tiles || []).length / 4);
    y += rows * th + Math.max(0, rows - 1) * 10;
    y += 26;
    return M.pitch ? Math.max(960, y) : y;
  }

  // The drawing tools every picture shares: fonts, rounded boxes, text that
  // fits or shrinks, and the glass card.
  function shareTools(c, T) {
    var F = function (w, s) { return w + " " + s + "px " + T.font; };
    var rr = function (x, y, w, h, r) {
      c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
      c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
    };
    var fit = function (s, max) {
      s = String(s == null ? "" : s);
      if (c.measureText(s).width <= max) return s;
      while (s.length > 1 && c.measureText(s + "…").width > max) s = s.slice(0, -1);
      return s + "…";
    };
    // A name that will not fit at full size tries smaller before it is cut.
    var shrink = function (s, max, w, sizes) {
      for (var i = 0; i < sizes.length; i++) {
        c.font = F(w, sizes[i]);
        if (c.measureText(s).width <= max) return { s: s, px: sizes[i], w: c.measureText(s).width };
      }
      c.font = F(w, sizes[sizes.length - 1]);
      var t = fit(s, max);
      return { s: t, px: sizes[sizes.length - 1], w: c.measureText(t).width };
    };
    var text = function (s, x, y, font, col, align, max) {
      c.font = font; c.fillStyle = col; c.textAlign = align || "left"; c.textBaseline = "alphabetic";
      c.fillText(max ? fit(s, max) : s, x, y);
    };
    var card = function (x, y, w, h) {
      c.save(); c.shadowColor = T.dark ? "rgba(0,0,0,.45)" : "rgba(30,30,70,.16)"; c.shadowBlur = 18; c.shadowOffsetY = 8;
      rr(x, y, w, h, 18); c.fillStyle = T.glass; c.fill(); c.restore();
      rr(x + .5, y + .5, w - 1, h - 1, 17.5); c.strokeStyle = T.border; c.lineWidth = 1; c.stroke();
    };
    return { F: F, rr: rr, fit: fit, shrink: shrink, text: text, card: card };
  }

  // The frame every picture sits in: the theme's wallpaper, blobs and all,
  // and the app's own bar with its logo and the picture's title.
  function shareFrame(c, W, H, T, logo, league, sub) {
    var U = shareTools(c, T), PAD = 16;
    var base = c.createLinearGradient(0, 0, 0, H);
    if (T.dark) { base.addColorStop(0, "#16011c"); base.addColorStop(1, "#0b0010"); }
    else { base.addColorStop(0, "#f8f5fc"); base.addColorStop(1, "#edeaf5"); }
    c.fillStyle = base; c.fillRect(0, 0, W, H);
    var blob = function (x, y, r, col) {
      var g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, col); g.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = g; c.fillRect(0, 0, W, H);
    };
    if (T.dark) { blob(40, -40, 420, "rgba(69,9,81,.5)"); blob(W + 20, 20, 470, "rgba(18,49,63,.5)"); blob(W / 2, H + 60, 380, "rgba(58,10,61,.5)"); }
    else { blob(30, -40, 400, "#f6d8ff"); blob(W + 10, 20, 450, "#ffd7e6"); blob(W / 2, H + 60, 360, "#d2f8ff"); }

    var bar = c.createLinearGradient(0, 0, W, 0);
    bar.addColorStop(0, "#37003c"); bar.addColorStop(.55, "#4a0050"); bar.addColorStop(1, "#6a0a5c");
    c.fillStyle = bar; c.fillRect(0, 0, W, 96);
    var rule = c.createLinearGradient(0, 0, W, 0);
    rule.addColorStop(0, "#e90052"); rule.addColorStop(.5, "#04f5ff"); rule.addColorStop(1, "#00ff87");
    c.fillStyle = rule; c.fillRect(0, 96, W, 3);
    if (logo) { c.save(); U.rr(PAD, 22, 52, 52, 12); c.clip(); c.drawImage(logo, PAD, 22, 52, 52); c.restore(); }
    U.text(league, 84, 44, U.F(800, 21), "#fff", "left", W - 84 - PAD);
    U.text(sub, 84, 70, U.F(600, 14), "rgba(255,255,255,.78)", "left", W - 84 - PAD);
  }

  // The stamp every picture ends on.
  function shareStamp(c, W, H, T) {
    var U = shareTools(c, T);
    var when = new Date().toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    U.text("Game On V12 · " + when, W / 2, H - 9, U.F(600, 11), T.faint, "center");
  }

  /* ---- the eliminations poster ------------------------------------------
     Who went out of Last Manager Standing in a gameweek, as a poster: the
     headline, the count of the field, a card per manager with his club and
     score, and how many are left. Only a checked gameweek has eliminations
     to picture; a live one has a drop zone, which is not the same claim. */
  var DIV_COLOUR = { elite: "#d69a00", championship: "#7c3aed", challenger: "#22a559", conference: "#2f7fe0" };
  function shareLmsModel(ds, gw) {
    var lms = K.lms(ds);
    var week = lms.perGw.filter(function (w) { return +w.gw === +gw; })[0];
    if (!week) return "No eliminations yet: the gameweek is decided when FPL finalises it";
    var outs = week.table.filter(function (r) { return r.eliminated; });
    if (!outs.length) return "No eliminations in this gameweek";
    var row = lms.grid.filter(function (g) { return +g.gw === +gw; })[0] || {};
    // the division each man was playing in when he went out
    var div = {}, divName = {};
    K.pyramid(ds).seasons.forEach(function (se) {
      if (se.gws.indexOf(+gw) === -1) return;
      se.divisions.forEach(function (dv) { dv.rows.forEach(function (r) { div[r.id] = dv.key; divName[r.id] = dv.name; }); });
    });
    var started = ds.managers.length;
    return {
      kind: "lms", gw: +gw, league: (ds.league && ds.league.name) || "Game On",
      file: "gameon-gw" + gw + "-eliminated.png", title: "Gameweek " + gw + " eliminations",
      sub: "Last Manager Standing \u00b7 GW" + gw + " \u00b7 Final",
      started: started, outSoFar: started - (row.eog != null ? row.eog : started), left: row.eog != null ? row.eog : started,
      carry: week.unresolved ? week.unresolved.places : 0,
      rows: outs.map(function (r) {
        return { id: r.id, name: r.player || r.name, team: r.name, score: r.score,
                 div: div[r.id] || null, divName: divName[r.id] || "" };
      })
    };
  }
  // The poster's shape follows the league's own: the stadium at night, the
  // headline on a brush stroke, four cards across. Two rows of cards for
  // the usual eight; more if a carried tie makes a bigger week.
  var POSTER = { top: 92, head: 126, stats: 84, banner: 44, card: 196, gap: 8, hunt: 112, strip: 76, foot: 40 };
  function shareLmsHeight(M) {
    var rows = Math.ceil(M.rows.length / 4), P = POSTER;
    return P.top + P.head + P.stats + 14 + P.banner + 12 + rows * P.card + Math.max(0, rows - 1) * P.gap + 18 + P.hunt + P.strip + P.foot;
  }
  function shareLmsPaint(c, M, T, logo) {
    var W = SHARE_W, H = shareLmsHeight(M), PAD = 16, cw = W - PAD * 2, P = POSTER;
    // The poster is always the night version, whatever the app is set to:
    // it is the league's colours on the app's palette, not a page.
    var K2 = { pink: "#e90052", pink2: "#ff2d6f", ink: "#ffffff", soft: "#c9c2d6", faint: "#8f87a0",
               card: "rgba(20,8,28,.82)", line: "rgba(255,255,255,.14)", font: T.font };
    var U = shareTools(c, { font: T.font, dark: true, glass: K2.card, border: K2.line });
    var F = U.F, rr = U.rr, text = U.text, shrink = U.shrink;
    var FI = function (w, s) { return "italic " + w + " " + s + "px " + T.font; };
    // a seeded scatter, so the same week draws the same poster
    var seed = 7919 + M.gw * 31;
    var rnd = function () { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

    /* the stadium at night */
    var base = c.createLinearGradient(0, 0, 0, H);
    base.addColorStop(0, "#1a0424"); base.addColorStop(.35, "#0e0214"); base.addColorStop(1, "#06000a");
    c.fillStyle = base; c.fillRect(0, 0, W, H);
    var glow = function (x, y, r, col) {
      var g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, col); g.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = g; c.fillRect(0, 0, W, H);
    };
    glow(40, 20, 260, "rgba(255,240,255,.22)"); glow(W - 40, 20, 260, "rgba(255,240,255,.22)");
    glow(W / 2, H - 40, 320, "rgba(233,0,82,.22)"); glow(W / 2, H * .55, 420, "rgba(90,10,120,.18)");
    // floodlight beams
    c.save(); c.globalAlpha = .07; c.fillStyle = "#ffffff";
    [[20, 0, 250, H * .5, 120, H * .5], [W - 20, 0, W - 250, H * .5, W - 120, H * .5]].forEach(function (b) {
      c.beginPath(); c.moveTo(b[0], b[1]); c.lineTo(b[2], b[3]); c.lineTo(b[4], b[5]); c.closePath(); c.fill();
    });
    c.restore();
    // the crowd: a scatter of faint points over the stands
    c.save();
    for (var d = 0; d < 1400; d++) {
      var dx = rnd() * W, dy = rnd() * H * .42;
      c.globalAlpha = .05 + rnd() * .16; c.fillStyle = rnd() < .8 ? "#ffffff" : K2.pink;
      c.fillRect(dx, dy, 1.4, 1.4);
    }
    c.restore();
    // a few sparks over the pitch end
    c.save();
    for (var d2 = 0; d2 < 60; d2++) {
      c.globalAlpha = .25 + rnd() * .5; c.fillStyle = rnd() < .5 ? K2.pink2 : "#ffd0a0";
      c.beginPath(); c.arc(rnd() * W, H - rnd() * 200, .8 + rnd() * 1.2, 0, Math.PI * 2); c.fill();
    }
    c.restore();

    /* a brush stroke: a slab with rough edges, tilted a little */
    var brush = function (x, y, w, h, col, tilt) {
      c.save(); c.translate(x + w / 2, y + h / 2); c.rotate(tilt || 0);
      c.beginPath();
      var steps = 18, i;
      for (i = 0; i <= steps; i++) c.lineTo(-w / 2 + (w * i) / steps, -h / 2 + (rnd() - .5) * h * .18);
      for (i = steps; i >= 0; i--) c.lineTo(-w / 2 + (w * i) / steps, h / 2 + (rnd() - .5) * h * .18);
      c.closePath(); c.fillStyle = col; c.fill(); c.restore();
    };
    var shadowText = function (s, x, y, font, col, align, shadow) {
      c.save(); c.shadowColor = shadow || "rgba(0,0,0,.6)"; c.shadowBlur = 10; c.shadowOffsetY = 3;
      text(s, x, y, font, col, align); c.restore();
    };

    /* the crest and the corner lines */
    if (logo) { c.save(); rr(W / 2 - 30, 14, 60, 60, 14); c.clip(); c.drawImage(logo, W / 2 - 30, 14, 60, 60); c.restore(); }
    var tag = function (x, y, a, b, tilt, align) {
      c.save(); c.translate(x, y); c.rotate(tilt);
      text(a, 0, 0, FI(800, 13), K2.ink, align); text(b, 0, 17, FI(900, 14), K2.pink2, align);
      c.restore();
    };
    tag(PAD + 6, 40, "SAME MANAGERS.", "BIGGER BATTLES.", -0.1, "left");
    tag(W - PAD - 6, 40, "SURVIVE. ADAPT.", "CONQUER.", 0.1, "right");
    var y = P.top;

    /* the headline */
    c.font = FI(900, 44);
    var gwLbl = "GW" + M.gw, elim = "ELIMINATION";
    var gwW = c.measureText(gwLbl).width, elW = c.measureText(elim).width;
    var totalW = gwW + 18 + elW, scale = Math.min(1, cw / totalW), fs = Math.floor(44 * scale);
    c.font = FI(900, fs); gwW = c.measureText(gwLbl).width; elW = c.measureText(elim).width;
    var hx = W / 2 - (gwW + 18 + elW) / 2;
    brush(hx - 10, y + 6, gwW + 22, fs + 6, K2.pink, -0.04);
    shadowText(gwLbl, hx, y + 8 + fs * .82, FI(900, fs), K2.ink, "left", "rgba(0,0,0,.5)");
    shadowText(elim, hx + gwW + 18, y + 8 + fs * .82, FI(900, fs), K2.ink, "left", "rgba(233,0,82,.55)");
    var n = M.rows.length;
    c.font = FI(900, 21);
    var s1 = "THE ", s2 = "BOTTOM " + num(n), s3 = (n === 1 ? " IS OUT!" : " ARE OUT!");
    var w1 = c.measureText(s1).width, w2 = c.measureText(s2).width, w3 = c.measureText(s3).width;
    var sx = W / 2 - (w1 + w2 + w3) / 2, sy = y + fs + 44;
    shadowText(s1, sx, sy, FI(900, 21), K2.ink, "left"); shadowText(s2, sx + w1, sy, FI(900, 21), K2.pink2, "left");
    shadowText(s3, sx + w1 + w2, sy, FI(900, 21), K2.ink, "left");
    y += P.head;

    /* the field: started, out, still in */
    rr(PAD, y, cw, P.stats, 12); c.fillStyle = K2.card; c.fill();
    rr(PAD + .5, y + .5, cw - 1, P.stats - 1, 11.5); c.strokeStyle = "rgba(233,0,82,.7)"; c.lineWidth = 1.5; c.stroke();
    var icon = function (kind, x, cy) {
      c.save(); c.strokeStyle = K2.soft; c.fillStyle = K2.soft; c.lineWidth = 2.2; c.lineCap = "round"; c.lineJoin = "round";
      if (kind === "people") {
        [[-9, 3], [9, 3], [0, -1]].forEach(function (o, i) {
          var r = i === 2 ? 6 : 4.5, ox = x + o[0], oy = cy + o[1] - 6;
          c.beginPath(); c.arc(ox, oy, r, 0, Math.PI * 2); c.fill();
          c.beginPath(); c.arc(ox, oy + r + 8, r + 3, Math.PI, 0); c.fill();
        });
      } else if (kind === "x") {
        c.strokeStyle = K2.pink2; c.lineWidth = 4;
        c.beginPath(); c.moveTo(x - 9, cy - 9); c.lineTo(x + 9, cy + 9); c.moveTo(x + 9, cy - 9); c.lineTo(x - 9, cy + 9); c.stroke();
      } else if (kind === "shield") {
        c.beginPath(); c.moveTo(x, cy - 12); c.lineTo(x + 11, cy - 8); c.lineTo(x + 10, cy + 3);
        c.quadraticCurveTo(x + 7, cy + 11, x, cy + 14); c.quadraticCurveTo(x - 7, cy + 11, x - 10, cy + 3);
        c.lineTo(x - 11, cy - 8); c.closePath(); c.stroke();
        c.beginPath(); c.moveTo(x - 4, cy); c.lineTo(x - 1, cy + 3); c.lineTo(x + 5, cy - 4); c.stroke();
      } else if (kind === "target") {
        c.beginPath(); c.arc(x, cy, 9, 0, Math.PI * 2); c.stroke();
        c.beginPath(); c.arc(x, cy, 4, 0, Math.PI * 2); c.stroke();
        c.beginPath(); c.moveTo(x, cy - 12); c.lineTo(x, cy - 7); c.moveTo(x + 7, cy); c.lineTo(x + 12, cy); c.stroke();
      } else if (kind === "arrow") {
        c.beginPath(); c.moveTo(x - 10, cy + 8); c.lineTo(x - 2, cy); c.lineTo(x + 2, cy + 4); c.lineTo(x + 10, cy - 7); c.stroke();
        c.beginPath(); c.moveTo(x + 4, cy - 8); c.lineTo(x + 10, cy - 7); c.lineTo(x + 9, cy - 1); c.stroke();
      } else if (kind === "trophy") {
        c.beginPath(); c.moveTo(x - 8, cy - 11); c.lineTo(x + 8, cy - 11); c.lineTo(x + 6, cy);
        c.quadraticCurveTo(x, cy + 7, x - 6, cy); c.closePath(); c.stroke();
        c.beginPath(); c.moveTo(x - 8, cy - 8); c.quadraticCurveTo(x - 14, cy - 8, x - 10, cy - 1);
        c.moveTo(x + 8, cy - 8); c.quadraticCurveTo(x + 14, cy - 8, x + 10, cy - 1); c.stroke();
        c.beginPath(); c.moveTo(x, cy + 6); c.lineTo(x, cy + 11); c.moveTo(x - 6, cy + 12); c.lineTo(x + 6, cy + 12); c.stroke();
      }
      c.restore();
    };
    var stats = [["people", M.started, "MANAGERS", "STARTED"], ["x", M.outSoFar, "OUT AFTER", "GW" + M.gw], ["shield", M.left, "STILL IN", "THE HUNT"]];
    var sw = cw / 3;
    stats.forEach(function (st, i) {
      var x0 = PAD + sw * i, cx = x0 + sw / 2, cy = y + P.stats / 2;
      icon(st[0], x0 + 26, cy);
      text(num(st[1]), x0 + 46, cy + 6, F(900, 27), i === 1 ? K2.pink2 : K2.ink, "left");
      c.font = F(900, 27); var nw = c.measureText(num(st[1])).width;
      text(st[2], x0 + 52 + nw, cy - 4, F(700, 8), K2.soft, "left", sw - 60 - nw);
      text(st[3], x0 + 52 + nw, cy + 8, F(700, 8), K2.soft, "left", sw - 60 - nw);
      if (i) { c.fillStyle = K2.line; c.fillRect(x0, y + 18, 1, P.stats - 36); }
    });
    y += P.stats + 14;

    /* the banner */
    c.save(); c.beginPath();
    c.moveTo(PAD + 40, y); c.lineTo(W - PAD - 40, y); c.lineTo(W - PAD - 52, y + P.banner - 8); c.lineTo(PAD + 52, y + P.banner - 8); c.closePath();
    c.fillStyle = K2.pink; c.fill(); c.restore();
    shadowText("THE ELIMINATED " + num(n), W / 2, y + P.banner - 16, FI(900, 19), K2.ink, "center");
    y += P.banner + 12;

    /* one card each, worst first */
    var cols = 4, colw = (cw - P.gap * (cols - 1)) / cols, ch = P.card;
    M.rows.forEach(function (r, i) {
      var x = PAD + (i % cols) * (colw + P.gap), cy = y + Math.floor(i / cols) * (ch + P.gap), mx = x + colw / 2;
      rr(x, cy, colw, ch, 10); c.fillStyle = K2.card; c.fill();
      rr(x + .5, cy + .5, colw - 1, ch - 1, 9.5); c.strokeStyle = "rgba(233,0,82,.75)"; c.lineWidth = 1.5; c.stroke();
      text(String(i + 1), x + 8, cy + 30, FI(900, 30), "rgba(255,255,255,.14)");
      // the silhouette
      c.save(); c.fillStyle = "#3b2f47";
      c.beginPath(); c.arc(mx, cy + 34, 15, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.moveTo(mx - 30, cy + 78); c.quadraticCurveTo(mx - 30, cy + 52, mx - 8, cy + 50);
      c.lineTo(mx + 8, cy + 50); c.quadraticCurveTo(mx + 30, cy + 52, mx + 30, cy + 78); c.closePath(); c.fill();
      c.restore();
      // the stamp
      c.save(); c.translate(mx, cy + 66); c.rotate(-0.1);
      rr(-44, -9, 88, 18, 3); c.fillStyle = K2.pink; c.fill();
      rr(-44 + 1.5, -9 + 1.5, 88 - 3, 18 - 3, 2); c.strokeStyle = "rgba(255,255,255,.75)"; c.lineWidth = 1; c.stroke();
      text("ELIMINATED", 0, 4, F(900, 9.5), K2.ink, "center");
      c.restore();
      var nf = shrink(r.name, colw - 12, 800, [12, 11, 10, 9]);
      text(nf.s, mx, cy + 100, F(800, nf.px), K2.ink, "center");
      var tf = shrink("(" + r.team + ")", colw - 12, 600, [9.5, 8.5, 7.5]);
      text(tf.s, mx, cy + 114, F(600, tf.px), K2.soft, "center");
      if (r.div) {
        var col = DIV_COLOUR[r.div] || K2.pink2, lbl = String(r.divName).toUpperCase();
        c.font = F(900, 9); var lw = c.measureText(lbl).width;
        var ix = mx - (lw + 16) / 2;
        c.save(); c.fillStyle = col;
        if (r.div === "elite") { c.beginPath(); for (var k = 0; k < 10; k++) { var ang = -Math.PI / 2 + k * Math.PI / 5, rad = k % 2 ? 2.6 : 6; c.lineTo(ix + 6 + Math.cos(ang) * rad, cy + 131 + Math.sin(ang) * rad); } c.closePath(); c.fill(); }
        else if (r.div === "championship") { c.beginPath(); c.moveTo(ix + 1, cy + 125); c.lineTo(ix + 11, cy + 125); c.lineTo(ix + 9, cy + 133); c.lineTo(ix + 3, cy + 133); c.closePath(); c.fill(); c.fillRect(ix + 3, cy + 135, 6, 2); }
        else if (r.div === "challenger") { c.beginPath(); c.moveTo(ix + 6, cy + 124); c.lineTo(ix + 12, cy + 127); c.lineTo(ix + 11, cy + 134); c.quadraticCurveTo(ix + 6, cy + 139, ix + 1, cy + 134); c.lineTo(ix, cy + 127); c.closePath(); c.fill(); }
        else { c.beginPath(); c.arc(ix + 3.5, cy + 128, 2.6, 0, Math.PI * 2); c.arc(ix + 9, cy + 128, 2.6, 0, Math.PI * 2); c.fill(); c.beginPath(); c.arc(ix + 6, cy + 137, 6, Math.PI, 0); c.fill(); }
        c.restore();
        text(lbl, ix + 16, cy + 134, F(900, 9), col, "left");
      }
      text("GW" + M.gw + " PTS", mx, cy + 156, F(700, 7.5), K2.soft, "center");
      rr(mx - 26, cy + 162, 52, 24, 5); c.fillStyle = "rgba(0,0,0,.5)"; c.fill();
      rr(mx - 25.5, cy + 162.5, 51, 23, 4.5); c.strokeStyle = "rgba(255,255,255,.7)"; c.lineWidth = 1; c.stroke();
      text(num(r.score), mx, cy + 179, F(900, 15), K2.ink, "center");
    });
    var rows = Math.ceil(n / cols);
    y += rows * ch + Math.max(0, rows - 1) * P.gap + 18;

    /* what is left */
    var hunt = num(M.left) + " STILL IN THE HUNT";
    var hf = shrink(hunt, cw - 24, 900, [34, 30, 26]);
    c.font = FI(900, hf.px); var hw = c.measureText(hunt).width;
    brush(W / 2 - hw / 2 - 12, y + 18, hw + 24, hf.px + 8, "rgba(233,0,82,.85)", -0.02);
    shadowText(hunt, W / 2, y + 22 + hf.px * .82, FI(900, hf.px), K2.ink, "center", "rgba(0,0,0,.6)");
    text(M.carry ? (num(M.carry) + (M.carry === 1 ? " place carries" : " places carry") + " to the next gameweek — a tie the rules could not break")
                 : "IT GOES ON…", W / 2, y + hf.px + 56, FI(800, 12), K2.soft, "center", cw - 24);
    y += P.hunt;

    /* the strip */
    c.fillStyle = K2.line; c.fillRect(PAD, y, cw, 1);
    var strip = [["target", "SAME PASSION"], ["arrow", "HIGHER STAKES"], ["people", "TOUGHER OPPONENTS"], ["trophy", "A GREATER CHAMPION"]];
    var qw = cw / 4;
    strip.forEach(function (it, i) {
      var x0 = PAD + qw * i, cy2 = y + 30;
      icon(it[0], x0 + 18, cy2);
      var lf = shrink(it[1], qw - 44, 800, [8.5, 7.5, 7]);
      text(lf.s, x0 + 34, cy2 + 3, F(800, lf.px), K2.ink, "left");
      if (i) { c.fillStyle = K2.line; c.fillRect(x0, y + 14, 1, 32); }
    });
    c.fillStyle = K2.line; c.fillRect(PAD, y + P.strip - 16, cw, 1);
    y += P.strip;
    c.save(); c.letterSpacing = "4px"; text("PLAY. PLAN. PERFORM. REPEAT.", W / 2, y + 6, F(700, 9.5), K2.soft, "center"); c.restore();
    var when = new Date().toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    text("Game On V12 · " + when, W / 2, H - 8, F(600, 9), K2.faint, "center");
  }

  function sharePaint(c, M, T, logo, faces) {
    var W = SHARE_W, H = shareHeight(M), PAD = 16;
    var U = shareTools(c, T), F = U.F, rr = U.rr, shrink = U.shrink, text = U.text, card = U.card;
    shareFrame(c, W, H, T, logo, M.league, M.sub);

    var y = 116, cw = W - PAD * 2;

    /* the pitch */
    if (M.pitch) {
      var ph = M.chips ? 384 : 410;
      card(PAD, y, cw, ph + 62);
      text(M.pitch.title, PAD + 16, y + 30, F(800, 17), T.head);
      text(M.pitch.note, PAD + 16, y + 48, F(500, 11.5), T.faint, "left", cw - 32);
      sharePitch(c, M.pitch.lines, M.pitch.metric, PAD + 12, y + 58, cw - 24, ph, T, logo, faces, rr, shrink, F);
      y += ph + 62 + 12;
    }

    /* the hero: a ranked list with a bar under each row */
    if (M.hero) {
      var hh = 62 + M.hero.rows.length * 30 + 10;
      card(PAD, y, cw, hh);
      text(M.hero.title, PAD + 16, y + 30, F(800, 17), T.head);
      text(M.hero.note || "", PAD + 16, y + 48, F(500, 11.5), T.faint, "left", cw - 32);
      var ig = c.createLinearGradient(PAD, 0, PAD + cw, 0);
      ig.addColorStop(0, T.accent); ig.addColorStop(1, T.dark ? "#c98bff" : "#6b1f7a");
      M.hero.rows.forEach(function (r, k) {
        var ry = y + 62 + k * 30, x0 = PAD + 16, x1 = PAD + cw - 16;
        if (M.hero.plain) x0 -= 26;
        else {
          rr(x0, ry + 2, 18, 18, 9); c.fillStyle = k === 0 ? T.accent : T.chip; c.fill();
          text(String(k + 1), x0 + 9, ry + 15, F(800, 10), k === 0 ? "#fff" : T.soft, "center");
        }
        c.font = F(800, 12.5);
        var vw = c.measureText(r.val).width;
        text(r.val, x1, ry + 15, F(800, 12.5), T.ink, "right");
        c.font = F(600, 10);
        var sw = r.sub ? c.measureText(r.sub).width + 6 : 0;
        var nf = shrink(r.name, x1 - vw - 10 - (x0 + 26) - sw, 700, [12.5, 11.5, 10.5]);
        text(nf.s, x0 + 26, ry + 15, F(700, nf.px), T.ink);
        if (r.sub) text(r.sub, x0 + 26 + nf.w + 6, ry + 15, F(600, 10), T.faint);
        var bw = x1 - (x0 + 26);
        rr(x0 + 26, ry + 21, bw, 5, 2.5); c.fillStyle = T.chip; c.fill();
        var fw = Math.max(5, Math.round(bw * Math.max(0, Math.min(1, r.frac || 0))));
        rr(x0 + 26, ry + 21, fw, 5, 2.5); c.fillStyle = ig; c.fill();
      });
      y += hh + 12;
    }

    /* the lists */
    if (M.cols && M.cols.length) {
      var lh = M.chips ? 214 : 226, rs = M.chips ? 31 : 33, gap = 10, colw = (cw - gap * (M.cols.length - 1)) / M.cols.length;
      M.cols.forEach(function (col, i) {
        var x = PAD + i * (colw + gap);
        card(x, y, colw, lh);
        text(col.title, x + 12, y + 24, F(800, 12.5), T.head, "left", colw - 24);
        if (col.note) text(col.note, x + 12, y + 38, F(500, 10), T.faint, "left", colw - 24);
        col.rows.slice(0, 5).forEach(function (r, k) {
          var ry = y + 60 + k * rs;
          c.font = F(800, 12.5);
          var vw = c.measureText(r.val).width;
          rr(x + 12, ry - 12, 18, 18, 9); c.fillStyle = k === 0 ? T.accent : T.chip; c.fill();
          text(String(k + 1), x + 21, ry + 1, F(800, 10), k === 0 ? "#fff" : T.soft, "center");
          text(r.val, x + colw - 12, ry + 1, F(800, 12.5), T.ink, "right");
          c.font = F(600, 10);
          var tagw = r.tag ? c.measureText(r.tag).width + 5 : 0;
          var nameMax = colw - 24 - 26 - vw - 8 - tagw;
          var nf = shrink(r.name, nameMax, 700, [12.5, 11.5, 10.5]);
          text(nf.s, x + 36, ry + 1, F(700, nf.px), T.ink);
          if (r.tag) text(r.tag, x + 36 + nf.w + 5, ry + 1, F(600, 10), T.faint);
        });
      });
      y += lh + (M.chips ? 10 : 12);
    }

    /* chips played, as a row of pills */
    if (M.chips) {
      card(PAD, y, cw, 46);
      text("Chips played", PAD + 14, y + 28, F(800, 12.5), T.head);
      var px = PAD + 14 + c.measureText("Chips played").width + 12;
      if (!M.chips.length) text("none this week", px, y + 28, F(600, 12), T.faint);
      M.chips.forEach(function (ch) {
        var lbl = ch.name + " × " + num(ch.n);
        c.font = F(700, 11.5);
        var pw = c.measureText(lbl).width + 20;
        if (px + pw > PAD + cw - 12) return;
        rr(px, y + 12, pw, 22, 11); c.fillStyle = T.dark ? "rgba(246,196,69,.16)" : "rgba(169,121,26,.14)"; c.fill();
        text(lbl, px + 10, y + 27, F(700, 11.5), T.gold);
        px += pw + 6;
      });
      y += 46 + 10;
    }

    /* the headline tiles, four to a row */
    var th = M.chips ? 80 : 84, k = th / 84;
    (M.tiles || []).forEach(function (t, i) {
      var per = Math.min(4, M.tiles.length - Math.floor(i / 4) * 4);
      var tw = (cw - 10 * (per - 1)) / per;
      var x = PAD + (i % 4) * (tw + 10), ty = y + Math.floor(i / 4) * (th + 10);
      card(x, ty, tw, th);
      var lf = shrink(t.l.toUpperCase(), tw - 20, 800, [9, 8.2]);
      text(lf.s, x + 10, ty + 22 * k, F(800, lf.px), T.faint);
      var vf = shrink(t.v, tw - 20, 800, [24, 20, 17]);
      text(vf.s, x + 10, ty + 52 * k, F(800, vf.px), T.accent);
      var wf = shrink(t.w, tw - 20, 600, [10.5, 9.5, 8.5]);
      text(wf.s, x + 10, ty + 70 * k, F(600, wf.px), T.soft);
    });

    shareStamp(c, W, H, T);
  }

  // The pitch as the app draws it: hoarding, goal, perspective turf and the
  // eleven in four lines, each card a shirt with the face over it, the name
  // on white and the ownership on purple.
  function sharePitch(c, xi, metric, x, y, w, h, T, logo, faces, rr, shrink, F) {
    c.save();
    rr(x, y, w, h, 12); c.clip();
    // turf, in the same per-mille geometry as turfSvg()
    var X = function (u) { return x + (u / 1000) * w; }, Y = function (v) { return y + (v / 1000) * h; };
    var T0 = 73, hw = function (v) { return 410 + 0.2267 * (v - T0); };
    var grass = c.createLinearGradient(0, y, 0, y + h);
    grass.addColorStop(0, "#1e9349"); grass.addColorStop(.55, "#27a957"); grass.addColorStop(.86, "#31b965"); grass.addColorStop(1, "#2fb862");
    c.fillStyle = grass; c.fillRect(x, y, w, h);
    var edges = [73, 150, 232, 325, 425, 530, 640, 760, 885, 1000];
    c.fillStyle = "rgba(0,0,0,.055)";
    for (var k = 0; k + 1 < edges.length; k += 2) c.fillRect(x, Y(edges[k]), w, Y(edges[k + 1]) - Y(edges[k]));
    c.strokeStyle = "rgba(255,255,255,.72)"; c.lineWidth = 1.6; c.lineJoin = "round";
    var trap = function (f, y1, y2) {
      c.beginPath(); c.moveTo(X(500 - hw(y1) * f), Y(y1)); c.lineTo(X(500 - hw(y2) * f), Y(y2));
      c.lineTo(X(500 + hw(y2) * f), Y(y2)); c.lineTo(X(500 + hw(y1) * f), Y(y1)); c.closePath(); c.stroke();
    };
    c.beginPath(); c.moveTo(X(500 - hw(T0)), Y(T0)); c.lineTo(X(500 - hw(1000)), Y(1000));
    c.moveTo(X(500 + hw(T0)), Y(T0)); c.lineTo(X(500 + hw(1000)), Y(1000));
    c.moveTo(X(500 - hw(T0)), Y(T0)); c.lineTo(X(500 + hw(T0)), Y(T0)); c.stroke();
    trap(0.66, T0, 158); trap(0.35, T0, 110);
    c.beginPath(); c.ellipse(X(500), Y(158), (128 / 1000) * w, (27 / 1000) * h, 0, 0, Math.PI); c.stroke();
    c.beginPath(); c.moveTo(X(500 - hw(603)), Y(603)); c.lineTo(X(500 + hw(603)), Y(603)); c.stroke();
    c.beginPath(); c.ellipse(X(500), Y(603), (198 / 1000) * w, (97 / 1000) * h, 0, 0, Math.PI * 2); c.stroke();
    // hoarding and goal
    var hx = x + w * .095, hy = y + h * .004, hwid = w * .81, hh = h * .056;
    var hg = c.createLinearGradient(hx, 0, hx + hwid, 0);
    hg.addColorStop(0, "#1e0037"); hg.addColorStop(.5, "#2a0648"); hg.addColorStop(1, "#1e0037");
    rr(hx, hy, hwid, hh, 7); c.fillStyle = hg; c.fill();
    if (logo) {
      var lw = hh - 4;
      c.save(); rr(hx + w * .025, hy + 2, lw, lw, 3); c.clip(); c.drawImage(logo, hx + w * .025, hy + 2, lw, lw); c.restore();
      c.save(); rr(hx + hwid - w * .025 - lw, hy + 2, lw, lw, 3); c.clip(); c.drawImage(logo, hx + hwid - w * .025 - lw, hy + 2, lw, lw); c.restore();
    }
    var gx = x + w * .413, gy = y + h * .022, gw = w * .174, gh = h * .051;
    c.fillStyle = "rgba(0,0,0,.3)"; c.fillRect(gx, gy, gw, gh);
    c.strokeStyle = "rgba(255,255,255,.55)"; c.lineWidth = .7; c.beginPath();
    for (var nx = gx + 5; nx < gx + gw; nx += 5) { c.moveTo(nx, gy); c.lineTo(nx, gy + gh); }
    for (var ny = gy + 4; ny < gy + gh; ny += 4) { c.moveTo(gx, ny); c.lineTo(gx + gw, ny); }
    c.stroke();
    c.strokeStyle = "#fff"; c.lineWidth = 2.5; c.beginPath(); c.moveTo(gx, gy + gh); c.lineTo(gx, gy); c.lineTo(gx + gw, gy); c.lineTo(gx + gw, gy + gh); c.stroke();

    // the eleven
    var rows = xi || [], rowH = (h - 34) / Math.max(1, rows.length);
    // the card is the app's, unless the rows are too close for it: then the
    // shirt slot gives ground and the name and figure bars keep their height
    var CW = 64, NH = 19, PH = 19, GAP = 10;
    var CH = Math.min(90, Math.floor(rowH) - 2), SH = CH - NH - PH;
    rows.forEach(function (ln, ri) {
      var ps = ln.players || [], n = ps.length;
      var total = n * CW + (n - 1) * GAP, sx = x + (w - total) / 2;
      var cy = y + 30 + ri * rowH + (rowH - CH) / 2;
      ps.forEach(function (p, i) {
        var px = sx + i * (CW + GAP);
        c.save(); c.shadowColor = "rgba(0,0,0,.28)"; c.shadowBlur = 6; c.shadowOffsetY = 2;
        rr(px, cy, CW, CH, 7); c.fillStyle = "rgba(6,60,32,.42)"; c.fill(); c.restore();
        c.save(); rr(px, cy, CW, CH, 7); c.clip();
        var im = faces[p.el];
        if (!im) shareJersey(c, p.team, p.type, px + CW / 2, cy + 6, 46, SH - 9);
        else {
          // object-fit cover at 50% 6%, into a 48 by 46 slot
          var fw = 48, fh = SH - 6, s = Math.max(fw / im.width, fh / im.height);
          var dw = im.width * s, dh = im.height * s;
          var fx = px + (CW - fw) / 2, fy = cy + 4;
          c.save(); c.beginPath(); c.rect(fx, fy, fw, fh); c.clip();
          c.drawImage(im, fx + (fw - dw) / 2, fy - (dh - fh) * .06, dw, dh); c.restore();
        }
        c.fillStyle = "#fff"; c.fillRect(px, cy + SH, CW, NH);
        var nf = shrink(p.name, CW - 6, 700, [11, 10, 9]);
        c.font = F(700, nf.px); c.fillStyle = "#2b0b34"; c.textAlign = "center"; c.textBaseline = "middle";
        c.fillText(nf.s, px + CW / 2, cy + SH + NH / 2 + .5);
        c.fillStyle = "#37003c"; c.fillRect(px, cy + SH + NH, CW, PH);
        c.font = F(800, 12); c.fillStyle = "#fff";
        c.fillText(metric === "pts" ? num(p.pts) : (p.eo + "%"), px + CW / 2, cy + SH + NH + PH / 2 + .5);
        c.restore();
      });
    });
    c.restore();
  }

  // The little shirt, the same path as jersey() scaled into a box.
  function shareJersey(c, team, type, cx, top, bw, bh) {
    var k = kitFor(team, type), body = k[0], sleeve = k[1], stripe = k[2];
    var sx = bw / 44, sy = bh / 42;
    c.save(); c.translate(cx - bw / 2, top); c.scale(sx, sy);
    var shirt = new Path2D("M16,3 L11,4.6 L3,11 L8.6,18.2 L12.6,14.6 L12.6,39 L31.4,39 L31.4,14.6 L35.4,18.2 L41,11 L33,4.6 L28,3 C26.4,6.6 17.6,6.6 16,3 Z");
    c.save(); c.shadowColor = "rgba(0,0,0,.35)"; c.shadowBlur = 3; c.shadowOffsetY = 2; c.fillStyle = body; c.fill(shirt); c.restore();
    if (stripe) {
      c.save(); c.clip(shirt); c.fillStyle = stripe;
      c.fillRect(14.2, 0, 3.4, 42); c.fillRect(20.3, 0, 3.4, 42); c.fillRect(26.4, 0, 3.4, 42); c.restore();
    }
    c.fillStyle = sleeve;
    c.fill(new Path2D("M11,4.6 L3,11 L8.6,18.2 L12.6,14.6 L12.6,5.6 Z"));
    c.fill(new Path2D("M33,4.6 L41,11 L35.4,18.2 L31.4,14.6 L31.4,5.6 Z"));
    c.strokeStyle = "rgba(0,0,0,.30)"; c.lineWidth = 1.1; c.stroke(shirt);
    c.restore();
  }

  // The button: draw, then show the picture in a sheet with Share and Save.
  // Sharing needs the tap it is answering, so the picture is made first and
  // the buttons in the sheet each answer a fresh tap of their own.
  var _shareUrl = null;
  function shareStats(ds, gw, kind, from) {
    var btn = from || $("#stShare");
    if (btn) btn.disabled = true;
    var M = null;
    shareDraw(ds, gw, kind).then(function (cv) {
      M = cv.shareModel;
      return new Promise(function (res, rej) {
        cv.toBlob(function (b) { b ? res(b) : rej(new Error("no image")); }, "image/png");
      });
    }).then(function (blob) {
      if (_shareUrl) { try { URL.revokeObjectURL(_shareUrl); } catch (e) {} }
      _shareUrl = URL.createObjectURL(blob);
      var name = M.file;
      var file = null;
      try { file = new File([blob], name, { type: "image/png" }); } catch (e) {}
      var canShare = !!(file && navigator.share && navigator.canShare && navigator.canShare({ files: [file] }));
      var body = modal(M.title, '<div class="shpic"><img src="' + _shareUrl + '" alt="' + esc(M.title) + '" width="540" height="960"></div>' +
        '<div class="btnrow shbtns">' +
        (canShare ? '<button type="button" class="btn primary" id="shShare">' + svg("upload", 16) + 'Share</button>' : '') +
        '<a class="btn' + (canShare ? '' : ' primary') + '" id="shSave" href="' + _shareUrl + '" download="' + name + '">' + svg("download", 16) + 'Save image</a>' +
        '</div><div class="note shnote">Or press and hold the picture to save it.</div>');
      var sh = $("#shShare", body);
      if (sh) sh.addEventListener("click", function () {
        navigator.share({ files: [file], title: M.title }).catch(function (e) {
          if (e && e.name === "AbortError") return;
          var a = $("#shSave", body); if (a) a.click();
        });
      });
      var sv = $("#shSave", body);
      if (sv) sv.addEventListener("click", function () { toast("Saved " + name); });
      track("/share", true);
    }).catch(function (e) {
      // a reason the model gave is said as it is; anything else is one line
      var why = e && e.message;
      toast(why && /^(No scores yet|No gameweeks|Squad values|Past-season|No eliminations)/.test(why) ? why : "Couldn’t make the picture");
    }).then(function () { if (btn) btn.disabled = false; });
  }

  var STAT_TABS = [
    { k: "gw",     label: "Gameweek returns",    gwPicker: true, share: "gw" },
    { k: "picks",  label: "Gameweek selections", gwPicker: true, share: "picks" },
    { k: "value",  label: "Squad values",        gwPicker: true, share: "value" },
    { k: "season", label: "Season",              share: "season" },
    { k: "fame",   label: "All time",            share: "fame" }
  ];

  function renderStats(host, ds) {
    if (!ds || !ds.managers || !ds.managers.length) {
      host.innerHTML = '<div class="callout">Standings not loaded yet.</div>';
      return;
    }
    var all = (ds.bootstrap && ds.bootstrap.events || []).filter(function (e) {
      return e.finished || e.is_current;
    }).map(function (e) { return e.id; });
    if (!all.length) all = K.squadGws(ds);
    if (!all.length) { host.innerHTML = '<div class="callout">No gameweeks played yet.</div>'; return; }
    if (!state.statsGw || all.indexOf(+state.statsGw) === -1) state.statsGw = all[all.length - 1];
    if (!STAT_TABS.some(function (t) { return t.k === state.statsTab; })) state.statsTab = "gw";

    // Each page is reached from the profile sheet and named in the bar, so
    // there is no row of tabs here. The pictures are the organisers' to make:
    // the button is theirs alone.
    var h = '<div class="pgwline" id="stGwLine" style="margin-bottom:4px">' +
      '<select class="in gwsel" id="stGwSel" aria-label="Gameweek">' + all.map(function (g) {
        return '<option value="' + g + '"' + (+g === +state.statsGw ? ' selected' : '') + '>Gameweek ' + g + '</option>';
      }).join("") + '</select>' +
      (isOrganiser() ? '<button type="button" class="btn sm" id="stShare" title="A picture of this gameweek to share">' +
        svg("download", 15) + 'Export image</button>' : '') + '</div>';
    h += '<div id="stBox"></div>';
    host.innerHTML = h;

    $("#stGwSel", host).addEventListener("change", function () { state.statsGw = +this.value; drawStats(ds); });
    var shareBtn = $("#stShare", host);
    if (shareBtn) shareBtn.addEventListener("click", function () {
      var t = STAT_TABS.filter(function (x) { return x.k === state.statsTab; })[0];
      shareStats(ds, state.statsGw, (t && t.share) || "gw");
    });
    drawStats(ds);
  }

  // Whether the signed-in manager runs the league: the config names them by
  // entry id.
  function isOrganiser() {
    var ids = S.config().organisers || [];
    return !!state.me && ids.some(function (id) { return +id === +state.me; });
  }

  function drawStats(ds) {
    var box = $("#stBox");
    if (!box) return;
    var tab = STAT_TABS.filter(function (t) { return t.k === state.statsTab; })[0] || STAT_TABS[0];
    var line = $("#stGwLine"), sel = $("#stGwSel"), sb = $("#stShare");
    if (line) line.style.display = (tab.gwPicker || (tab.share && sb)) ? "" : "none";
    if (sel) sel.style.display = tab.gwPicker ? "" : "none";
    if (sb) { sb.style.display = tab.share ? "" : "none"; sb.classList.toggle("alone", !tab.gwPicker); }

    var H = K.highlights(ds, state.statsGw);
    if (!H) { box.innerHTML = '<div class="callout">Nothing to show yet.</div>'; return; }
    var fn = { gw: statsGw, picks: statsPicks, value: statsValue, season: statsSeason, fame: statsFame }[tab.k];
    box.innerHTML = fn(H, ds) || '<div class="callout">Nothing to show yet.</div>';
    var lb = $("#stLmsShare", box);
    if (lb) lb.addEventListener("click", function () { shareStats(ds, state.statsGw, "lms", lb); });
    wireXi(box);
  }

  /* A side that is nobody's squad — the template XI, the team of the week —
     drawn the way a profile draws a squad: the three figures above it and the
     Points / Ownership / Value switch, with the cards changing under it. The
     figures are the eleven's own; there is no bench, bank or hit here. */
  var XI_BLOCKS = {};
  function xiBlock(key, lines, ctx) {
    XI_BLOCKS[key] = { lines: lines, ctx: ctx || {} };
    return '<div class="xiblock" data-xi="' + key + '">' + xiBlockInner(key) + '</div>';
  }
  function xiBlockInner(key) {
    var B = XI_BLOCKS[key];
    if (!B) return "";
    var metric = (state.xiMetric || {})[key] || B.ctx.metric || "pts";
    if (!METRICS[metric]) metric = "pts";
    var players = [];
    B.lines.forEach(function (l) { l.players.forEach(function (p) { players.push(p); }); });
    var n = players.length || 1, total = 0, eoSum = 0, val = 0, top = null, most = null, pricey = null;
    players.forEach(function (p) {
      total += p.pts || 0; eoSum += p.eo || 0; val += p.price || 0;
      if (!top || (p.pts || 0) > top.pts) top = p;
      if (!most || (p.eo || 0) > most.eo) most = p;
      if (!pricey || (p.price || 0) > pricey.price) pricey = p;
    });
    var stat = function (v, l, sub, main) {
      return '<div class="pstat' + (main ? ' main' : '') + '"><div class="v">' + esc(v) + '</div>' +
        (sub ? '<div class="sub">' + esc(sub) + '</div>' : '') + '<div class="l">' + l + '</div></div>';
    };
    var strip;
    if (metric === "eo") {
      strip = stat(B.ctx.leagueAvgOwned != null ? B.ctx.leagueAvgOwned + "%" : "\u2014", "League avg") +
        stat(Math.round((eoSum / n) * 10) / 10 + "%", "Average owned", null, true) +
        stat(most ? most.eo + "%" : "\u2014", "Most owned", most ? most.name : "");
    } else if (metric === "val") {
      strip = stat(mval(Math.round(val / n)), "Per player") +
        stat(mval(val), "XI value", null, true) +
        stat(pricey ? mval(pricey.price) : "\u2014", "Priciest", pricey ? pricey.name : "");
    } else {
      strip = stat(B.ctx.average != null ? num(B.ctx.average) : "\u2014", "League avg") +
        stat(num(total), "Total Pts", null, true) +
        stat(top ? num(top.pts) : "\u2014", "Top scorer", top ? top.name : "");
    }
    var h = '<div class="psegrow"><div class="pseg sm">' + Object.keys(METRICS).map(function (k) {
      return '<button type="button"' + (metric === k ? ' class="on"' : '') +
        ' data-metric="' + k + '">' + esc(METRICS[k]) + '</button>';
    }).join("") + '</div></div>';
    h += '<div class="pstats' + (metric === "val" ? ' money' : '') + '">' + strip + '</div>';
    if (metric === "eo") h += '<div class="note" style="margin:-6px 2px 8px">Ownership here is within Game On\u2019s 245 managers.</div>';
    h += '<div class="card pitchcard"><div class="bd">' + pitchHtml({ lines: B.lines, bench: [] }, metric) + '</div></div>';
    return h;
  }
  // The switch under either side, wired once on the stats box: the box is
  // redrawn on every tab and gameweek change, the listener is not.
  function wireXi(box) {
    if (box._xiWired) return;
    box._xiWired = true;
    box.addEventListener("click", function (e) {
      var b = e.target.closest(".xiblock .pseg button[data-metric]");
      if (!b) return;
      var blk = b.closest(".xiblock"), key = blk.getAttribute("data-xi");
      state.xiMetric = state.xiMetric || {};
      state.xiMetric[key] = b.getAttribute("data-metric");
      blk.innerHTML = xiBlockInner(key);
    });
  }

  /* ---- one tab each ----------------------------------------------------- */
  // One group per kind of question the gameweek answers, so a reader looking
  // for transfers is not sifting through scores to find them. A group with
  // nothing to say prints nothing at all — an early gameweek has no movement,
  // and most have no chips.
  function statGroup(title, cards) {
    var body = cards.filter(Boolean).join("");
    if (!body) return "";
    return '<div class="statgrp">' + esc(title) + '</div><div class="hgrid">' + body + '</div>';
  }

  function statsGw(H, ds) {
    var g = H.gwStats;
    if (!g) return '<div class="callout">No scores recorded for this gameweek yet.</div>';
    // The dropdown above already names the gameweek; repeating it here was
    // the same words twice, a line apart. Only "Live" earns the space.
    var h = H.live ? '<div class="statlead"><span class="pill live">Live</span></div>' : '';

    h += statGroup("Scores", [
      hcard("Top score", num(g.top.p), g.top.name, g.top.id, g.top.player, "trophy", "top"),
      hcard("Lowest score", num(g.low.p), g.low.name, g.low.id, g.low.player, "down", "low"),
      hcard("League average", num(g.average), g.count + " managers", null,
        g.median !== null ? ("median " + num(g.median)) : "", "chart", "average"),
      hcard("A good week was", num(g.topQuarter) + "+", "the top quarter", null,
        "bottom quarter: " + num(g.bottomQuarter) + " or less", "target", "topQuarter"),
      hcard("Beat the average", num(g.aboveAvg), "of " + g.count + " managers", null,
        num(g.range) + " between best and worst", "check", "aboveAvg"),
      g.fplAverage !== null
        ? hcard("Beat FPL's average", num(g.beatFpl), "of " + g.count + " managers", null,
            "the world scored " + num(g.fplAverage), "globe", "beatFpl")
        : ""
    ]);

    h += statGroup("Left on the bench", [
      (g.mostBench && g.mostBench.bench > 0)
        ? hcard("Most benched", num(g.mostBench.bench), g.mostBench.name, g.mostBench.id,
            "points benched", "bench", "mostBench")
        : "",
      hcard("Across the league", num(g.benchTotal), "points benched", null,
        num(g.benchAvg) + " each on average", "chart", "benchTotal")
    ]);

    h += statGroup("Movement", [
      g.biggestClimb
        ? hcard("Biggest climb", "+" + num(g.biggestClimb.move), g.biggestClimb.name,
            g.biggestClimb.id, num(g.climbers) + " managers moved up", "up", "climb")
        : "",
      g.biggestFall
        ? hcard("Biggest fall", "\u2212" + num(g.biggestFall.move), g.biggestFall.name,
            g.biggestFall.id, num(g.fallers) + " managers moved down", "down", "fall")
        : ""
    ]);

    h += statGroup("Player of the week", [
      H.potw
        ? hcard(H.potw.name, num(H.potw.pts), H.potw.team, null,
            (H.potw.ownedPct !== null && H.potw.ownedPct !== undefined)
              ? H.potw.ownedPct + "% of the league owned him" : "", "star", "potw")
        : ""
    ]);

    // What the choices returned: the captains and the differentials. The
    // choices themselves are on the Picks tab; this is what they came to.
    var sq = H.squads;
    if (sq) {
      h += statGroup("Captains and differentials", [
        sq.bestCaptain
          ? hcard("Best captain", num(sq.bestCaptain.pts * 2), sq.bestCaptain.name, null,
              sq.bestCaptain.caps + " of " + sq.managers + " captained", "captain", "bestCap")
          : "",
        sq.worstCaptain
          ? hcard("Captain to forget", num(sq.worstCaptain.pts * 2), sq.worstCaptain.name, null,
              sq.worstCaptain.caps + " captained", "circleDown", "worstCap")
          : "",
        sq.differentials.length
          ? hcard("Best differential", num(sq.differentials[0].pts), sq.differentials[0].name, null,
              sq.differentials[0].ownedPct + "% of the league", "gem", "bestDiff")
          : ""
      ]);
    }

    // The best eleven the league held, and how many of them were yours. It
    // is what the gameweek returned, so it sits with the returns, not the picks.
    if (sq && sq.teamOfWeek) {
      var tw = sq.teamOfWeek, mine = null, ds = S.dataset();
      var mySq = state.me && ds && ds.picks && ds.picks[H.gw] && ds.picks[H.gw][state.me];
      if (mySq && mySq.p) {
        var held = {};
        mySq.p.forEach(function (t) { held[+t[0]] = 1; });
        mine = tw.els.filter(function (el) { return held[+el]; }).length;
      }
      h += '<div class="section-title"><h2>Team of the week</h2><div class="rule"></div></div>';
      h += '<div class="note" style="margin:-4px 2px 10px">The highest-scoring legal eleven from players anyone in the league held, a ' +
        esc(tw.shape) + ' worth ' + num(tw.total) + ' points' +
        (mine !== null ? ' \u00b7 ' + mine + ' of them in your squad' : '') + '.</div>';
      h += xiBlock("totw", tw.lines, { metric: "pts", average: g.average, leagueAvgOwned: sq.leagueAvgOwned });
    }

    if (sq && (sq.topScorers.length || sq.differentials.length)) {
      h += '<div class="card"><div class="bd hcols">';
      h += hlist("Top scorers owned", sq.topScorers, function (x) {
        return { name: x.name, tag: x.team, val: num(x.pts) };
      });
      h += hlist("Differentials", sq.differentials, function (x) {
        return { name: x.name, tag: x.ownedPct + "%", val: num(x.pts) };
      }, "Owned by under 10% of the league.");
      h += '</div></div>';
    }

    h += bucketTable(g);
    h += statsLms(H, ds || S.dataset());
    return h;
  }

  // Who went out of Last Manager Standing this gameweek — the same rows the
  // LMS page shows, cut to the eliminated, worst first — with a poster of
  // them to share. While the gameweek is live it is the drop zone as it
  // stands, said as such, and there is no poster: nobody is out yet.
  function statsLms(H, ds) {
    if (!ds) return "";
    var lms = K.lms(ds);
    var week = lms.perGw.filter(function (w) { return +w.gw === +H.gw; })[0];
    var live = (lms.live && +lms.live.gw === +H.gw) ? lms.live : null;
    // Nothing is listed until FPL has finalised the gameweek: the drop zone
    // during a live afternoon is not a list of anyone who is out.
    if (!week && !live) return "";
    var rows = week ? week.table.filter(function (r) { return r.eliminated; }) : [];
    var note;
    if (week) {
      var row = lms.grid.filter(function (x) { return +x.gw === +H.gw; })[0];
      note = (rows.length ? num(rows.length) + ' eliminated after GW' + H.gw : 'Nobody was eliminated this gameweek') +
        (row ? ' \u00b7 ' + num(row.eog) + ' still in' : '');
      if (week.unresolved) note += ' \u00b7 ' + num(week.unresolved.places) +
        (week.unresolved.places === 1 ? ' place carries' : ' places carry') + ' to the next gameweek';
    } else {
      note = 'The eliminations are decided when FPL finalises the gameweek.';
    }
    // The poster is the organisers' to make.
    var poster = rows.length > 0 && isOrganiser();
    var h = '<div class="section-title"><h2>Last Manager Standing</h2><div class="rule"></div>' +
      (poster ? '<button type="button" class="btn sm" id="stLmsShare" title="A poster of this gameweek\u2019s eliminations">' +
                svg("download", 15) + 'Export image</button>'
              : (live ? '<span class="pill live">Live</span>' : '')) + '</div>';
    h += '<div class="note" style="margin:-4px 2px 10px">' + esc(note) + '</div>';
    if (rows.length) h += '<div class="card">' + lmsGwTable({ table: rows }, {}) + '</div>';
    return h;
  }

  // The whole league in bands of equal width, best first: where the gameweek
  // actually landed, rather than only how far apart its two ends were.
  function bucketTable(g) {
    if (!g.buckets || !g.buckets.length) return "";
    var myScore = null;
    if (state.me) {
      var ds = S.dataset();
      if (ds) myScore = K.gwScore(ds, state.me, g.gw);
    }
    var h = '<div class="section-title"><h2>Where everyone landed</h2><div class="rule"></div></div>';
    h += '<div class="card"><div class="tablewrap"><table class="t bktbl"><thead><tr>' +
      '<th>Points</th><th class="bkbarh"></th><th class="num">Managers</th><th class="num">Share</th>' +
      '</tr></thead><tbody>';
    h += g.buckets.map(function (b) {
      var mine = myScore !== null && myScore >= b.lo && myScore <= b.hi;
      var avg = g.average >= b.lo && g.average <= b.hi;
      return '<tr' + (mine ? ' class="me"' : '') + '>' +
        '<td class="bkband">' + num(b.lo) + '\u2013' + num(b.hi) +
          (mine ? ' <span class="pill gold">you</span>'
                : (avg ? ' <span class="pill">average</span>' : '')) + '</td>' +
        '<td class="bkbar"><span style="width:' + b.bar + '%"></span></td>' +
        '<td class="num"><b>' + num(b.n) + '</b></td>' +
        '<td class="num">' + b.pct + '%</td></tr>';
    }).join("");
    h += '</tbody></table></div><div class="note bknote">Bands of ' +
      num(g.bucketWidth) + ' points, best first.</div></div>';
    return h;
  }

  function statsPicks(H) {
    var sq = H.squads;
    if (!sq) return '<div class="callout">No squads stored for this gameweek.</div>';
    var h = '<div class="statlead">' + esc(H.gwName) + ' · ' + num(sq.managers) + ' squads</div>';
    h += '<div class="hgrid">';
    h += hcard("Different captains", num(sq.distinctCaptains), "picked across the league", null, "", "users");
    if (sq.mostCaptained[0]) {
      h += hcard("Most captained", sq.managers ? Math.round((sq.mostCaptained[0].caps / sq.managers) * 100) + "%" : num(sq.mostCaptained[0].caps),
        sq.mostCaptained[0].name, null, num(sq.mostCaptained[0].caps) + " of " + num(sq.managers) + " armbands", "captain");
    }
    h += '</div>';

    // Transfers are made before the deadline, so they are a matter of picks.
    var g = H.gwStats;
    if (g) {
      var dealt = g.count - g.noTransfer;
      h += statGroup("Transfers", [
        hcard("Total transfers", num(g.transfersTotal), "across the league", null,
          g.hitTotal ? ("\u2212" + num(g.hitTotal) + " pts in hits") : "no hits taken", "swap"),
        hcard("Made a transfer", num(dealt), "of " + g.count + " managers", null,
          dealt ? (Math.round((dealt / g.count) * 100) + "% of the league") : "nobody moved", "users"),
        hcard("Made none", num(g.noTransfer), "kept the same squad", null,
          Math.round((g.noTransfer / g.count) * 100) + "% of the league", "shield"),
        (g.mostTransfers && g.mostTransfers.transfers > 0)
          ? hcard("Most transfers", num(g.mostTransfers.transfers), g.mostTransfers.name,
              g.mostTransfers.id, "in one gameweek", "flame")
          : "",
        (g.mostHits && g.mostHits.hits > 0)
          ? hcard("Biggest hit", "\u2212" + num(g.mostHits.hits), g.mostHits.name, g.mostHits.id,
              num(g.mostHits.transfers) + " transfers", "warn")
          : ""
      ]);
    }

    var chipKeys = Object.keys(sq.chips || {});
    if (chipKeys.length) {
      h += '<div class="card"><div class="bd"><div class="lab-sm">Chips played</div><div class="chiprow">' +
        chipKeys.map(function (c) {
          return '<button type="button" class="pill gold chipgo" data-chipgo="' + esc(c) +
            '" data-chipgw="' + H.gw + '">' + esc(CHIP_NAME[c] || c) + ' \u00b7 ' + sq.chips[c] + '</button>';
        }).join("") + '</div></div></div>';
    }

    // The league's most-owned XI, drawn as a side.
    if (sq.templateXi) {
      h += '<div class="section-title"><h2>The template XI</h2><div class="rule"></div></div>';
      h += '<div class="note" style="margin:-4px 2px 10px">The most-owned player in each position, with how much of the league has them.</div>';
      h += xiBlock("template", sq.templateXi, { metric: "eo", average: H.gwStats ? H.gwStats.average : null, leagueAvgOwned: sq.leagueAvgOwned });
    }

    h += '<div class="card"><div class="bd hcols">';
    h += hlist("Most owned", sq.mostOwned, function (x) {
      return { name: x.name, tag: x.team, val: x.ownedPct + "%" };
    });
    h += hlist("Highest effective ownership", sq.ownershipLeaders, function (x) {
      return { name: x.name, tag: x.team, val: x.eo + "%" };
    }, "Counts captaincy, so it can pass 100%.");
    h += hlist("Most captained", sq.mostCaptained, function (x) {
      return { name: x.name, tag: x.team, val: num(x.caps) };
    });
    h += hlist("Most vice-captained", sq.mostVice, function (x) {
      return { name: x.name, tag: x.team, val: num(x.vices) };
    });
    h += '</div></div>';

    if (sq.movedIn && (sq.movedIn.length || sq.movedOut.length)) {
      h += '<div class="section-title"><h2>In and out</h2><div class="rule"></div></div>';
      h += '<div class="note" style="margin:-4px 2px 10px">' + num(sq.churn) +
        ' changes to squads since the previous gameweek.</div>';
      h += '<div class="card"><div class="bd hcols">';
      h += hlist("Brought in", sq.movedIn, function (x) {
        return { name: x.name, tag: x.team, val: num(x.count) };
      });
      h += hlist("Moved out", sq.movedOut, function (x) {
        return { name: x.name, tag: x.team, val: num(x.count) };
      });
      h += '</div></div>';
    }
    return h;
  }

  function statsValue(H) {
    var v = H.value, sq = H.squads;
    var h = '<div class="statlead">' + esc(H.gwName) + '</div>';
    if (v && v.richest.value === v.poorest.value) {
      // Before anyone has transferred, every squad is still worth the same —
      // naming a "richest" and "leanest" here would just look broken.
      h += '<div class="hgrid">' +
        hcard("Squad value", mval(v.average), "identical across " + v.count + " squads", null,
          "no squad has changed value yet", "tag") + '</div>';
    } else if (v) {
      h += '<div class="hgrid">';
      h += hcard("Richest squad", mval(v.richest.value), v.richest.name, v.richest.id,
        mval(v.richest.bank) + " in the bank", "up");
      h += hcard("League average", mval(v.average), v.count + " squads", null,
        mval(v.averageBank) + " in the bank", "chart");
      h += hcard("Leanest squad", mval(v.poorest.value), v.poorest.name, v.poorest.id,
        mval(v.poorest.bank) + " in the bank", "down");
      if (v.mostBanked && v.mostBanked.bank > 0) {
        h += hcard("Most in the bank", mval(v.mostBanked.bank), v.mostBanked.name, v.mostBanked.id,
          mval(v.mostBanked.value) + " on the pitch", "bank");
      }
      h += '</div>';
    } else {
      h += '<div class="callout">Squad values appear after the next data refresh.</div>';
    }
    if (v && v.top && v.top.length) {
      h += '<div class="card"><div class="bd">';
      h += hlist("Most valuable teams", v.top, function (x) {
        return { id: x.id, name: x.name, tag: "", val: mval(x.value) };
      }, v.richest.value === v.poorest.value ? "Every squad is still at its starting value." : "");
      h += '</div></div>';
    }
    if (sq && sq.bestValue.length) {
      h += '<div class="card"><div class="bd hcols">';
      h += hlist("Best value this week", sq.bestValue, function (x) {
        return { name: x.name, tag: mval(x.price), val: x.value + " /£m" };
      }, "Points per million of the player's price.");
      h += hlist("Priciest owned", sq.priciest, function (x) {
        return { name: x.name, tag: x.team, val: mval(x.price) };
      });
      h += '</div></div>';
    }
    return h;
  }

  function statsSeason(H, ds) {
    var se = H.season;
    if (!se) return '<div class="callout">No gameweeks scored yet.</div>';
    var h = '<div class="statlead">' + num(se.gws) + ' gameweek' + (se.gws === 1 ? '' : 's') + ' played</div>';
    h += '<div class="hgrid">';
    if (se.bestGw) {
      h += hcard("Best gameweek", num(se.bestGw.p), se.bestGw.name, se.bestGw.id, "in GW" + se.bestGw.gw, "trophy");
    }
    if (se.bestAvg) {
      h += hcard("Best average", num(se.bestAvg.avg), se.bestAvg.name, se.bestAvg.id,
        "over " + se.gws + " gameweek" + (se.gws === 1 ? "" : "s"), "chart");
    }
    if (se.steadiest) {
      h += hcard("Most consistent", num(se.steadiest.spread), se.steadiest.name, se.steadiest.id,
        "between their best and worst", "steady");
    }
    if (se.biggestClimb && se.biggestClimb.climb > 0) {
      h += hcard("Biggest riser", num(se.biggestClimb.climb), se.biggestClimb.name, se.biggestClimb.id,
        "places gained overall", "up");
    }
    if (se.worstGw) {
      h += hcard("Lowest gameweek", num(se.worstGw.p), se.worstGw.name, se.worstGw.id, "in GW" + se.worstGw.gw, "down");
    }
    if (se.mostHits && se.mostHits.hits > 0) {
      h += hcard("Most hits taken", "−" + num(se.mostHits.hits), se.mostHits.name, se.mostHits.id, "all season", "warn");
    }
    if (se.mostBench && se.mostBench.bench > 0) {
      h += hcard("Most benched", num(se.mostBench.bench), se.mostBench.name, se.mostBench.id, "points on the bench", "bench");
    }
    if (se.mostTransfers && se.mostTransfers.transfers > 0) {
      h += hcard("Most transfers", num(se.mostTransfers.transfers), se.mostTransfers.name, se.mostTransfers.id, "so far", "swap");
    }
    h += hcard("Never took a hit", num(se.cleanest), "managers", null, "no transfer costs yet", "shield");
    h += '</div>';

    h += whereEveryoneLanded(ds);

    // Who is winning money. Ordered by the figure the row actually prints —
    // settled plus what is still being played for. It used to lead on the
    // settled half alone, which put a manager on 23,500 above one on 50,900
    // and made a ranked list read as though it were in no order at all; worse,
    // the eight shown were the top eight of a different measure from the one
    // beside them. Settled money breaks a tie, since it is the half in hand.
    var wAll = K.winningsAll(ds);
    var purse = ds.managers.map(function (m) {
      var w = wAll[+m.id] || { settled: 0, onTrack: 0, total: 0 };
      return { id: m.id, name: m.entryName, settled: w.settled, onTrack: w.onTrack, total: w.total };
    }).filter(function (x) { return x.total > 0; })
      .sort(function (a, b) { return (b.total - a.total) || (b.settled - a.settled); });
    if (purse.length) {
      h += '<div class="section-title"><h2>XP</h2><div class="rule"></div></div>';
      h += '<div class="card"><div class="bd">';
      h += hlist("On course to win", purse.slice(0, 8), function (x) {
        return { id: x.id, name: x.name, tag: x.settled ? xpa(x.settled) + " settled" : "", val: xpa(x.total) };
      }, "Nothing is settled until a competition finishes.");
      h += '</div></div>';
    }

    h += '<div class="section-title"><h2>Across the league</h2><div class="rule"></div></div>';
    h += '<div class="hgrid">';
    h += hcard("Transfers", num(se.transfersTotal), "made in total", null, "−" + num(se.hitsTotal) + " pts in hits", "swap");
    h += hcard("Points benched", num(se.benchTotal), "left on benches", null, "", "bench");
    h += hcard("Chips played", num(se.chipsPlayed), "so far this season", null, "", "sparkle");
    h += '</div>';
    return h;
  }

  /* The league as a shape rather than a ladder. A table of 245 rows says who
     is where; this says how tightly the field is packed and where you sit
     inside it — which is the thing you cannot see from a position alone.
     Buckets and totals both come from compute, so they are settled on the
     same numbers as the Classic table. */
  function whereEveryoneLanded(ds) {
    var sp = K.pointsSpread(ds);
    if (!sp || !sp.buckets.length) return "";
    var mine = state.me ? +state.me : null;
    var myBucket = null;
    if (mine) {
      sp.buckets.forEach(function (b, i) {
        if (b.names.some(function (x) { return +x.id === mine; })) myBucket = i;
      });
    }
    var h = '<div class="section-title"><h2>Where everyone landed</h2><div class="rule"></div></div>';
    h += '<div class="card"><div class="sprlead">' +
      num(sp.count) + ' managers, ' + num(sp.low) + ' to ' + num(sp.high) + ' points' +
      ' \u00b7 median ' + num(sp.median) + '</div>';
    h += sp.buckets.map(function (b, i) {
      var w = sp.most ? Math.round((b.n / sp.most) * 100) : 0;
      return '<div class="sprow' + (i === myBucket ? ' me' : '') + '">' +
        '<span class="sprg">' + num(b.from) + '\u2013' + num(b.to) + '</span>' +
        '<span class="sprb"><i style="width:' + w + '%"></i></span>' +
        '<span class="sprn">' + num(b.n) +
        (i === myBucket ? '<b class="sprme">You</b>' : '') + '</span></div>';
    }).join("");
    h += '<div class="sprfoot">Season totals, hits taken off \u2014 the same numbers ' +
      'the Classic table is settled on. Buckets are ' + num(sp.width) + ' points wide.</div>';
    return h + '</div>';
  }

  function statsFame(H) {
    var pa = H.past;
    if (!pa) return '<div class="callout">Past-season history appears after the next data refresh.</div>';
    var h = '<div class="statlead">' + num(pa.players) + ' managers have played FPL before</div>';
    if (pa.topTen) {
      h += '<div class="hgrid">' +
        hcard("Top 10k finishes", num(pa.topTen), "managers have one", null, "in any past season", "medal") +
        (pa.topRanks[0] ? hcard("Best ever finish", num(pa.topRanks[0].bestRank.rank),
          pa.topRanks[0].name, pa.topRanks[0].id, pa.topRanks[0].bestRank.season, "trophy") : "") +
        (pa.topCareer[0] ? hcard("Career points", num(pa.topCareer[0].career),
          pa.topCareer[0].name, pa.topCareer[0].id, pa.topCareer[0].seasons + " seasons", "flame") : "") +
        '</div>';
    }
    h += '<div class="card"><div class="bd hcols">';
    h += hlist("Best ever finish", pa.topRanks, function (x) {
      return { id: x.id, name: x.name, tag: x.bestRank.season, val: num(x.bestRank.rank) };
    }, "Overall FPL rank.");
    h += hlist("Highest season score", pa.topScores, function (x) {
      return { id: x.id, name: x.name, val: num(x.bestPts.total),
               tag: x.bestPts.season + (x.bestPts.rank ? " · rank " + num(x.bestPts.rank) : "") };
    });
    h += hlist("Best average season", pa.topAvg, function (x) {
      return { id: x.id, name: x.name, tag: x.seasons + " seasons", val: num(x.avg) };
    }, "Points per season, two seasons or more.");
    h += hlist("Most career points", pa.topCareer, function (x) {
      return { id: x.id, name: x.name, tag: x.seasons + " seasons", val: num(x.career) };
    });
    h += hlist("Most seasons played", pa.veterans, function (x) {
      return { id: x.id, name: x.name, tag: "", val: num(x.seasons) };
    });
    h += '</div></div>';
    return h;
  }

  /* ====================================================================== */
  /* HEAD TO HEAD — two managers side by side                               */
  /* ====================================================================== */
  function cmpCell(v, win) {
    if (v === null || v === undefined) return '<td class="num">—</td>';
    if (typeof v !== "number") { // text values (chips) read as prose, not a score
      return '<td class="num"><span class="txt">' + esc(String(v)) + '</span></td>';
    }
    return '<td class="num' + (win ? ' win' : '') + '">' + num(v) + '</td>';
  }
  function cmpRow(label, a, b, hint, lowerBetter) {
    var an = (typeof a === "number") ? a : null, bn = (typeof b === "number") ? b : null;
    var aw = false, bw = false;
    if (an !== null && bn !== null && an !== bn) {
      var aBetter = lowerBetter ? (an < bn) : (an > bn);
      aw = aBetter; bw = !aBetter;
    }
    return '<tr>' + cmpCell(a, aw) +
      '<td class="cmid">' + esc(label) + (hint ? '<div class="note">' + esc(hint) + '</div>' : '') + '</td>' +
      cmpCell(b, bw) + '</tr>';
  }
  function mgrLabel(m) { return m.entryName + " \u2014 " + m.playerName; }
  // Match typed text to a manager: exact label, then a prefix on either name,
  // then any substring. Returns null when nothing matches.
  function resolveMgr(text, mgrs) {
    var t = String(text || "").trim().toLowerCase();
    if (!t) return null;
    function pick(test) { return mgrs.filter(test)[0] || null; }
    return pick(function (m) { return mgrLabel(m).toLowerCase() === t; })
        || pick(function (m) {
             return String(m.entryName || "").toLowerCase().indexOf(t) === 0 ||
                    String(m.playerName || "").toLowerCase().indexOf(t) === 0;
           })
        || pick(function (m) { return mgrLabel(m).toLowerCase().indexOf(t) !== -1; });
  }

  // One player in the side-by-side squad table.
  function sqCell(p, metric) {
    if (!p) return '<td class="sqp empty"><div class="sqin"></div></td>';
    var mark = p.cap ? '<i class="pb cap sq">C</i>' : (p.vice ? '<i class="pb vice sq">V</i>' : "");
    // The flex row lives on an inner div: making the cell itself a flex
    // container would drop it out of the table and stack the two columns.
    return '<td class="sqp' + (p.benched ? ' benched' : '') + '"><div class="sqin">' +
      '<span class="sq-pos">' + esc(p.pos) + '</span>' +
      '<span class="sq-nm">' + esc(p.name) + mark + '</span>' +
      '<span class="sq-v">' + esc(metricOf(p, metric)) + '</span></div></td>';
  }
  // A past season for one manager: rank on top, points beneath.
  function seasonCell(s, win) {
    if (!s) return '<td class="num"><span class="txt">—</span></td>';
    return '<td class="num' + (win ? ' win' : '') + '"><div class="sr">' + (s.rank ? num(s.rank) : "—") + '</div>' +
      '<div class="sp">' + (typeof s.total === "number" ? num(s.total) + " pts" : "") + '</div></td>';
  }
  // Who had the better season: overall rank decides, points only if a rank is
  // missing. Nobody wins a season they did not both play.
  function seasonWinner(a, b) {
    if (!a || !b) return [false, false];
    if (a.rank && b.rank && a.rank !== b.rank) return [a.rank < b.rank, b.rank < a.rank];
    if (typeof a.total === "number" && typeof b.total === "number" && a.total !== b.total) {
      return [a.total > b.total, b.total > a.total];
    }
    return [false, false];
  }

  function renderChips(host, ds) {
    if (!ds) { host.innerHTML = '<div class="callout">Standings not loaded yet.</div>'; return; }
    var gw = state.chipsGw, chip = state.chipsKey;
    var list = (gw && chip) ? K.chipPlayers(ds, gw, chip) : [];
    var label = CHIP_NAME[chip] || chip || "Chip";
    var h = '<div class="section-title"><h2>' + esc(label) + '</h2><div class="rule"></div>' +
      '<span class="chip">GW' + esc(String(gw || "?")) + '</span></div>';
    if (!list.length) {
      h += '<div class="callout">Nobody played ' + esc(label) + ' in Gameweek ' + esc(String(gw || "?")) + '.</div>';
    } else {
      h += '<div class="card"><div class="tablewrap"><table class="t"><thead><tr>' +
        '<th class="num">#</th><th>Team</th><th class="num">GW pts</th></tr></thead><tbody>';
      h += list.map(function (r, i) {
        return '<tr' + (isMe(r.id) ? ' class="me"' : '') + '><td class="num">' + (i + 1) + '</td>' +
          '<td class="name" data-entry="' + r.id + '"><span class="who">' + esc(r.name) + '</span>' +
          '<div class="mgr">' + esc(r.player) + '</div></td>' +
          '<td class="num"><b>' + (r.score === null ? "\u2014" : num(r.score)) + '</b></td></tr>';
      }).join("");
      h += '</tbody></table></div></div>';
    }
    host.innerHTML = h;
  }

  function renderCompare(host, ds) {
    if (!ds || !ds.managers || !ds.managers.length) {
      host.innerHTML = '<div class="callout">Standings not loaded yet.</div>';
      return;
    }
    var gws = K.squadGws(ds);
    var mgrs = ds.managers.slice().sort(function (x, y) {
      return String(x.entryName || "").localeCompare(String(y.entryName || ""));
    });
    // Defaults: you (or the leader) against the next manager in the table.
    var byRank = ds.managers.slice().sort(function (x, y) { return (x.rank || 1e9) - (y.rank || 1e9); });
    if (!state.cmpA) state.cmpA = state.me || (byRank[0] && byRank[0].id);
    // Nobody is compared with himself: whoever the first side ends up being,
    // the second has to be somebody else.
    if (state.cmpB && +state.cmpB === +state.cmpA) state.cmpB = null;
    if (!state.cmpB) {
      var other = byRank.filter(function (m) { return +m.id !== +state.cmpA; })[0];
      state.cmpB = other && other.id;
    }
    if (!state.cmpGw || gws.indexOf(+state.cmpGw) === -1) state.cmpGw = gws[gws.length - 1];

    // 245 names is too many to scroll, so these are type-ahead fields backed
    // by a shared datalist rather than dropdowns.
    function field(idAttr, chosen) {
      var cur = mgrs.filter(function (m) { return +m.id === +chosen; })[0];
      return '<input class="in mgrin" id="' + idAttr + '" list="mgrOpts" autocomplete="off" ' +
        'spellcheck="false" placeholder="Type a team or manager" value="' +
        esc(cur ? mgrLabel(cur) : "") + '">';
    }
    var h = '<datalist id="mgrOpts">' + mgrs.map(function (m) {
      return '<option value="' + esc(mgrLabel(m)) + '"></option>';
    }).join("") + '</datalist>';
    h += '<div class="cmppick">' + field("cmpA", state.cmpA) +
      '<div class="vs">vs</div>' + field("cmpB", state.cmpB) + '</div>';
    h += '<div id="cmpBox"></div>';
    host.innerHTML = h;

    function bindPick(sel, key) {
      var el = $(sel, host);
      el.addEventListener("focus", function () { this.select(); });
      el.addEventListener("change", function () {
        var found = resolveMgr(this.value, mgrs);
        if (found) {
          state[key] = found.id;
          this.value = mgrLabel(found);
          el.classList.remove("bad");
          drawCompare(ds);
        } else {
          el.classList.add("bad");
          toast("No manager matches that name");
        }
      });
    }
    bindPick("#cmpA", "cmpA");
    bindPick("#cmpB", "cmpB");
    drawCompare(ds);
  }

  function drawCompare(ds) {
    var box = $("#cmpBox");
    if (!box) return;
    var gws = K.squadGws(ds);
    var R = K.compare(ds, state.cmpA, state.cmpB, state.cmpGw);
    if (!R) { box.innerHTML = '<div class="callout">Pick two managers.</div>'; return; }
    var a = R.a, b = R.b;

    var h = '<div class="card"><div class="bd">';
    h += '<div class="pgwline"><select class="in gwsel" id="cmpGwSel" aria-label="Gameweek">' +
      gws.map(function (g) {
        return '<option value="' + g + '"' + (+g === +R.gw ? ' selected' : '') + '>Gameweek ' + g + '</option>';
      }).join("") + '</select></div>';

    h += '<div class="cmphead">' +
      '<div class="side"><div class="nm" data-entry="' + a.id + '">' + esc(a.name) + '</div>' +
        '<div class="sc' + (a.gwPts > b.gwPts ? ' win' : '') + '">' + (a.gwPts === null ? "—" : num(a.gwPts)) + '</div></div>' +
      '<div class="mid">GW' + R.gw + '</div>' +
      '<div class="side"><div class="nm" data-entry="' + b.id + '">' + esc(b.name) + '</div>' +
        '<div class="sc' + (b.gwPts > a.gwPts ? ' win' : '') + '">' + (b.gwPts === null ? "—" : num(b.gwPts)) + '</div></div>' +
      '</div>';

    var cm = METRICS[state.cmpMetric] ? state.cmpMetric : "pts";
    h += '<div class="psegrow"><div class="pseg sm" id="cmpMetric">' + Object.keys(METRICS).map(function (k) {
      return '<button type="button"' + (cm === k ? ' class="on"' : '') + ' data-metric="' + k + '">' + esc(METRICS[k]) + '</button>';
    }).join("") + '</div></div>';
    function chipTag(side) {
      return side.pitch && side.pitch.chip
        ? '<div class="colchip"><span class="pill gold">' + esc(CHIP_NAME[side.pitch.chip] || side.pitch.chip) + '</span></div>'
        : '<div class="colchip"></div>';
    }
    h += '<div class="cmppitch">' +
      '<div class="col">' + chipTag(a) + (a.pitch ? pitchHtml(a.pitch, cm) : '<div class="callout">No squad</div>') + '</div>' +
      '<div class="col">' + chipTag(b) + (b.pitch ? pitchHtml(b.pitch, cm) : '<div class="callout">No squad</div>') + '</div>' +
      '</div></div></div>';

    /* ---- this season ---- */
    h += '<div class="section-title"><h2>This season</h2><div class="rule"></div></div>';
    h += '<div class="card"><div class="tablewrap"><table class="t cmptable"><thead><tr>' +
      '<th class="num">' + esc(a.name) + '</th><th class="cmid"></th><th class="num">' + esc(b.name) + '</th>' +
      '</tr></thead><tbody>';
    h += cmpRow("Season total", a.total, b.total);
    h += cmpRow("League position", a.rank || null, b.rank || null, "", true);
    h += cmpRow("Gameweeks won", R.record.w, R.record.l, R.record.d ? (R.record.d + " drawn") : "");
    h += cmpRow("Best gameweek", a.best ? a.best.p : null, b.best ? b.best.p : null,
      (a.best && b.best) ? ("GW" + a.best.gw + " vs GW" + b.best.gw) : "");
    h += cmpRow("Points hits", a.hits, b.hits, "lower is better", true);
    h += cmpRow("Points on bench", a.bench, b.bench, "lower is better", true);
    h += cmpRow("GW" + R.gw + " points", a.gwPts, b.gwPts);
    h += cmpRow("GW" + R.gw + " hit", a.gwHits, b.gwHits, "", true);
    var ac = a.chips.map(function (c) { return (CHIP_NAME[c.chip] || c.chip) + " (GW" + c.gw + ")"; }).join(", ");
    var bc = b.chips.map(function (c) { return (CHIP_NAME[c.chip] || c.chip) + " (GW" + c.gw + ")"; }).join(", ");
    h += cmpRow("Chips played", ac || "none", bc || "none");
    h += cmpRow("Badges", badgeText(ds, a.id), badgeText(ds, b.id));
    h += '</tbody></table></div></div>';

    /* ---- the season side by side: points a week, and where each stood ---- */
    var fa = K.form(ds, a.id), fb = K.form(ds, b.id);
    if (fa.length && fb.length) {
      h += '<div class="section-title"><h2>Form</h2><div class="rule"></div></div>';
      h += '<div class="card"><div class="bd" id="cmpForm">' +
        formCompare(fa, fb, a.name, b.name) + '</div></div>';
    }

    /* ---- all fifteen, shared players on the same row ---- */
    if (R.squadRows.length) {
      h += '<div class="section-title"><h2>Squads · GW' + R.gw + '</h2><div class="rule"></div></div>';
      h += '<div class="card"><div class="bd">';
      h += '<div class="note" style="margin-bottom:10px">' + R.shared.length + ' player' +
        (R.shared.length === 1 ? '' : 's') + ' in common, highlighted.</div>';
      h += '<table class="t sqtable"><tbody>';
      h += R.squadRows.map(function (r) {
        return '<tr' + (r.shared ? ' class="same"' : '') + '>' +
          sqCell(r.a, cm) + sqCell(r.b, cm) + '</tr>';
      }).join("");
      h += '</tbody></table></div></div>';
    }

    /* ---- past seasons ---- */
    h += '<div class="section-title"><h2>Hall of fame</h2><div class="rule"></div></div>';
    if (a.seasonCount || b.seasonCount) {
      h += '<div class="card"><div class="tablewrap"><table class="t cmptable"><thead><tr>' +
        '<th class="num">' + esc(a.name) + '</th><th class="cmid"></th><th class="num">' + esc(b.name) + '</th>' +
        '</tr></thead><tbody>';
      h += cmpRow("Seasons played", a.seasonCount, b.seasonCount);
      h += cmpRow("Best finish", a.bestRank ? a.bestRank.rank : null, b.bestRank ? b.bestRank.rank : null,
        "overall FPL rank · lower is better", true);
      h += cmpRow("Best season", a.bestPts ? a.bestPts.total : null, b.bestPts ? b.bestPts.total : null,
        (a.bestPts && b.bestPts) ? (a.bestPts.season + " vs " + b.bestPts.season) : "");
      h += cmpRow("Average season", a.avgSeason, b.avgSeason, "points per season");
      h += cmpRow("Career points", a.career || null, b.career || null);
      h += '</tbody></table></div>';

      // Season by season: rank and points for each.
      h += '<div class="tablewrap"><table class="t cmptable seasons"><thead><tr>' +
        '<th class="num">Rank · Pts</th><th class="cmid">Season</th><th class="num">Rank · Pts</th>' +
        '</tr></thead><tbody>';
      h += R.seasonRows.map(function (s) {
        var w = seasonWinner(s.a, s.b);
        return '<tr>' + seasonCell(s.a, w[0]) +
          '<td class="cmid">' + esc(s.season) + '</td>' + seasonCell(s.b, w[1]) + '</tr>';
      }).join("");
      h += '</tbody></table></div></div>';
    } else {
      h += '<div class="callout">Neither manager has played a previous FPL season.</div>';
    }

    box.innerHTML = h;
    $("#cmpGwSel", box).addEventListener("change", function () {
      state.cmpGw = +this.value; drawCompare(ds);
    });
    $("#cmpMetric", box).addEventListener("click", function (e) {
      var t = e.target.closest("button[data-metric]");
      if (t) { state.cmpMetric = t.getAttribute("data-metric"); drawCompare(ds); }
    });
    // The form chart's legend sits in its own card, so this listens on the box
    // — which outlives the redraw, so it is bound once. Binding it here without
    // the guard added a listener per redraw, and a click then toggled once per
    // listener: two taps' worth of work for one tap, landing back where it
    // started.
    if (!box.dataset.sideWired) {
      box.dataset.sideWired = "1";
      box.addEventListener("click", function (e) {
        var sb = e.target.closest("button[data-side]");
        if (!sb) return;
        var k = sb.getAttribute("data-side"), sh = state.cmpShow || (state.cmpShow = { a: true, b: true });
        // as on a profile, the last manager on stays on
        if (sh[k] && !(k === "a" ? sh.b : sh.a)) return;
        sh[k] = !sh[k];
        drawCompare(S.dataset());
      });
    }
  }

  /* ====================================================================== */
  /* SETTINGS + ADMIN                                                       */
  /* ====================================================================== */
  function renderSettings(host) {
    var cfg = S.config();
    var ds = S.dataset();
    var h = '<div class="section-title"><h2>Settings</h2><div class="rule"></div></div>';

    // League config
    h += '<div class="card"><div class="hd"><h3>League</h3></div><div class="bd">';
    h += field("Classic League ID", '<input class="in" id="cfgClassic" value="' + esc(cfg.classicLeagueId || "") + '" placeholder="e.g. 314" inputmode="numeric">');
    h += field("H2H group League IDs (comma-separated, optional)", '<input class="in" id="cfgH2h" value="' + esc((cfg.h2hGroupLeagueIds || []).join(", ")) + '" placeholder="one FPL H2H league id per group">');
    h += field("Joining fee (optional, for prize pool)", '<input class="in" id="cfgFee" value="' + esc(cfg.joiningFee || "") + '" inputmode="numeric">');
    h += field("Season start year (for month labels, e.g. 2026)", '<input class="in" id="cfgYear" value="' + esc(cfg.seasonStartYear || "") + '" inputmode="numeric">');
    h += field("Highlight my team (entry ID)", '<input class="in" id="cfgMe" value="' + esc(state.me || "") + '" placeholder="your FPL entry id" inputmode="numeric">');
    h += '<div class="btnrow"><button class="btn primary" id="saveLeague">Save</button></div>';
    h += '</div></div>';

    // Data source
    h += '<div class="card"><div class="hd"><h3>Data source (CORS proxy)</h3></div><div class="bd">';
    h += '<div class="note">The FPL API has no CORS, so requests route through a proxy. If one stops working, switch it here.</div>';
    var opts = (cfg.proxy.alternatives || []).map(function (t) {
      var label = t === "" ? "(direct / own proxy)" : t;
      return '<option value="' + esc(t) + '"' + (t === cfg.proxy.template ? ' selected' : '') + '>' + esc(label) + '</option>';
    }).join("");
    h += field("Active proxy", '<select class="in" id="cfgProxy">' + opts + '</select>');
    h += field("Custom proxy template ({url} = encoded FPL url)", '<input class="in" id="cfgProxyCustom" placeholder="https://your-proxy/?url={url}">');
    h += '<div class="btnrow"><button class="btn" id="saveProxy">Save proxy</button></div>';
    h += '</div></div>';

    // Refresh + data
    h += '<div class="card"><div class="hd"><h3>Data</h3></div><div class="bd">';
    h += '<div class="note">' + (ds ? ('Loaded ' + ds.managers.length + ' managers · updated ' + new Date(ds.updatedAt).toLocaleString()) : 'No data loaded yet.') + '</div>';
    h += '<div id="refreshBox" style="margin:12px 0"></div>';
    h += '<div class="btnrow">' +
      '<button class="btn primary" id="btnDoRefresh">' + svg("refresh", 16) + 'Refresh from FPL</button>' +
      '<button class="btn" id="btnExport">' + svg("download", 16) + 'Export data.json</button>' +
      '<button class="btn" id="btnImport">' + svg("upload", 16) + 'Import bundle</button>' +
      '<input type="file" id="fileImport" accept="application/json" style="display:none">' +
      '</div>';
    h += '<div class="note" style="margin-top:10px">Organiser tip: refresh once per gameweek, <b>Export</b>, and commit the file as <code>gameon/data.json</code>. Everyone else\'s app will load it automatically — no proxy load for 245 people.</div>';
    h += '</div></div>';

    // Usage counter. GoatCounter cannot pick one person's visits back out of
    // its totals — it keeps no identity — so the choice is about the visits
    // still to come, and it lives on the phone, in the key count.js honours.
    h += '<div class="card"><div class="hd"><h3>Usage counter</h3></div><div class="bd">';
    h += '<div class="note" id="countNote">' + countNote() + '</div>';
    h += '<div class="btnrow" style="margin-top:10px"><button class="btn" id="btnCount">' + countLabel() + '</button></div>';
    h += '</div></div>';

    // Theo. He is decoration with opinions, and not everyone wants opinions.
    if (window.GO_THEO) {
      var theoOn = window.GO_THEO.on();
      h += '<div class="card"><div class="hd"><h3>Theo</h3></div><div class="bd">';
      h += '<div class="note" id="theoNote">' + (theoOn
        ? 'The lion in the corner. He says hello when the app opens and has something to say about your week when you tap him.'
        : 'Theo is off. The corner is yours.') + '</div>';
      h += '<div class="btnrow" style="margin-top:10px"><button class="btn" id="btnTheo">' + (theoOn ? 'Turn Theo off' : 'Bring Theo back') + '</button></div>';
      h += '</div></div>';
    }

    // Admin overrides
    h += '<div class="section-title"><h2>Admin — custom rules</h2><div class="rule"></div></div>';
    h += '<div class="card"><div class="bd">';
    h += '<div class="note" style="margin-bottom:12px">The app auto-computes everything it can. Use these to lock outcomes that need human judgement or the real draw. Each opens a JSON editor with the current auto value pre-filled.</div>';
    h += '<div class="btnrow">' +
      '<button class="btn" data-ov="months">Month → GW map & XP</button>' +
      '<button class="btn" data-ov="classicPrizes">Classic XP</button>' +
      '<button class="btn" data-ov="lmsElim">LMS manual eliminations</button>' +
      '<button class="btn" data-ov="pyramidRosters">Pyramid rosters</button>' +
      '<button class="btn" data-ov="h2hGroups">H2H groups</button>' +
      '</div>';
    h += '<div class="btnrow" style="margin-top:16px"><button class="btn danger" id="btnReset">Reset all settings & overrides</button></div>';
    h += '</div></div>';

    host.innerHTML = h;
    wireSettings(host);
  }

  function field(lab, control) {
    return '<label class="field"><span class="lab">' + esc(lab) + '</span>' + control + '</label>';
  }

  function countNote() {
    return countingOff()
      ? "This phone's visits are not counted in the usage stats. Visits counted before this was switched off stay in the totals."
      : "This phone's visits are counted in the usage stats. Switch off on every phone you use to keep yourself out of the totals.";
  }
  function countLabel() { return countingOff() ? "Count my visits again" : "Stop counting my visits"; }

  function wireSettings(host) {
    var bt = $("#btnTheo", host);
    if (bt) bt.addEventListener("click", function () {
      var on = !window.GO_THEO.on();
      window.GO_THEO.setOn(on);
      if (on) window.GO_THEO.sync({ ds: S.dataset(), me: state.me, view: state.view });
      bt.textContent = on ? 'Turn Theo off' : 'Bring Theo back';
      $("#theoNote", host).textContent = on
        ? 'The lion in the corner. He says hello when the app opens and has something to say about your week when you tap him.'
        : 'Theo is off. The corner is yours.';
      toast(on ? "Theo\u2019s back" : "Theo has gone for a nap");
    });
    $("#btnCount", host).addEventListener("click", function () {
      try { if (countingOff()) localStorage.removeItem(SKIP_KEY); else localStorage.setItem(SKIP_KEY, "t"); } catch (e) {}
      $("#countNote", host).textContent = countNote();
      $("#btnCount", host).textContent = countLabel();
      toast(countingOff() ? "This phone is no longer counted" : "This phone is counted again");
    });
    $("#saveLeague", host).addEventListener("click", function () {
      var classic = parseInt($("#cfgClassic", host).value, 10);
      var h2h = $("#cfgH2h", host).value.split(",").map(function (s) { return parseInt(s.trim(), 10); }).filter(function (n) { return !isNaN(n); });
      var fee = parseInt($("#cfgFee", host).value, 10);
      var year = parseInt($("#cfgYear", host).value, 10);
      S.saveConfig({
        classicLeagueId: isNaN(classic) ? null : classic,
        h2hGroupLeagueIds: h2h,
        joiningFee: isNaN(fee) ? null : fee,
        seasonStartYear: isNaN(year) ? S.config().seasonStartYear : year
      });
      var me = parseInt($("#cfgMe", host).value, 10);
      state.me = isNaN(me) ? null : me; lsSet(ME_KEY, state.me);
      toast("Saved");
    });

    $("#saveProxy", host).addEventListener("click", function () {
      var custom = $("#cfgProxyCustom", host).value.trim();
      var template = custom || $("#cfgProxy", host).value;
      var cfg = S.config();
      var alts = cfg.proxy.alternatives.slice();
      if (custom && alts.indexOf(custom) === -1) alts.unshift(custom);
      S.saveConfig({ proxy: { template: template, alternatives: alts } });
      toast("Proxy saved");
    });

    $("#btnDoRefresh", host).addEventListener("click", startRefresh);

    $("#btnExport", host).addEventListener("click", function () {
      var bundle = S.exportBundle();
      if (!bundle.dataset) { toast("Nothing to export — refresh first"); return; }
      download("data.json", JSON.stringify(bundle));
      toast("Exported data.json");
    });
    $("#btnImport", host).addEventListener("click", function () { $("#fileImport", host).click(); });
    $("#fileImport", host).addEventListener("change", function (e) {
      var f = e.target.files[0]; if (!f) return;
      var rd = new FileReader();
      rd.onload = function () {
        try {
          var bundle = JSON.parse(rd.result);
          S.importBundle(bundle).then(function () { toast("Imported"); updateDataState(); render(); });
        } catch (err) { toast("Invalid file"); }
      };
      rd.readAsText(f);
    });

    $all("[data-ov]", host).forEach(function (b) {
      b.addEventListener("click", function () { openOverrideEditor(b.getAttribute("data-ov")); });
    });

    $("#btnReset", host).addEventListener("click", function () {
      if (!confirm("Reset all settings and admin overrides? Pulled data is kept.")) return;
      S.resetConfig(); S.saveOverrides({}); localStorage.removeItem("go12.overrides");
      location.reload();
    });
  }

  function openOverrideEditor(kind) {
    var cfg = S.config(), ov = S.overrides(), ds = S.dataset();
    var title, path, value, help;
    if (kind === "months") { title = "Month → GW map & prizes"; path = ["_configMonths"]; value = cfg.months;
      help = "Set which gameweeks belong to each month and the prizes. This drives the Manager of the Month tab."; }
    else if (kind === "classicPrizes") { title = "Classic XP"; path = ["_configClassicPrizes"]; value = cfg.classicPrizes;
      help = "exact = rank→amount; ranges = inclusive from/to bands."; }
    else if (kind === "lmsElim") { title = "LMS manual eliminations"; path = ["lms", "elim"]; value = (ov.lms && ov.lms.elim) || {};
      help = 'Override who is eliminated in a GW: { "5": [entryId, entryId] }. Leave empty to auto-compute.'; }
    else if (kind === "pyramidRosters") { title = "Pyramid rosters"; path = ["pyramid", "rosters"];
      value = (ov.pyramid && ov.pyramid.rosters) || (ds ? { s1: K.pyramid(ds).rosters.s1 } : {});
      help = 'Season rosters: { "s1": { "elite":[ids], "championship":[ids], ... } }. S2/S3 auto-follow promotion/relegation unless set.'; }
    else if (kind === "h2hGroups") { title = "H2H groups"; path = ["h2h", "groups"];
      value = (ov.h2h && ov.h2h.groups) || (ds ? K.h2h(ds).groups.map(function (g) { return { name: g.name, entries: g.table.map(function (t) { return t.id; }) }; }) : []);
      help = 'Array of { "name":"Group A", "entries":[entryIds] }. 16 groups of 15.'; }
    else return;

    if (path[0] === "_configMonths" || path[0] === "_configClassicPrizes") {
      // These edit config, not overrides.
      var body = modal(title, '<div class="note" style="margin-bottom:10px">' + esc(help) + '</div>' +
        '<textarea class="in" id="ovText" spellcheck="false">' + esc(JSON.stringify(value, null, 2)) + '</textarea>' +
        '<div class="btnrow" style="margin-top:12px"><button class="btn primary" id="ovSave">Save</button><button class="btn ghost" id="ovCancel">Cancel</button></div>');
      $("#ovCancel").addEventListener("click", closeModal);
      $("#ovSave").addEventListener("click", function () {
        try {
          var parsed = JSON.parse($("#ovText").value);
          if (path[0] === "_configMonths") S.saveConfig({ months: parsed });
          else S.saveConfig({ classicPrizes: parsed });
          closeModal(); toast("Saved"); render();
        } catch (e) { toast("Invalid JSON"); }
      });
      return;
    }
    editOverrideJson(title, path, value, help);
  }

  function editOverrideJson(title, path, value, help) {
    if (value === undefined) value = getPath(S.overrides(), path);
    var body = modal(title, '<div class="note" style="margin-bottom:10px">' + esc(help || "") + '</div>' +
      '<textarea class="in" id="ovText" spellcheck="false">' + esc(JSON.stringify(value == null ? null : value, null, 2)) + '</textarea>' +
      '<div class="btnrow" style="margin-top:12px"><button class="btn primary" id="ovSave">Save</button>' +
      '<button class="btn ghost" id="ovClear">Clear (use auto)</button>' +
      '<button class="btn ghost" id="ovCancel">Cancel</button></div>');
    $("#ovCancel").addEventListener("click", closeModal);
    $("#ovClear").addEventListener("click", function () { S.setOverridePath(path, undefined); closeModal(); toast("Cleared — using auto"); render(); });
    $("#ovSave").addEventListener("click", function () {
      try { var parsed = JSON.parse($("#ovText").value); S.setOverridePath(path, parsed); closeModal(); toast("Saved"); render(); }
      catch (e) { toast("Invalid JSON"); }
    });
  }
  function getPath(obj, path) { var n = obj; for (var i = 0; i < path.length; i++) { if (!n) return undefined; n = n[path[i]]; } return n; }

  /* ---- refresh flow ---------------------------------------------------- */
  function startRefresh() {
    var cfg = S.config();
    if (!cfg.classicLeagueId) {
      toast("Set your Classic League ID in Settings first");
      location.hash = "settings";
      return;
    }
    var body = modal("Refreshing from FPL", progressHtml("Starting…", 0));
    S.refresh(function (p) {
      var pct = (p.total && p.done != null) ? Math.round((p.done / p.total) * 100) : (p.phase === "done" ? 100 : null);
      $("#modalBody").innerHTML = progressHtml(p.message || p.phase, pct);
    }).then(function () {
      closeModal(); updateDataState(); render();
      toast("Updated from FPL");
    }).catch(function (err) {
      $("#modalBody").innerHTML = '<div class="callout" style="border-color:var(--red);color:var(--red)">' +
        esc(err.message || "Refresh failed") + '</div>' +
        '<div class="note" style="margin-top:10px">If proxies are down, try a different one in Settings → Data source, then refresh again.</div>' +
        '<div class="btnrow" style="margin-top:12px"><button class="btn" id="errClose">Close</button></div>';
      $("#errClose").addEventListener("click", closeModal);
    });
  }
  function progressHtml(msg, pct) {
    return '<div class="note" style="margin-bottom:10px">' + esc(msg) + '</div>' +
      '<div class="progress"><i style="width:' + (pct == null ? 12 : pct) + '%"></i></div>' +
      (pct == null ? '<div class="note" style="margin-top:8px">Working…</div>' : '');
  }

  function download(name, text) {
    var blob = new Blob([text], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a"); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* ---- usage counting (GoatCounter) ----------------------------------- */
  // Fire-and-forget. count.js may be blocked, offline or missing — every call
  // is wrapped so the app cannot tell the difference. Paths are aggregated
  // (every profile is "/profile") so the dashboard reads as tabs, not as 245
  // manager names.
  var lastTracked = null;
  // GoatCounter's own opt-out key: count.js drops every call while it is set,
  // and the check here keeps that true whichever version of count.js loads.
  var SKIP_KEY = "skipgc";
  function countingOff() { try { return localStorage.getItem(SKIP_KEY) === "t"; } catch (e) { return false; } }
  function track(path, isEvent) {
    try {
      if (countingOff()) return;
      if (!isEvent) {
        if (path === lastTracked) return;
        lastTracked = path;
        // the league's own counter takes tab changes, whether or not
        // GoatCounter's script ever arrived
        try { if (window.GO_USAGE) window.GO_USAGE.view(path); } catch (e) {}
      }
      if (!window.goatcounter || typeof window.goatcounter.count !== "function") return;
      window.goatcounter.count({ path: path, event: !!isEvent });
    } catch (e) {}
  }

  function isMe(id) { return state.me && +id === +state.me; }

  // Which group or division holds my team. Everything with a picker opens on
  // it; without a chosen team the pickers keep their plain defaults.
  function myGroupIndex(groups) {
    if (!state.me) return -1;
    for (var i = 0; i < (groups || []).length; i++) {
      var t = groups[i].table || [];
      for (var j = 0; j < t.length; j++) if (isMe(t[j].id)) return i;
    }
    return -1;
  }
  function myDivKey(SEA) {
    if (!state.me || !SEA) return null;
    var divs = SEA.divisions || [];
    for (var i = 0; i < divs.length; i++) {
      var t = divs[i].table || divs[i].rows || [];
      for (var j = 0; j < t.length; j++) if (isMe(t[j].id)) return divs[i].key;
    }
    return null;
  }

  // "just now" / "8m ago" / "3h ago"
  function agoText(ms) {
    if (ms < 0) return "just now";
    if (Math.round(ms / 60000) < 1) return "just now";
    return spanText(ms) + " ago";
  }
  // The same length of time without the "ago", for a sentence that already
  // says when: "not synced for 40m" rather than "not synced for 40m ago".
  function spanText(ms) {
    var m = Math.round(ms / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
    if (h < 1) return m + "m";
    if (d < 1) return h + "h";
    return d + "d";
  }

  // "in 2d 4h" / "in 40m" / "closed"
  function untilText(ms) {
    if (ms <= 0) return "closed";
    var m = Math.floor(ms / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
    if (d >= 1) return "in " + d + "d " + (h % 24) + "h";
    if (h >= 1) return "in " + h + "h " + (m % 60) + "m";
    return "in " + m + "m";
  }

  /* ---- form charts --------------------------------------------------------
     A season's shape: what they scored each gameweek, and where that left them
     in the league.

     On one manager the two share a plot: bars for points, the line over them
     for position. They have no common scale, so where the two cross means
     nothing — which is why no value axis is drawn against either. Every mark
     carries its own number instead, and the numbers are the thing to read.
     Comparing two managers puts points and position in separate panels, since
     there colour already means which manager and cannot also mean which
     measure.

     Points are bars from zero, because a bar's length is its value and a
     gameweek score is a magnitude. Position is a line, because it is one
     continuous thing moving over time. Either can be switched off in the
     legend; the last one on cannot be, since an empty chart says nothing.

     Where every mark carries its own number the value axis is dropped: two
     ways of reading the same figure is one more than a chart needs. Past a
     dozen gameweeks the labels thin out to the ends and the extremes, and the
     axis comes back to carry the rest. */
  var CHART_GEOM = { w: 320, padL: 10, padR: 10, top: 18, gap: 32, foot: 26 };

  function formShown() {
    var s = state.formShow || (state.formShow = { p: true, r: true });
    if (!s.p && !s.r) s.p = true;
    return s;
  }
  function formLegend(items) {
    return '<div class="lgd" role="group" aria-label="Series">' + items.map(function (it) {
      return '<button type="button" class="lg' + (it.on ? ' on' : '') + '" data-series="' + it.key +
        '" aria-pressed="' + (it.on ? "true" : "false") + '">' +
        '<i class="' + it.mark + '"></i>' + esc(it.label) + '</button>';
    }).join("") + '</div>';
  }
  // Every mark labelled reads well for a season so far; a full season does not,
  // so past a dozen only the ends and the extremes are called out.
  function labelRule(pts, pick) {
    if (pts.length <= 12) return function () { return true; };
    var best = 0, worst = 0;
    pts.forEach(function (p, i) {
      if (pick(p) > pick(pts[best])) best = i;
      if (pick(p) < pick(pts[worst])) worst = i;
    });
    return function (i) { return i === 0 || i === pts.length - 1 || i === best || i === worst; };
  }
  function gwAxis(pts, x, y) {
    var every = Math.max(1, Math.ceil(pts.length / 7));
    // "GW3" says what the number is; over a full season there is only room for
    // the number itself, and by then the axis is unmistakable
    var pre = pts.length <= 12 ? "GW" : "";
    return pts.map(function (p, i) {
      if (i !== 0 && i !== pts.length - 1 && i % every) return "";
      return '<text class="axG" x="' + x(i).toFixed(1) + '" y="' + y + '">' + pre + p.gw + '</text>';
    }).join("");
  }
  // One column per gameweek, the full height of the chart: a tap anywhere in it
  // reads out that week rather than asking for a mark to be hit exactly.
  function gwHits(pts, x, top, bottom, text) {
    var half = pts.length > 1 ? (x(1) - x(0)) / 2 : CHART_GEOM.w / 2;
    return pts.map(function (p, i) {
      return '<rect class="hit" x="' + (x(i) - half).toFixed(1) + '" y="' + top +
        '" width="' + (half * 2).toFixed(1) + '" height="' + (bottom - top).toFixed(1) +
        '"><title>' + esc(text(p)) + '</title></rect>';
    }).join("");
  }
  function barGeom(x, n, slots) {
    var step = n > 1 ? x(1) - x(0) : CHART_GEOM.w / 2;
    var band = Math.max(6, Math.min(30, step * 0.66));
    var w = slots > 1 ? Math.max(4, (band - 2) / slots) : band;
    return { w: w, band: band };
  }

  function formChart(pts) {
    if (!pts || !pts.length) return "";
    if (pts.length < 2) {
      var one = pts[0];
      return '<div class="sparkone"><span class="v">' + num(one.p) + '</span>' +
        '<span class="l">GW' + one.gw + (one.r ? ' \u00b7 ' + ord(one.r) + ' of ' + num(one.of) : '') +
        ' \u2014 a chart needs more than one gameweek</span></div>';
    }
    var show = formShown();
    var ranked = pts.filter(function (p) { return p.r; });
    var hasR = ranked.length > 1;
    var onP = show.p, onR = hasR && show.r;
    if (!onP && !onR) onP = true;

    var G = CHART_GEOM;
    var plotH = 162;
    var H = G.top + plotH + G.foot;
    var top = G.top, bot = top + plotH;
    var x0 = G.padL + 16, x1 = G.w - G.padR - 16;
    function x(i) { return x0 + (i * (x1 - x0)) / (pts.length - 1); }
    var labelAll = pts.length <= 12;

    var vals = pts.map(function (p) { return p.p; });
    var hi = Math.max.apply(null, vals), lo = Math.min(0, Math.min.apply(null, vals));
    if (hi === lo) hi = lo + 1;
    var yP = function (v) { return bot - ((v - lo) / (hi - lo)) * (plotH - 20); };
    var zero = yP(0);
    var avg = vals.reduce(function (t, v) { return t + v; }, 0) / vals.length;

    var rv = ranked.map(function (p) { return p.r; });
    var best = rv.length ? Math.min.apply(null, rv) : 0;
    var worst = rv.length ? Math.max.apply(null, rv) : 1;
    if (worst === best) worst = best + 1;
    // 1st sits at the top: better is higher, the way a league table reads. The
    // band is inset so a label above the highest dot and below the lowest both
    // stay inside the plot.
    var yR = function (v) { return top + 16 + ((v - best) / (worst - best)) * (plotH - 46); };

    var bg = barGeom(x, pts.length, 1);
    var body = "", labels = "";
    var barTop = [];
    if (onP) {
      body += '<line class="avg" x1="' + x0 + '" x2="' + x1 + '" y1="' + yP(avg).toFixed(1) +
        '" y2="' + yP(avg).toFixed(1) + '"/>';
      var labP = labelRule(pts, function (p) { return p.p; });
      pts.forEach(function (p, i) {
        var yv = yP(p.p), h = Math.abs(zero - yv), y = Math.min(zero, yv);
        barTop[i] = y;
        body += '<rect class="barP" x="' + (x(i) - bg.w / 2).toFixed(1) + '" y="' + y.toFixed(1) +
          '" width="' + bg.w.toFixed(1) + '" height="' + Math.max(1, h).toFixed(1) + '" rx="3"/>';
        if (labP(i)) {
          labels += '<text class="dlP" x="' + x(i).toFixed(1) + '" y="' + (y - 5).toFixed(1) +
            '">' + num(p.p) + '</text>';
        }
      });
    }
    if (onR) {
      // the line is drawn over the bars, never under them
      var seg = [];
      pts.forEach(function (p, i) {
        if (!p.r) return;
        seg.push((seg.length ? "L" : "M") + x(i).toFixed(1) + " " + yR(p.r).toFixed(1));
      });
      body += '<path class="lnR" d="' + seg.join(" ") + '"/>';
      var labR = labelRule(pts, function (p) { return -(p.r || worst); });
      pts.forEach(function (p, i) {
        if (!p.r) return;
        var y = yR(p.r);
        body += '<circle class="mkR" cx="' + x(i).toFixed(1) + '" cy="' + y.toFixed(1) + '" r="4"/>';
        if (!labR(i)) return;
        // Below the dot by default. Where a bar top is close above it the two
        // numbers would sit on each other, so this one goes above instead —
        // every label has a surface halo, so either side stays readable.
        var flip = onP && barTop[i] != null && y <= barTop[i] && (barTop[i] - y) < 26;
        labels += '<text class="dlR" x="' + x(i).toFixed(1) + '" y="' +
          (flip ? (y - 9) : (y + 15)).toFixed(1) + '">' + esc(ord(p.r)) + '</text>';
      });
    }

    var axes = "";
    if (!labelAll) {
      if (onP) axes += '<text class="axV" x="' + (x0 - 8) + '" y="' + (top + 8) + '">' + num(hi) + '</text>';
      if (onR) axes += '<text class="axV" x="' + (x0 - 8) + '" y="' + (bot - 2) + '">' + esc(ord(worst)) + '</text>';
    }

    var legend = formLegend([
      { key: "p", label: "Points", mark: "bar", on: onP }
    ].concat(hasR ? [{ key: "r", label: "League position", mark: "dot", on: onR }] : []));

    return '<div class="fchart">' + legend +
      '<svg viewBox="0 0 ' + G.w + ' ' + H + '" role="img" aria-label="Gameweek points' +
        (hasR ? ' and league position' : '') + ' from GW' + pts[0].gw + ' to GW' + pts[pts.length - 1].gw + '">' +
        body + labels + axes + gwAxis(pts, x, H - 8) +
        gwHits(pts, x, G.top - 10, bot + 6, function (p) {
          return "GW" + p.gw + ": " + num(p.p) + " pts" +
            (p.r ? " \u00b7 " + ord(p.r) + " of " + num(p.of) : "");
        }) +
      '</svg></div>';
  }

  /* One tile of the Gameweek tab across the whole season: a bar per gameweek,
     the week the tab is on marked, the live week hatched because its figure is
     still moving, and under it the same numbers as a list with the manager or
     player each belongs to. Every figure is the tab's own for that week. */
  function openTrend(key) {
    var ds = S.dataset(), meta = K.SERIES[key];
    if (!ds || !meta) return;
    var all = K.gwSeries(ds);
    var pts = all ? all.series[key] : [];
    var cur = +state.statsGw;
    modal(meta.label, trendHtml(key, meta, pts, cur));
    // the bars read out their week; a name in the list opens who it was,
    // through the same tap handler every manager's name in the app uses
    track("/trend", true);
  }
  function trendHtml(key, meta, pts, cur) {
    var have = pts.filter(function (p) { return p.v !== null; });
    if (!have.length) return '<div class="callout">Nothing to chart yet.</div>';
    var h = '';
    if (meta.note) h += '<div class="note" style="margin:-4px 0 10px">' + esc(meta.note) + '</div>';
    if (have.length < 2) {
      var one = have[0];
      h += '<div class="sparkone"><span class="v">' + num(one.v) + '</span>' +
        '<span class="l">GW' + one.gw + (one.who ? ' \u00b7 ' + esc(one.who) : '') +
        ' \u2014 a chart needs more than one gameweek</span></div>';
    } else {
      h += trendChart(pts, cur, meta.unit);
    }
    // the same season as a list, newest first, the week the tab is on marked
    h += '<div class="trlist">' + pts.slice().reverse().map(function (p) {
      var val = p.v === null ? '\u2014' : num(p.v);
      return '<div class="trrow' + (p.gw === cur ? ' on' : '') + '">' +
        '<span class="trgw">GW' + p.gw + (p.live ? ' <span class="pill live">Live</span>' : '') + '</span>' +
        '<span class="trwho"' + (p.id ? ' data-entry="' + p.id + '" role="button" tabindex="0"' : '') + '>' + esc(p.who) + '</span>' +
        '<span class="trv">' + val + '</span></div>';
    }).join("") + '</div>';
    return h;
  }
  function trendChart(pts, cur, unit) {
    var G = CHART_GEOM, plotH = 150;
    var H = G.top + plotH + G.foot;
    var top = G.top, bot = top + plotH;
    var x0 = G.padL + 16, x1 = G.w - G.padR - 16;
    var x = function (i) { return x0 + (i * (x1 - x0)) / (pts.length - 1); };
    var vals = pts.map(function (p) { return p.v === null ? 0 : p.v; });
    var hi = Math.max(0, Math.max.apply(null, vals)), lo = Math.min(0, Math.min.apply(null, vals));
    if (hi === lo) hi = lo + 1;
    var yP = function (v) { return bot - ((v - lo) / (hi - lo)) * (plotH - 20); };
    var zero = yP(0);
    var bg = barGeom(x, pts.length, 1);
    var lab = labelRule(pts, function (p) { return p.v === null ? -Infinity : p.v; });
    var body = "", labels = "";
    body += '<defs><pattern id="trhatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
      '<rect width="4" height="4" fill="var(--card-bg)"/><rect width="2" height="4" fill="var(--chart-a)"/></pattern></defs>';
    body += '<line class="base" x1="' + x0 + '" x2="' + x1 + '" y1="' + zero.toFixed(1) + '" y2="' + zero.toFixed(1) + '"/>';
    pts.forEach(function (p, i) {
      if (p.v === null) return;
      var yv = yP(p.v), hh = Math.abs(zero - yv), y = Math.min(zero, yv);
      body += '<rect class="barP' + (p.live ? ' live' : '') + (p.gw === cur ? ' on' : '') + '" x="' + (x(i) - bg.w / 2).toFixed(1) +
        '" y="' + y.toFixed(1) + '" width="' + bg.w.toFixed(1) + '" height="' + Math.max(1, hh).toFixed(1) + '" rx="3"/>';
      if (lab(i) || p.gw === cur) {
        labels += '<text class="dlP" x="' + x(i).toFixed(1) + '" y="' + (p.v < 0 ? (y + hh + 11) : (y - 5)).toFixed(1) + '">' + num(p.v) + '</text>';
      }
    });
    // the week the tab is on, marked under its label
    var ci = pts.findIndex(function (p) { return p.gw === cur; });
    var mark = ci >= 0 ? '<path class="cur" d="M' + (x(ci) - 4).toFixed(1) + ' ' + (H - 3) + ' l4 -5 l4 5 Z"/>' : '';
    return '<div class="fchart trchart"><svg viewBox="0 0 ' + G.w + ' ' + H + '" role="img" aria-label="' +
      esc(unit) + ' by gameweek from GW' + pts[0].gw + ' to GW' + pts[pts.length - 1].gw + '">' +
      body + labels + mark + gwAxis(pts, x, H - 8) +
      gwHits(pts, x, G.top - 10, bot + 6, function (p) {
        return "GW" + p.gw + ": " + (p.v === null ? "\u2014" : num(p.v) + " " + unit) + (p.who ? " \u00b7 " + p.who : "") + (p.live ? " (live)" : "");
      }) + '</svg></div>';
  }

  /* The same season, two managers. Points are grouped bars — one pair per
     gameweek, so the comparison is a length against a length — and position is
     a line each. Colour carries who, never which measure; the panels say that.
     Either manager can be switched off in the legend. */
  function formCompare(fa, fb, aName, bName) {
    var byGw = {};
    fa.forEach(function (p) { (byGw[p.gw] = byGw[p.gw] || {}).a = p; });
    fb.forEach(function (p) { (byGw[p.gw] = byGw[p.gw] || {}).b = p; });
    var gws = Object.keys(byGw).map(Number).sort(function (m, n) { return m - n; });
    if (gws.length < 2) return '<div class="note">A chart needs more than one gameweek.</div>';
    var pts = gws.map(function (g) { return { gw: g, a: byGw[g].a || null, b: byGw[g].b || null }; });

    var show = state.cmpShow || (state.cmpShow = { a: true, b: true });
    if (!show.a && !show.b) show.a = true;
    var sides = [{ k: "a", name: aName, on: show.a }, { k: "b", name: bName, on: show.b }]
      .filter(function (s) { return s.on; });

    var G = CHART_GEOM;
    var hP = 104, hR = 76;
    // the caption sits above each panel, and the closing position is printed
    // past the end of its line, so both need their own room
    var H = G.top + hP + G.gap + hR + G.foot;
    var x0 = G.padL + 16, x1 = G.w - G.padR - 16;
    function x(i) { return x0 + (i * (x1 - x0)) / (pts.length - 1); }

    var vals = [];
    pts.forEach(function (p) { sides.forEach(function (s) { if (p[s.k]) vals.push(p[s.k].p); }); });
    var hi = vals.length ? Math.max.apply(null, vals) : 1;
    var lo = Math.min(0, vals.length ? Math.min.apply(null, vals) : 0);
    if (hi === lo) hi = lo + 1;
    var top = G.top, bot = top + hP;
    var yP = function (v) { return bot - ((v - lo) / (hi - lo)) * (hP - 14); };
    var zero = yP(0);

    var rv = [];
    pts.forEach(function (p) { sides.forEach(function (s) { if (p[s.k] && p[s.k].r) rv.push(p[s.k].r); }); });
    var hasR = rv.length > 1;
    var best = hasR ? Math.min.apply(null, rv) : 0, worst = hasR ? Math.max.apply(null, rv) : 1;
    if (worst === best) worst = best + 1;
    var rTop = top + hP + G.gap;
    var yR = function (v) { return rTop + 14 + ((v - best) / (worst - best)) * (hR - 34); };

    var bg = barGeom(x, pts.length, sides.length);
    var body = "";
    pts.forEach(function (p, i) {
      sides.forEach(function (s, si) {
        var d = p[s.k];
        if (!d) return;
        var cx = sides.length > 1
          ? x(i) - bg.w - 1 + si * (bg.w + 2) + bg.w / 2
          : x(i);
        var yv = yP(d.p), h = Math.abs(zero - yv), y = Math.min(zero, yv);
        body += '<rect class="bar' + s.k.toUpperCase() + '" x="' + (cx - bg.w / 2).toFixed(1) +
          '" y="' + y.toFixed(1) + '" width="' + bg.w.toFixed(1) +
          '" height="' + Math.max(1, h).toFixed(1) + '" rx="3"/>';
      });
    });
    // Every bar carries its own number, each over the bar it belongs to. Past a
    // dozen gameweeks two numbers a week stops fitting, so the labels thin to
    // the ends and the extremes the way they do on a single manager's chart.
    var labP = labelRule(pts, function (p) {
      return Math.max(p.a ? p.a.p : -Infinity, p.b ? p.b.p : -Infinity);
    });
    pts.forEach(function (p, i) {
      if (!labP(i)) return;
      sides.forEach(function (s, si) {
        var d = p[s.k];
        if (!d) return;
        var cx = sides.length > 1
          ? x(i) - bg.w - 1 + si * (bg.w + 2) + bg.w / 2
          : x(i);
        body += '<text class="dlW ' + s.k + '" x="' + cx.toFixed(1) + '" y="' +
          (yP(d.p) - 5).toFixed(1) + '">' + num(d.p) + '</text>';
      });
    });
    if (hasR) {
      sides.forEach(function (s) {
        var seg = [];
        pts.forEach(function (p, i) {
          var d = p[s.k];
          if (!d || !d.r) return;
          seg.push((seg.length ? "L" : "M") + x(i).toFixed(1) + " " + yR(d.r).toFixed(1));
        });
        if (seg.length > 1) body += '<path class="ln' + s.k.toUpperCase() + '" d="' + seg.join(" ") + '"/>';
        pts.forEach(function (p, i) {
          var d = p[s.k];
          if (!d || !d.r) return;
          body += '<circle class="mk' + s.k.toUpperCase() + '" cx="' + x(i).toFixed(1) +
            '" cy="' + yR(d.r).toFixed(1) + '" r="3.6"/>';
        });
      });
      // Every position carries its number too. Two managers a place apart put
      // their dots almost on top of each other, so within each gameweek the
      // higher dot labels above and the lower one below. Assigning a side per
      // manager instead breaks the moment their lines cross: the one meant to
      // label upwards is now underneath, and the two numbers meet in the
      // middle.
      var labR = labelRule(pts, function (p) {
        return -Math.min(p.a && p.a.r ? p.a.r : worst, p.b && p.b.r ? p.b.r : worst);
      });
      pts.forEach(function (p, i) {
        if (!labR(i)) return;
        var here = sides.map(function (s) { return { k: s.k, d: p[s.k] }; })
          .filter(function (o) { return o.d && o.d.r; });
        here.sort(function (m, n) { return yR(m.d.r) - yR(n.d.r); });
        here.forEach(function (o, idx) {
          var up = idx === 0;
          body += '<text class="dlR ' + o.k + '" x="' + x(i).toFixed(1) + '" y="' +
            (yR(o.d.r) + (up ? -9 : 15)).toFixed(1) + '">' + esc(ord(o.d.r)) + '</text>';
        });
      });
    }

    var caps = '<text class="pnl" x="' + G.padL + '" y="' + (G.top - 6) + '">Points a gameweek</text>';
    if (hasR) caps += '<text class="pnl" x="' + G.padL + '" y="' + (rTop - 10) + '">League position</text>';

    var legend = '<div class="lgd" role="group" aria-label="Managers">' +
      [{ k: "a", n: aName, on: show.a }, { k: "b", n: bName, on: show.b }].map(function (s) {
        return '<button type="button" class="lg ' + s.k + (s.on ? " on" : "") +
          '" data-side="' + s.k + '" aria-pressed="' + (s.on ? "true" : "false") + '">' +
          '<i class="bar"></i>' + esc(s.n) + '</button>';
      }).join("") + '</div>';

    return '<div class="fchart cmpchart">' + legend +
      '<svg viewBox="0 0 ' + G.w + ' ' + H + '" role="img" aria-label="Points and league position by gameweek for ' +
        esc(aName) + ' and ' + esc(bName) + '">' +
        caps + body + gwAxis(pts, x, H - 8) +
        gwHits(pts, x, G.top - 10, H - G.foot, function (p) {
          var bits = ["GW" + p.gw];
          if (p.a) bits.push(aName + ": " + num(p.a.p) + (p.a.r ? " · " + ord(p.a.r) : ""));
          if (p.b) bits.push(bName + ": " + num(p.b.p) + (p.b.r ? " · " + ord(p.b.r) : ""));
          return bits.join("  ");
        }) +
      '</svg></div>';
  }

  // 1st, 2nd, 3rd — a league position reads as a position, not a count.
  function ord(n) {
    if (n == null) return "";
    var t = n % 100;
    var suf = (t >= 11 && t <= 13) ? "th"
            : ({ 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th");
    return num(n) + suf;
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
