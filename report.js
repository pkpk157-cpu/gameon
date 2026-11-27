/* Scouting reports: the weekly report for one position, drawn from
   reports/gw<N>/<pos>.json (scripts/scout.js), and the list of them on the
   News page. Charts are inline SVG and every number comes from the file.
   window.GOReport.render(host, report, opts) and .list(host, index, opts);
   opts: crest(short) -> html, face(id) -> url or "". */
(function () {
  "use strict";
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function fmt(n, d) { if (n == null || !isFinite(n)) return "–"; return Number(n).toLocaleString("en-GB", { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
  function money(p) { return "£" + fmt(p, 1) + "m"; }
  function signed(n, d) { if (!n) return "–"; return (n > 0 ? "+" : "−") + fmt(Math.abs(n), d); }
  function ord(n) { var s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
  function kfmt(n) { return (n > 0 ? "+" : n < 0 ? "−" : "") + (Math.abs(n) >= 1000 ? fmt(Math.abs(n) / 1000) + "k" : fmt(Math.abs(n))); }
  var TAGS = { BUY: "buy", HOLD: "hold", WATCH: "watch", SELL: "sell" };
  var GK = function (R) { return R.key === "gkp"; };
  var DEF = function (R) { return R.key === "def"; };
  function fdrCls(d) { return "rp-d" + Math.max(1, Math.min(5, d || 3)); }
  function out(p) { return p.status === "i" || p.status === "s" || p.status === "u" || p.status === "n" || (p.chance != null && p.chance <= 25); }
  function flag(p) {
    if (p.status === "i") return '<span class="rp-flag">INJ</span>';
    if (p.status === "s") return '<span class="rp-flag">SUS</span>';
    if (p.status === "u" || p.status === "n") return '<span class="rp-flag">OUT</span>';
    if (p.chance != null && p.chance < 100) return '<span class="rp-flag amb">' + p.chance + "%</span>";
    return "";
  }
  function teamCell(p, o) { return '<span class="rp-team">' + (o.crest ? o.crest(p.team) : "") + esc(p.team) + "</span>"; }

  /* ---- charts ---- */
  // a scatter with labels; pts: [{x, y, r, hollow, label, hi}]
  function scatter(pts, c) {
    var W = 340, H = 250, L = 34, R = 10, T = 12, B = 32;
    if (!pts.length) return "";
    var xs = pts.map(function (p) { return p.x; }), ys = pts.map(function (p) { return p.y; });
    var x0 = c.x0 != null ? c.x0 : Math.min.apply(null, xs), x1 = c.x1 != null ? c.x1 : Math.max.apply(null, xs);
    var y0 = Math.min(0, Math.min.apply(null, ys)), y1 = Math.max.apply(null, ys) * 1.08 || 1;
    if (x1 === x0) x1 = x0 + 1;
    var X = function (v) { var t = (v - x0) / (x1 - x0); if (c.xRev) t = 1 - t; return L + t * (W - L - R); };
    var Y = function (v) { return H - B - (v - y0) / (y1 - y0) * (H - T - B); };
    var g = '<svg class="rp-chart" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(c.aria || "") + '">';
    if (c.zone) g += '<rect class="rp-zone" x="' + Math.min(X(c.zone[0]), X(x1)) + '" y="' + T + '" width="' + Math.abs(X(x1) - X(c.zone[0])) + '" height="' + (Y(c.zone[1]) - T) + '"/>';
    [0, 0.25, 0.5, 0.75, 1].forEach(function (f) {
      var v = y0 + f * (y1 - y0), y = Y(v);
      g += '<line class="rp-grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '"/><text class="rp-ax" x="' + (L - 5) + '" y="' + (y + 3) + '" text-anchor="end">' + fmt(v, c.yDec || 0) + "</text>";
    });
    [0, 0.5, 1].forEach(function (f) { var v = x0 + f * (x1 - x0); g += '<text class="rp-ax" x="' + X(v) + '" y="' + (H - B + 13) + '" text-anchor="middle">' + fmt(v, c.xDec == null ? 1 : c.xDec) + "</text>"; });
    if (c.fit) {
      // the least-squares line through the points
      var n = pts.length, mx = xs.reduce(function (a, b) { return a + b; }, 0) / n, my = ys.reduce(function (a, b) { return a + b; }, 0) / n;
      var sxy = 0, sxx = 0; pts.forEach(function (p) { sxy += (p.x - mx) * (p.y - my); sxx += (p.x - mx) * (p.x - mx); });
      var k = sxx ? sxy / sxx : 0, b = my - k * mx;
      pts.forEach(function (p) { p.above = p.y >= k * p.x + b; });
      g += '<line class="rp-fit" x1="' + X(x0) + '" y1="' + Y(k * x0 + b) + '" x2="' + X(x1) + '" y2="' + Y(k * x1 + b) + '"/>';
    }
    pts.slice().sort(function (a, b) { return (a.hi ? 1 : 0) - (b.hi ? 1 : 0); }).forEach(function (p) {
      g += '<circle class="rp-dot' + (p.hollow ? " hollow" : "") + (c.fit ? (p.above ? " up" : " dn") : "") + '" cx="' + X(p.x).toFixed(1) + '" cy="' + Y(p.y).toFixed(1) + '" r="' + (p.r || 3.5) + '"><title>' + esc(p.title || p.label || "") + "</title></circle>";
    });
    var placed = [];
    pts.filter(function (p) { return p.label; }).forEach(function (p) {
      var x = X(p.x) + (p.r || 3.5) + 3, y = Y(p.y) + 3;
      for (var i = 0; i < placed.length; i++) if (Math.abs(placed[i][1] - y) < 9 && Math.abs(placed[i][0] - x) < 48) y = placed[i][1] + 9;
      placed.push([x, y]);
      var anchor = x > W - 60 ? "end" : "start";
      g += '<text class="rp-lbl" x="' + (anchor === "end" ? X(p.x) - (p.r || 3.5) - 3 : x) + '" y="' + y + '" text-anchor="' + anchor + '">' + esc(p.label) + "</text>";
    });
    g += '<text class="rp-axt" x="' + ((L + W - R) / 2) + '" y="' + (H - 4) + '" text-anchor="middle">' + esc(c.xLabel || "") + '</text>';
    g += '<text class="rp-axt" transform="translate(10 ' + ((T + H - B) / 2) + ') rotate(-90)" text-anchor="middle">' + esc(c.yLabel || "") + "</text>";
    return g + "</svg>";
  }
  // horizontal bars: [{name, team, v}]
  function bars(items, c) {
    var mx = Math.max.apply(null, items.map(function (x) { return Math.abs(x.v); })) || 1;
    return '<div class="rp-bars ' + (c.cls || "") + '">' + items.map(function (x) {
      return '<div class="rp-bar"><span class="rp-bn">' + esc(x.name) + '</span><span class="rp-bt">' + esc(x.team || "") + '</span><span class="rp-bw"><i style="width:' +
        (Math.abs(x.v) / mx * 100).toFixed(1) + '%"></i></span><b>' + fmt(x.v, c.dec == null ? 1 : c.dec) + "</b></div>";
    }).join("") + "</div>";
  }
  // diverging bars around zero: [{name, v}]
  function diverge(items, c) {
    var mx = Math.max.apply(null, items.map(function (x) { return Math.abs(x.v); })) || 1;
    return '<div class="rp-div">' + items.map(function (x) {
      var w = (Math.abs(x.v) / mx * 50).toFixed(1);
      return '<div class="rp-dv"><span class="rp-bn">' + esc(x.name) + '</span><span class="rp-dw"><i class="' + (x.v < 0 ? "neg" : "pos") + '" style="width:' + w + "%;" + (x.v < 0 ? "right:50%" : "left:50%") + '"></i></span><b>' + signed(x.v, 1) + "</b></div>";
    }).join("") + "</div>";
  }
  // points by gameweek as small bars
  function gwBars(gws, recentFrom) {
    var mx = Math.max.apply(null, gws.map(function (v) { return v || 0; }).concat([4]));
    return '<div class="rp-gwb">' + gws.map(function (v, i) {
      var h = v == null ? 0 : Math.max(2, Math.max(0, v) / mx * 100);
      return '<span class="' + (i + 1 >= recentFrom ? "rc" : "") + (v == null ? " none" : "") + '"><em>' + (v == null ? "–" : v) + '</em><i style="height:' + h.toFixed(0) + '%"></i><small>' + (i + 1) + "</small></span>";
    }).join("") + "</div>";
  }
  function fixPill(gm) {
    if (!gm.length) return '<span class="rp-fx rp-d5 blank">–</span>';
    return gm.map(function (g) { return '<span class="rp-fx ' + fdrCls(g.d) + '">' + esc(g.h ? g.o : g.o.toLowerCase()) + "</span>"; }).join("");
  }

  /* ---- the report ---- */
  function render(host, R, o) {
    o = o || {};
    var P = {}; R.players.forEach(function (p) { P[p.id] = p; });
    var gk = GK(R), def = DEF(R), cur = R.after, rf = R.recent[0], rl = "GW" + rf + "–" + cur;
    var dl = new Date(R.deadline);
    var dlTxt = isFinite(dl) ? dl.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
    var secs = [["rpVerdict", "Verdict"], ["rpTable", "Leaderboard"], ["rpValue", "Value"], ["rpForm", "Form"], ["rpFix", "Fixtures"], ["rpModel", "Model"], ["rpFiles", "Players"], ["rpPlan", "Plan"]];
    var h = '<article class="rp">';
    h += '<header class="rp-hero"><div class="rp-kick">Fantasy Premier League · after GW' + cur + " · for the GW" + R.gw + " deadline</div>" +
      '<h1>The ' + esc(R.name.toLowerCase()) + "<span>Scouting report</span></h1>" +
      '<p>The top ' + R.n + " " + esc(R.name.toLowerCase()) + " by FPL points: value, underlying numbers, form, fixtures, a weighted model, player files and a transfer plan for the GW" + R.gw + " deadline" + (dlTxt ? " (" + esc(dlTxt) + ")" : "") + ".</p>" +
      (o.pdf ? '<a class="rp-pdf" href="' + esc(o.pdf) + '" download target="_blank" rel="noopener">Download PDF</a>' : "") + "</header>";
    h += '<nav class="rp-nav" aria-label="Sections">' + secs.map(function (s) { return '<a href="#" data-rp-jump="' + s[0] + '">' + s[1] + "</a>"; }).join("") + "</nav>";
    h += '<div class="rp-heads">' + R.head.map(function (x) { return '<div class="rp-hd"><b>' + esc(x.v) + "</b><span>" + esc(x.k) + "</span><small>" + esc(x.who) + "</small></div>"; }).join("") + "</div>";

    // verdict + form against fixtures
    var hiIds = {}; R.verdict.forEach(function (v) { v.ids.forEach(function (id) { hiIds[id] = 1; }); });
    h += '<section class="rp-card" id="rpVerdict"><h2>The verdict</h2><div class="rp-verdict">' + R.verdict.map(function (v) {
      return '<div class="rp-v"><span class="rp-tag ' + TAGS[v.tag] + '">' + v.tag + "</span><p>" + esc(v.text) + "</p></div>";
    }).join("") + "</div></section>";
    var recents = R.players.map(function (p) { return p.recent; }).sort(function (a, b) { return b - a; });
    var cutY = recents[Math.min(9, recents.length - 1)];
    var fdrs = R.players.map(function (p) { return p.fdr; }).sort(function (a, b) { return a - b; });
    var cutX = fdrs[Math.floor(fdrs.length / 2)];
    h += '<section class="rp-card"><h2>Form against fixtures</h2><p class="rp-sub">Points in ' + rl + " against the weighted difficulty of the next six (easier to the right). Bigger dot = dearer; hollow = injured or suspended.</p>" +
      scatter(R.players.map(function (p) {
        return { x: p.fdr, y: p.recent, r: 2.5 + (p.price - 4) * 0.55, hollow: out(p), label: hiIds[p.id] || p.recent >= cutY ? p.name : "", hi: !!hiIds[p.id], title: p.name + " · " + p.recent + " pts · FDR " + p.fdr };
      }), { xRev: true, xLabel: "Average fixture difficulty, next six (lower = easier)", yLabel: "FPL points, " + rl, xDec: 1, zone: [cutX, cutY], aria: "Form against fixtures" }) + "</section>";

    // leaderboard
    var cols = gk ? [["CS", "cs"], ["SV", "sv"], ["SV/90", "sv90", 1], ["GC", "gc"], ["XGC", "xgc", 1], ["XGC/90", "xgc90", 2], ["BON", "bon"]]
      : def ? [["G", "g"], ["A", "a"], ["XGI/90", "xgi90", 2], ["CS", "cs"], ["DC/90", "dc90", 1], ["XGC/90", "xgc90", 2], ["BON", "bon"]]
      : R.key === "fwd" ? [["G", "g"], ["A", "a"], ["XG", "xg", 2], ["XA", "xa", 2], ["XGI/90", "xgi90", 2], ["BON", "bon"], ["PEN", "pen"]]
      : [["G", "g"], ["A", "a"], ["XG", "xg", 2], ["XA", "xa", 2], ["XGI/90", "xgi90", 2], ["BON", "bon"], ["CS", "cs"], ["DC/90", "dc90", 1], ["PEN", "pen"]];
    h += '<section class="rp-card" id="rpTable"><h2>The leaderboard</h2><p class="rp-sub">The top ' + R.n + " by total points. ΔPR = price change since the start; NET = transfers in minus out this week; " + rl + " = points in the last four.</p>" +
      '<div class="rp-scroll"><table class="rp-tbl"><thead><tr><th>#</th><th class="l">Player</th><th class="l">Team</th><th>£M</th><th>ΔPR</th><th>PTS</th><th>PTS/90</th><th>MINS</th>' +
      cols.map(function (c) { return "<th>" + c[0] + "</th>"; }).join("") + "<th>OWN%</th><th>NET</th><th>" + rf + "–" + cur + "</th></tr></thead><tbody>" +
      R.players.slice().sort(function (a, b) { return b.pts - a.pts || b.mins - a.mins; }).map(function (p, i) {
        return '<tr data-rp-player="' + p.id + '"><td>' + (i + 1) + '</td><td class="l rp-nm">' + esc(p.name) + flag(p) + '</td><td class="l">' + teamCell(p, o) + "</td><td>" + fmt(p.price, 1) +
          '</td><td class="' + (p.dPrice > 0 ? "up" : p.dPrice < 0 ? "dn" : "") + '">' + signed(p.dPrice, 1) + "</td><td><b>" + p.pts + "</b></td><td>" + fmt(p.p90, 1) + "</td><td>" + fmt(p.mins) + "</td>" +
          cols.map(function (c) { var v = p[c[1]]; return "<td>" + (c[1] === "pen" ? (v || "–") : fmt(v, c[2] || 0)) + "</td>"; }).join("") +
          "<td>" + fmt(p.own, 1) + '</td><td class="' + (p.net > 0 ? "up" : p.net < 0 ? "dn" : "") + '">' + kfmt(p.net) + "</td><td>" + p.recent + "</td></tr>";
      }).join("") + "</tbody></table></div></section>";

    // value and underlying numbers
    var regular = R.players.filter(function (p) { return p.mins >= 600; });
    var valTop = R.players.slice().sort(function (a, b) { return b.ptsPerM - a.ptsPerM; }).slice(0, 15);
    var under = gk ? { k: "sv90", t: "Saves per 90 (600+ minutes)", d: 2 } : def ? { k: "dc90", t: "Defensive contributions per 90 (600+ minutes)", d: 1 } : { k: "xgi90", t: "xGI per 90 (600+ minutes)", d: 2 };
    var undTop = regular.slice().sort(function (a, b) { return b[under.k] - a[under.k]; }).slice(0, 15);
    var luckKey = gk ? "gcLuck" : "luck";
    var luckSorted = R.players.slice().sort(function (a, b) { return a[luckKey] - b[luckKey]; });
    var luckRows = luckSorted.slice(0, 10).concat(luckSorted.slice(-10)).filter(function (p, i, a) { return a.indexOf(p) === i; });
    h += '<section class="rp-card" id="rpValue"><h2>Value and underlying numbers</h2><div class="rp-two">' +
      '<div><h3>Points per £m (season)</h3>' + bars(valTop.map(function (p) { return { name: p.name, team: p.team, v: p.ptsPerM }; }), { cls: "g" }) + "</div>" +
      "<div><h3>" + under.t + "</h3>" + bars(undTop.map(function (p) { return { name: p.name, team: p.team, v: p[under.k] }; }), { cls: "c", dec: under.d }) + "</div></div>" +
      '<div class="rp-two"><div><h3>' + (gk ? "Saves against points" : "Chances against points") + '</h3><p class="rp-sub">' + (gk ? "x = saves per 90" : "x = xGI per 90") + "; y = points per 90 (600+ minutes). Green = above the line: returning more than the numbers suggest.</p>" +
      scatter(regular.map(function (p) { var x = gk ? p.sv90 : p.xgi90; return { x: x, y: p.p90, label: hiIds[p.id] ? p.name : "", title: p.name }; }), { fit: true, xLabel: gk ? "Saves per 90" : "xGI per 90", yLabel: "Points per 90", xDec: 2, yDec: 0, aria: "Chances against points" }) + "</div>" +
      "<div><h3>" + (gk ? "Goals conceded minus expected" : "Goals + assists minus xGI") + '</h3><p class="rp-sub">' + (gk ? "Negative: conceding fewer than the chances faced (good shot-stopping or luck). Positive: conceding more." : "Negative: unlucky, more returns should come. Positive: returning more than the chances; likely to cool.") + "</p>" +
      diverge(luckRows.map(function (p) { return { name: p.name, v: p[luckKey] }; })) + "</div></div></section>";

    // form
    var fids = R.form.ids.map(function (id) { return P[id]; }).filter(Boolean);
    var heat = function (v) { if (v == null) return ""; var t = Math.max(0, Math.min(1, v / 15)); return ' style="--h:' + t.toFixed(2) + '"'; };
    h += '<section class="rp-card" id="rpForm"><h2>Form: who is hot, who is not</h2><p class="rp-sub">Points in every gameweek for the 30 with most points in ' + rl + ", then points per game before and since.</p>" +
      '<div class="rp-scroll"><table class="rp-tbl rp-heat"><thead><tr><th class="l">Player</th>' + R.players[0].gws.map(function (v, i) { return '<th class="' + (i + 1 >= rf ? "rc" : "") + '">' + (i + 1) + "</th>"; }).join("") +
      "<th>" + rf + "–" + cur + "</th><th>PPG 1–" + (rf - 1) + "</th><th>PPG " + rf + "–" + cur + "</th><th>TREND</th><th>" + (gk ? "SV/90" : "XGI/90") + "</th></tr></thead><tbody>" +
      fids.map(function (p) {
        var d = p.ppgEarly != null && p.ppgRecent != null ? Math.round((p.ppgRecent - p.ppgEarly) * 10) / 10 : null;
        return '<tr data-rp-player="' + p.id + '"><td class="l rp-nm">' + esc(p.name) + ' <small>' + esc(p.team) + "</small></td>" + p.gws.map(function (v) { return '<td class="rp-hc"' + heat(v) + ">" + (v == null ? "–" : v) + "</td>"; }).join("") +
          "<td><b>" + p.recent + "</b></td><td>" + fmt(p.ppgEarly, 1) + "</td><td>" + fmt(p.ppgRecent, 1) + '</td><td class="' + (d > 0.9 ? "up" : d < -0.9 ? "dn" : "") + '">' + (d == null ? "–" : (d > 0.9 ? "▲" : d < -0.9 ? "▼" : "■") + signed(d, 1)) +
          "</td><td>" + fmt(gk ? p.rSv90 : p.rXgi90, 2) + "</td></tr>";
      }).join("") + "</tbody></table></div>" +
      '<div class="rp-two"><div><h3>Biggest movers: points per game before → since GW' + rf + "</h3>" + R.form.movers.map(function (m) {
        var p = P[m.id]; if (!p) return "";
        var mx = 12, a = Math.max(0, Math.min(mx, p.ppgEarly)) / mx * 100, b = Math.max(0, Math.min(mx, p.ppgRecent)) / mx * 100;
        return '<div class="rp-mv"><span class="rp-bn">' + esc(p.name) + '</span><span class="rp-mw"><i class="' + (m.d >= 0 ? "pos" : "neg") + '" style="left:' + Math.min(a, b).toFixed(1) + "%;width:" + Math.abs(b - a).toFixed(1) + '%"></i><em class="a" style="left:' + a.toFixed(1) + '%"></em><em class="b ' + (m.d >= 0 ? "pos" : "neg") + '" style="left:' + b.toFixed(1) + '%"></em></span><b>' + signed(m.d, 1) + "</b></div>";
      }).join("") + "</div><div><h3>What the form says</h3>" + R.form.text.map(function (t) { return "<p>" + esc(t) + "</p>"; }).join("") + "</div></div></section>";

    // fixtures
    var F = R.fixtures;
    h += '<section class="rp-card" id="rpFix"><h2>Fixtures: GW' + R.gw + "–" + (R.gw + 7) + '</h2><p class="rp-sub">FPL difficulty (capitals = home), sorted by the weighted average of the next six. Opp GA = goals a game the opponents concede at that venue; Opp GF = what they score.</p>' +
      '<div class="rp-scroll"><table class="rp-tbl rp-fixt"><thead><tr><th class="l">Team</th>' + F.teams[0].runs.map(function (r, i) { return "<th>GW" + (R.gw + i) + "</th>"; }).join("") + '<th>FDR</th><th>OPP GA</th><th>OPP GF</th><th class="l">Players</th></tr></thead><tbody>' +
      F.teams.map(function (t) {
        return '<tr><td class="l">' + (o.crest ? o.crest(t.team) : "") + esc(t.team) + "</td>" + t.runs.map(function (r) { return '<td class="rp-fxc">' + fixPill(r) + "</td>"; }).join("") +
          "<td><b>" + fmt(t.fdr, 2) + "</b></td><td>" + fmt(t.oppGA, 2) + "</td><td>" + fmt(t.oppGF, 2) + '</td><td class="l rp-small">' + esc(t.players.join(", ")) + "</td></tr>";
      }).join("") + "</tbody></table></div>" +
      '<div class="rp-three">' + [["a", "Best for GW" + R.gw + "–" + (R.gw + 2)], ["b", "Best for GW" + (R.gw + 3) + "–" + (R.gw + 5)], ["c", "Best for GW" + (R.gw + 6) + "–" + (R.gw + 7)]].map(function (b) {
        return "<div><h3>" + b[1] + "</h3>" + F.best[b[0]].map(function (t) {
          return '<div class="rp-best"><span class="rp-bt2">' + (o.crest ? o.crest(t.team) : "") + esc(t.team) + "<small>" + esc(t.player || "") + '</small></span><span class="rp-runs">' + t.runs.map(function (r) { return fixPill(r); }).join("") + "</span></div>";
        }).join("") + "</div>";
      }).join("") + '</div><div class="rp-note"><h3>How to read the runs</h3><p>' + esc(F.text) + "</p></div></section>";

    // the model
    var mids = R.model.ids.map(function (id) { return P[id]; }).filter(Boolean);
    var W = [0.45, 0.25, 0.20, 0.10];
    h += '<section class="rp-card" id="rpModel"><h2>The model: top 30</h2><p class="rp-sub">A rating over all ' + R.n + ": form 45%, fixtures 25%, points per £m 20%, minutes 10%. Form = 60% points in " + rl + " + 40% " + (gk ? "saves and expected goals against" : def ? "xGI, defensive contributions and expected goals against" : "xGI per 90") + " in those games; fixtures = weighted FPL difficulty of the next six; minutes = share of the last 360. The last three columns: the rank under other weightings.</p>" +
      '<div class="rp-scroll"><table class="rp-tbl rp-model"><thead><tr><th>#</th><th class="l">Player</th><th>£M</th><th>SCORE</th><th class="l">Contribution</th><th>FORM-HEAVY</th><th>FIXTURE-HEAVY</th><th>VALUE-HEAVY</th></tr></thead><tbody>' +
      mids.map(function (p) {
        return '<tr data-rp-player="' + p.id + '"><td>' + p.rank + '</td><td class="l rp-nm">' + esc(p.name) + flag(p) + " <small>" + esc(p.team) + "</small></td><td>" + fmt(p.price, 1) + "</td><td><b>" + p.score + '</b></td><td class="l"><span class="rp-stack">' +
          p.parts.map(function (x, i) { return '<i class="s' + i + '" style="width:' + (x * W[i] * 100).toFixed(1) + '%"></i>'; }).join("") + "</span></td>" +
          ["form", "fix", "value"].map(function (k) { return '<td class="' + (p.alt[k] <= 5 ? "up" : "") + '">' + p.alt[k] + "</td>"; }).join("") + "</tr>";
      }).join("") + '</tbody></table></div><div class="rp-key"><span><i class="s0"></i>Form (45%)</span><span><i class="s1"></i>Fixtures (25%)</span><span><i class="s2"></i>Points per £m (20%)</span><span><i class="s3"></i>Minutes (10%)</span></div>' +
      '<div class="rp-note"><p>' + esc(R.model.text) + "</p></div></section>";

    // player files
    var file = function (f) {
      var p = P[f.id]; if (!p) return "";
      var face = o.face ? o.face(p.id) : "";
      var tiles = gk ? [[p.pts, "PTS"], [p.cs, "CS"], [p.sv, "SAVES"], [fmt(p.xgc90, 2), "XGC/90"], [p.recent, rl.replace("GW", "GW ")], [p.bon, "BONUS"]]
        : def ? [[p.pts, "PTS"], [p.cs, "CS"], [fmt(p.dc90, 1), "DC/90"], [fmt(p.xgi90, 2), "XGI/90"], [p.recent, rl.replace("GW", "GW ")], [p.bon, "BONUS"]]
        : [[p.pts, "PTS"], [p.g + "/" + p.a, "G/A"], [fmt(p.xg + p.xa, 2), "XGI"], [fmt(p.xgi90, 2), "XGI/90"], [p.recent, rl.replace("GW", "GW ")], [p.bon, "BONUS"]];
      return '<div class="rp-file" data-rp-player="' + p.id + '"><div class="rp-fh">' + (face ? '<img class="rp-face" src="' + esc(face) + '" alt="" width="48" height="48" loading="lazy">' : "") +
        '<div><h3>' + esc(p.name) + "</h3><small>" + esc(p.teamName) + " · " + money(p.price) + " · " + fmt(p.own, 1) + "% owned · model #" + p.rank + (p.pen === 1 ? " · penalties #1" : "") + '</small></div><span class="rp-tag ' + TAGS[f.tag] + '">' + f.tag + "</span></div>" +
        '<div class="rp-tiles">' + tiles.map(function (t, i) { return '<span class="' + (i === 0 ? "hi" : "") + '"><b>' + t[0] + "</b><small>" + t[1] + "</small></span>"; }).join("") + "</div>" +
        gwBars(p.gws, rf) + '<div class="rp-next"><small>Next six</small>' + teamRuns(R, p) + "</div><p>" + esc(f.text) + "</p></div>";
    };
    var teamRuns = function (R2, p) { var t = R2.fixtures.teams.find(function (x) { return x.team === p.team; }); return t ? t.runs.slice(0, 6).map(fixPill).join("") : ""; };
    h += '<section class="rp-card" id="rpFiles"><h2>Player files: the big names</h2><div class="rp-files">' + R.files.filter(function (f) { return f.group === "big"; }).map(file).join("") + "</div></section>";
    h += '<section class="rp-card"><h2>Player files: budget picks</h2><div class="rp-files">' + R.files.filter(function (f) { return f.group === "budget"; }).map(file).join("") + "</div></section>";

    // the plan
    var L = R.plan;
    var row = function (id, right) { var p = P[id]; return p ? '<div class="rp-pr" data-rp-player="' + p.id + '"><span class="rp-nm">' + esc(p.name) + "</span><small>" + esc(p.team) + " " + money(p.price) + "</small>" + right + "</div>" : ""; };
    h += '<section class="rp-card" id="rpPlan"><h2>The plan for GW' + R.gw + '</h2><div class="rp-two">' +
      "<div><h3>Moves by budget</h3>" + L.budget.map(function (b) { return '<div class="rp-band"><b>' + esc(b.band) + "</b><p>" + esc(b.text) + "</p></div>"; }).join("") + "</div>" +
      "<div><h3>GW" + R.gw + " captaincy: " + esc(R.name.toLowerCase()) + " ranked</h3>" + L.captaincy.map(function (c, i) {
        var p = P[c.id]; if (!p) return "";
        return '<div class="rp-cap"><b class="n">' + (i + 1) + '</b><div><span class="rp-nm">' + esc(p.name) + "</span><small>" + esc(c.why) + '</small></div><span class="rp-fx ' + fdrCls(c.d) + '">' + esc(c.opp) + "</span></div>";
      }).join("") + "</div></div>" +
      '<div class="rp-three"><div><h3>Differentials (under 5% owned)</h3>' + L.diffs.map(function (id) { var p = P[id]; return row(id, "<em>" + fmt(p.own, 1) + "% · #" + p.rank + "</em>"); }).join("") + "</div>" +
      "<div><h3>Price watch: net transfers</h3><h4>Most bought</h4>" + L.up.map(function (id) { return row(id, '<em class="up">' + kfmt(P[id].net) + "</em>"); }).join("") +
      "<h4>Most sold</h4>" + L.down.map(function (id) { return row(id, '<em class="dn">' + kfmt(P[id].net) + "</em>"); }).join("") + "</div>" +
      "<div><h3>Unavailable or doubtful</h3>" + (L.out.length ? L.out.map(function (x) { var p = P[x.id]; return '<div class="rp-pr col"><span class="rp-nm">' + esc(p.name) + " <small>" + esc(p.team) + "</small></span><small>" + esc(x.news) + "</small></div>"; }).join("") : '<p class="rp-sub">Everyone is available.</p>') + "</div></div>" +
      (L.changes.length ? '<div class="rp-note"><h3>What would change these calls</h3><ul>' + L.changes.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul></div>" : "") + "</section>";

    h += '<p class="rp-src">Source: official Fantasy Premier League data (fantasy.premierleague.com), built ' + esc(new Date(R.built).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })) +
      " after GW" + cur + ". Verdicts and commentary come from fixed rules over these numbers. Fixture difficulty = FPL's own 1–5 rating. Prices and transfers move through the week: check the FPL app before the deadline.</p></article>";
    host.innerHTML = h;
    host.querySelectorAll("[data-rp-jump]").forEach(function (a) {
      a.addEventListener("click", function (e) {
        e.preventDefault();
        var t = document.getElementById(a.getAttribute("data-rp-jump"));
        if (t) t.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
    if (o.onPlayer) host.addEventListener("click", function (e) {
      var t = e.target.closest("[data-rp-player]");
      if (t && !e.target.closest("a")) o.onPlayer(+t.getAttribute("data-rp-player"));
    });
  }

  /* ---- the list on the News page ---- */
  var POS_ICON = { gkp: "GK", def: "DEF", mid: "MID", fwd: "FWD" };
  function list(host, index, o) {
    o = o || {};
    var reps = (index && index.reports) || [];
    if (!reps.length) { host.innerHTML = '<div class="callout">No scouting reports yet. The first arrives once a gameweek is finished and checked.</div>'; return; }
    var latest = reps[0];
    var h = '<div class="rp-list"><div class="rp-lh"><b>GW' + latest.gw + ' scouting reports</b><small>After GW' + latest.after + " · for the GW" + latest.gw + " deadline</small></div>" +
      '<div class="rp-lcards">' + latest.positions.map(function (p) {
        return '<a class="rp-lcard" href="#news/report/' + latest.gw + "/" + p.key + '"><span class="rp-lic">' + POS_ICON[p.key] + '</span><b>The ' + esc(p.name.toLowerCase()) + "</b><small>Top scorer: " + esc(p.top) + "</small><p>" + esc(p.verdict) + "</p></a>";
      }).join("") + "</div>";
    if (reps.length > 1) h += '<div class="rp-lh sm"><b>Earlier gameweeks</b></div><div class="card rp-older">' + reps.slice(1).map(function (r) {
      return '<div class="rp-orow"><b>GW' + r.gw + "</b><span>" + r.positions.map(function (p) { return '<a href="#news/report/' + r.gw + "/" + p.key + '">' + POS_ICON[p.key] + "</a>"; }).join("") + "</span></div>";
    }).join("") + "</div>";
    host.innerHTML = h + "</div>";
  }

  window.GOReport = { render: render, list: list };
})();
