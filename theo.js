/* ==========================================================================
   Game On V12 — Theo, the lion in the corner.

   A small drawn lion, bottom-left, above the tab bar. He greets you once
   each time the app opens, after the data is in so what he says is true,
   and says something else when you tap him — sweet or sharp, and always
   about your week. Every figure he quotes comes from the same store and
   arithmetic the pages use, so he can never contradict a table.

   He slides away while you scroll down and comes back when you stop, sits
   under nothing that opens over the page, honours reduced motion, and can
   be switched off under Settings. Nothing in the app depends on him: if
   this file never loads, nothing else notices.
   ========================================================================== */
(function () {
  "use strict";
  var KEY = "go12.theo";
  var root = null, lion = null, bub = null, ctx = { me: null };
  var greeted = false, last = -1, lastAct = "", bubT = null, awayT = null, idleT = null, scrollY = {};
  // Ten taps in one session and he turns: the face changes and so does the
  // tongue. He stays turned until the app is opened again.
  var taps = 0, savage = false, SAVAGE_AT = 10;

  function isOff() { try { return localStorage.getItem(KEY) === "off"; } catch (e) { return false; } }
  function setOff(off) { try { if (off) localStorage.setItem(KEY, "off"); else localStorage.removeItem(KEY); } catch (e) {} }
  function num(n) { return n == null || isNaN(n) ? "—" : Number(n).toLocaleString("en-US"); }
  function ord(n) { var s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
  function pl(n, w) { return num(n) + " " + w + (n === 1 ? "" : "s"); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  var CHIP = { bboost: "Bench Boost", "3xc": "Triple Captain", freehit: "Free Hit", wildcard: "Wildcard" };

  /* ---- what he knows: the week, read through the app's own arithmetic ---- */
  var _built = { key: null, val: null };
  function build(ds, me) {
    var key = (ds && ds.updatedAt || "") + "|" + (me || "") + "|" + new Date().getHours();
    if (_built.key === key && _built.val) return _built.val;
    var val = build0(ds, me);
    _built = { key: key, val: val };
    return val;
  }
  function build0(ds, me) {
    var c = { me: null, name: null, hour: new Date().getHours(), day: new Date().getDay(), n: 0 };
    var C = window.GO_COMPUTE;
    if (!ds || !ds.managers || !ds.managers.length || !C) return c;
    c.n = ds.managers.length;
    var ev = (ds.bootstrap && ds.bootstrap.events) || [];
    var live = C.liveGwId(ds);
    c.live = live || null; c.gw = C.currentGw(ds);
    var next = ev.filter(function (e) { return e.is_next; })[0];
    c.nextGw = next ? next.id : null;
    c.hours = next && next.deadline_time ? (Date.parse(next.deadline_time) - Date.now()) / 36e5 : null;
    var fx = (ds.gwFixtures || {})[live] || [];
    c.fxTotal = fx.length;
    c.inPlay = fx.filter(function (f) { return f[2] && !(f[3] || f[8]); }).length;
    c.toCome = fx.filter(function (f) { return !f[2]; }).length;
    c.done = !!(live && fx.length && fx.every(function (f) { return f[3] || f[8]; }));
    var ge = ev.filter(function (e) { return +e.id === +live; })[0];
    c.checked = !!(ge && ge.finished && ge.data_checked);
    if (!me) return c;
    var mm = C.managerMap(ds)[+me];
    if (!mm) return c;
    c.me = +me; c.name = mm.entryName;
    var sn = C.snapshot(ds, me);
    if (sn) {
      c.total = sn.total; c.pts = sn.gwPoints; c.avg = sn.leagueAvg; c.rank = sn.rank; c.tied = sn.tied;
      c.move = sn.move || 0; c.overall = sn.overall; c.overallMove = sn.overallMove || 0;
      c.leading = !!sn.leading; c.behind = sn.behindLeader; c.chipsPlayed = sn.chipPlays || 0;
      c.best = sn.best;
    }
    var g = live || c.gw, row = ((ds.history || {})[me] || {})[g];
    c.hits = row ? (row.h || 0) : 0; c.bench = row ? (row.b || 0) : 0; c.tr = row ? (row.tr || 0) : 0;
    var pk = ds.picks && ds.picks[g] && ds.picks[g][me];
    if (pk && pk.p) {
      var cap = null, mult = 0;
      pk.p.forEach(function (t) { if (t[1] >= 2 && t[1] > mult) { mult = t[1]; cap = t[0]; } });
      if (cap !== null) {
        var lp = ds.picksV >= 2 ? ((ds.livePoints || {})[g] || {}) : ((+g === +ds.pitchGw) ? (ds.livePoints || {}) : {});
        var el = ds.elements && ds.elements[cap];
        c.cap = el ? el[0] : null;
        c.capPts = typeof lp[cap] === "number" ? lp[cap] * mult : null;
        c.tc = mult === 3;
      }
      c.chipNow = pk.c || null;
    }
    c.scored = !!(live && typeof c.pts === "number" && (c.inPlay > 0 || c.done || c.toCome < c.fxTotal));
    try {
      var lms = C.lms(ds);
      if (lms && lms.survivors) {
        c.lmsOutGw = lms.eliminatedAt[me] || null;
        c.lmsAlive = !c.lmsOutGw;
        c.lmsLeft = lms.survivors.length; c.lmsOut = c.n - c.lmsLeft;
      }
    } catch (e) {}
    // where you stand in each of the five competitions, as the profile prints it
    try {
      var P = C.prizeStatus(ds, me) || [];
      c.comp = {};
      P.forEach(function (e) {
        var k = /^Classic/.test(e.comp) ? "classic" : /^Month/.test(e.comp) ? "monthly" : /^Last/.test(e.comp) ? "lms"
              : /^Pyramid/.test(e.comp) ? "pyramid" : /^UCL/.test(e.comp) ? "ucl" : null;
        if (k) c.comp[k] = e;
      });
      c.inCount = P.filter(function (e) { return e.state === "in" || e.state === "alive"; }).length;
      c.compCount = P.length;
      c.xpCourse = P.reduce(function (t, e) { return t + ((e.state === "in" && !e.settled) ? (e.prize || 0) : 0); }, 0);
      var pyr = c.comp.pyramid;
      c.division = pyr && pyr.where ? String(pyr.where).split("\u00b7")[0].trim() : null;
    } catch (e) {}
    // last night's price moves, and whether any were yours
    try {
      var log = ds.priceLog || [];
      if (log.length) {
        var latest = log.reduce(function (m, r) { return r[3] > m ? r[3] : m; }, "");
        var since = Date.parse(latest) - 6 * 36e5;
        var night = log.filter(function (r) { return Date.parse(r[3]) >= since; });
        c.rises = night.filter(function (r) { return r[2] > r[1]; }).length;
        c.falls = night.filter(function (r) { return r[2] < r[1]; }).length;
        var mine = {};
        if (pk && pk.p) pk.p.forEach(function (t) { mine[t[0]] = 1; });
        var nm = function (el) { var e = ds.elements && ds.elements[el]; return e ? e[0] : null; };
        var up = night.filter(function (r) { return r[2] > r[1] && mine[r[0]]; })[0];
        var dn = night.filter(function (r) { return r[2] < r[1] && mine[r[0]]; })[0];
        if (up && nm(up[0])) c.myRise = { name: nm(up[0]), price: up[2] / 10 };
        if (dn && nm(dn[0])) c.myFall = { name: nm(dn[0]), price: dn[2] / 10 };
        var big = night.filter(function (r) { return r[2] > r[1]; }).sort(function (a, b) { return (b[5] || 0) - (a[5] || 0); })[0];
        if (big && nm(big[0])) c.bigRiser = { name: nm(big[0]), price: big[2] / 10 };
      }
    } catch (e) {}
    // the league's players this week
    try {
      var H = C.highlights(ds, g), q = H && H.squads;
      if (q) {
        var mo = q.mostOwned && q.mostOwned[0]; if (mo) c.mostOwned = { name: mo.name, pct: mo.ownedPct };
        var mc = q.mostCaptained && q.mostCaptained[0]; if (mc) c.mostCap = { name: mc.name, caps: mc.caps };
        var bv = q.bestValue && q.bestValue[0]; if (bv) c.bestValue = { name: bv.name, value: bv.value, owners: bv.owners };
        var df = q.differentials && q.differentials[0]; if (df) c.diff = { name: df.name, pts: df.pts, owners: df.owners };
        var pr = q.priciest && q.priciest[0]; if (pr) c.priciest = { name: pr.name, price: pr.price / 10, pct: pr.ownedPct };
      }
      if (H && H.potw && H.potw.pts > 0) c.potw = { name: H.potw.name, pts: H.potw.pts, pct: H.potw.ownedPct };
      var els = ds.elements || {}, keys = Object.keys(els);
      c.nPlayers = keys.length;
      var best = null;
      keys.forEach(function (el) { var e = els[el]; var f = +e[9]; if (f > 0 && (!best || f > best.form)) best = { name: e[0], form: f }; });
      if (best && best.form >= 5) c.topForm = best;
    } catch (e) {}
    // the season's habits
    try {
      var snr = C.snapshot(ds, me);
      c.seasonHits = snr ? snr.hits : null; c.seasonTr = snr ? snr.transfers : null;
      c.gwsPlayed = C.finishedGws(ds).length;
    } catch (e) {}
    try {
      var B = C.badges(ds, me) || [];
      var has = function (k) { return B.some(function (b) { return b.k === k; }); };
      c.leader = has("leader"); c.topTen = has("topten") || c.leader; c.bottomTen = has("bottomten");
      c.sliding = has("slide"); c.climbing = has("climb"); c.asleep = has("asleep");
      c.spoon = has("spoon"); c.benched = has("benched"); c.topBadge = has("top"); c.captBadge = has("capt");
    } catch (e) {}
    return c;
  }

  /* ---- the hundred lines ------------------------------------------------- */
  // Each: when it may be said, what it says. "k" groups them: a state-specific
  // line is preferred to a general one when both fit; "poke" lines only follow
  // a tap. Nothing here quotes a number it has not been given.
  var me = function (c) { return !!c.me; };
  var pre = function (c) { return me(c) && !c.live && c.hours != null && c.hours > 0; };
  var lock = function (c) { return me(c) && c.live && !c.scored && c.inPlay === 0 && c.toCome === c.fxTotal; };
  var liv = function (c) { return me(c) && c.live && c.scored; };
  var after = function (c) { return me(c) && !c.live && typeof c.pts === "number" && typeof c.avg === "number"; };
  var L = [
    // no team picked
    { k: "none", w: function (c) { return !me(c); }, t: function () { return "Tell me who you are and I’ll start keeping score. Settings, then your team."; } },
    { k: "none", w: function (c) { return !me(c); }, t: function (c) { return "I know all " + num(c.n || 245) + " of them. Which one’s you?"; } },
    { k: "none", w: function (c) { return !me(c); }, t: function () { return "Welcome to your FPL home. Pick your team and I’ll take it personally."; } },
    { k: "none", w: function (c) { return !me(c); }, t: function () { return "No name, no nagging. Pick your team when you’re ready."; } },
    { k: "none", w: function (c) { return !me(c); }, t: function () { return "I greet everyone. I only remember the ones who pick a team."; } },
    // before the deadline
    { k: "pre", w: function (c) { return pre(c) && c.hours < 1; }, t: function (c) { return "Deadline in " + pl(Math.max(1, Math.round(c.hours * 60)), "minute") + ". Whatever you’re thinking, think faster."; } },
    { k: "pre", w: function (c) { return pre(c) && c.hours >= 1 && c.hours < 3; }, t: function () { return "Under three hours to the deadline. Captain sorted?"; } },
    { k: "pre", w: function (c) { return pre(c) && c.hours >= 3 && c.hours < 24; }, t: function (c) { return num(Math.round(c.hours)) + " hours to the deadline and I already have a bad feeling about your bench."; } },
    { k: "pre", w: function (c) { return pre(c) && c.hours >= 24; }, t: function (c) { return pl(Math.round(c.hours / 24), "day") + " to the deadline. Plenty of time to overthink it."; } },
    { k: "pre", w: pre, t: function () { return "New week, new armband, same me."; } },
    { k: "pre", w: pre, t: function () { return "Free transfers don’t roll into next week’s regrets. Use them or don’t; I’m just the lion."; } },
    { k: "pre", w: function (c) { return pre(c) && c.chipsPlayed >= 3; }, t: function (c) { return pl(c.chipsPlayed, "chip") + " gone already. Pace yourself; May is a long way off."; } },
    { k: "pre", w: function (c) { return pre(c) && c.chipsPlayed === 0; }, t: function () { return "Not a chip played yet. Patient, or asleep? I’ll assume patient."; } },
    { k: "pre", w: function (c) { return pre(c) && c.rank <= 10; }, t: function (c) { return ord(c.rank) + " in the league going into GW" + c.nextGw + ". Don’t get clever."; } },
    { k: "pre", w: function (c) { return pre(c) && c.rank > c.n - 20; }, t: function (c) { return ord(c.rank) + " of " + num(c.n) + ". Nowhere to go but up, and I mean that kindly."; } },
    { k: "pre", w: pre, t: function (c) { return "Ready for GW" + c.nextGw + "? I’ve had a nap and a stretch. Your move."; } },
    { k: "pre", w: pre, t: function () { return "Before the deadline: check the injuries, check the captain, then check the captain again."; } },
    { k: "pre", w: function (c) { return pre(c) && c.best; }, t: function (c) { return "Your best week is still the " + num(c.best.points) + " in GW" + c.best.gw + ". Beat it this time?"; } },
    { k: "pre", w: function (c) { return pre(c) && c.lmsAlive && c.lmsOut > 0; }, t: function (c) { return "Still in Last Manager Standing with " + num(c.lmsOut) + " gone. A quiet week is fine; just don’t be lowest."; } },
    // locked, nothing kicked off
    { k: "lock", w: lock, t: function () { return "Deadline’s passed. Nothing to do now but watch. And refresh. And watch."; } },
    { k: "lock", w: function (c) { return lock(c) && c.cap; }, t: function (c) { return "Squads are locked. " + c.name + ", you’re on " + c.cap + " for the armband. Bold. Or obvious. We’ll see."; } },
    { k: "lock", w: lock, t: function () { return "Kick-off soon. I’ll be right here pretending not to care."; } },
    { k: "lock", w: lock, t: function () { return "The league average is about to be born. Be above it."; } },
    { k: "lock", w: function (c) { return lock(c) && c.hits > 0; }, t: function (c) { return "You took a " + num(c.hits) + "-point hit before a ball was kicked. Confidence. I like it."; } },
    { k: "lock", w: function (c) { return lock(c) && c.chipNow; }, t: function (c) { return (CHIP[c.chipNow] || c.chipNow) + " week. The whole league can see it. No pressure."; } },
    // live and scoring
    { k: "live", w: function (c) { return liv(c) && c.pts > c.avg + 20; }, t: function (c) { return num(c.pts) + " points with the league on " + num(c.avg) + ". Are you cheating? Kidding. Mostly."; } },
    { k: "live", w: function (c) { return liv(c) && c.pts > c.avg && c.pts <= c.avg + 20; }, t: function (c) { return num(c.pts) + " against an average of " + num(c.avg) + ". Above the line. Stay there."; } },
    { k: "live", w: function (c) { return liv(c) && c.pts < c.avg - 15; }, t: function (c) { return num(c.pts) + " while the average is " + num(c.avg) + ". There are matches left. I checked."; } },
    { k: "live", w: function (c) { return liv(c) && c.pts < c.avg && c.pts >= c.avg - 15; }, t: function (c) { return "Just under the average at " + num(c.pts) + ". The later games owe you."; } },
    { k: "live", w: function (c) { return liv(c) && c.capPts != null && c.capPts >= 20; }, t: function (c) { return c.cap + " on " + num(c.capPts) + " as captain. Frame it."; } },
    { k: "live", w: function (c) { return liv(c) && c.capPts != null && c.capPts <= 2 && c.done; }, t: function (c) { return "Your captain finished on " + num(c.capPts) + ". I’ve seen worse. Not many."; } },
    { k: "live", w: function (c) { return liv(c) && c.capPts != null && c.capPts <= 4 && !c.done; }, t: function (c) { return c.cap + " has " + num(c.capPts) + " so far. Still time. Some time. A bit."; } },
    { k: "live", w: function (c) { return liv(c) && c.bench >= 15; }, t: function (c) { return num(c.bench) + " points on your bench. We don’t talk about the bench."; } },
    { k: "live", w: function (c) { return liv(c) && c.bench >= 8 && c.bench < 15; }, t: function (c) { return num(c.bench) + " on the bench. Mildly annoying, like a wet sock."; } },
    { k: "live", w: function (c) { return liv(c) && c.move >= 10; }, t: function (c) { return "Up " + num(c.move) + " places this week and it isn’t over. Steady."; } },
    { k: "live", w: function (c) { return liv(c) && c.move <= -10; }, t: function (c) { return "Down " + num(-c.move) + " places. The table is a mean thing. Tomorrow’s another day."; } },
    { k: "live", w: function (c) { return liv(c) && c.inPlay > 0; }, t: function (c) { return pl(c.inPlay, "match") + " in play. Nobody move."; } },
    { k: "live", w: function (c) { return liv(c) && c.toCome > 0 && c.inPlay === 0; }, t: function (c) { return pl(c.toCome, "match") + " still to come this week. Your points aren’t finished; neither is the league."; } },
    { k: "live", w: function (c) { return liv(c) && c.done && !c.checked; }, t: function () { return "Every match done. Bonus and the auto subs land in the morning; sleep on it."; } },
    { k: "live", w: function (c) { return liv(c) && c.hits > 0 && c.pts > c.avg; }, t: function (c) { return "A " + num(c.hits) + "-point hit and still above the average. Justified. This time."; } },
    { k: "live", w: function (c) { return liv(c) && c.hits > 0 && c.pts <= c.avg; }, t: function (c) { return "The hit was " + num(c.hits) + ". The reward, so far, is " + num(c.pts) + ". I say nothing."; } },
    { k: "live", w: function (c) { return liv(c) && c.leader; }, t: function () { return "Top of the league while it’s live. Every phone in the league is watching you."; } },
    { k: "live", w: function (c) { return liv(c) && c.topTen && !c.leader; }, t: function () { return "Top ten and scoring. The others are refreshing your name."; } },
    { k: "live", w: function (c) { return liv(c) && c.tc; }, t: function (c) { return "Triple Captain on " + c.cap + ". Go big or go home — you’ve chosen."; } },
    { k: "live", w: function (c) { return liv(c) && c.chipNow === "bboost"; }, t: function () { return "Bench Boost. Your fifteen, all counting, all of them yours."; } },
    { k: "live", w: function (c) { return liv(c) && c.chipNow === "freehit"; }, t: function () { return "Free Hit week. One night only. Make it count."; } },
    { k: "live", w: function (c) { return liv(c) && c.pts >= 100; }, t: function (c) { return num(c.pts) + " points! Hundred up! I’m doing the run."; } },
    { k: "live", w: function (c) { return liv(c) && c.pts >= 80 && c.pts < 100; }, t: function (c) { return num(c.pts) + " and counting. That’s a proper week."; } },
    { k: "live", w: function (c) { return liv(c) && c.pts < 40 && c.done; }, t: function (c) { return num(c.pts) + ". A week for character building. You have loads now."; } },
    { k: "live", w: liv, t: function () { return "Live points move every ten minutes. Blinking is optional."; } },
    { k: "live", w: function (c) { return liv(c) && c.tied; }, t: function (c) { return "Level with someone on " + num(c.total) + ". A single point splits you. Shout at the telly accordingly."; } },
    // just finished, or between gameweeks
    { k: "after", w: function (c) { return after(c) && c.pts > c.avg + 20; }, t: function (c) { return num(c.pts) + " last week against " + num(c.avg) + ". Enjoy it. Enjoy it quietly."; } },
    { k: "after", w: function (c) { return after(c) && c.pts > c.avg && c.pts <= c.avg + 20; }, t: function (c) { return "Above the average last week with " + num(c.pts) + ". Solid. Boring word, good result."; } },
    { k: "after", w: function (c) { return after(c) && c.pts < c.avg - 15; }, t: function (c) { return num(c.pts) + " last week. The average was " + num(c.avg) + ". We move."; } },
    { k: "after", w: function (c) { return after(c) && c.pts < c.avg && c.pts >= c.avg - 15; }, t: function () { return "Just under last week. The kind of week you forget by Wednesday."; } },
    { k: "after", w: function (c) { return after(c) && c.bench >= 15; }, t: function (c) { return num(c.bench) + " left on the bench last week. Your bench outscored some starting elevens."; } },
    { k: "after", w: function (c) { return after(c) && c.move > 0; }, t: function (c) { return "Up " + num(c.move) + " last week. The climb continues."; } },
    { k: "after", w: function (c) { return after(c) && c.move < 0; }, t: function (c) { return "Down " + num(-c.move) + " last week. Your rivals look bigger in the mirror than they are."; } },
    { k: "after", w: function (c) { return me(c) && c.leading; }, t: function (c) { return "Top of the league. I’ll learn your name now. " + c.name + ". Got it."; } },
    { k: "after", w: function (c) { return me(c) && c.topTen && !c.leading; }, t: function () { return "Top ten. Keep this up and I’ll start wagging on purpose."; } },
    { k: "after", w: function (c) { return me(c) && c.bottomTen; }, t: function () { return "Bottom ten. Nobody’s looking. Except me. Kindly."; } },
    { k: "after", w: function (c) { return me(c) && c.sliding; }, t: function () { return "Sliding three weeks running. A transfer, or a cup of tea. Possibly both."; } },
    { k: "after", w: function (c) { return me(c) && c.climbing; }, t: function () { return "Climbing three weeks running. Don’t touch anything."; } },
    { k: "after", w: function (c) { return me(c) && c.asleep; }, t: function () { return "No transfers for a month. Either genius, or you’ve lost your phone."; } },
    { k: "after", w: function (c) { return me(c) && c.lmsAlive && c.lmsOut > 0 && !c.live; }, t: function (c) { return "Still standing in LMS with " + num(c.lmsOut) + " out. Tread carefully."; } },
    { k: "after", w: function (c) { return me(c) && c.lmsOutGw; }, t: function (c) { return "Out of LMS in GW" + c.lmsOutGw + ". There’s always the Classic. And me."; } },
    // where you stand
    { k: "stand", w: function (c) { return me(c) && c.overall && c.overall <= 100000; }, t: function (c) { return num(c.overall) + " in the world. That’s world with a capital W."; } },
    { k: "stand", w: function (c) { return me(c) && c.overall && c.overall > 4000000; }, t: function (c) { return num(c.overall) + " overall. FPL is a marathon, and you’ve stopped for a snack."; } },
    { k: "stand", w: function (c) { return me(c) && c.overallMove > 200000; }, t: function (c) { return "Up " + num(c.overallMove) + " places in the world last week. Have you told your mum?"; } },
    { k: "stand", w: function (c) { return me(c) && c.best; }, t: function (c) { return "Your best week: " + num(c.best.points) + " in GW" + c.best.gw + ". I remember it fondly."; } },
    { k: "stand", w: function (c) { return me(c) && typeof c.total === "number" && c.rank; }, t: function (c) { return num(c.total) + " points, " + ord(c.rank) + " of " + num(c.n) + ". Numbers don’t lie, but I embellish."; } },
    { k: "stand", w: function (c) { return me(c) && c.spoon; }, t: function () { return "You own a Wooden spoon. Not many in the league can say that. Fewer would want to."; } },
    { k: "stand", w: function (c) { return me(c) && c.topBadge; }, t: function () { return "A Top scorer badge. Framed above my basket."; } },
    { k: "stand", w: function (c) { return me(c) && c.benched; }, t: function () { return "Bench blunder on your record. It stays there. Like a tattoo."; } },
    { k: "stand", w: function (c) { return me(c) && c.captBadge; }, t: function () { return "Captain fantastic. Say it in a deep voice."; } },
    { k: "stand", w: function (c) { return me(c) && c.behind > 0; }, t: function (c) { return num(c.behind) + " behind the leader. Give me a minute to do the sums… no, still " + num(c.behind) + "."; } },
    // anyone, any time
    { k: "gen", w: function () { return true; }, t: function () { return "Welcome back to your FPL home."; } },
    { k: "gen", w: function () { return true; }, t: function () { return "Ready to see those points?"; } },
    { k: "gen", w: function () { return true; }, t: function () { return "How many hits are we taking this week? Rhetorical. I know."; } },
    { k: "gen", w: function (c) { return c.hour < 6; }, t: function () { return "It’s the middle of the night. The points won’t change. Go to bed."; } },
    { k: "gen", w: function (c) { return c.hour >= 6 && c.hour < 11; }, t: function () { return "Morning. Coffee first, then the table."; } },
    { k: "gen", w: function (c) { return c.hour >= 22; }, t: function () { return "Late one. The bonus is in the morning; so am I."; } },
    { k: "gen", w: function (c) { return c.day === 5; }, t: function () { return "Friday. Deadline-day energy."; } },
    { k: "gen", w: function (c) { return c.day === 1; }, t: function () { return "Monday. Time to admit what the bench did."; } },
    { k: "gen", w: function () { return true; }, t: function () { return "I’m Theo. I live here now."; } },
    { k: "gen", w: function (c) { return c.n > 1; }, t: function (c) { return num(c.n) + " managers, one lion. Fair fight."; } },
    { k: "gen", w: function () { return true; }, t: function () { return "Pull down to refresh. I’ll be here pretending it was my idea."; } },
    { k: "gen", w: function () { return true; }, t: function () { return "Tap me. I have opinions."; } },
    { k: "gen", w: function () { return true; }, t: function () { return "I don’t pick players. I just judge."; } },
    { k: "gen", w: function () { return true; }, t: function () { return "Every gameweek is a fresh start, except the ones that aren’t."; } },
    // where you stand in each of the five competitions
    { k: "comp", w: function (c) { return me(c) && c.comp && c.comp.classic && c.comp.classic.state === "in"; }, t: function (c) { var e = c.comp.classic; return ord(e.pos) + " in the Classic, " + num(e.gap) + " " + e.gapLabel + ". That\u2019s XP territory. Don\u2019t look down."; } },
    { k: "comp", w: function (c) { return me(c) && c.comp && c.comp.classic && c.comp.classic.state === "out" && c.comp.classic.gap != null; }, t: function (c) { var e = c.comp.classic; return ord(e.pos) + " in the Classic, " + num(e.gap) + " " + e.gapLabel + ". The money\u2019s up there. So are the stairs."; } },
    { k: "comp", w: function (c) { return me(c) && c.comp && c.comp.monthly && c.comp.monthly.state === "in"; }, t: function (c) { var e = c.comp.monthly; return ord(e.pos) + " in the " + e.where + " table. A month is a short race; sprint."; } },
    { k: "comp", w: function (c) { return me(c) && c.comp && c.comp.monthly && c.comp.monthly.state === "out" && c.comp.monthly.pos <= 20; }, t: function (c) { var e = c.comp.monthly; return ord(e.pos) + " for " + e.where + ", " + num(e.gap) + " " + e.gapLabel + ". One big week fixes that."; } },
    { k: "comp", w: function (c) { return me(c) && c.comp && c.comp.monthly && c.comp.monthly.state === "out" && c.comp.monthly.pos > 100; }, t: function (c) { var e = c.comp.monthly; return ord(e.pos) + " in " + e.where + ". Let\u2019s call it a rebuilding month."; } },
    { k: "comp", w: function (c) { return me(c) && c.comp && c.comp.lms && c.comp.lms.state === "alive" && c.lmsOut > 60; }, t: function (c) { return "Still standing in Last Manager, and " + num(c.lmsOut) + " aren\u2019t. Smug is allowed. Briefly."; } },
    { k: "comp", w: function (c) { return me(c) && c.comp && c.comp.lms && c.comp.lms.state !== "alive" && c.lmsOutGw; }, t: function (c) { return "Out of Last Manager in GW" + c.lmsOutGw + ". Four other pots. Five, if you count my respect."; } },
    { k: "comp", w: function (c) { return me(c) && c.comp && c.comp.pyramid && c.comp.pyramid.pos === 1 && c.division; }, t: function (c) { return "Top of the " + c.division + " in the Pyramid. Promotion smells like this."; } },
    { k: "comp", w: function (c) { return me(c) && c.comp && c.comp.pyramid && c.comp.pyramid.state === "in" && c.comp.pyramid.pos > 1 && c.division; }, t: function (c) { return ord(c.comp.pyramid.pos) + " in the " + c.division + ". Promotion places. Hold on to them."; } },
    { k: "comp", w: function (c) { return me(c) && c.comp && c.comp.pyramid && c.comp.pyramid.state === "out" && c.division; }, t: function (c) { return ord(c.comp.pyramid.pos) + " in the " + c.division + ". Not going up. Mind you don\u2019t go down."; } },
    { k: "comp", w: function (c) { return me(c) && c.comp && c.comp.ucl && c.comp.ucl.state === "in" && /UCL$/.test(c.comp.ucl.where); }, t: function (c) { return ord(c.comp.ucl.pos) + " in your group and in the Champions League places. Big nights ahead."; } },
    { k: "comp", w: function (c) { return me(c) && c.comp && c.comp.ucl && /UEL$/.test(c.comp.ucl.where); }, t: function (c) { return ord(c.comp.ucl.pos) + " in your group: the Europa slot. It\u2019s still Europe."; } },
    // once the draw is made the UCL entry names the bracket and the round
    { k: "comp", w: function (c) { return me(c) && c.comp && c.comp.ucl && c.comp.ucl.pos == null && c.comp.ucl.state === "alive"; }, t: function (c) { var w = String(c.comp.ucl.where).split(" \u00b7 "); return "Still in the " + w[0] + ": " + (w[1] || "the knockouts") + ". Two legs, nowhere to hide."; } },
    { k: "comp", w: function (c) { return me(c) && c.comp && c.comp.ucl && c.comp.ucl.pos == null && c.comp.ucl.state === "out"; }, t: function (c) { var w = String(c.comp.ucl.where).split(" \u00b7 "); return "Out of the " + w[0] + " in the " + (w[1] || "knockouts") + ". Thursday nights are your own again."; } },
    { k: "comp", w: function (c) { return me(c) && c.comp && c.comp.ucl && c.comp.ucl.pos == null && c.comp.ucl.state === "in"; }, t: function (c) { return "Champion of the " + String(c.comp.ucl.where).split(" \u00b7 ")[0] + ". Say it slowly. Then say it again."; } },
    { k: "comp", w: function (c) { return me(c) && c.comp && c.comp.ucl && c.comp.ucl.state === "out" && c.comp.ucl.pos > 4; }, t: function (c) { return ord(c.comp.ucl.pos) + " in your group. Thursday nights at best, and not even those."; } },
    { k: "comp", w: function (c) { return me(c) && c.compCount >= 5 && c.inCount === c.compCount; }, t: function () { return "In the money in all five. Insufferable. Deserved."; } },
    { k: "comp", w: function (c) { return me(c) && c.compCount >= 5 && c.inCount === 0; }, t: function () { return "Out of the money in all five. Bold strategy. Let\u2019s see how it plays out."; } },
    { k: "comp", w: function (c) { return me(c) && c.compCount >= 5 && c.inCount > 0 && c.inCount < c.compCount; }, t: function (c) { var rest = c.compCount - c.inCount; return "In " + num(c.inCount) + " of the five money spots. " + (rest === 1 ? "The other one is watching." : "The other " + num(rest) + " are watching."); } },
    { k: "comp", w: function (c) { return me(c) && c.xpCourse > 0; }, t: function (c) { return num(c.xpCourse) + " XP on course. Not in your pocket yet. Mine\u2019s empty too."; } },
    { k: "comp", w: function (c) { return me(c) && c.comp && c.comp.classic && c.comp.classic.pos <= 3 && !c.leading; }, t: function (c) { return ord(c.comp.classic.pos) + " in the Classic, " + num(c.behind) + " off the top. The leader can feel your breath."; } },
    { k: "comp", w: function (c) { return me(c) && c.comp && c.comp.classic && c.comp.classic.pos > c.n - 10; }, t: function (c) { return ord(c.comp.classic.pos) + " of " + num(c.n) + " in the Classic. I\u2019ve seen comebacks. Not from here, but I\u2019ve seen them."; } },
    { k: "comp", w: function (c) { return me(c) && c.comp && c.comp.monthly && c.comp.monthly.pos === 1; }, t: function (c) { return "Leading " + c.comp.monthly.where + ". Manager of the Month has a ring to it."; } },
    // prices
    { k: "price", w: function (c) { return me(c) && c.myRise; }, t: function (c) { return c.myRise.name + " rose to \u00a3" + c.myRise.price.toFixed(1) + "m overnight and you own him. Free money, the pretend kind."; } },
    { k: "price", w: function (c) { return me(c) && c.myFall; }, t: function (c) { return c.myFall.name + " dropped to \u00a3" + c.myFall.price.toFixed(1) + "m last night. You own him. I\u2019d look away."; } },
    { k: "price", w: function (c) { return c.rises > 0 || c.falls > 0; }, t: function (c) { return pl(c.rises || 0, "price rise") + " and " + pl(c.falls || 0, "fall") + " last night. The market never sleeps; I do."; } },
    { k: "price", w: function (c) { return !!c.bigRiser; }, t: function (c) { return c.bigRiser.name + " is up to \u00a3" + c.bigRiser.price.toFixed(1) + "m. The bandwagon has a door; it\u2019s closing."; } },
    { k: "price", w: function (c) { return !!c.priciest; }, t: function (c) { return c.priciest.name + " at \u00a3" + c.priciest.price.toFixed(1) + "m, owned by " + c.priciest.pct + "% of the league. Expensive taste, widely shared."; } },
    { k: "price", w: function (c) { return c.bestValue && c.bestValue.value > 1; }, t: function (c) { return c.bestValue.name + ": " + c.bestValue.value + " points per million this week. Bargain of the week, held by " + num(c.bestValue.owners) + " of you."; } },
    { k: "price", w: function (c) { return c.rises === 0 && c.falls === 0 && c.nPlayers > 0; }, t: function () { return "No price moves last night. Even the market took the evening off."; } },
    { k: "price", w: function (c) { return me(c) && !c.myRise && !c.myFall && c.rises > 0; }, t: function () { return "Prices moved last night and none were yours. Steady squad, or a lucky one."; } },
    { k: "price", w: function (c) { return me(c) && c.myRise && c.myFall; }, t: function (c) { return c.myRise.name + " up, " + c.myFall.name + " down. Your squad had a night of it."; } },
    { k: "price", w: function (c) { return c.rises >= 10; }, t: function (c) { return num(c.rises) + " rises in one night. Somebody\u2019s been busy. Everybody, in fact."; } },
    // the players
    { k: "player", w: function (c) { return !!c.mostOwned; }, t: function (c) { return c.mostOwned.name + " is in " + c.mostOwned.pct + "% of the league\u2019s squads. Original."; } },
    { k: "player", w: function (c) { return c.mostCap && c.mostCap.caps > 1; }, t: function (c) { return num(c.mostCap.caps) + " armbands on " + c.mostCap.name + " this week. If he blanks, so does everyone."; } },
    { k: "player", w: function (c) { return c.potw && c.potw.pct != null; }, t: function (c) { return c.potw.name + " scored " + num(c.potw.pts) + " this week. " + c.potw.pct + "% of the league had him."; } },
    { k: "player", w: function (c) { return c.potw && c.potw.pct == null; }, t: function (c) { return c.potw.name + " scored " + num(c.potw.pts) + " this week, and not one of you owned him. Awkward."; } },
    { k: "player", w: function (c) { return me(c) && c.cap && c.mostCap && c.cap !== c.mostCap.name; }, t: function (c) { return "You went " + c.cap + " while " + num(c.mostCap.caps) + " others went " + c.mostCap.name + ". Brave, or contrarian. Same thing."; } },
    { k: "player", w: function (c) { return me(c) && c.cap && c.mostCap && c.cap === c.mostCap.name; }, t: function (c) { return c.cap + " as captain, like " + num(c.mostCap.caps - 1) + " others. Safety in numbers. Or a herd."; } },
    { k: "player", w: function (c) { return c.diff && c.diff.pts >= 8; }, t: function (c) { return c.diff.name + ": " + num(c.diff.pts) + " points and under 10% ownership. " + num(c.diff.owners) + " of you saw it coming."; } },
    { k: "player", w: function (c) { return !!c.topForm; }, t: function (c) { return c.topForm.name + " is averaging " + c.topForm.form + " a game lately. Just saying."; } },
    { k: "player", w: function (c) { return c.nPlayers > 100; }, t: function (c) { return num(c.nPlayers) + " players in the game and you get fifteen. Choose wisely. Or don\u2019t; it\u2019s more fun for me."; } },
    { k: "player", w: function (c) { return c.mostOwned && c.mostOwned.pct >= 80; }, t: function (c) { return "Four in five of you own " + c.mostOwned.name + ". Not owning him is the real gamble."; } },
    { k: "player", w: function (c) { return me(c) && c.capPts != null && c.mostCap && c.cap === c.mostCap.name && c.capPts >= 12; }, t: function (c) { return "The whole league captained " + c.cap + " and he delivered " + num(c.capPts) + ". Nobody gains, nobody loses, everybody cheers."; } },
    { k: "player", w: function (c) { return c.bestValue && c.bestValue.owners <= 3 && c.bestValue.value > 2; }, t: function (c) { return c.bestValue.name + " returned " + c.bestValue.value + " points per million and " + pl(c.bestValue.owners, "manager") + " had him. Hipsters."; } },
    // praise, and digs
    { k: "mood", w: function (c) { return me(c) && typeof c.pts === "number" && c.pts > c.avg + 25 && c.rank <= 5; }, t: function (c) { return "Top five and " + num(c.pts) + " this week. I\u2019d purr if lions purred."; } },
    { k: "mood", w: function (c) { return me(c) && c.move >= 20; }, t: function (c) { return "Up " + num(c.move) + " places. That\u2019s not a climb, that\u2019s a lift."; } },
    { k: "mood", w: function (c) { return me(c) && c.move <= -20; }, t: function (c) { return "Down " + num(-c.move) + " places. Did you forget the deadline, or just the football?"; } },
    { k: "mood", w: function (c) { return me(c) && c.bench >= 25; }, t: function (c) { return num(c.bench) + " on the bench. Your subs are auditioning for the first team, and winning."; } },
    { k: "mood", w: function (c) { return me(c) && c.hits >= 8; }, t: function (c) { return "\u2212" + num(c.hits) + " in hits this week. Aggressive. Let\u2019s call it aggressive."; } },
    { k: "mood", w: function (c) { return me(c) && c.leading && typeof c.pts === "number" && c.pts > c.avg; }, t: function () { return "Top, and outscoring the average. Everyone else is playing for second."; } },
    { k: "mood", w: function (c) { return me(c) && c.bottomTen && typeof c.pts === "number" && c.pts > c.avg; }, t: function () { return "Bottom ten, but above the average this week. Green shoots. Tiny ones."; } },
    { k: "mood", w: function (c) { return me(c) && c.capPts != null && c.capPts >= 26; }, t: function (c) { return c.cap + " with " + num(c.capPts) + " as captain. You get the credit; he did the running."; } },
    { k: "mood", w: function (c) { return me(c) && c.best && c.best.points >= 120; }, t: function (c) { return "Your best week was " + num(c.best.points) + ". Once. The FPL gods giveth."; } },
    { k: "mood", w: function (c) { return me(c) && c.seasonHits === 0 && c.gwsPlayed >= 4; }, t: function () { return "Not a single hit all season. Discipline, or fear? Either works."; } },
    { k: "mood", w: function (c) { return me(c) && c.seasonHits >= 20; }, t: function (c) { return num(c.seasonHits) + " points of hits this season. You could have bought a small car with those."; } },
    { k: "mood", w: function (c) { return me(c) && c.seasonTr >= 12; }, t: function (c) { return pl(c.seasonTr, "transfer") + " already. Restless. I respect it. Your rank doesn\u2019t."; } },
    { k: "mood", w: function (c) { return me(c) && c.topTen && c.climbing; }, t: function () { return "Top ten and still climbing. Leave the settings alone, you\u2019re doing something right."; } },
    { k: "mood", w: function (c) { return me(c) && c.bottomTen && c.sliding; }, t: function () { return "Bottom ten and sliding. I\u2019m not angry. I\u2019m a lion; I\u2019m disappointed."; } },
    { k: "mood", w: function (c) { return me(c) && typeof c.pts === "number" && c.pts < c.avg - 25; }, t: function (c) { return num(c.pts) + " against an average of " + num(c.avg) + ". Was the wildcard active? Was anything?"; } },
    // the terraces: the chants every ground knows, turned on the week
    { k: "chant", w: function (c) { return liv(c) && c.pts < c.avg; }, t: function () { return "You\u2019re not scoring anymore. You\u2019re not scoring any-more."; } },
    { k: "chant", w: function (c) { return me(c) && (c.bottomTen || c.move <= -15); }, t: function () { return "Sacked in the morning. You\u2019re getting sacked in the morning."; } },
    { k: "chant", w: function (c) { return me(c) && typeof c.pts === "number" && c.pts > c.avg + 15; }, t: function () { return "Can we play you every week? Asks nobody. They\u2019re scared."; } },
    { k: "chant", w: function (c) { return me(c) && c.rank > 200; }, t: function (c) { return "Who are ya? Who are ya? Seriously, " + ord(c.rank) + " of " + num(c.n) + ". Who are ya?"; } },
    { k: "chant", w: function (c) { return me(c) && (c.asleep || (c.tr === 0 && c.gwsPlayed >= 2 && !c.live)); }, t: function () { return "Is this a library? Not a transfer in the place."; } },
    { k: "chant", w: function (c) { return me(c) && typeof c.pts === "number" && c.pts > c.avg; }, t: function () { return "You only sing when you\u2019re winning. So go on, sing."; } },
    { k: "chant", w: function (c) { return me(c) && c.move < 0; }, t: function (c) { return "We can see you sneaking out. Down " + num(-c.move) + " and hoping nobody noticed."; } },
    { k: "chant", w: function (c) { return me(c) && c.lmsOutGw; }, t: function (c) { return "Cheerio, cheerio, cheerio. Last Manager waved you off in GW" + c.lmsOutGw + "."; } },
    { k: "chant", w: function (c) { return me(c) && c.rank > 10; }, t: function (c) { return "Que sera, sera. Whatever will be, will be. You\u2019re going to be " + ord(c.rank) + ", probably."; } },
    { k: "chant", w: function (c) { return me(c) && c.comp && c.comp.ucl && c.comp.ucl.state === "in" && /UCL$/.test(c.comp.ucl.where); }, t: function () { return "Que sera, sera. Whatever will be, will be. You\u2019re going to the knockouts. Que sera, sera."; } },
    { k: "chant", w: function (c) { return me(c) && c.leading; }, t: function () { return "Champione, champione, ol\u00e9 ol\u00e9 ol\u00e9. Early, but sing it while you can."; } },
    { k: "chant", w: function (c) { return me(c) && c.tr === 0 && typeof c.pts === "number" && Math.abs(c.pts - c.avg) <= 5; }, t: function (c) { return "Boring, boring " + c.name + ". Same eleven, same result."; } },
    { k: "chant", w: function (c) { return liv(c) && c.pts < c.avg; }, t: function () { return "It\u2019s all gone quiet over there."; } },
    { k: "chant", w: function (c) { return me(c) && typeof c.pts === "number" && c.pts < c.avg - 20; }, t: function () { return "Shall we sing a song for you? The bench already is."; } },
    { k: "chant", w: function (c) { return me(c) && c.hits > 0; }, t: function () { return "Stand up if you took a hit. Sit down, you\u2019re making it obvious."; } },
    { k: "chant", w: function (c) { return me(c) && c.name; }, t: function (c) { return "There\u2019s only one " + c.name + ". One is plenty."; } },
    { k: "chant", w: function (c) { return me(c) && c.gwsPlayed < 30; }, t: function () { return "Sit down if you\u2019ve won the league. Right, everybody up, then."; } },
    { k: "chant", w: function (c) { return me(c) && c.leading; }, t: function () { return "Top of the league. You\u2019re singing it; everybody else is muttering it."; } },
    { k: "chant", w: function (c) { return me(c) && c.leading && typeof c.pts === "number" && c.pts > c.avg; }, t: function () { return "By far the greatest team the league has ever seen. This week. Terms apply."; } },
    { k: "chant", w: function (c) { return me(c) && c.move > 0; }, t: function (c) { return "On the march with " + c.name + "\u2019s army. Up " + num(c.move) + " and still marching."; } },
    { k: "chant", w: function (c) { return me(c) && c.comp && c.comp.pyramid && c.comp.pyramid.state === "out" && c.comp.pyramid.pos >= 20; }, t: function () { return "Going down, going down, going down. Not yet. But the tune\u2019s ready."; } },
    { k: "chant", w: function (c) { return me(c) && c.comp && c.comp.ucl && /UEL$/.test(c.comp.ucl.where); }, t: function () { return "Thursday nights, Channel 5. The Europa slot has its own song, and it\u2019s that one."; } },
    { k: "chant", w: function (c) { return me(c) && c.bench >= 15; }, t: function (c) { return "Same old " + c.name + ", always benching."; } },
    { k: "chant", w: function (c) { return liv(c) && c.pts < c.avg; }, t: function () { return "You\u2019re supposed to be at home. Your points certainly are."; } },
    { k: "chant", w: function (c) { return me(c) && c.done && !c.checked; }, t: function () { return "Oh when the subs go marching in. Tomorrow morning, if your bench is lucky."; } },
    { k: "chant", w: function (c) { return me(c) && c.cap && c.capPts != null && c.capPts >= 12; }, t: function (c) { return "Feed the " + c.cap + " and he will score. Fed. Scored. " + num(c.capPts) + "."; } },
    { k: "chant", w: function (c) { return me(c) && typeof c.pts === "number" && c.pts < c.avg; }, t: function () { return "One-nil to the average. Boring, boring average."; } },
    { k: "chant", w: function (c) { return me(c) && c.myRise; }, t: function (c) { return "Sign him up, sign him up! Oh, you did. " + c.myRise.name + ", up to \u00a3" + c.myRise.price.toFixed(1) + "m."; } },
    { k: "chant", w: function (c) { return me(c) && c.bench >= 15; }, t: function () { return "Your bench is, your bench is, your bench is terrible. Terribly good, and terribly benched."; } },
    { k: "chant", w: function (c) { return me(c) && c.seasonHits === 0 && c.gwsPlayed >= 3; }, t: function (c) { return "Oh " + c.name + " is wonderful. No hits, no fuss, no fear."; } },
    { k: "chant", w: function (c) { return me(c) && c.leading; }, t: function () { return "Stand up for the champion. Sit down, it\u2019s September."; } },
    { k: "chant", w: function (c) { return me(c) && c.asleep; }, t: function () { return "Attack, attack, attack, attack, attack. Or just the one transfer. Anything."; } },
    { k: "chant", w: function (c) { return me(c) && c.name; }, t: function (c) { return "Come on you " + c.name + "! That\u2019s the whole chant. Work with me."; } },
    { k: "chant", w: function (c) { return liv(c) && c.inPlay > 0 && c.pts < c.avg; }, t: function () { return "Score in a minute, we\u2019re gonna score in a minute. Any minute. This minute would be good."; } },
    { k: "chant", w: function (c) { return me(c) && typeof c.pts === "number" && c.pts > c.avg + 20; }, t: function () { return "Easy, easy, easy. Say it quietly; the table listens."; } },
    { k: "chant", w: function (c) { return me(c) && c.division && c.comp.pyramid && c.comp.pyramid.pos > 20; }, t: function (c) { return "Just a small club in the " + c.division + ". Small clubs go up. Occasionally."; } },
    { k: "chant", w: function (c) { return me(c) && c.topTen && !c.leading; }, t: function () { return "We\u2019re on our way. We\u2019re on our way. To where? Top ten says the top, eventually."; } },
    { k: "chant", w: function (c) { return me(c) && c.lmsAlive && c.lmsOut > 0; }, t: function (c) { return "We shall not, we shall not be moved. " + num(c.lmsOut) + " were. You weren\u2019t."; } },
    { k: "chant", w: function (c) { return me(c) && typeof c.pts === "number" && c.pts < c.avg - 10 && c.hits > 0; }, t: function () { return "What a waste of money. The hit, I mean. Sing it with me."; } },
    { k: "chant", w: function (c) { return me(c) && c.move >= 10; }, t: function () { return "Hark now hear, the table sings: up you go. Up you go."; } },
    { k: "chant", w: function (c) { return me(c) && c.capPts != null && c.capPts <= 2; }, t: function (c) { return "You\u2019re not captain anymore. You\u2019re not captain any-more. Aimed at " + c.cap + ", not you. Mostly."; } },
    { k: "chant", w: function (c) { return me(c) && c.gwsPlayed >= 1; }, t: function () { return "Here we go, here we go, here we go. Somewhere. The table will tell us."; } },
    { k: "chant", w: function (c) { return me(c) && c.overall && c.overall <= 50000; }, t: function () { return "We\u2019re the famous " + "top fifty thousand and we\u2019re going to\u2026 keep going, apparently."; } },
    { k: "chant", w: function (c) { return me(c) && c.comp && c.comp.monthly && c.comp.monthly.pos === 1; }, t: function () { return "Manager of the Month, he\u2019s here, he\u2019s there, he\u2019s every-blooming-where. For a month."; } },
    { k: "chant", w: function (c) { return me(c) && c.spoon; }, t: function () { return "Wooden spoon, wooden spoon, wooden spoon. To the tune of nothing; it doesn\u2019t deserve one."; } },
    // turned: ten taps, and the gloves are off. Keyed to the week where it can be.
    { k: "savage", turn: true, w: function () { return true; }, t: function () { return "That\u2019s ten. You\u2019ve woken something."; } },
    { k: "savage", w: function () { return true; }, t: function () { return "Why are you even playing?"; } },
    { k: "savage", w: function () { return true; }, t: function () { return "Better luck next season. This one\u2019s gone."; } },
    { k: "savage", w: function () { return true; }, t: function () { return "You\u2019ll always walk alone. The table agrees."; } },
    { k: "savage", w: function () { return true; }, t: function () { return "You should be sacked. I\u2019d do it myself, but I\u2019m a lion."; } },
    { k: "savage", w: function () { return true; }, t: function () { return "You should be sacked. The vote was unanimous. I was the vote."; } },
    { k: "savage", w: function () { return true; }, t: function () { return "Keep tapping. It\u2019s the only thing you\u2019ve done right today."; } },
    { k: "savage", w: function () { return true; }, t: function () { return "I\u2019ve seen Bench Boosts with more ambition than this squad."; } },
    { k: "savage", w: function () { return true; }, t: function () { return "The deadline isn\u2019t a suggestion."; } },
    { k: "savage", w: function () { return true; }, t: function () { return "I\u2019d wag my tail, but you haven\u2019t earned a twitch."; } },
    { k: "savage", w: function () { return true; }, t: function () { return "Roar. That was a warning."; } },
    { k: "savage", w: function () { return true; }, t: function () { return "Next season, try a different hobby. Bingo has fewer hits."; } },
    { k: "savage", w: function () { return true; }, t: function () { return "The armband is not a lucky charm. Stop treating it like one."; } },
    { k: "savage", w: function () { return true; }, t: function () { return "Nice rank. Shame about the personality."; } },
    { k: "savage", w: function () { return true; }, t: function () { return "Your wildcard didn\u2019t fix it. Nothing will."; } },
    { k: "savage", w: function (c) { return me(c) && typeof c.pts === "number" && c.pts < c.avg; }, t: function () { return "Even the gameweek average outscored you. The average!"; } },
    { k: "savage", w: function (c) { return me(c) && typeof c.pts === "number" && c.pts < c.avg; }, t: function () { return "The average is a line. You\u2019re the reason it\u2019s that low."; } },
    { k: "savage", w: function (c) { return me(c) && c.capPts != null && c.capPts <= 4; }, t: function () { return "Your captain choice was a cry for help."; } },
    { k: "savage", w: function (c) { return me(c) && c.bottomTen; }, t: function (c) { return num(c.n) + " managers and you found the bottom. Talent."; } },
    { k: "savage", w: function (c) { return me(c) && c.bottomTen; }, t: function () { return "Top ten? That\u2019s the table upside down, right?"; } },
    { k: "savage", w: function (c) { return me(c) && c.sliding; }, t: function () { return "Sliding three weeks. That\u2019s not form, that\u2019s a policy."; } },
    { k: "savage", w: function (c) { return me(c) && c.lmsOutGw; }, t: function (c) { return "Out of LMS in GW" + c.lmsOutGw + ". Last Manager Standing; you were the first sitting."; } },
    { k: "savage", w: function (c) { return me(c) && c.capPts != null && c.bench > c.capPts; }, t: function () { return "Your bench outscored your captain. Let that sink in."; } },
    { k: "savage", w: function (c) { return me(c) && c.hits > 0; }, t: function (c) { return "Hits: " + num(c.hits) + ". Return: regret."; } },
    { k: "savage", w: function (c) { return me(c) && c.behind > 50; }, t: function (c) { return num(c.behind) + " behind the leader. He\u2019s not looking back. Nobody is."; } },
    { k: "savage", w: function (c) { return me(c) && c.spoon; }, t: function () { return "Somewhere a Wooden spoon has your name on it. Oh wait, it\u2019s on your profile."; } },
    { k: "savage", w: function (c) { return me(c) && c.leading; }, t: function () { return "Top of the league and you\u2019re poking a lion. Enjoy it; it ends."; } },
    { k: "savage", w: function (c) { return me(c) && c.topTen; }, t: function () { return "Top ten. Everybody\u2019s favourite target. Including mine."; } },
    { k: "savage", w: function (c) { return me(c) && c.best; }, t: function (c) { return "Your best week was GW" + c.best.gw + ". Everything since has been a slow apology."; } },
    { k: "savage", w: function (c) { return me(c) && c.overall > 3000000; }, t: function (c) { return num(c.overall) + " in the world. There are people who don\u2019t play ranked higher."; } },
    { k: "savage", w: function (c) { return me(c) && c.seasonTr >= 10; }, t: function (c) { return pl(c.seasonTr, "transfer") + " and nothing to show for them. The definition of busy."; } },
    { k: "savage", w: function (c) { return me(c) && c.benched; }, t: function () { return "Bench blunder. Plural, eventually. I\u2019m patient."; } },
    { k: "savage", w: function (c) { return me(c) && c.asleep; }, t: function () { return "A month without a transfer. Even your squad has given up on you."; } },
    { k: "savage", w: function (c) { return !me(c); }, t: function () { return "You haven\u2019t even picked a team. Sacked before you were hired."; } },
    { k: "savage", w: function (c) { return me(c) && c.comp && c.comp.classic && c.comp.classic.state === "out"; }, t: function () { return "Out of the Classic money. The stairs are that way, and you\u2019re not climbing them."; } },
    { k: "savage", w: function (c) { return me(c) && c.inCount === 0 && c.compCount >= 5; }, t: function () { return "Out of the money in all five. That takes a special kind of consistency."; } },
    // the terraces, turned
    { k: "savage", w: function () { return true; }, t: function () { return "You\u2019re getting sacked in the morning. And the afternoon, to be safe."; } },
    { k: "savage", w: function () { return true; }, t: function () { return "You\u2019re not singing anymore. You never were."; } },
    { k: "savage", w: function () { return true; }, t: function () { return "Cheerio, cheerio, cheerio. That\u2019s the sound of your rank leaving."; } },
    { k: "savage", w: function () { return true; }, t: function () { return "Going down, going down, going down."; } },
    { k: "savage", w: function () { return true; }, t: function () { return "Is this a library? No. Libraries have points."; } },
    { k: "savage", w: function () { return true; }, t: function () { return "It\u2019s all gone quiet over there. Good."; } },
    { k: "savage", w: function () { return true; }, t: function () { return "You only sing when you\u2019re winning. That explains the silence."; } },
    { k: "savage", w: function () { return true; }, t: function () { return "Who are ya? No, really. The table\u2019s never heard of you."; } },
    { k: "savage", w: function () { return true; }, t: function () { return "Can we play you every week? Everyone already does."; } },
    { k: "savage", w: function () { return true; }, t: function () { return "Shall we sing a song for you? Here\u2019s one: sacked in the morning."; } },
    { k: "savage", w: function () { return true; }, t: function () { return "Your support is terrible. Your bench is worse."; } },
    { k: "savage", w: function () { return true; }, t: function () { return "Thursday nights, Channel 5. That\u2019s your ceiling."; } },
    { k: "savage", w: function () { return true; }, t: function () { return "We can see you sneaking out. Take the wildcard with you."; } },
    { k: "savage", w: function () { return true; }, t: function () { return "Stand up if you hate your own squad. Thought so."; } },
    { k: "savage", w: function () { return true; }, t: function () { return "Que sera, sera. Whatever will be, will be. You\u2019re going nowhere. Que sera, sera."; } },
    // only after a tap
    { k: "poke", w: function () { return true; }, t: function () { return "That tickles."; } },
    { k: "poke", w: function () { return true; }, t: function () { return "Again? Fine. Once more."; } },
    { k: "poke", w: function () { return true; }, t: function () { return "I’m a lion, not a stress ball."; } },
    { k: "poke", w: function () { return true; }, t: function () { return "Roar. That’s the whole routine."; } },
    { k: "poke", w: function () { return true; }, t: function () { return "Tail wag: earned. Don’t get used to it."; } },
    { k: "poke", w: function () { return true; }, t: function () { return "You could be checking your bench. Just saying."; } },
    { k: "poke", w: function () { return true; }, t: function () { return "If you poke me a hundred times, nothing happens. I’ve checked."; } },
    { k: "poke", w: function () { return true; }, t: function () { return "Head shake. It’s not you. It’s your defence."; } },
    { k: "poke", w: function (c) { return !!c.name; }, t: function (c) { return "Jumping for you, " + c.name + ". Not for everyone."; } },
    { k: "poke", w: function () { return true; }, t: function () { return "Okay, okay. Go look at the table."; } }
  ];

  // A line for now: something about the week when there is something to say,
  // otherwise something general; never the one just said.
  function pick(poked) {
    var can = [];
    L.forEach(function (l, i) {
      if (i === last) return;
      if (l.k === "poke" && !poked) return;
      // turned, he says only savage things; calm, he never does
      if ((l.k === "savage") !== (savage && poked)) return;
      var ok = false; try { ok = !!l.w(ctx); } catch (e) { ok = false; }
      if (ok) can.push(i);
    });
    if (!can.length) return -1;
    if (savage && poked) {
      // the first savage line is the turn itself
      var turn = can.filter(function (i) { return L[i].turn; });
      if (taps === SAVAGE_AT && turn.length) return turn[0];
      var rest = can.filter(function (i) { return !L[i].turn; });
      return rest[Math.floor(Math.random() * rest.length)];
    }
    var specific = can.filter(function (i) { return ["pre", "lock", "live", "after", "stand", "comp", "price", "player", "mood", "chant"].indexOf(L[i].k) !== -1; });
    var pokes = can.filter(function (i) { return L[i].k === "poke"; });
    var pool = can;
    var r = Math.random();
    if (poked && pokes.length && r < 0.35) pool = pokes;
    else if (specific.length && r < 0.85) pool = specific;
    return pool[Math.floor(Math.random() * pool.length)];
  }
  function lineText(i) {
    try { return L[i].t(ctx); } catch (e) { return ""; }
  }

  /* ---- the lion himself ------------------------------------------------- */
  function svg() {
    // A lion: a broad mane of pointed tufts in two shades, a tawny face with
    // a strong nose and brow, a cream muzzle, small ears set into the mane,
    // a sitting body with two paws, and a tail curled up the side with a
    // dark tuft. Lion colours throughout.
    var mane = function (cx, cy, r1, r2, n, rot) {
      var d = "";
      for (var i = 0; i < n * 2; i++) {
        var a = rot + (i / (n * 2)) * Math.PI * 2, r = i % 2 ? r2 : r1;
        d += (i ? "L" : "M") + (cx + Math.cos(a) * r).toFixed(1) + " " + (cy + Math.sin(a) * r).toFixed(1);
      }
      return d + "Z";
    };
    return '<svg class="tlion" viewBox="0 0 64 64" aria-hidden="true">' +
      '<g class="ttail"><path d="M47 57c9-2 13-9 11-19" fill="none" stroke="#c9862d" stroke-width="3.4" stroke-linecap="round"/>' +
        '<path d="M58 34c-3 2-3 6 0 8c3-2 3-6 0-8z" fill="#6b3410"/></g>' +
      '<ellipse cx="32" cy="53" rx="15" ry="10" fill="#dd9a30"/>' +
      '<ellipse cx="32" cy="55" rx="9" ry="7" fill="#f0c97a"/>' +
      '<ellipse cx="23" cy="60.5" rx="6.2" ry="3.4" fill="#e6a63b"/><ellipse cx="41" cy="60.5" rx="6.2" ry="3.4" fill="#e6a63b"/>' +
      '<path d="M20 61.5v1.6M23 61.5v1.6M26 61.5v1.6M38 61.5v1.6M41 61.5v1.6M44 61.5v1.6" stroke="#b5741f" stroke-width="1" stroke-linecap="round"/>' +
      '<g class="thead">' +
        '<path class="tmane1" d="' + mane(32, 33, 27, 21, 14, -Math.PI / 2) + '" fill="#8f4512"/>' +
        '<path class="tmane2" d="' + mane(32, 33, 23.5, 19, 12, -Math.PI / 2 + 0.2) + '" fill="#c26d1f"/>' +
        '<g class="tear tearL"><circle cx="19" cy="20" r="5.2" fill="#e6a63b"/><circle cx="19" cy="20.6" r="2.8" fill="#f3c98f"/></g>' +
        '<g class="tear tearR"><circle cx="45" cy="20" r="5.2" fill="#e6a63b"/><circle cx="45" cy="20.6" r="2.8" fill="#f3c98f"/></g>' +
        '<ellipse cx="32" cy="35" rx="15.5" ry="15" fill="#e8ab3d"/>' +
        '<ellipse cx="32" cy="42" rx="9.8" ry="6.8" fill="#f8e3b8"/>' +
        '<path class="tbrow" d="M22 28.5q3.5-2.5 7 0M35 28.5q3.5-2.5 7 0" fill="none" stroke="#7a3d12" stroke-width="1.6" stroke-linecap="round"/>' +
        '<path class="tbrowmad" d="M21.5 26.5l7.5 3M42.5 26.5l-7.5 3" fill="none" stroke="#3a1a08" stroke-width="2" stroke-linecap="round"/>' +
        '<g class="teyes"><ellipse cx="25.8" cy="33" rx="2.5" ry="3" fill="#2b1a0e"/><ellipse cx="38.2" cy="33" rx="2.5" ry="3" fill="#2b1a0e"/>' +
          '<circle cx="26.7" cy="32" r="1" fill="#fff"/><circle cx="39.1" cy="32" r="1" fill="#fff"/></g>' +
        '<path d="M28.5 39.5h7l-3.5 3.6z" fill="#4a2a12"/>' +
        '<path d="M32 42.6v2.2" stroke="#4a2a12" stroke-width="1.3" stroke-linecap="round"/>' +
        '<path class="tsmile" d="M27.5 45.5q4.5 3.6 9 0" fill="none" stroke="#4a2a12" stroke-width="1.4" stroke-linecap="round"/>' +
        '<path class="troar" d="M27.5 45q4.5 8 9 0z" fill="#4a2a12"/>' +
        '<g class="tsnarl"><path d="M26 44.5q6 8 12 0z" fill="#3a0d0d"/>' +
          '<path d="M27.5 45l1.6 3.4 1.6-3.4zM33.3 45l1.6 3.4 1.6-3.4z" fill="#fff"/>' +
          '<path d="M30.5 50.6l1.5-2.6 1.5 2.6z" fill="#fff"/></g>' +
        '<path d="M29 49.5l3 4 3-4z" fill="#c26d1f"/>' +
        '<g stroke="#c98a3c" stroke-width=".9" stroke-linecap="round"><path d="M14.5 40h7.5M15 43.5l7-1.2M42 40h7.5M42 42.3l7 1.2"/></g>' +
      '</g>' +
      '</svg>';
  }
  var ACTS = ["wag", "shake", "jump", "blink", "twitch", "roar", "yawn"];
  var DUR = { wag: 1000, shake: 800, jump: 700, blink: 400, twitch: 700, roar: 900, yawn: 1300 };
  function act(name) {
    if (!root) return;
    ACTS.forEach(function (a) { root.classList.remove(a); });
    void root.offsetWidth;
    root.classList.add(name);
    setTimeout(function () { if (root) root.classList.remove(name); }, DUR[name] || 800);
  }
  function randomAct() {
    var pool = ACTS.filter(function (a) { return a !== lastAct; });
    lastAct = pool[Math.floor(Math.random() * pool.length)];
    return lastAct;
  }
  function idle() {
    clearTimeout(idleT);
    idleT = setTimeout(function () {
      if (root && !root.classList.contains("away")) act(Math.random() < 0.8 ? "blink" : "twitch");
      idle();
    }, 4000 + Math.random() * 5000);
  }

  function say(i, poked) {
    if (!bub || i < 0) return "";
    var text = lineText(i);
    if (!text) return "";
    last = i;
    bub.textContent = text;
    bub.classList.toggle("savage", savage);
    bub.classList.add("show");
    clearTimeout(bubT);
    bubT = setTimeout(function () { if (bub) bub.classList.remove("show"); }, poked ? 6000 : 8000);
    return text;
  }
  function poke() {
    if (!root) return;
    taps++;
    if (!savage && taps >= SAVAGE_AT) {
      savage = true;
      root.classList.add("savage");
      act("roar");
      say(pick(true), true);
      return;
    }
    act(savage ? (Math.random() < 0.5 ? "roar" : "shake") : randomAct());
    say(pick(true), true);
  }

  function mount() {
    if (root || !document.body) return;
    root = document.createElement("button");
    root.type = "button"; root.className = "theo"; root.id = "theo";
    root.setAttribute("aria-label", "Theo the lion");
    root.innerHTML = svg();
    root.addEventListener("click", function (e) { e.stopPropagation(); poke(); });
    bub = document.createElement("div");
    bub.className = "theobub"; bub.id = "theobub"; bub.setAttribute("role", "status");
    bub.addEventListener("click", function () { bub.classList.remove("show"); });
    document.body.appendChild(bub);
    document.body.appendChild(root);
    // out of the way while the reader scrolls down, back when they stop
    document.addEventListener("scroll", function (e) {
      if (!root || !bub) return; // switched off since
      var t = e.target, y, key;
      if (t === document || t === document.documentElement || t === document.body) { y = window.scrollY || 0; key = "w"; }
      else if (t && t.classList && t.classList.contains("freeze")) { y = t.scrollTop; key = "f"; }
      else return;
      var was = scrollY[key] || 0; scrollY[key] = y;
      if (y > was + 6 && y > 40) {
        root.classList.add("away"); bub.classList.remove("show");
        clearTimeout(awayT); awayT = setTimeout(function () { root.classList.remove("away"); }, 900);
      } else if (y < was - 6) {
        clearTimeout(awayT); root.classList.remove("away");
      }
    }, true);
    idle();
  }
  function unmount() {
    if (root) { root.remove(); root = null; }
    if (bub) { bub.remove(); bub = null; }
    clearTimeout(idleT); clearTimeout(bubT);
  }

  /* ---- what the app tells him ------------------------------------------- */
  var T = {};
  // Called on every render: the data, who you are, which page. He mounts on
  // the first call that has data, greets once, and keeps his facts current.
  T.sync = function (o) {
    try {
      if (isOff()) { unmount(); return; }
      var ds = o && o.ds;
      ctx = build(ds, o && o.me);
      if (!ds || !ds.managers || !ds.managers.length) return;
      mount();
      if (!greeted) {
        greeted = true;
        setTimeout(function () { if (root && !isOff()) { act("wag"); say(pick(false), false); } }, 1200);
      } else if (bub) {
        bub.classList.remove("show"); // a new page is a new subject
      }
    } catch (e) { /* he is decoration: nothing he does may break a page */ }
  };
  T.poke = poke;
  T.on = function () { return !isOff(); };
  T.setOn = function (on) { setOff(!on); if (!on) unmount(); else { greeted = false; } };
  // for the suites: every line, and the facts he is working from
  T.lines = function () { return L.map(function (l) { return l.k; }); };
  T.say = function (i) { return say(i, true); };
  T.text = function (i) { return lineText(i); };
  T.fits = function (i) { try { return !!L[i].w(ctx); } catch (e) { return false; } };
  T.context = function () { return ctx; };
  T.pick = function (poked) { return pick(!!poked); };
  T.taps = function () { return taps; };
  T.savage = function () { return savage; };
  window.GO_THEO = T;
})();
