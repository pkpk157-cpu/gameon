const GOENV = require("./lib/env.js");
/* Theo, the lion in the corner. He appears above the tab bar once the data
 * is in, greets once with a line that is true of the week, says something
 * else on every tap while a part of him moves, slides away while the page
 * scrolls down and comes back, hides under anything that opens over the
 * page, can be switched off under Settings and stays off, and every one of
 * his hundred lines renders without a hole in it — with a team picked and
 * without. He must never throw, whatever the data. */
const { chromium, devices } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP, PORT = 8816, ME = 1255976;
let DATA = null;
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".webp":"image/webp", ".png":"image/png" };
const srv = http.createServer((q, r) => { let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  const f = (u === "/data.json" && DATA) ? DATA : path.join(APP, u);
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { "content-type": T[path.extname(u)] || "text/plain", "cache-control": "no-store" }); r.end(b); }); });
let fails = 0;
const chk = (ok, m, x) => { console.log((ok ? "  ok   " : "  FAIL ") + m + (x ? "  " + x : "")); if (!ok) fails++; };
const holes = /undefined|NaN|null|\{|\}|—/;

(async () => {
  await new Promise((r) => srv.listen(PORT, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  const open = async (opts) => {
    const ctx = await b.newContext({ ...(opts.device || devices["iPhone 12"]), serviceWorkers: "block" });
    // the switch is cleared once per context, not on every load: a reload must find it as it was left
    await ctx.addInitScript((o) => { try { if (!sessionStorage.getItem("theo-test-init")) { sessionStorage.setItem("theo-test-init", "1"); localStorage.removeItem("go12.theo"); }
      if (o.me) localStorage.setItem("go12.me", JSON.stringify(o.me)); else localStorage.removeItem("go12.me"); } catch (e) {} }, opts);
    const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.goto("http://localhost:" + PORT + "/index.html#" + (opts.view || "classic"), { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(opts.wait || 3000);
    return { ctx, p, errs };
  };

  // 1. with a team: placed, greets, every line whole
  {
    const { ctx, p, errs } = await open({ me: ME });
    const at = await p.evaluate(() => { const t = document.querySelector("#theo"), n = document.querySelector(".navbar"); const r = t && t.getBoundingClientRect(), nr = n.getBoundingClientRect();
      const bb = document.querySelector("#theobub"); return { has: !!t, left: r && r.left, bottom: r && r.bottom, navTop: nr.top, greet: bb && bb.classList.contains("show") ? bb.textContent : "" }; });
    chk(at.has && at.left >= 0 && at.left < 30 && at.bottom <= at.navTop, "he sits bottom-left, above the tab bar", JSON.stringify({ left: at.left, bottom: at.bottom, navTop: at.navTop }));
    chk(at.greet.length > 8 && !holes.test(at.greet), "he greets, and the line is whole", at.greet);
    const lines = await p.evaluate(() => { const T = window.GO_THEO, ks = T.lines(); return ks.map((k, i) => ({ k, fits: T.fits(i), text: T.text(i) })); });
    chk(lines.length >= 150, "a hundred and fifty lines or more", lines.length);
    const bad = lines.filter((l) => l.fits && (!l.text || holes.test(l.text)));
    chk(bad.length === 0, "every line that fits the week renders whole", bad.slice(0, 3).map((l) => l.text).join(" | "));
    const fitting = lines.filter((l) => l.fits).length;
    chk(fitting >= 15, "plenty fit this week", fitting + " of 100 fit");
    const kinds = {}; lines.forEach((l) => { kinds[l.k] = (kinds[l.k] || 0) + 1; });
    chk(kinds.pre >= 10 && kinds.live >= 20 && kinds.after >= 10 && kinds.poke === 10 && kinds.gen >= 10 && kinds.comp >= 15 && kinds.price >= 8 && kinds.player >= 10 && kinds.mood >= 10,
        "lines cover the deadline, the live week, the week after, standing, the five competitions, prices, players, praise and digs, general and taps", JSON.stringify(kinds));
    // the five competitions each get a word, and it is the profile's own figure
    const comp = await p.evaluate(() => { const T = window.GO_THEO, c = T.context(); const ks = T.lines();
      const said = {}; ks.forEach((k, i) => { if (k === "comp" && T.fits(i)) { const t = T.text(i); ["classic","monthly","lms","pyramid","ucl"].forEach((x) => { if (c.comp[x] && (c.comp[x].pos == null || t.indexOf(String(c.comp[x].pos)) !== -1 || /Last Manager/.test(t))) said[x] = (said[x] || 0) + 1; }); } });
      return { said, comp: Object.keys(c.comp || {}).length }; });
    chk(comp.comp === 5 && Object.keys(comp.said).length >= 4, "he has a line for each of the competitions, quoting the profile's own position", JSON.stringify(comp.said));
    // greeting never a poke line
    const greetKinds = await p.evaluate(() => { const T = window.GO_THEO; const s = new Set(); for (let i = 0; i < 200; i++) { const j = T.pick(false); if (j >= 0) s.add(T.lines()[j]); } return [...s]; });
    chk(greetKinds.indexOf("poke") === -1 && greetKinds.indexOf("none") === -1, "a greeting is never a tap line, nor the no-team line when a team is picked", greetKinds.join(","));
    // taps: a part moves, a line comes, lines vary
    const seen = new Set(), acts = new Set();
    for (let i = 0; i < 8; i++) {
      await p.click("#theo"); await p.waitForTimeout(120);
      const r = await p.evaluate(() => { const t = document.querySelector("#theo"); const a = ["wag","shake","jump","blink","twitch","roar","yawn"].find((k) => t.classList.contains(k)); return { a, text: document.querySelector("#theobub").textContent }; });
      if (r.a) acts.add(r.a); seen.add(r.text);
      await p.waitForTimeout(500);
    }
    chk(acts.size >= 3, "taps move different parts of him", [...acts].join(","));
    chk(seen.size >= 4 && [...seen].every((t) => t && !holes.test(t)), "taps bring different lines, all whole", seen.size + " distinct");
    // ten taps in a session and he turns: the face, the tongue, and it holds until the app opens again
    const before = await p.evaluate(() => ({ taps: window.GO_THEO.taps(), savage: window.GO_THEO.savage() }));
    let turnLine = "";
    while ((await p.evaluate(() => window.GO_THEO.taps())) < 10) { await p.click("#theo"); await p.waitForTimeout(150); }
    turnLine = await p.evaluate(() => document.querySelector("#theobub").textContent);
    const turned = await p.evaluate(() => { const t = document.querySelector("#theo"); const snarl = t.querySelector(".tsnarl"), smile = t.querySelector(".tsmile"), brow = t.querySelector(".tbrowmad");
      return { cls: t.classList.contains("savage"), snarl: getComputedStyle(snarl).display !== "none", smile: getComputedStyle(smile).display === "none", brow: getComputedStyle(brow).display !== "none", savage: window.GO_THEO.savage() }; });
    chk(!before.savage && turned.cls && turned.savage && turned.snarl && turned.smile && turned.brow, "the tenth tap turns him: fangs out, brows down, smile gone", JSON.stringify(turned));
    chk(/ten/i.test(turnLine), "and he says so", turnLine);
    const savageLines = new Set();
    for (let i = 0; i < 6; i++) { await p.click("#theo"); await p.waitForTimeout(150); savageLines.add(await p.evaluate(() => document.querySelector("#theobub").textContent)); await p.waitForTimeout(300); }
    const savageKinds = await p.evaluate(() => { const T = window.GO_THEO; const s = new Set(); for (let i = 0; i < 100; i++) { const j = T.pick(true); if (j >= 0) s.add(T.lines()[j]); } return [...s]; });
    chk(savageKinds.length === 1 && savageKinds[0] === "savage" && savageLines.size >= 3 && [...savageLines].every((t) => t && !holes.test(t)), "turned, every tap is a savage line, and they vary", savageKinds.join(",") + " · " + savageLines.size + " distinct");
    const allSavage = await p.evaluate(() => { const T = window.GO_THEO; return T.lines().map((k, i) => ({ k, fits: T.fits(i), text: T.text(i) })).filter((l) => l.k === "savage"); });
    chk(allSavage.length >= 30 && allSavage.filter((l) => l.fits && (!l.text || holes.test(l.text))).length === 0, "thirty savage lines or more, every fitting one whole", allSavage.length);
    const greetKinds2 = await p.evaluate(() => { const T = window.GO_THEO; const s = new Set(); for (let i = 0; i < 100; i++) { const j = T.pick(false); if (j >= 0) s.add(T.lines()[j]); } return [...s]; });
    chk(greetKinds2.indexOf("savage") === -1, "a greeting is never savage, even from a turned lion", greetKinds2.join(","));
    await p.reload({ waitUntil: "domcontentloaded" }); await p.waitForTimeout(2500);
    const calm = await p.evaluate(() => ({ savage: window.GO_THEO.savage(), taps: window.GO_THEO.taps(), cls: document.querySelector("#theo").classList.contains("savage") }));
    chk(!calm.savage && calm.taps === 0 && !calm.cls, "opening the app again calms him", JSON.stringify(calm));
    await p.evaluate(() => { location.hash = "#classic"; }); await p.waitForTimeout(600);
    // scrolling the table sends him away, stopping brings him back
    await p.evaluate(() => { const f = document.querySelector(".view.active .freeze"); f.scrollTop = 0; f.dispatchEvent(new Event("scroll", { bubbles: true })); f.scrollTop = 400; f.dispatchEvent(new Event("scroll", { bubbles: true })); });
    await p.waitForTimeout(150);
    const away = await p.evaluate(() => document.querySelector("#theo").classList.contains("away"));
    await p.waitForTimeout(1200);
    const back = await p.evaluate(() => !document.querySelector("#theo").classList.contains("away"));
    chk(away && back, "away while the table scrolls down, back when it stops");
    // under a sheet he is gone
    await p.evaluate(() => { location.hash = "#gwstatus"; }); await p.waitForTimeout(700);
    await p.click("#gwWhat"); await p.waitForTimeout(300);
    const hidden = await p.evaluate(() => getComputedStyle(document.querySelector("#theo")).display === "none");
    await p.click("#modalClose"); await p.waitForTimeout(300);
    const shown = await p.evaluate(() => getComputedStyle(document.querySelector("#theo")).display !== "none");
    chk(hidden && shown, "hidden under a sheet, back when it closes");
    chk(errs.length === 0, "no JS errors", errs.slice(0, 2).join(" | "));
    await ctx.close();
  }

  // 2. without a team: the invitation, and nothing about a week he cannot see
  {
    const { ctx, p, errs } = await open({ me: null });
    const g = await p.evaluate(() => { const bb = document.querySelector("#theobub"); return bb ? bb.textContent : ""; });
    const okKinds = await p.evaluate(() => { const T = window.GO_THEO; const s = new Set(); for (let i = 0; i < 100; i++) { const j = T.pick(false); if (j >= 0) s.add(T.lines()[j]); } return [...s]; });
    chk(g.length > 0 && !holes.test(g) && okKinds.every((k) => k === "none" || k === "gen"), "no team picked: he asks who you are, or makes small talk", okKinds.join(",") + " · " + g);
    chk(errs.length === 0, "no JS errors", errs.slice(0, 2).join(" | "));
    await ctx.close();
  }

  // 3. switched off under Settings, and it holds
  {
    const { ctx, p, errs } = await open({ me: ME, view: "settings", wait: 1500 });
    await p.click("#btnTheo"); await p.waitForTimeout(300);
    const gone = await p.evaluate(() => !document.querySelector("#theo"));
    await p.reload({ waitUntil: "domcontentloaded" }); await p.waitForTimeout(2500);
    const still = await p.evaluate(() => !document.querySelector("#theo"));
    await p.evaluate(() => { location.hash = "#settings"; }); await p.waitForTimeout(500);
    await p.click("#btnTheo"); await p.waitForTimeout(400);
    const back = await p.evaluate(() => !!document.querySelector("#theo"));
    chk(gone && still && back, "Settings turns him off, it holds across a reload, and brings him back", [gone, still, back].join(","));
    chk(errs.length === 0, "no JS errors", errs.slice(0, 2).join(" | "));
    await ctx.close();
  }

  // 4. a narrow phone: the bubble stays on the screen
  {
    const { ctx, p, errs } = await open({ me: ME, device: { viewport: { width: 320, height: 568 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } });
    await p.click("#theo"); await p.waitForTimeout(200);
    const r = await p.evaluate(() => { const bb = document.querySelector("#theobub").getBoundingClientRect(); return { l: bb.left, r: bb.right, t: bb.top }; });
    chk(r.l >= 0 && r.r <= 320 && r.t >= 0, "the bubble fits a 320px phone", JSON.stringify(r));
    chk(errs.length === 0, "no JS errors", errs.slice(0, 2).join(" | "));
    await ctx.close();
  }

  // 5. hostile data: he never throws, and never speaks of what is not there
  for (const st of ["no-managers", "nulls-everywhere", "no-history", "one-manager", "no-picks", "gw2-current-no-picks"]) {
    DATA = GOENV.STATES + "/" + st + ".json";
    const { ctx, p, errs } = await open({ me: ME, wait: 2500 });
    const r = await p.evaluate(() => { const t = document.querySelector("#theo"), bb = document.querySelector("#theobub"); return { has: !!t, text: bb ? bb.textContent : "" }; });
    chk(errs.length === 0 && !/undefined|NaN|\{/.test(r.text), st + ": no error" + (r.has ? ", says " + JSON.stringify(r.text.slice(0, 50)) : ", stays away"), errs.slice(0, 2).join(" | "));
    await ctx.close();
  }
  DATA = null;
  await b.close(); srv.close();
  console.log(fails ? "\nFAILS: " + fails : "\nTheo is on duty");
  process.exit(fails ? 1 : 0);
})();
