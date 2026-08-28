/* ==========================================================================
   app.js — UI: tabs, rendering for every competition, refresh flow, admin.
   ========================================================================== */
(function () {
  "use strict";

  var S = window.GO_STORE, K = window.GO_COMPUTE;
  var ME_KEY = "go12.me", THEME_KEY = "go12.theme";
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
    book: '<path d="M5 4.5A2 2 0 0 1 7 3h11v15H7a2 2 0 0 0-2 2V4.5Z"/><path d="M5 18.5A2 2 0 0 0 7 21h11"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M20 12a8 8 0 0 0-.12-1.36l1.9-1.48-2-3.46-2.24.9a7.9 7.9 0 0 0-2.36-1.36L14.7 3h-4L10.3 5.3a7.9 7.9 0 0 0-2.36 1.36l-2.24-.9-2 3.46 1.9 1.48A8 8 0 0 0 5.48 12a8 8 0 0 0 .12 1.36l-1.9 1.48 2 3.46 2.24-.9a7.9 7.9 0 0 0 2.36 1.36l.4 2.34h4l.4-2.34a7.9 7.9 0 0 0 2.36-1.36l2.24.9 2-3.46-1.9-1.48A8 8 0 0 0 20 12Z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11.2v5M12 7.8h.01"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    person: '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>',
    sync: '<path d="M20 11a8 8 0 0 0-14.3-4.4M4 13a8 8 0 0 0 14.3 4.4"/><path d="M5 3v4h4M19 21v-4h-4"/>'
  };
  function svg(name, size) {
    return '<svg viewBox="0 0 24 24" width="' + (size || 24) + '" height="' + (size || 24) +
      '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
      (ICONS[name] || "") + '</svg>';
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
    { id: "monthly", label: "Monthly", icon: "monthly" },
    { id: "lms",     label: "LMS",     icon: "lms" },
    { id: "pyramid", label: "Pyramid", icon: "pyramid" },
    { id: "h2h",     label: "UCL",     icon: "h2h" }
  ];

  /* ---- tiny DOM/util helpers ------------------------------------------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function num(n) { if (n == null || isNaN(n)) return "—"; return Number(n).toLocaleString("en-US"); }
  // Experience points. Bare inside a table whose column head already says XP;
  // xpa() carries the unit for anything standing on its own. Plain grouping —
  // nothing about these figures should read as a currency.
  function xp(n) { return num(n); }
  function xpa(n) { return n == null || isNaN(n) ? "\u2014" : num(n) + " XP"; }
  function lsGet(k) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
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
    var n = { done: 0, live: 0, upcoming: 0 };
    var chips = gws.map(function (g) {
      var s = statusFn(g); n[s]++;
      return '<span class="gwchip ' + s + '" title="' + s + '">' + g + '</span>';
    }).join("");
    var parts = [];
    if (n.done) parts.push('<span class="lg done"></span>' + n.done + ' done');
    if (n.live) parts.push('<span class="lg live"></span>' + n.live + ' live');
    if (n.upcoming) parts.push('<span class="lg upcoming"></span>' + n.upcoming + ' upcoming');
    return '<div class="gwchips">' + chips + '</div>' +
      '<div class="gwlegend">' + gws.length + ' GWs · ' + parts.join(" · ") + '</div>';
  }

  function toast(msg) {
    var t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("show"); }, 2600);
  }
  function modal(title, bodyHtml) {
    $("#modalTitle").textContent = title; $("#modalBody").innerHTML = bodyHtml;
    $("#modalBack").classList.add("show");
    return $("#modalBody");
  }
  function closeModal() { $("#modalBack").classList.remove("show"); }

  /* ---- profile sheet --------------------------------------------------- */
  function isAdmin() {
    try { if (/[?&]admin(=|&|$)/.test(location.search)) lsSet("go12.admin", true); } catch (e) {}
    return !!lsGet("go12.admin");
  }

  // The drawer opens *you*: who you are first, then your things, then the
  // league's, then anything administrative, and the theme last — it is set
  // once and then wants to be out of the way.
  function openProfile(opts) {
    var ds = S.dataset();
    var admin = isAdmin();
    var theme = getTheme();
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

    // 2 — your things
    if (me) {
      h += '<div class="menu"><div class="lab-sm">You</div>' +
        menuItem("pfMine", "person", "My profile") +
        menuItem("pfMyCompare", "h2h", "Compare me with someone") +
        '</div>';
    }

    // 3 — the league
    h += '<div class="menu"><div class="lab-sm">League</div>' +
      menuItem("pfStats", "classic", "Stats & highlights") +
      menuItem("pfCompare", "h2h", "Head to head") +
      menuItem("pfRules", "book", "Game rules") +
      '</div>';

    // 4 — admin, for whoever runs the league
    if (admin) {
      h += '<div class="menu"><div class="lab-sm">Admin</div>' +
        menuItem("pfRefresh", "refresh", "Refresh from FPL") +
        menuItem("pfSettings", "gear", "League settings") +
        '<div class="divider"></div>' +
        menuItem("pfExport", "download", "Export data file") +
        menuItem("pfImport", "upload", "Import data file") +
        '</div>';
    }

    // 5 — preferences, kept at the bottom: set once, then out of the way
    h += '<div class="menu"><div class="lab-sm">Appearance</div>' +
      '<div class="seg" id="pfTheme">' +
      segBtn("system", "auto", "System", theme) +
      segBtn("light", "sun", "Light", theme) +
      segBtn("dark", "moon", "Dark", theme) +
      '</div></div>';

    // 6 — where the numbers came from
    h += '<div class="pffoot">' +
      (ds ? ("Updated " + new Date(ds.updatedAt).toLocaleString() +
             " · " + num(ds.managers.length) + " managers")
          : "Standings not loaded yet") +
      (admin ? '<br><span class="warn">Admin mode is on for this device.</span>' : '') +
      '</div>';

    $("#menuBody").innerHTML = sectionList() + h;
    $all(".menuitem", $("#menuBody")).forEach(function (b) {
      b.addEventListener("click", function () {
        closeProfile();
        location.hash = b.getAttribute("data-go");
      });
    });
    $("#menuBack").classList.add("show");

    $all("#pfTheme button").forEach(function (b) {
      b.addEventListener("click", function () { applyTheme(b.getAttribute("data-th")); openProfile({ edit: editing }); });
    });
    function go(hash) { closeProfile(); location.hash = hash; }
    $("#pfStats").addEventListener("click", function () { go("stats"); });
    $("#pfCompare").addEventListener("click", function () { go("compare"); });
    $("#pfRules").addEventListener("click", function () { go("rules"); });
    if (me) {
      $("#pfMine").addEventListener("click", function () { go("profile/" + state.me); });
      $("#pfMyCompare").addEventListener("click", function () {
        state.cmpA = state.me; go("compare");
      });
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
  function closeProfile() { $("#menuBack").classList.remove("show"); }
  function segBtn(val, icon, label, cur) {
    return '<button data-th="' + val + '" class="' + (cur === val ? "on" : "") + '">' + svg(icon, 16) + label + '</button>';
  }
  function menuItem(id, icon, label) {
    return '<button id="' + id + '">' + svg(icon, 19) + esc(label) + '</button>';
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

  function priceRows(rows, tracked, scale) {
    return rows.map(function (r) {
      var dir = progressCell(r, scale);
      return '<tr><td class="name"><span class="who">' + esc(r.name) + '</span>' +
        '<div class="mgr">' + esc(r.pos) + ' \u00b7 ' + esc(r.team) + '</div></td>' +
        '<td class="num"><b>' + r.price.toFixed(1) + '</b></td>' +
        '<td class="num">' + r.owned.toFixed(1) + '%</td>' +
        '<td class="num">' + (r.goOwned == null ? '\u2013'
            : '<b>' + r.goOwned.toFixed(1) + '%</b>') + '</td>' +
        (tracked ? '<td class="num">' + dir + '</td>' : '') + '</tr>';
    }).join("");
  }

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
    // Before the threshold is known the bar is scaled to the strongest pressure
    // in the whole list, not the filtered view, so filtering or searching never
    // changes how far along anyone looks.
    var scale = thr.measured ? 0 : rows.reduce(function (m, r) {
      return Math.max(m, Math.abs(r.pressure || 0));
    }, 0);
    // Nothing to say yet: on the very first capture there is no threshold and
    // no flow either, and a column of dashes reads as broken rather than early.
    var tracked = rows.some(function (r) { return r.pressure != null; }) &&
      (thr.measured || scale > 0);
    if (!state.pricePos) state.pricePos = "all";

    // Each column knows how to order itself and which way round it should read
    // the first time you tap it: names run A to Z, numbers put the biggest
    // first, since that is what anyone opening this table came to see.
    var COLS = [
      { k: "name",  t: "Player",  first: 1,
        cmp: function (a, b) { return COLL.compare(a.name, b.name); } },
      { k: "price", t: "Price",   num: 1, first: -1,
        cmp: function (a, b) { return a.price - b.price; } },
      { k: "owned", t: "FPL",     num: 1, first: -1,
        cmp: function (a, b) { return a.owned - b.owned; } },
      { k: "go",    t: "Game On", num: 1, first: -1,
        cmp: function (a, b) { return (a.goOwned || 0) - (b.goOwned || 0); } }
    ];
    if (tracked) COLS.push({ k: "move", t: thr.measured ? "Progress" : "Pressure", num: 1, first: -1,
      cmp: function (a, b) { return (a.pressure || 0) - (b.pressure || 0); } });

    var colOf = function (k) {
      for (var i = 0; i < COLS.length; i++) if (COLS[i].k === k) return COLS[i];
      return null;
    };
    // A column that has gone away (Moving, before there is movement) must not
    // leave the table sorted by something it can no longer show a header for.
    if (!colOf(state.priceSort)) { state.priceSort = "price"; state.priceDir = 0; }
    if (!state.priceDir) state.priceDir = colOf(state.priceSort).first;

    var poss = { all: "All", 1: "GK", 2: "DEF", 3: "MID", 4: "FWD" };
    var h = '<div class="pickrow">' +
      '<select class="in narrow" id="prPos">' + Object.keys(poss).map(function (k) {
        return '<option value="' + k + '"' + (k === state.pricePos ? ' selected' : '') + '>' + esc(poss[k]) + '</option>';
      }).join("") + '</select>' +
      searchBox("prSearch") + '</div>';
    h += '<div id="prPanel"></div>';
    host.innerHTML = h;

    // Every player is in the table, so nobody is unreachable by scrolling. But
    // laying out 600 rows before the first paint cost more than two seconds on a
    // slow phone, so the rows that fit go in first and the rest follow on the
    // next frame — by which time the reader is still looking at the top of a
    // list they can already scroll and sort.
    var FIRST = 80, pending = 0, gen = 0;
    var draw = function () {
      gen++;
      if (pending) { cancelAnimationFrame(pending); pending = 0; }
      var list = rows.slice();
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
        return '<th class="sortable' + (c.num ? " num" : "") + (on ? " sorted" : "") +
          '" data-sort="' + c.k + '" role="button" tabindex="0" aria-sort="' +
          (on ? (dir === 1 ? "ascending" : "descending") : "none") + '">' +
          esc(c.t) + '<span class="sarrow">' + arrow + '</span></th>';
      }).join("");

      var panel = $("#prPanel", host);
      // "freeze" alone, as the league tables use it: .card carries overflow:hidden
      // and wins on order, which left the rows unreachable by any gesture even
      // though scrollTop still moved them from script.
      panel.innerHTML = '<div class="freeze"><table class="t pricetbl"><thead><tr>' +
        head + '</tr></thead><tbody>' + priceRows(list.slice(0, FIRST), tracked, scale) + '</tbody></table></div>' +
        (list.length ? '' : '<div class="callout nohits">No player matches that search.</div>') +
        (tracked && !thr.measured
          ? '<div class="koline">Pressure orders who is being bought and sold hardest. ' +
            'It becomes a distance to a price change once we have seen a night of real ' +
            'changes to measure the level against \u2014 FPL does not publish it.</div>'
          : '');

      if (list.length > FIRST) {
        var mine = gen, body = $("tbody", panel);
        pending = requestAnimationFrame(function () {
          pending = 0;
          // A tap or a keystroke while this was queued has already redrawn the
          // table; appending the rest of a list nobody is looking at any more
          // would mix two sorts together.
          if (mine !== gen || !body.parentNode) return;
          body.insertAdjacentHTML("beforeend", priceRows(list.slice(FIRST), tracked, scale));
        });
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

  /* ---- the section menu -------------------------------------------------- */
  // Sections, shown above everything the gear used to hold — one menu, not two.
  function sectionList() {
    var here = state.view;
    // Coming back should land where the reader left, not always on Classic.
    var backTo = TABS.map(function (t) { return t.id; }).indexOf(state.backView) === -1
      ? "classic" : state.backView;
    var items = [
      { k: "league", go: backTo, t: "Game On tournament", s: "Classic, Monthly, LMS, Pyramid and UCL" },
      { k: "prices", go: "prices", t: "Player prices", s: "Price, ownership and which way it is moving" }
    ];
    var inLeague = here !== "prices";
    return '<div class="menu"><div class="lab-sm">Sections</div>' +
      '<div class="menulist">' + items.map(function (it) {
        var on = (it.k === "league") ? inLeague : (here === it.k);
        return '<button type="button" class="menuitem' + (on ? " on" : "") + '" data-go="' + it.go + '">' +
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
    return $("#modalBack").classList.contains("show") || $("#menuBack").classList.contains("show");
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
      keepPlace(render);
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
  var liveTimer = null, liveBusy = false;
  function scheduleLive() {
    clearTimeout(liveTimer);
    liveTimer = setTimeout(tickLive, LIVE_MS);
  }
  function tickLive() {
    var ds = S.dataset();
    if (liveBusy || document.hidden || busyReading() || !ds || !K.liveGwId(ds)) { scheduleLive(); return; }
    liveBusy = true;
    S.liveOverlay().then(function (changed) {
      liveBusy = false;
      if (changed && !busyReading()) keepPlace(render);
      scheduleLive();
    }, function () { liveBusy = false; scheduleLive(); });
  }

  // Coming back to the app is when the numbers are most likely stale: phones
  // suspend timers the moment it goes into the background.
  function onForeground() {
    if (document.hidden) { clearTimeout(autoTimer); return; }
    updateBanner();
    if (Date.now() - autoLast < AUTO_MIN_GAP) { scheduleAuto(); return; }
    autoCheck().then(scheduleAuto, scheduleAuto);
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
    buildNav();
    measureChrome();
    var remeasure = function () { measureChrome(); };
    window.addEventListener("resize", remeasure);
    window.addEventListener("orientationchange", remeasure);
    if (window.visualViewport) window.visualViewport.addEventListener("resize", remeasure);
    isAdmin(); // persist ?admin flag on first visit
    $("#btnSync").innerHTML = svg("sync", 19);
    $("#btnSync").addEventListener("click", function () {
      var btn = this;
      if (btn.classList.contains("spin")) return;
      track("sync-tap", true);
      btn.classList.add("spin");
      var before = (S.dataset() || {}).updatedAt;
      // The fetch can finish in tens of milliseconds, which would flash the
      // spinner too briefly to register as anything. Hold it for one full turn
      // so the tap visibly does something.
      var spun = new Promise(function (r) { setTimeout(r, 600); });
      var work = S.reload().then(
        function (ds) { return { ok: true, changed: ds && ds.updatedAt !== before }; },
        function () { return { ok: false }; }
      );
      Promise.all([work, spun]).then(function (res) {
        var out = res[0];
        btn.classList.remove("spin");
        if (!out.ok) { toast("Could not reach the league data"); return; }
        render();
        toast(out.changed ? "Updated" : "Already up to date");
      });
    });
    $("#barBack").addEventListener("click", function () {
      if (state.view === "rules" && state.rulesBack) { location.hash = state.rulesBack; return; }
      goBack();
    });
    $("#barInfo").innerHTML = svg("info", 18);
    $("#barMenu").innerHTML = svg("menu", 19);
    $("#barMenu").addEventListener("click", function () { openProfile(); });
    $("#modalClose").addEventListener("click", closeModal);
    $("#modalBack").addEventListener("click", function (e) { if (e.target === $("#modalBack")) closeModal(); });
    $("#menuBack").addEventListener("click", function (e) { if (e.target === $("#menuBack")) closeProfile(); });
    document.addEventListener("click", function (e) {
      if (!e.target.closest) return;
      var b = e.target.closest("[data-rules]");
      if (b) { location.hash = "rules/" + b.getAttribute("data-rules"); return; }
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
    window.addEventListener("pageshow", function (e) { if (e.persisted) onForeground(); });
    window.addEventListener("focus", onForeground);

    S.load().then(function () {
      syncFromHash();
      updateDataState();
      scheduleAuto();
      scheduleLive();
    });
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

  function syncFromHash() {
    var h = (location.hash || "#classic").replace("#", "");
    var parts = h.split("/");
    var view = parts[0];
    var known = TABS.map(function (t) { return t.id; })
      .concat(["rules", "settings", "profile", "compare", "stats", "prices"]);
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
    state.view = view;
    if (view === "monthly" && parts[1]) state.monthKey = parts[1];
    if (view === "pyramid" && parts[1]) state.seasonKey = parts[1];
    if (view === "profile") state.profileId = parts[1] || null;
    state.rulesTopic = (view === "rules") ? (parts[1] || null) : state.rulesTopic;
    track(view === "rules" && parts[1] ? "/rules/" + parts[1] : "/" + view);
    render();
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
    var fill = ["classic", "monthly", "lms", "pyramid", "h2h", "prices"].indexOf(state.view) !== -1;
    setFill(fill);
    updateBanner();
  }

  var VIEW_META = {
    classic: { t: "Classic League", topic: "classic" },
    monthly: { t: "Monthly", topic: "monthly" },
    lms:     { t: "Last Manager Standing", topic: "lms" },
    pyramid: { t: "Pyramid", topic: "pyramid" },
    h2h:     { t: "Game On UCL", topic: "h2h" },
    rules:   { t: "Rules" },
    settings:{ t: "Settings" },
    profile: { t: "Profile" },
    compare: { t: "Head to head" },
    stats:   { t: "Stats & highlights" },
    prices:  { t: "Player prices" }
  };
  // Sub-views carry a back arrow in the bar; a profile also puts the manager's
  // team and name there, so the page body never repeats them.
  var SUB_VIEWS = ["profile", "rules", "compare", "stats", "settings", "prices"];
  function updateBanner() {
    var m = VIEW_META[state.view] || { t: "Game On V12" };
    var title = m.t, sub = "";
    if (state.view === "profile" && state.profileId) {
      var ds = S.dataset();
      var who = ds && K.managerMap(ds)[+state.profileId];
      // a manager's own name — escaped, it is not ours to trust as markup
      if (who) { title = who.entryName; sub = esc(who.playerName); }
    }
    // Competition tabs have no subtitle of their own, so the next deadline and
    // how old the numbers are live there, costing no extra space. On a very
    // narrow screen the sync half drops rather than truncating the deadline.
    if (!sub && TABS.some(function (t) { return t.id === state.view; })) {
      var ds2 = S.dataset();
      // While a gameweek is being played the bar names IT, not the next
      // deadline — a weekend of "GW3 in 6d" over live GW2 tables reads wrong.
      var liveNow = ds2 ? K.liveGwId(ds2) : null;
      if (liveNow) {
        sub += '<span>GW' + liveNow + ' live</span>';
      } else {
        var dl = ds2 ? K.nextDeadline(ds2) : null;
        if (dl) sub += '<span>GW' + dl.gw + ' ' + esc(untilText(dl.msLeft)) + '</span>';
      }
      if (ds2 && ds2.updatedAt) {
        sub += '<span class="syncago">' + (sub ? ' \u00b7 ' : '') + 'synced ' +
          esc(agoText(Date.now() - Date.parse(ds2.updatedAt))) + '</span>';
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
  }
  function goBack() { location.hash = state.backView || "classic"; }

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

    if (state.view === "settings") return renderSettings(host);
    if (state.view === "rules") return renderRules(host);
    if (state.view === "compare") return renderCompare(host, S.dataset());
    if (state.view === "stats") return renderStats(host, S.dataset());
    if (state.view === "prices") return renderPrices(host, S.dataset());

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
      return '<div class="empty"><div class="big">🏆</div>' +
        '<h3>Game On V12</h3>' +
        '<p class="note">Standings haven\'t loaded yet. Please check back shortly.</p>' +
        '<div class="btnrow" style="justify-content:center;margin-top:16px">' +
        '<button class="btn" id="emptyReload">Reload</button></div></div>';
    }
    var cfg = S.config();
    var hasId = !!cfg.classicLeagueId;
    return '<div class="empty"><div class="big">🏆</div>' +
      '<h3>Welcome to Game On V12</h3>' +
      '<p class="note">' + (hasId
        ? 'League ID is set. Pull the latest data from FPL to populate every tab.'
        : 'First, add your <b>Classic League ID</b> in Settings, then refresh.') + '</p>' +
      '<div class="btnrow" style="justify-content:center;margin-top:16px">' +
      (hasId ? '<button class="btn primary" id="emptyRefresh">↻ Refresh from FPL</button>' : '') +
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
  function renderClassic(host, ds) {
    var rows = K.classic(ds);
    var h = '';

    h += '<label class="field" style="margin-bottom:12px">' +
      '<input class="in" id="classicSearch" placeholder="Search manager or team…"></label>';

    h += '<div class="freeze"><table class="t"><thead><tr>' +
      '<th class="num">#</th><th>Team</th><th class="num">GW</th><th class="num">Total</th><th class="num">Move</th><th class="num">XP</th>' +
      '</tr></thead><tbody id="classicBody">' + classicRows(rows) + '</tbody></table></div>';

    host.innerHTML = h;
    var search = $("#classicSearch", host);
    search.addEventListener("input", function () {
      var q = search.value.toLowerCase().trim();
      var filtered = !q ? rows : rows.filter(function (r) {
        return (r.entryName + " " + r.playerName).toLowerCase().indexOf(q) !== -1;
      });
      $("#classicBody", host).innerHTML = classicRows(filtered);
    });
  }

  function classicRows(rows) {
    return rows.map(function (r) {
      var mv = r.move > 0 ? '<span class="move up">▲' + r.move + '</span>'
             : r.move < 0 ? '<span class="move down">▼' + Math.abs(r.move) + '</span>'
             : '<span class="move flat">–</span>';
      var rc = r.computedRank <= 3 ? "rk" + r.computedRank : "";
      // Managers still level after months won share the place and the XP,
      // so say so rather than showing an order the table cannot justify.
      var eq = r.tiedWith > 1
        ? '<span class="jt" title="Level with ' + (r.tiedWith - 1) + ' other' +
          (r.tiedWith > 2 ? 's' : '') + ' — XP shared">=</span>' : '';
      return '<tr' + (isMe(r.id) ? ' class="me"' : '') + '>' +
        '<td class="num"><span class="rankcell">' + eq + '<span class="r ' + rc + '">' + r.computedRank + '</span></span></td>' +
        '<td class="name" data-entry="' + r.id + '"><span class="who">' + esc(r.entryName) + '</span><div class="mgr">' + esc(r.playerName) + '</div></td>' +
        '<td class="num">' + num(r.eventTotal) + '</td>' +
        '<td class="num"><b>' + num(r.total) + '</b></td>' +
        '<td class="num">' + mv + '</td>' +
        '<td class="num">' + (r.prize ? '<span class="prize">' + xp(r.prize) + '</span>' : '') + '</td>' +
        '</tr>';
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
      $("#monthMeta", host).innerHTML = gwChips(M.gws, statusFn);
      $("#monthPanel", host).innerHTML = monthPanel(M);
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

    h += '<div class="freeze"><table class="t"><thead><tr><th class="num">#</th><th>Team</th><th class="num">Points</th><th class="num">Bench</th><th class="num">XP</th></tr></thead><tbody>';
    h += M.rows.map(function (r) {
      var rc = r.pos <= 3 ? "rk" + r.pos : "";
      return '<tr' + (isMe(r.id) ? ' class="me"' : '') + '><td class="num"><span class="r ' + rc + '">' + r.pos + '</span></td>' +
        '<td class="name" data-entry="' + r.id + '"><span class="who">' + esc(r.entryName) + '</span><div class="mgr">' + esc(r.playerName) + '</div></td>' +
        '<td class="num"><b>' + num(r.score) + '</b></td><td class="num">' + num(r.bench) + '</td>' +
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
      h += '<div class="card" style="margin-top:14px;border-color:var(--gold)"><div class="bd" style="text-align:center">' +
        '<div style="font-size:34px">👑</div><h3 style="margin:6px 0">' + esc(lms.champion.name) + '</h3>' +
        '<div class="note">The Last Manager Standing</div></div></div>';
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
        '<td class="num">' + elim + '</td><td class="num">' + (r.eog === 1 ? '🏆 1' : r.eog) + '</td></tr>';
    }).join("");
    return '<div class="card"><div class="tablewrap"><table class="t"><thead><tr><th>GW</th><th class="num">SOG</th><th class="num">Out</th><th class="num">EOG</th></tr></thead><tbody>' + body + '</tbody></table></div></div>';
  }
  function prizeTile(label, amount, cls) {
    return '<div class="stat"><div class="k">' + xpa(amount) + '</div><div class="l">' + esc(label) + '</div></div>';
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
        '<td class="num">' + (r.hit ? '−' + r.hit : '0') + '</td>' +
        '<td class="num">' + num(r.bench) + '</td></tr>';
    }).join("");
    return '<div class="freeze"><table class="t"><thead><tr><th>Team</th><th class="num">GW pts</th><th class="num">Played</th><th class="num">Hits</th><th class="num">Bench</th></tr></thead><tbody>' +
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
          // one group at a time reads best, so open on the first; "All groups"
          // stays on the list for anyone who wants the whole gameweek at once
          if (state.fxGroup == null || state.fxGroup === "") {
            var mfg = myGroupIndex(groups);
            state.fxGroup = String(mfg >= 0 ? mfg : 0);
          }
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
          $("#fxGroup", host).addEventListener("change", function () { state.fxGroup = this.value; drawFx(); });
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
        (B.groupEndsGw || (B.startsGw - 1)) + ' \u2014 ' +
        (B.gwsLeft === 1 ? 'one gameweek to go' : num(B.gwsLeft) + ' gameweeks to go') +
        '. The rounds and their gameweeks are below.</div>';
    }
    if (B.prizes) {
      h += '<div class="korow"><span class="pill gold">Winner ' + xpa(B.prizes.winner) + '</span>' +
        '<span class="pill">Runner-up ' + xpa(B.prizes.runnerUp) + '</span></div>';
    }
    var only = B.rounds[idx] ? [B.rounds[idx]] : B.rounds;
    h += only.map(function (r) {
      if (!r.ties.length) {
        return '<div class="koline">GW\u00a0' + r.gws.join("\u2013") +
          (r.legs === 2 ? ' \u00b7 two legs' : ' \u00b7 one leg') + '</div>' +
          '<div class="card"><div class="bd"><div class="note" style="text-align:center;padding:6px 0">' +
          'Waiting on the draw</div></div></div>';
      }
      var body = r.ties.map(function (t) {
        if (t.home !== undefined) {
          return '<div class="tie">' + '<span class="tn">' + t.n + '</span>' +
            '<div class="ts">' + koSide(t.home) + koSide(t.away) + '</div></div>';
        }
        return '<div class="tie pending"><span class="tn">' + t.n + '</span>' +
          '<div class="ts"><div class="side"><span class="nm">Winner of tie ' + t.fromA + '</span></div>' +
          '<div class="side"><span class="nm">Winner of tie ' + t.fromB + '</span></div></div></div>';
      }).join("");
      var n = r.ties.length;
      return '<div class="koline">' + n + (n === 1 ? ' tie' : ' ties') +
        ' \u00b7 GW ' + r.gws.join("\u2013") + (r.legs === 2 ? ' \u00b7 two legs' : '') + '</div>' +
        '<div class="card"><div class="bd kobody">' + body + '</div></div>';
    }).join("");
    return h;
  }
  function koSide(s) {
    if (!s) return '<div class="side"><span class="nm">\u2014</span></div>';
    // just the group's letter — the full name does not fit beside a team
    var m = /group\s+([A-Za-z0-9]+)/i.exec(s.group || "");
    var badge = (m ? m[1].toUpperCase() : "?") + " #" + s.place;
    return '<div class="side' + (isMe(s.id) ? ' me' : '') + '" data-entry="' + s.id + '"><span class="nm">' + esc(s.name) + '</span>' +
      '<span class="sd">' + esc(badge) + '</span></div>';
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
      return '<tr class="' + zone + (isMe(t.id) ? ' me' : '') + '"><td class="num">' + t.pos + '</td>' +
        '<td class="name" data-entry="' + t.id + '"><span class="who">' + esc(t.name) + '</span> ' + pill + '<div class="mgr">' + esc(t.player) + '</div></td>' +
        '<td class="num">' + t.w + '</td><td class="num">' + t.d + '</td><td class="num">' + t.l + '</td>' +
        '<td class="num"><b>' + t.pts + '</b></td><td class="num">' + num(t.gwPts) + '</td></tr>';
    }).join("");
    return '<div class="freeze"><table class="t"><thead><tr><th class="num">#</th><th>Team</th><th class="num">W</th><th class="num">D</th><th class="num">L</th><th class="num">Pts</th><th class="num">GW pts</th></tr></thead><tbody>' +
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
      '<label class="field"><span class="lab">Mini season</span><select class="in" id="pyrSeason">' +
        pyr.seasons.map(function (s) {
          return '<option value="' + s.key + '"' + (s.key === cur ? ' selected' : '') + '>' + esc(s.name) + '</option>';
        }).join("") + '</select></label>' +
      '<label class="field"><span class="lab">Division</span><select class="in" id="pyrDiv">' +
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
      $("#pyrMeta", host).innerHTML = gwChips(SEA.gws, statusFn);
      // A mini-season nobody has played yet has no table — everyone would sit
      // level on nothing, in an order that means nothing. Say it has not
      // started and say when it does.
      if (!SEA.played) {
        $("#pyrPanel", host).innerHTML =
          '<div class="callout"><b>' + esc(SEA.name) + ' has not started.</b><br>' +
          'It runs GW\u00a0' + SEA.gws[0] + '\u2013' + SEA.gws[SEA.gws.length - 1] +
          '. Divisions are set by how ' +
          (SEA.key === "s2" ? "Mini Season 1" : "the mini-season before it") +
          ' finishes, so the table appears once its first gameweek is played.</div>';
        return;
      }
      $("#pyrPanel", host).innerHTML = divisionCard(div, cfg);
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
      var badge = top ? '<span class="pill up">▲</span>'
        : (bot ? '<span class="pill down">▼</span>' : '');
      var rc = r.pos <= 3 ? "rk" + r.pos : "";
      return '<tr class="' + zone + (isMe(r.id) ? ' me' : '') + '"><td class="num"><span class="r ' + rc + '">' + r.pos + '</span></td>' +
        '<td class="name" data-entry="' + r.id + '"><span class="who">' + esc(r.name) + '</span> ' + badge + '<div class="mgr">' + esc(r.player) + '</div></td>' +
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

    h += '<div class="grid cols-4">' +
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

    /* the league's own wording, kept verbatim */
    h += '<div class="section-title"><h2>As written by the league</h2><div class="rule"></div></div>';
    h += '<div class="card"><div class="bd"><ol class="verbatim">' +
      (cfg.rules || []).map(function (r) {
        return '<li><b>' + esc(r.title) + '</b><span>' + esc(r.body) + '</span></li>';
      }).join("") + '</ol></div></div>';

    h += '<div class="section-title"><h2>Monthly XP</h2><div class="rule"></div></div>' + monthlyPrizeCard(cfg);
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
      name: "Monthly Winners", back: "monthly",
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
    return '<div class="grid cols-3">' + prizeTile("🏆 Champion", p.champion) + prizeTile("🥈 Runner-up", p.runnerUp) + prizeTile("🥉 3rd place", p.third) + '</div>';
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
  function pp(p, showPos, metric) {
    var badge = p.cap ? '<i class="pb cap">C</i>' : (p.vice ? '<i class="pb vice">V</i>' : "");
    if (p.star && metric !== "eo" && metric !== "val") badge += '<i class="pb star">★</i>';
    return '<div class="pcell">' +
      (showPos ? '<div class="pposlbl">' + esc(p.pos) + '</div>' : '') +
      '<div class="pcard">' + badge +
        '<div class="pshirt">' + jersey(p.team, p.type) + '</div>' +
        '<div class="pname">' + esc(p.name) + '</div>' +
        '<div class="ppts' + (metric && metric !== "pts" ? ' alt' : '') + '">' + esc(metricOf(p, metric)) + '</div>' +
      '</div></div>';
  }

  function pitchHtml(pit, metric) {
    var h = '<div class="pitch"><div class="pmark">' +
      '<span class="goal"></span><span class="box18"></span><span class="box6"></span>' +
      '<span class="spot"></span><span class="arc"></span><span class="halfway"></span>' +
      '<span class="circle"></span></div>';
    h += pit.lines.map(function (ln) {
      if (!ln.players.length) return "";
      return '<div class="prow">' + ln.players.map(function (p) { return pp(p, false, metric); }).join("") + '</div>';
    }).join("");
    h += '</div>';
    if (pit.bench.length) {
      h += '<div class="pbench">' + pit.bench.map(function (p) { return pp(p, true, metric); }).join("") + '</div>';
    }
    return h;
  }

  var CHIP_NAME = { bboost: "Bench Boost", "3xc": "Triple Captain", freehit: "Free Hit", wildcard: "Wildcard" };

  // The whole squad block: gameweek picker, the three stats, Pitch/List and the
  // squad itself. Re-rendered in place whenever the gameweek or mode changes.
  // The three stats above a squad change with the metric being shown.
  function pitchStats(pit, metric) {
    var left, mid, right, midLabel, leftLabel, rightLabel, hiId = null;
    if (metric === "eo") {
      leftLabel = "League avg"; left = pit.leagueAvgEo + "%";
      midLabel = "Average EO"; mid = pit.avgEo + "%";
      rightLabel = "Most owned"; right = pit.topEo + "%";
    } else if (metric === "val") {
      leftLabel = "League avg"; left = mval(pit.leagueAvgValue);
      midLabel = "Squad value"; mid = mval(pit.squadValue);
      rightLabel = "Priciest"; right = mval(pit.topPrice);
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
    return '<div class="pstats">' +
      '<div class="pstat"><div class="v">' + esc(left) + '</div><div class="l">' + leftLabel + '</div></div>' +
      '<div class="pstat main"><div class="v">' + esc(mid) + '</div><div class="l">' + midLabel + '</div></div>' +
      rightOpen + '<div class="v">' + esc(right) + '</div><div class="l">' + rightLabel + '</div></div>' +
      '</div>';
  }

  function mountPitch(box, ds, id, gw, mode, metric) {
    var gws = K.squadGws(ds);
    if (!gws.length) return;
    gw = gw || gws[gws.length - 1];
    if (gws.indexOf(+gw) === -1) gw = gws[gws.length - 1];
    var pit = K.managerPitch(ds, id, gw);
    if (!pit) {
      box.innerHTML = '<div class="callout">No squad recorded for this gameweek.</div>';
      return;
    }
    mode = mode === "list" ? "list" : "pitch";
    if (!METRICS[metric]) metric = "pts";
    state.pitchGw = +gw; state.pitchMode = mode; state.pitchMetric = metric;

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
    h += '<div class="pseg"><button type="button"' + (mode === "pitch" ? ' class="on"' : '') + ' data-mode="pitch">Pitch</button>' +
      '<button type="button"' + (mode === "list" ? ' class="on"' : '') + ' data-mode="list">List</button></div>';
    h += '<div class="pseg sm">' + Object.keys(METRICS).map(function (k) {
      return '<button type="button"' + (metric === k ? ' class="on"' : '') + ' data-metric="' + k + '">' + esc(METRICS[k]) + '</button>';
    }).join("") + '</div>';
    h += '</div>';

    h += mode === "list" ? listHtml(pit, metric) : pitchHtml(pit, metric);
    box.innerHTML = h;

    $("#pitchGwSel", box).addEventListener("change", function () {
      mountPitch(box, ds, id, +this.value, mode, metric);
    });
    $(".psegrow", box).addEventListener("click", function (e) {
      var b = e.target.closest("button[data-mode], button[data-metric]");
      if (!b) return;
      if (b.hasAttribute("data-mode")) mountPitch(box, ds, id, gw, b.getAttribute("data-mode"), metric);
      else mountPitch(box, ds, id, gw, mode, b.getAttribute("data-metric"));
    });
  }

  function listHtml(pit, metric) {
    var rows = [];
    pit.lines.forEach(function (ln) {
      ln.players.forEach(function (p) { rows.push([p, false]); });
    });
    pit.bench.forEach(function (p) { rows.push([p, true]); });
    // The list always carries all three numbers; the toggle just picks which
    // one is emphasised.
    var h = '<div class="tablewrap"><table class="t plist"><thead><tr><th></th><th>Player</th>' +
            '<th>Team</th><th class="num">Pts</th><th class="num">EO</th><th class="num">Price</th>' +
            '</tr></thead><tbody>';
    h += rows.map(function (r) {
      var p = r[0], onBench = r[1];
      var mark = p.cap ? ' <span class="pill gold">C</span>' : (p.vice ? ' <span class="pill">V</span>' : "");
      function cell(kind, val) {
        return '<td class="num' + (metric === kind || (!metric && kind === "pts") ? ' lead' : '') + '">' + esc(val) + '</td>';
      }
      return '<tr' + (onBench ? ' class="benchrow2"' : '') + '>' +
        '<td class="pcol">' + esc(p.pos) + '</td>' +
        '<td>' + esc(p.name) + mark + (onBench ? ' <span class="note">bench</span>' : '') + '</td>' +
        '<td>' + esc(p.team) + '</td>' +
        cell("pts", num(p.pts)) +
        cell("eo", p.eo + "%") +
        cell("val", "£" + (Math.round(p.price) / 10).toFixed(1) + "m") +
        '</tr>';
    }).join("");
    return h + '</tbody></table></div>';
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
    var h = isMe(id) ? '<div class="youline"><span class="pill gold">This is you</span></div>' : '';

    // One section per competition, and how near the places each one is.
    var W = K.winnings(ds, id);
    var PS = K.prizeStatus(ds, id);
    h += '<div class="section-title"><h2>XP</h2><div class="rule"></div></div>';
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
    h += '<div class="section-title"><h2>Chips</h2><div class="rule"></div></div>';
    h += '<div class="chipgrid">' + chips.map(function (c) {
      return '<div class="chipcard' + (c.used ? ' used' : '') + '">' +
        '<div class="cn">' + esc(c.label) + '</div>' +
        '<div class="cg">' + (c.used ? c.gws.map(function (g) { return "GW" + g; }).join(", ") : "unused") + '</div>' +
        '</div>';
    }).join("") + '</div>';

    // Form — the shape of their season.
    var fm = K.form(ds, id);
    if (fm.length) {
      h += '<div class="section-title"><h2>Form</h2><div class="rule"></div></div>';
      h += '<div class="card"><div class="bd">' + sparkline(fm) + '</div></div>';
    }

    // Squad on a football pitch, steppable through every gameweek played.
    var gws = K.squadGws(ds);
    if (gws.length && K.managerPitch(ds, id, gws[gws.length - 1])) {
      h += '<div class="section-title"><h2>Squad</h2><div class="rule"></div></div>';
      h += '<div class="card pitchcard"><div class="bd" id="pitchBox"></div></div>';
    }

    if (P.monthly.length) {
      h += '<div class="section-title"><h2>Monthly</h2><div class="rule"></div></div>';
      h += '<div class="card"><div class="tablewrap"><table class="t"><thead><tr><th>Month</th><th class="num">Pos</th><th class="num">Points</th><th class="num">XP</th></tr></thead><tbody>';
      h += P.monthly.map(function (m) {
        return '<tr><td>' + esc(m.label || m.name) + '</td><td class="num">' + m.pos + '</td><td class="num">' + num(m.score) + '</td>' +
          '<td class="num">' + (m.prize ? '<span class="prize">' + xp(m.prize) + '</span>' : '') + '</td></tr>';
      }).join("");
      h += '</tbody></table></div></div>';
    }

    // Every head-to-head this manager has played and has left, in the same
    // shape as the fixtures tab.
    var R = K.h2hRecord(ds, id);
    if (R) {
      h += '<div class="section-title"><h2>Head-to-head</h2><div class="rule"></div></div>';
      h += '<div class="card"><div class="h2hsum">' +
        h2hStat("Played", R.played) + h2hStat("W", R.w) + h2hStat("D", R.d) +
        h2hStat("L", R.l) + h2hStat("Points", R.pts) + h2hStat("For", R.pointsFor) +
        '</div><div class="fxwrap"><div class="fxgrp">' +
        R.rows.map(function (r) {
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
        }).join("") + '</div></div></div>';
    }

    h += '<div class="section-title"><h2>Past seasons (FPL)</h2><div class="rule"></div></div>';
    if (P.past && P.past.length) {
      h += '<div class="card"><div class="tablewrap"><table class="t"><thead><tr><th>Season</th><th class="num">Overall rank</th><th class="num">Points</th></tr></thead><tbody>';
      h += P.past.slice().reverse().map(function (s) {
        return '<tr><td>' + esc(s.season) + '</td><td class="num">' + num(s.rank) + '</td><td class="num">' + num(s.total) + '</td></tr>';
      }).join("");
      h += '</tbody></table></div></div>';
    } else {
      h += '<div class="callout">No past-season history for this manager (new to FPL, or not yet synced).</div>';
    }

    host.innerHTML = h;
    var box = $("#pitchBox", host);
    if (box) mountPitch(box, ds, id, state.pitchGw, state.pitchMode, state.pitchMetric);
  }

  /* ====================================================================== */
  /* STATS & HIGHLIGHTS                                                     */
  /* ====================================================================== */
  // Squad values arrive in tenths of a million.
  function mval(tenths) { return "£" + (Math.round(tenths) / 10).toFixed(1) + "m"; }

  // A headline card: big number, caption, and who it belongs to.
  function hcard(label, big, who, id, sub) {
    return '<div class="hcard"' + (id ? ' data-entry="' + id + '" role="button" tabindex="0"' : '') + '>' +
      '<div class="hl">' + esc(label) + '</div>' +
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

  var STAT_TABS = [
    { k: "gw",     label: "Gameweek", gwPicker: true },
    { k: "picks",  label: "Picks",    gwPicker: true },
    { k: "value",  label: "Value",    gwPicker: true },
    { k: "season", label: "Season" },
    { k: "fame",   label: "All time" }
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

    var h = '<div class="tabrow" id="stTabs">' + STAT_TABS.map(function (t) {
      return '<button type="button" class="tabbtn' + (state.statsTab === t.k ? ' on' : '') +
        '" data-tab="' + t.k + '">' + esc(t.label) + '</button>';
    }).join("") + '</div>';
    h += '<div class="pgwline" id="stGwLine" style="margin-bottom:4px">' +
      '<select class="in gwsel" id="stGwSel" aria-label="Gameweek">' + all.map(function (g) {
        return '<option value="' + g + '"' + (+g === +state.statsGw ? ' selected' : '') + '>Gameweek ' + g + '</option>';
      }).join("") + '</select></div>';
    h += '<div id="stBox"></div>';
    host.innerHTML = h;

    $("#stTabs", host).addEventListener("click", function (e) {
      var b = e.target.closest("button[data-tab]");
      if (!b) return;
      state.statsTab = b.getAttribute("data-tab");
      $all(".tabbtn", this).forEach(function (x) { x.classList.toggle("on", x === b); });
      drawStats(ds);
    });
    $("#stGwSel", host).addEventListener("change", function () { state.statsGw = +this.value; drawStats(ds); });
    drawStats(ds);
  }

  function drawStats(ds) {
    var box = $("#stBox");
    if (!box) return;
    var tab = STAT_TABS.filter(function (t) { return t.k === state.statsTab; })[0] || STAT_TABS[0];
    var line = $("#stGwLine");
    if (line) line.style.display = tab.gwPicker ? "" : "none";

    var H = K.highlights(ds, state.statsGw);
    if (!H) { box.innerHTML = '<div class="callout">Nothing to show yet.</div>'; return; }
    var fn = { gw: statsGw, picks: statsPicks, value: statsValue, season: statsSeason, fame: statsFame }[tab.k];
    box.innerHTML = fn(H, ds) || '<div class="callout">Nothing to show yet.</div>';
  }

  /* ---- one tab each ----------------------------------------------------- */
  function statsGw(H) {
    var g = H.gwStats;
    if (!g) return '<div class="callout">No scores recorded for this gameweek yet.</div>';
    var h = '<div class="statlead">' + esc(H.gwName) +
      (H.live ? ' <span class="pill live">Live</span>' : '') + '</div>';
    h += '<div class="hgrid">';
    if (H.potw) {
      h += hcard("Player of the week", num(H.potw.pts), H.potw.name, null,
        H.potw.team + (H.potw.ownedPct !== null && H.potw.ownedPct !== undefined
          ? " · " + H.potw.ownedPct + "% of the league" : ""));
    }
    h += hcard("Top score", num(g.top.p), g.top.name, g.top.id, g.top.player);
    h += hcard("League average", num(g.average), g.count + " managers", null,
      g.median !== null ? ("median " + num(g.median)) : "");
    h += hcard("Lowest score", num(g.low.p), g.low.name, g.low.id, g.low.player);
    h += hcard("Beat the average", num(g.aboveAvg), "of " + g.count + " managers", null,
      num(g.range) + " between best and worst");
    if (g.mostBench && g.mostBench.bench > 0) {
      h += hcard("Most left on bench", num(g.mostBench.bench), g.mostBench.name, g.mostBench.id, "points benched");
    }
    if (g.mostHits && g.mostHits.hits > 0) {
      h += hcard("Biggest hit", "−" + num(g.mostHits.hits), g.mostHits.name, g.mostHits.id,
        num(g.mostHits.transfers) + " transfers");
    }
    h += hcard("Transfers made", num(g.transfersTotal), "across the league", null,
      num(g.noTransfer) + " made none · −" + num(g.hitTotal) + " pts in hits");
    if (g.biggestClimb) {
      h += hcard("Biggest climb", "+" + num(g.biggestClimb.move), g.biggestClimb.name, g.biggestClimb.id,
        num(g.climbers) + " managers moved up");
    }
    if (g.biggestFall) {
      h += hcard("Biggest fall", "−" + num(g.biggestFall.move), g.biggestFall.name, g.biggestFall.id,
        num(g.fallers) + " managers moved down");
    }
    h += '</div>';
    return h;
  }

  function statsPicks(H) {
    var sq = H.squads;
    if (!sq) return '<div class="callout">No squads stored for this gameweek.</div>';
    var h = '<div class="statlead">' + esc(H.gwName) + ' · ' + num(sq.managers) + ' squads</div>';
    h += '<div class="hgrid">';
    if (sq.bestCaptain) {
      h += hcard("Best captain", num(sq.bestCaptain.pts * 2), sq.bestCaptain.name, null,
        sq.bestCaptain.caps + " of " + sq.managers + " captained");
    }
    if (sq.worstCaptain) {
      h += hcard("Captain to forget", num(sq.worstCaptain.pts * 2), sq.worstCaptain.name, null,
        sq.worstCaptain.caps + " captained");
    }
    if (sq.differentials.length) {
      var d0 = sq.differentials[0];
      h += hcard("Best differential", num(d0.pts), d0.name, null, d0.ownedPct + "% of the league");
    }
    h += hcard("Different captains", num(sq.distinctCaptains), "picked across the league");
    h += '</div>';

    var chipKeys = Object.keys(sq.chips || {});
    if (chipKeys.length) {
      h += '<div class="card"><div class="bd"><div class="lab-sm">Chips played</div><div class="chiprow">' +
        chipKeys.map(function (c) {
          return '<span class="pill gold">' + esc(CHIP_NAME[c] || c) + ' · ' + sq.chips[c] + '</span>';
        }).join("") + '</div></div></div>';
    }

    // The league's most-owned XI, drawn as a side.
    if (sq.templateXi) {
      h += '<div class="section-title"><h2>The template XI</h2><div class="rule"></div></div>';
      h += '<div class="note" style="margin:-4px 2px 10px">The most-owned player in each position, with how much of the league has them.</div>';
      h += '<div class="card pitchcard"><div class="bd">' +
        pitchHtml({ lines: sq.templateXi, bench: [] }, "eo") + '</div></div>';
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
    h += hlist("Top scorers owned", sq.topScorers, function (x) {
      return { name: x.name, tag: x.team, val: num(x.pts) };
    });
    h += hlist("Differentials", sq.differentials, function (x) {
      return { name: x.name, tag: x.ownedPct + "%", val: num(x.pts) };
    }, "Owned by under 10% of the league.");
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
          "no squad has changed value yet") + '</div>';
    } else if (v) {
      h += '<div class="hgrid">';
      h += hcard("Richest squad", mval(v.richest.value), v.richest.name, v.richest.id,
        mval(v.richest.bank) + " in the bank");
      h += hcard("League average", mval(v.average), v.count + " squads", null,
        mval(v.averageBank) + " in the bank");
      h += hcard("Leanest squad", mval(v.poorest.value), v.poorest.name, v.poorest.id,
        mval(v.poorest.bank) + " in the bank");
      if (v.mostBanked && v.mostBanked.bank > 0) {
        h += hcard("Most in the bank", mval(v.mostBanked.bank), v.mostBanked.name, v.mostBanked.id,
          mval(v.mostBanked.value) + " on the pitch");
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
      h += hcard("Best gameweek", num(se.bestGw.p), se.bestGw.name, se.bestGw.id, "in GW" + se.bestGw.gw);
    }
    if (se.bestAvg) {
      h += hcard("Best average", num(se.bestAvg.avg), se.bestAvg.name, se.bestAvg.id,
        "over " + se.gws + " gameweek" + (se.gws === 1 ? "" : "s"));
    }
    if (se.steadiest) {
      h += hcard("Most consistent", num(se.steadiest.spread), se.steadiest.name, se.steadiest.id,
        "between their best and worst");
    }
    if (se.biggestClimb && se.biggestClimb.climb > 0) {
      h += hcard("Biggest riser", num(se.biggestClimb.climb), se.biggestClimb.name, se.biggestClimb.id,
        "places gained overall");
    }
    if (se.worstGw) {
      h += hcard("Lowest gameweek", num(se.worstGw.p), se.worstGw.name, se.worstGw.id, "in GW" + se.worstGw.gw);
    }
    if (se.mostHits && se.mostHits.hits > 0) {
      h += hcard("Most hits taken", "−" + num(se.mostHits.hits), se.mostHits.name, se.mostHits.id, "all season");
    }
    if (se.mostBench && se.mostBench.bench > 0) {
      h += hcard("Most benched", num(se.mostBench.bench), se.mostBench.name, se.mostBench.id, "points on the bench");
    }
    if (se.mostTransfers && se.mostTransfers.transfers > 0) {
      h += hcard("Most transfers", num(se.mostTransfers.transfers), se.mostTransfers.name, se.mostTransfers.id, "so far");
    }
    h += hcard("Never took a hit", num(se.cleanest), "managers", null, "no transfer costs yet");
    h += '</div>';

    // Who is winning money, settled first.
    var purse = ds.managers.map(function (m) {
      var w = K.winnings(ds, m.id);
      return { id: m.id, name: m.entryName, settled: w.settled, onTrack: w.onTrack, total: w.total };
    }).filter(function (x) { return x.total > 0; })
      .sort(function (a, b) { return (b.settled - a.settled) || (b.onTrack - a.onTrack); });
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
    h += hcard("Transfers", num(se.transfersTotal), "made in total", null, "−" + num(se.hitsTotal) + " pts in hits");
    h += hcard("Points benched", num(se.benchTotal), "left on benches");
    h += hcard("Chips played", num(se.chipsPlayed), "so far this season");
    h += '</div>';
    return h;
  }

  function statsFame(H) {
    var pa = H.past;
    if (!pa) return '<div class="callout">Past-season history appears after the next data refresh.</div>';
    var h = '<div class="statlead">' + num(pa.players) + ' managers have played FPL before</div>';
    if (pa.topTen) {
      h += '<div class="hgrid">' +
        hcard("Top 10k finishes", num(pa.topTen), "managers have one", null, "in any past season") +
        (pa.topRanks[0] ? hcard("Best ever finish", num(pa.topRanks[0].bestRank.rank),
          pa.topRanks[0].name, pa.topRanks[0].id, pa.topRanks[0].bestRank.season) : "") +
        (pa.topCareer[0] ? hcard("Most career points", num(pa.topCareer[0].career),
          pa.topCareer[0].name, pa.topCareer[0].id, pa.topCareer[0].seasons + " seasons") : "") +
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
    h += '<div class="card"><div class="bd cmppick">' + field("cmpA", state.cmpA) +
      '<div class="vs">vs</div>' + field("cmpB", state.cmpB) + '</div></div>';
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
    h += '</tbody></table></div></div>';

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
      '<button class="btn primary" id="btnDoRefresh">↻ Refresh from FPL</button>' +
      '<button class="btn" id="btnExport">⬇ Export data.json</button>' +
      '<button class="btn" id="btnImport">⬆ Import bundle</button>' +
      '<input type="file" id="fileImport" accept="application/json" style="display:none">' +
      '</div>';
    h += '<div class="note" style="margin-top:10px">Organiser tip: refresh once per gameweek, <b>Export</b>, and commit the file as <code>gameon/data.json</code>. Everyone else\'s app will load it automatically — no proxy load for 245 people.</div>';
    h += '</div></div>';

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

  function wireSettings(host) {
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
      help = "Set which gameweeks belong to each month and the prizes. This drives the Monthly tab."; }
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
  function track(path, isEvent) {
    try {
      if (!window.goatcounter || typeof window.goatcounter.count !== "function") return;
      if (!isEvent) {
        if (path === lastTracked) return;
        lastTracked = path;
      }
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
    var m = Math.round(ms / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
    if (m < 1) return "just now";
    if (h < 1) return m + "m ago";
    if (d < 1) return h + "h ago";
    return d + "d ago";
  }

  // "in 2d 4h" / "in 40m" / "closed"
  function untilText(ms) {
    if (ms <= 0) return "closed";
    var m = Math.floor(ms / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
    if (d >= 1) return "in " + d + "d " + (h % 24) + "h";
    if (h >= 1) return "in " + h + "h " + (m % 60) + "m";
    return "in " + m + "m";
  }

  // A season's shape: one line, no axes, the latest point labelled. Fewer than
  // two gameweeks is not a chart, so it renders as a plain figure instead.
  function sparkline(points, opts) {
    opts = opts || {};
    if (!points || !points.length) return "";
    if (points.length < 2) {
      return '<div class="sparkone"><span class="v">' + num(points[0].p) + '</span>' +
        '<span class="l">GW' + points[0].gw + ' \u2014 a line needs more than one gameweek</span></div>';
    }
    var W = 300, H = 62, padY = 10, padX = 4;
    var vals = points.map(function (p) { return p.p; });
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    var span = (hi - lo) || 1;
    var avg = vals.reduce(function (t, v) { return t + v; }, 0) / vals.length;
    function x(i) { return padX + (i * (W - padX * 2)) / (points.length - 1); }
    function y(v) { return H - padY - ((v - lo) / span) * (H - padY * 2); }

    var line = points.map(function (p, i) { return (i ? "L" : "M") + x(i).toFixed(1) + " " + y(p.p).toFixed(1); }).join(" ");
    var area = line + " L" + x(points.length - 1).toFixed(1) + " " + (H - padY) + " L" + x(0).toFixed(1) + " " + (H - padY) + " Z";
    var last = points[points.length - 1];

    var dots = points.map(function (p, i) {
      // a generous invisible target so the native tooltip is reachable
      return '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(p.p).toFixed(1) + '" r="9" fill="transparent">' +
        '<title>GW' + p.gw + ': ' + num(p.p) + ' pts</title></circle>';
    }).join("");

    return '<div class="spark">' +
      // scales uniformly: stretching would turn the marker into an ellipse
      '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" ' +
        'aria-label="Gameweek scores from GW' + points[0].gw + ' to GW' + last.gw + '">' +
        '<line class="avg" x1="' + padX + '" x2="' + (W - padX) + '" y1="' + y(avg).toFixed(1) + '" y2="' + y(avg).toFixed(1) + '"/>' +
        '<path class="fill" d="' + area + '"/>' +
        '<path class="ln" d="' + line + '"/>' +
        '<circle class="head" cx="' + x(points.length - 1).toFixed(1) + '" cy="' + y(last.p).toFixed(1) + '" r="4"/>' +
        dots +
      '</svg>' +
      '<div class="sparkfoot"><span>GW' + points[0].gw + '</span>' +
        '<span class="mid">avg ' + num(Math.round(avg)) + '</span>' +
        '<span><b>' + num(last.p) + '</b> GW' + last.gw + '</span></div>' +
      '</div>';
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
