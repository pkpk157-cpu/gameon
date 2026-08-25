/* ==========================================================================
   app.js — UI: tabs, rendering for every competition, refresh flow, admin.
   ========================================================================== */
(function () {
  "use strict";

  var S = window.GO_STORE, K = window.GO_COMPUTE;
  var ME_KEY = "go12.me", THEME_KEY = "go12.theme";
  var state = { view: "classic", me: lsGet(ME_KEY), monthKey: null, seasonKey: null, group: 0, h2hComp: "UCL" };

  /* Minimal line icons (24px, currentColor). */
  var ICONS = {
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
    back: '<path d="M15 5l-7 7 7 7"/>'
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
  function money(n) { return num(n); }
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

  function openProfile() {
    var ds = S.dataset();
    var admin = isAdmin();
    var theme = getTheme();
    var updated = ds ? ("Updated " + new Date(ds.updatedAt).toLocaleString()) : "Standings not loaded yet";

    var h = '';
    h += '<div class="profile-hd"><div class="av">' + svg("gear", 24) + '</div>' +
      '<div><div class="who">Game On V12</div><div class="sub">' + esc(updated) + '</div></div></div>';

    h += '<div class="menu"><div class="lab-sm">Appearance</div>' +
      '<div class="seg" id="pfTheme">' +
      segBtn("system", "auto", "System", theme) +
      segBtn("light", "sun", "Light", theme) +
      segBtn("dark", "moon", "Dark", theme) +
      '</div></div>';

    h += '<div class="menu">' + menuItem("pfCompare", "h2h", "Head to head") + menuItem("pfRules", "book", "Game rules");
    if (admin) {
      h += menuItem("pfRefresh", "refresh", "Refresh from FPL") +
        menuItem("pfSettings", "gear", "League settings & admin") +
        '<div class="divider"></div>' +
        menuItem("pfExport", "download", "Export data file") +
        menuItem("pfImport", "upload", "Import data file");
    }
    h += '</div>';

    // My FPL team ID — every participant can set this to highlight themselves.
    h += '<label class="field" style="margin-top:12px"><span class="lab">My FPL team ID</span>' +
      '<div style="display:flex;gap:8px"><input class="in" id="pfMe" value="' + esc(state.me || "") + '" placeholder="e.g. 267043" inputmode="numeric">' +
      '<button class="btn" id="pfMeSave">Save</button></div></label>' +
      '<div class="note" style="margin-top:2px">Highlights your name across all tabs. Find your ID in your FPL team URL: /entry/<b>NUMBER</b>/.</div>' +
      (admin ? '<div class="note warn" style="margin-top:8px">Admin mode is on for this device.</div>' : '');

    $("#profileBody").innerHTML = h;
    $("#profileBack").classList.add("show");

    $all("#pfTheme button").forEach(function (b) {
      b.addEventListener("click", function () { applyTheme(b.getAttribute("data-th")); openProfile(); });
    });
    $("#pfCompare").addEventListener("click", function () { closeProfile(); location.hash = "compare"; });
    $("#pfRules").addEventListener("click", function () { closeProfile(); location.hash = "rules"; });
    $("#pfMeSave").addEventListener("click", function () {
      var v = parseInt($("#pfMe").value, 10);
      state.me = isNaN(v) ? null : v; lsSet(ME_KEY, state.me);
      toast(state.me ? "Saved — you're highlighted" : "Cleared"); render();
    });

    if (admin) {
      $("#pfRefresh").addEventListener("click", function () { closeProfile(); startRefresh(); });
      $("#pfSettings").addEventListener("click", function () { closeProfile(); location.hash = "settings"; });
      $("#pfExport").addEventListener("click", function () {
        var bundle = S.exportBundle();
        if (!bundle.dataset) { toast("Nothing to export — refresh first"); return; }
        download("data.json", JSON.stringify(bundle)); toast("Exported data.json");
      });
      $("#pfImport").addEventListener("click", function () { importFile(function () { closeProfile(); }); });
    }
  }
  function closeProfile() { $("#profileBack").classList.remove("show"); }
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

  /* ---- boot ------------------------------------------------------------ */
  function boot() {
    buildNav();
    isAdmin(); // persist ?admin flag on first visit
    $("#btnProfile").innerHTML = svg("gear", 20);
    $("#btnProfile").setAttribute("title", "Settings");
    $("#btnProfile").addEventListener("click", openProfile);
    $("#barInfo").innerHTML = svg("info", 18);
    $("#modalClose").addEventListener("click", closeModal);
    $("#modalBack").addEventListener("click", function (e) { if (e.target === $("#modalBack")) closeModal(); });
    $("#profileBack").addEventListener("click", function (e) { if (e.target === $("#profileBack")) closeProfile(); });
    document.addEventListener("click", function (e) {
      if (!e.target.closest) return;
      var b = e.target.closest("[data-rules]");
      if (b) { location.hash = "rules/" + b.getAttribute("data-rules"); return; }
      var n = e.target.closest("[data-entry]");
      if (n) { location.hash = "profile/" + n.getAttribute("data-entry"); }
    });
    window.addEventListener("hashchange", syncFromHash);

    S.load().then(function () {
      syncFromHash();
      updateDataState();
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
    var known = TABS.map(function (t) { return t.id; }).concat(["rules", "settings", "profile", "compare"]);
    if (known.indexOf(view) === -1) view = "classic";
    if (["profile","rules","settings","compare"].indexOf(view) === -1) state.backView = view;
    state.view = view;
    if (view === "monthly" && parts[1]) state.monthKey = parts[1];
    if (view === "pyramid" && parts[1]) state.seasonKey = parts[1];
    if (view === "profile") state.profileId = parts[1] || null;
    state.rulesTopic = (view === "rules") ? (parts[1] || null) : state.rulesTopic;
    render();
  }

  function setActiveView() {
    $all(".navitem").forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-tab") === state.view); });
    $all(".view").forEach(function (v) { v.classList.toggle("active", v.getAttribute("data-view") === state.view); });
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
    var fill = ["classic", "monthly", "lms", "pyramid", "h2h"].indexOf(state.view) !== -1;
    var wrap = $("main.wrap"); if (wrap) wrap.classList.toggle("fill", fill);
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
    compare: { t: "Head to head" }
  };
  function updateBanner() {
    var m = VIEW_META[state.view] || { t: "Game On V12" };
    $("#barTitle").textContent = m.t;
    var info = $("#barInfo");
    if (m.topic) { info.style.display = ""; info.setAttribute("data-rules", m.topic); }
    else { info.style.display = "none"; info.removeAttribute("data-rules"); }
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

    if (state.view === "settings") return renderSettings(host);
    if (state.view === "rules") return renderRules(host);
    if (state.view === "compare") return renderCompare(host, S.dataset());

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

  /* ====================================================================== */
  /* CLASSIC                                                                */
  /* ====================================================================== */
  function renderClassic(host, ds) {
    var rows = K.classic(ds);
    var h = '';

    h += '<label class="field" style="margin-bottom:12px">' +
      '<input class="in" id="classicSearch" placeholder="Search manager or team…"></label>';

    h += '<div class="freeze"><table class="t"><thead><tr>' +
      '<th class="num">#</th><th>Team</th><th class="num">GW</th><th class="num">Total</th><th class="num">Move</th><th class="num">Prize</th>' +
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
      return '<tr' + (isMe(r.id) ? ' class="me"' : '') + '>' +
        '<td class="num"><span class="rankcell"><span class="r ' + rc + '">' + r.computedRank + '</span></span></td>' +
        '<td class="name" data-entry="' + r.id + '"><span class="who">' + esc(r.entryName) + '</span><div class="mgr">' + esc(r.playerName) + '</div></td>' +
        '<td class="num">' + num(r.eventTotal) + '</td>' +
        '<td class="num"><b>' + num(r.total) + '</b></td>' +
        '<td class="num">' + mv + '</td>' +
        '<td class="num">' + (r.prize ? '<span class="prize">' + money(r.prize) + '</span>' : '') + '</td>' +
        '</tr>';
    }).join("");
  }

  function podiumCard(cls, medal, r, place) {
    return '<div class="p ' + cls + '"><div class="medal">' + medal + '</div>' +
      '<div class="amt">' + money(r.prize) + '</div>' +
      '<div class="who">' + esc(r.entryName) + '</div>' +
      '<div class="sub">' + esc(r.playerName) + ' · ' + num(r.total) + ' pts</div></div>';
  }

  function prizeReferenceCard() {
    var p = S.config().classicPrizes;
    var rows = '';
    Object.keys(p.exact).forEach(function (k) {
      rows += '<tr><td>' + ordinal(+k) + ' place</td><td class="num">' + money(p.exact[k]) + '</td></tr>';
    });
    (p.ranges || []).forEach(function (r) {
      var label = r.from === r.to ? ordinal(r.from) : (ordinal(r.from) + " – " + ordinal(r.to));
      rows += '<tr><td>' + label + '</td><td class="num">' + money(r.amount) + '</td></tr>';
    });
    return '<div class="card"><div class="hd"><h3>Prize breakdown</h3></div><div class="bd">' +
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
      }).join("") + '</select>' +
      '<div class="pickmeta" id="monthMeta"></div></div>';
    h += '<div id="monthPanel"></div>';

    host.innerHTML = h;
    var draw = function () {
      var M = months.filter(function (m) { return m.key === state.monthKey; })[0];
      $("#monthMeta", host).innerHTML = gwChips(M.gws, statusFn);
      $("#monthPanel", host).innerHTML = monthPanel(M);
    };
    $("#monthSel", host).addEventListener("change", function () { state.monthKey = this.value; draw(); });
    draw();
  }

  function monthPanel(M) {
    if (!M) return '';
    if (!M.rows.length) { return '<div class="callout">No gameweeks scored yet for this month.</div>'; }
    var h = '';

    h += '<div class="freeze"><table class="t"><thead><tr><th class="num">#</th><th>Team</th><th class="num">Points</th><th class="num">Bench</th><th class="num">Prize</th></tr></thead><tbody>';
    h += M.rows.map(function (r) {
      var rc = r.pos <= 3 ? "rk" + r.pos : "";
      return '<tr' + (isMe(r.id) ? ' class="me"' : '') + '><td class="num"><span class="r ' + rc + '">' + r.pos + '</span></td>' +
        '<td class="name" data-entry="' + r.id + '"><span class="who">' + esc(r.entryName) + '</span><div class="mgr">' + esc(r.playerName) + '</div></td>' +
        '<td class="num"><b>' + num(r.score) + '</b></td><td class="num">' + num(r.bench) + '</td>' +
        '<td class="num">' + (r.prize ? '<span class="prize">' + money(r.prize) + '</span>' : '') + '</td></tr>';
    }).join("");
    h += '</tbody></table></div>';
    h += '<div class="note" style="margin-top:8px">Monthly score includes hits. Ties shown by bench points; deeper tie-breaks (goals/CS/assists) can be set in Admin.</div>';
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

    h += '<div class="statrow">' +
      stat(started, "Started") +
      stat(lms.survivorsCount, "Alive") +
      stat(lms.finishedCount, "GWs") +
      stat(started - lms.survivorsCount, "Out") + '</div>';

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
    h += '<div class="pickrow"><select class="in narrow" id="lmsGwSel">' +
      gwOpts.map(function (o) {
        return '<option value="' + o.key + '"' + (o.key === curKey ? ' selected' : '') + '>' + esc(o.label) + '</option>';
      }).join("") + '</select></div>';
    h += '<div id="lmsGwPanel"></div>';

    host.innerHTML = h;
    var drawLms = function () {
      var o = byKey(state.lmsGw);
      $("#lmsGwPanel", host).innerHTML = lmsGwTable(o.week, { live: o.live });
    };
    $("#lmsGwSel", host).addEventListener("change", function () { state.lmsGw = this.value; drawLms(); });
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
    return '<div class="stat"><div class="k">' + money(amount) + '</div><div class="l">' + esc(label) + '</div></div>';
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
    var h = '';

    // Group selector (dropdown) + group-stage GW progress
    if (state.group >= h2h.groups.length) state.group = 0;
    h += '<div class="pickrow"><select class="in narrow" id="grpSel">' +
      h2h.groups.map(function (g, i) {
        return '<option value="' + i + '"' + (i === state.group ? ' selected' : '') + '>' + esc(g.name) + '</option>';
      }).join("") + '</select>' +
      '<div class="pickmeta">Group stage · GW ' + h2h.groupGwsPlayed + '/' + h2h.groupGwsTotal + '</div></div>';
    h += '<div id="grpPanel">' + groupPanel(h2h.groups[state.group] || h2h.groups[0], cfg) + '</div>';

    host.innerHTML = h;
    $("#grpSel", host).addEventListener("change", function () {
      state.group = +this.value;
      $("#grpPanel", host).innerHTML = groupPanel(h2h.groups[state.group], cfg);
    });
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
      rows + '</tbody></table></div>' +
      '<div class="note" style="margin-top:8px">' + g.table.length + ' managers · Top 2 → UCL · 3rd–4th → UEL. Points 3/1/0; ties by group-stage score.</div>';
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
    var curDiv = (state.pyrDiv && divKeys.indexOf(state.pyrDiv) >= 0) ? state.pyrDiv : divKeys[0];
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
      $("#pyrPanel", host).innerHTML = divisionCard(div, cfg);
    }
    $("#pyrSeason", host).addEventListener("change", function () { state.seasonKey = this.value; draw(); });
    $("#pyrDiv", host).addEventListener("change", function () { state.pyrDiv = this.value; draw(); });
    draw();
  }

  function divisionCard(div, cfg) {
    var pcfg = cfg.pyramid;
    var body = div.rows.map(function (r) {
      var zone = r.pos <= pcfg.promoteCount ? "zone-top"
        : (r.pos > div.rows.length - pcfg.relegateCount ? "zone-bot" : "");
      var badge = r.pos <= pcfg.promoteCount ? '<span class="pill up">▲</span>'
        : (r.pos > div.rows.length - pcfg.relegateCount ? '<span class="pill down">▼</span>' : '');
      var rc = r.pos <= 3 ? "rk" + r.pos : "";
      return '<tr class="' + zone + (isMe(r.id) ? ' me' : '') + '"><td class="num"><span class="r ' + rc + '">' + r.pos + '</span></td>' +
        '<td class="name" data-entry="' + r.id + '"><span class="who">' + esc(r.name) + '</span> ' + badge + '<div class="mgr">' + esc(r.player) + '</div></td>' +
        '<td class="num"><b>' + num(r.score) + '</b></td><td class="num">' +
        (r.prize ? '<span class="prize">' + money(r.prize) + '</span>' : '') + '</td></tr>';
    }).join("");
    if (!div.rows.length) return '<div class="callout">No managers assigned to this division.</div>';
    return '<div class="freeze"><table class="t"><thead><tr><th class="num">#</th><th>Team</th><th class="num">Points</th><th class="num">Prize</th></tr></thead><tbody>' + body + '</tbody></table></div>';
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

    // General overview (reached from the profile menu).
    var h = '<div class="section-title"><h2>General Rules</h2><div class="rule"></div>' +
      '<span class="chip">Fair play</span></div>';
    cfg.rules.forEach(function (r) {
      h += '<div class="card"><div class="hd"><h3>' + r.n + '. ' + esc(r.title) + '</h3></div>' +
        '<div class="bd"><div class="note" style="color:var(--ink-soft);font-size:13.5px;line-height:1.6">' + esc(r.body) + '</div></div></div>';
    });
    h += '<div class="section-title"><h2>Monthly prizes</h2><div class="rule"></div></div>' + monthlyPrizeCard(cfg);
    h += '<div class="section-title"><h2>Pyramid prizes (per mini-season)</h2><div class="rule"></div></div>' + pyramidPrizeCard(cfg);
    host.innerHTML = h;
  }

  function renderCompRules(host, R) {
    var h = '<div class="btnrow" style="margin-bottom:4px"><button class="btn ghost" id="rulesBack">' + svg("back", 16) + ' Back</button></div>';
    h += '<div class="section-title"><h2>' + esc(R.name) + '</h2><div class="rule"></div><span class="chip">Rules</span></div>';
    R.blocks.forEach(function (b) {
      h += '<div class="card"><div class="hd"><h3>' + esc(b.h) + '</h3></div>' +
        '<div class="bd"><div class="note" style="color:var(--ink-soft);font-size:13.5px;line-height:1.65">' + b.body + '</div></div></div>';
    });
    if (R.extra) { h += R.extra; }
    host.innerHTML = h;
    $("#rulesBack", host).addEventListener("click", function () { location.hash = R.back; });
  }

  function compRules(topic, cfg) {
    function rule(n) { var r = cfg.rules.filter(function (x) { return x.n === n; })[0]; return r ? esc(r.body) : ""; }
    var g = cfg.h2h.groupStageGws, kn = cfg.h2h.knockout;
    if (topic === "classic") return { name: "Classic League", back: "classic", extra: prizesBlock(prizeReferenceCard()), blocks: [
      { h: "How it works", body: "Your overall Fantasy Premier League points across all " + cfg.totalGameweeks + " gameweeks. The season-long total is your league score — the highest total at the end wins." },
      { h: "Prizes", body: "The top 45 managers are paid — see the full breakdown below." },
      { h: "Tie breakers", body: rule(2) } ] };
    if (topic === "monthly") return { name: "Monthly Winners", back: "monthly", extra: prizesBlock(monthlyPrizeCard(cfg)), blocks: [
      { h: "How it works", body: "Each month scores only the gameweeks that fall in that month, and <b>includes hits</b>. The top 3 each month (August–May) win." },
      { h: "Tie breakers", body: rule(7) } ] };
    if (topic === "lms") return { name: "Last Manager Standing", back: "lms", extra: prizesBlock(lmsPrizeCard(cfg)) + lmsGridCard(cfg), blocks: [
      { h: "Scoring", body: rule(3) },
      { h: "Eliminations", body: "Each gameweek the lowest scorers among the survivors are eliminated. The number out per GW is fixed (see the elimination grid). The last manager left standing is champion." },
      { h: "Tie breakers", body: rule(4) } ] };
    if (topic === "pyramid") return { name: "The Pyramid Battle", back: "pyramid", extra: pyramidVisualCard() + prizesBlock(pyramidPrizeCard(cfg)), blocks: [
      { h: "Structure", body: "4 divisions — Elite, Championship, Challenger, Conference — across 3 mini-seasons: " +
        cfg.pyramid.seasons.map(function (s) { return "<b>" + esc(s.name) + "</b> (GW " + s.gws[0] + "–" + s.gws[s.gws.length - 1] + ")"; }).join(", ") + "." },
      { h: "Promotion & relegation", body: "Top " + cfg.pyramid.promoteCount + " of each division are promoted and the bottom " + cfg.pyramid.relegateCount + " are relegated for the next mini-season." },
      { h: "Scoring & tie breakers", body: rule(6) } ] };
    if (topic === "h2h") return { name: "Game On UCL (H2H)", back: "h2h", extra: prizesBlock(h2hPrizeCard(cfg)), blocks: [
      { h: "Group stage", body: cfg.h2h.groupCount + " groups of " + cfg.h2h.perGroup + ", GW " + g[0] + "–" + g[g.length - 1] +
        ", round robin (" + cfg.h2h.pointsWin + "/" + cfg.h2h.pointsDraw + "/" + cfg.h2h.pointsLoss + "). Top 2 of each group advance to the UCL knockouts; 3rd & 4th drop to the UEL knockouts." },
      { h: "Knockouts", body: kn.map(function (k) { return "<b>" + esc(k.name) + "</b> — GW " + k.gws.join("–") + (k.legs === 2 ? " (2 legs)" : " (1 leg)"); }).join("<br>") },
      { h: "Tie breakers", body: rule(5) } ] };
    return null;
  }

  function prizesBlock(card) {
    return '<div class="section-title"><h2>Prizes</h2><div class="rule"></div></div>' + card;
  }
  function pyramidVisualCard() {
    return '<div class="section-title"><h2>The pyramid</h2><div class="rule"></div></div>' +
      '<div class="card"><div class="bd"><div class="pyr">' +
      '<div class="lvl elite">ELITE<small>promotion top · biggest prizes</small></div>' +
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
  function monthlyPrizeCard(cfg) {
    var rows = cfg.months.map(function (m) {
      return '<tr><td>' + esc(m.name) + '</td><td class="num prize">' + money(m.prizes[1]) + '</td>' +
        '<td class="num">' + money(m.prizes[2]) + '</td><td class="num">' + money(m.prizes[3]) + '</td>' +
        '<td class="note">GW ' + m.gws.join(", ") + '</td></tr>';
    }).join("");
    return '<div class="card"><div class="tablewrap"><table class="t"><thead><tr><th>Month</th><th class="num">1st</th><th class="num">2nd</th><th class="num">3rd</th><th>Gameweeks</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
  }
  function pyramidPrizeCard(cfg) {
    var rows = cfg.pyramid.divisions.map(function (d) {
      return '<tr><td>' + esc(d.name) + '</td><td class="num prize">' + money(d.prizes[1]) + '</td><td class="num">' + money(d.prizes[2]) + '</td><td class="num">' + money(d.prizes[3]) + '</td></tr>';
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
  function profStat(label, big, sub) {
    return '<div class="stat" style="text-align:left"><div class="l" style="margin:0 0 6px">' + esc(label) + '</div>' +
      '<div style="font-size:18px;font-weight:800;line-height:1.15">' + esc(big) + '</div>' +
      (sub ? '<div class="note" style="margin-top:3px">' + esc(sub) + '</div>' : '') + '</div>';
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

  // One player: shirt card with a white name bar and a points bar underneath.
  function pp(p, showPos) {
    var badge = p.cap ? '<i class="pb cap">C</i>' : (p.vice ? '<i class="pb vice">V</i>' : "");
    if (p.star) badge += '<i class="pb star">★</i>';
    return '<div class="pcell">' +
      (showPos ? '<div class="pposlbl">' + esc(p.pos) + '</div>' : '') +
      '<div class="pcard">' + badge +
        '<div class="pshirt">' + jersey(p.team, p.type) + '</div>' +
        '<div class="pname">' + esc(p.name) + '</div>' +
        '<div class="ppts">' + num(p.pts) + '</div>' +
      '</div></div>';
  }

  function pitchHtml(pit) {
    var h = '<div class="pitch"><div class="pmark">' +
      '<span class="goal"></span><span class="box18"></span><span class="box6"></span>' +
      '<span class="spot"></span><span class="arc"></span><span class="halfway"></span>' +
      '<span class="circle"></span></div>';
    h += pit.lines.map(function (ln) {
      if (!ln.players.length) return "";
      return '<div class="prow">' + ln.players.map(function (p) { return pp(p, false); }).join("") + '</div>';
    }).join("");
    h += '</div>';
    if (pit.bench.length) {
      h += '<div class="pbench">' + pit.bench.map(function (p) { return pp(p, true); }).join("") + '</div>';
    }
    return h;
  }

  var CHIP_NAME = { bboost: "Bench Boost", "3xc": "Triple Captain", freehit: "Free Hit", wildcard: "Wildcard" };

  // The whole squad block: gameweek picker, the three stats, Pitch/List and the
  // squad itself. Re-rendered in place whenever the gameweek or mode changes.
  function mountPitch(box, ds, id, gw, mode) {
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
    state.pitchGw = +gw; state.pitchMode = mode; // remember while browsing

    var h = '<div class="pgwline">';
    h += '<select class="in gwsel" id="pitchGwSel" aria-label="Gameweek">' + gws.map(function (g) {
      return '<option value="' + g + '"' + (+g === +gw ? ' selected' : '') + '>Gameweek ' + g + '</option>';
    }).join("") + '</select>';
    h += (pit.live ? ' <span class="pill live">Live</span>' : '') +
      (pit.chip ? ' <span class="pill gold">' + esc(CHIP_NAME[pit.chip] || pit.chip) + '</span>' : '');
    h += '</div>';

    h += '<div class="pstats">';
    h += '<div class="pstat"><div class="v">' + (pit.average === null ? "—" : num(pit.average)) + '</div><div class="l">Average</div></div>';
    h += '<div class="pstat main"><div class="v">' + num(pit.net) + '</div><div class="l">Total Pts' +
      (pit.hits ? ' <span class="hit">−' + num(pit.hits) + '</span>' : '') + '</div></div>';
    h += pit.highest
      ? '<div class="pstat hi" data-entry="' + pit.highest.id + '" role="button" tabindex="0"><div class="v">' +
          num(pit.highest.pts) + '</div><div class="l">Highest <span class="arw">›</span></div></div>'
      : '<div class="pstat"><div class="v">—</div><div class="l">Highest</div></div>';
    h += '</div>';

    h += '<div class="pseg"><button type="button"' + (mode === "pitch" ? ' class="on"' : '') + ' data-mode="pitch">Pitch</button>' +
      '<button type="button"' + (mode === "list" ? ' class="on"' : '') + ' data-mode="list">List</button></div>';
    h += mode === "list" ? listHtml(pit) : pitchHtml(pit);
    box.innerHTML = h;

    $("#pitchGwSel", box).addEventListener("change", function () {
      mountPitch(box, ds, id, +this.value, mode);
    });
    $(".pseg", box).addEventListener("click", function (e) {
      var b = e.target.closest("button[data-mode]");
      if (b) mountPitch(box, ds, id, gw, b.getAttribute("data-mode"));
    });
  }

  function listHtml(pit) {
    var rows = [];
    pit.lines.forEach(function (ln) {
      ln.players.forEach(function (p) { rows.push([p, false]); });
    });
    pit.bench.forEach(function (p) { rows.push([p, true]); });
    var h = '<div class="tablewrap"><table class="t plist"><thead><tr><th></th><th>Player</th>' +
            '<th>Team</th><th class="num">Pts</th></tr></thead><tbody>';
    h += rows.map(function (r) {
      var p = r[0], onBench = r[1];
      var mark = p.cap ? ' <span class="pill gold">C</span>' : (p.vice ? ' <span class="pill">V</span>' : "");
      return '<tr' + (onBench ? ' class="benchrow2"' : '') + '>' +
        '<td class="pcol">' + esc(p.pos) + '</td>' +
        '<td>' + esc(p.name) + mark + (onBench ? ' <span class="note">bench</span>' : '') + '</td>' +
        '<td>' + esc(p.team) + '</td>' +
        '<td class="num"><b>' + num(p.pts) + '</b></td></tr>';
    }).join("");
    return h + '</tbody></table></div>';
  }
  function renderProfile(host, ds, id) {
    if (!id) { host.innerHTML = '<div class="callout">No manager selected.</div>'; return; }
    var P = K.managerProfile(ds, id);
    var h = '<div class="btnrow" style="margin-bottom:10px"><button class="btn ghost" id="profBack">' + svg("back", 16) + ' Back</button></div>';
    h += '<div class="card"><div class="bd"><div class="profhero">' +
      '<div class="profav">' + esc((P.entryName || "?").trim().slice(0, 1).toUpperCase()) + '</div>' +
      '<div><h2 style="margin:0;font-size:20px">' + esc(P.entryName) + '</h2>' +
      '<div class="note">' + esc(P.playerName) + (isMe(id) ? ' · <span class="pill gold">You</span>' : '') + '</div></div>' +
      '</div></div></div>';

    h += '<div class="section-title"><h2>This season</h2><div class="rule"></div></div>';
    h += '<div class="grid cols-2">';
    h += profStat("Classic", P.classic ? ("#" + P.classic.computedRank) : "—",
      P.classic ? (num(P.classic.total) + " pts" + (P.classic.prize ? " · " + money(P.classic.prize) : "")) : "");
    var lmsTxt = P.lms.state === "in" ? "Still in" : (P.lms.state === "out" ? ("Out · GW" + P.lms.gw) : "—");
    h += profStat("Last Manager", lmsTxt, P.lms.state === "in" ? "surviving" : "");
    var pyl = P.pyramid.length ? P.pyramid[P.pyramid.length - 1] : null;
    h += profStat("Pyramid", pyl ? ("#" + pyl.pos + " " + pyl.division) : "—", pyl ? (pyl.season + " · " + num(pyl.score) + " pts") : "");
    h += profStat("UCL", P.h2h ? ("#" + P.h2h.pos + " " + P.h2h.group) : "—",
      P.h2h ? (P.h2h.w + "W " + P.h2h.d + "D " + P.h2h.l + "L · " + P.h2h.pts + " pts" + (P.h2h.dest ? " · " + P.h2h.dest : "")) : "");
    h += '</div>';

    // Squad on a football pitch, steppable through every gameweek played.
    var gws = K.squadGws(ds);
    if (gws.length && K.managerPitch(ds, id, gws[gws.length - 1])) {
      h += '<div class="section-title"><h2>Squad</h2><div class="rule"></div></div>';
      h += '<div class="card pitchcard"><div class="bd" id="pitchBox"></div></div>';
    }

    if (P.monthly.length) {
      h += '<div class="section-title"><h2>Monthly</h2><div class="rule"></div></div>';
      h += '<div class="card"><div class="tablewrap"><table class="t"><thead><tr><th>Month</th><th class="num">Pos</th><th class="num">Points</th><th class="num">Prize</th></tr></thead><tbody>';
      h += P.monthly.map(function (m) {
        return '<tr><td>' + esc(m.label || m.name) + '</td><td class="num">' + m.pos + '</td><td class="num">' + num(m.score) + '</td>' +
          '<td class="num">' + (m.prize ? '<span class="prize">' + money(m.prize) + '</span>' : '') + '</td></tr>';
      }).join("");
      h += '</tbody></table></div></div>';
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
    $("#barTitle").textContent = P.entryName || "Profile";
    $("#profBack", host).addEventListener("click", function () {
      if (state.backView) location.hash = state.backView; else location.hash = "classic";
    });

    var box = $("#pitchBox", host);
    if (box) mountPitch(box, ds, id, state.pitchGw, state.pitchMode);
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
  function diffChip(p) {
    return '<div class="dchip"><span class="dn">' + esc(p.name) + '</span>' +
      '<span class="dt">' + esc(p.team) + '</span>' +
      '<span class="dp">' + num(p.pts) + '</span></div>';
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

    function sel(idAttr, chosen) {
      return '<select class="in" id="' + idAttr + '">' + mgrs.map(function (m) {
        return '<option value="' + m.id + '"' + (+m.id === +chosen ? ' selected' : '') + '>' +
          esc(m.entryName) + ' — ' + esc(m.playerName) + '</option>';
      }).join("") + '</select>';
    }
    var h = '<div class="btnrow" style="margin-bottom:10px"><button class="btn ghost" id="cmpBack">' + svg("back", 16) + ' Back</button></div>';
    h += '<div class="card"><div class="bd cmppick">' + sel("cmpA", state.cmpA) +
      '<div class="vs">vs</div>' + sel("cmpB", state.cmpB) + '</div></div>';
    h += '<div id="cmpBox"></div>';
    host.innerHTML = h;

    $("#cmpBack", host).addEventListener("click", function () { location.hash = state.backView || "classic"; });
    $("#cmpA", host).addEventListener("change", function () { state.cmpA = +this.value; drawCompare(ds); });
    $("#cmpB", host).addEventListener("change", function () { state.cmpB = +this.value; drawCompare(ds); });
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

    h += '<div class="cmppitch">' +
      '<div class="col">' + (a.pitch ? pitchHtml(a.pitch) : '<div class="callout">No squad</div>') + '</div>' +
      '<div class="col">' + (b.pitch ? pitchHtml(b.pitch) : '<div class="callout">No squad</div>') + '</div>' +
      '</div></div></div>';

    h += '<div class="section-title"><h2>Compared</h2><div class="rule"></div></div>';
    h += '<div class="card"><div class="tablewrap"><table class="t cmptable"><thead><tr>' +
      '<th class="num">' + esc(a.name) + '</th><th class="cmid"></th><th class="num">' + esc(b.name) + '</th>' +
      '</tr></thead><tbody>';
    h += cmpRow("GW" + R.gw + " points", a.gwPts, b.gwPts);
    h += cmpRow("Season total", a.total, b.total);
    h += cmpRow("League position", a.rank || null, b.rank || null, "", true);
    h += cmpRow("Gameweeks won", R.record.w, R.record.l, R.record.d ? (R.record.d + " drawn") : "");
    h += cmpRow("Best gameweek", a.best ? a.best.p : null, b.best ? b.best.p : null,
      (a.best && b.best) ? ("GW" + a.best.gw + " vs GW" + b.best.gw) : "");
    h += cmpRow("Points hits (season)", a.hits, b.hits, "lower is better", true);
    h += cmpRow("Points on bench", a.bench, b.bench, "lower is better", true);
    h += cmpRow("GW" + R.gw + " hit", a.gwHits, b.gwHits, "", true);
    var ac = a.chips.map(function (c) { return (CHIP_NAME[c.chip] || c.chip) + " (GW" + c.gw + ")"; }).join(", ");
    var bc = b.chips.map(function (c) { return (CHIP_NAME[c.chip] || c.chip) + " (GW" + c.gw + ")"; }).join(", ");
    h += cmpRow("Chips played", ac || "none", bc || "none");
    h += '</tbody></table></div></div>';

    if (R.aOnly.length || R.bOnly.length) {
      h += '<div class="section-title"><h2>Differentials · GW' + R.gw + '</h2><div class="rule"></div></div>';
      h += '<div class="card"><div class="bd">';
      h += '<div class="note" style="margin-bottom:10px">' + R.shared.length + ' player' +
        (R.shared.length === 1 ? '' : 's') + ' in common.</div>';
      h += '<div class="diffgrid">';
      h += '<div><div class="lab-sm">' + esc(a.name) + ' only</div>' +
        (R.aOnly.length ? R.aOnly.map(diffChip).join("") : '<div class="note">—</div>') + '</div>';
      h += '<div><div class="lab-sm">' + esc(b.name) + ' only</div>' +
        (R.bOnly.length ? R.bOnly.map(diffChip).join("") : '<div class="note">—</div>') + '</div>';
      h += '</div></div></div>';
    }

    box.innerHTML = h;
    $("#cmpGwSel", box).addEventListener("change", function () {
      state.cmpGw = +this.value; drawCompare(ds);
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
      '<button class="btn" data-ov="months">Month → GW map & prizes</button>' +
      '<button class="btn" data-ov="classicPrizes">Classic prizes</button>' +
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
    else if (kind === "classicPrizes") { title = "Classic prizes"; path = ["_configClassicPrizes"]; value = cfg.classicPrizes;
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

  function isMe(id) { return state.me && +id === +state.me; }

  document.addEventListener("DOMContentLoaded", boot);
})();
