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

  function isOff() { try { return localStorage.getItem(KEY) === "off"; } catch (e) { return false; } }
  function setOff(off) { try { if (off) localStorage.setItem(KEY, "off"); else localStorage.removeItem(KEY); } catch (e) {} }
  function num(n) { return n == null || isNaN(n) ? "—" : Number(n).toLocaleString("en-US"); }
  function ord(n) { var s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
  function pl(n, w) { return num(n) + " " + w + (n === 1 ? "" : "s"); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  var CHIP = { bboost: "Bench Boost", "3xc": "Triple Captain", freehit: "Free Hit", wildcard: "Wildcard" };

  /* ---- what he knows: the week, read through the app's own arithmetic ---- */
  function build(ds, me) {
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
      var ok = false; try { ok = !!l.w(ctx); } catch (e) { ok = false; }
      if (ok) can.push(i);
    });
    if (!can.length) return -1;
    var specific = can.filter(function (i) { return ["pre", "lock", "live", "after", "stand"].indexOf(L[i].k) !== -1; });
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
        '<path d="' + mane(32, 33, 27, 21, 14, -Math.PI / 2) + '" fill="#8f4512"/>' +
        '<path d="' + mane(32, 33, 23.5, 19, 12, -Math.PI / 2 + 0.2) + '" fill="#c26d1f"/>' +
        '<g class="tear tearL"><circle cx="19" cy="20" r="5.2" fill="#e6a63b"/><circle cx="19" cy="20.6" r="2.8" fill="#f3c98f"/></g>' +
        '<g class="tear tearR"><circle cx="45" cy="20" r="5.2" fill="#e6a63b"/><circle cx="45" cy="20.6" r="2.8" fill="#f3c98f"/></g>' +
        '<ellipse cx="32" cy="35" rx="15.5" ry="15" fill="#e8ab3d"/>' +
        '<ellipse cx="32" cy="42" rx="9.8" ry="6.8" fill="#f8e3b8"/>' +
        '<path d="M22 28.5q3.5-2.5 7 0M35 28.5q3.5-2.5 7 0" fill="none" stroke="#7a3d12" stroke-width="1.6" stroke-linecap="round"/>' +
        '<g class="teyes"><ellipse cx="25.8" cy="33" rx="2.5" ry="3" fill="#2b1a0e"/><ellipse cx="38.2" cy="33" rx="2.5" ry="3" fill="#2b1a0e"/>' +
          '<circle cx="26.7" cy="32" r="1" fill="#fff"/><circle cx="39.1" cy="32" r="1" fill="#fff"/></g>' +
        '<path d="M28.5 39.5h7l-3.5 3.6z" fill="#4a2a12"/>' +
        '<path d="M32 42.6v2.2" stroke="#4a2a12" stroke-width="1.3" stroke-linecap="round"/>' +
        '<path class="tsmile" d="M27.5 45.5q4.5 3.6 9 0" fill="none" stroke="#4a2a12" stroke-width="1.4" stroke-linecap="round"/>' +
        '<path class="troar" d="M27.5 45q4.5 8 9 0z" fill="#4a2a12"/>' +
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
    bub.classList.add("show");
    clearTimeout(bubT);
    bubT = setTimeout(function () { if (bub) bub.classList.remove("show"); }, poked ? 6000 : 8000);
    return text;
  }
  function poke() {
    if (!root) return;
    act(randomAct());
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
  window.GO_THEO = T;
})();
