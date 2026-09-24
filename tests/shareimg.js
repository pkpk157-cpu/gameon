const GOENV = require("./lib/env.js");
/* The stats as a picture, one per tab. The Export image button sits beside
 * the gameweek picker, or alone on the tabs without one; a tap makes a PNG
 * 1080 wide in the theme the phone is showing and shows it in a sheet with
 * Save under it. Picks is what the league chose: the template XI, captains,
 * chips, transfers. Gameweek is what it returned: the team of the week, top
 * scorers, captain returns, differentials, the scores. Value is the money,
 * Season the campaign so far, All time the years before. A gameweek with no
 * squads says so in a toast and breaks nothing; one that has not scored yet
 * says so on the Gameweek tab and still draws on Picks;
 * hostile names and nulls draw without an error; a narrow phone keeps the
 * button on the page. The picture itself is checked by colour: the purple
 * bar, the green pitch and the theme's wallpaper, each where it should be. */
const { chromium, devices } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP, PORT = 8811;
let DATA = null;
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".webp":"image/webp", ".png":"image/png" };
const srv = http.createServer((q, r) => { let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  const f = (u === "/data.json" && DATA) ? DATA : path.join(APP, decodeURIComponent(u));
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { "content-type": T[path.extname(u)] || "text/plain", "cache-control": "no-store" }); r.end(b); }); });
let fails = 0;
const chk = (ok, m, x) => { console.log((ok ? "  ok   " : "  FAIL ") + m + (x ? "  " + x : "")); if (!ok) fails++; };

// The picture, read back: its size, its bytes, and the colour at a few points.
const picture = (p) => p.evaluate(async () => {
  const im = document.querySelector("#modalBack.show .shpic img"); if (!im) return null;
  await new Promise((r) => { if (im.complete && im.naturalWidth) r(); else { im.onload = r; im.onerror = r; } });
  const r = await fetch(im.src); const bytes = (await r.arrayBuffer()).byteLength;
  const cv = document.createElement("canvas"); cv.width = im.naturalWidth; cv.height = im.naturalHeight;
  const c = cv.getContext("2d"); c.drawImage(im, 0, 0);
  const at = (x, y) => Array.from(c.getImageData(x, y, 1, 1).data).slice(0, 3);
  const save = document.querySelector("#shSave");
  return { w: im.naturalWidth, h: im.naturalHeight, bytes, bar: at(900, 40), pitch: at(100, 1000), wall: at(8, 1200),
    tileTxt: at(10, 1700), title: document.querySelector("#modalTitle").textContent,
    save: save ? { href: save.getAttribute("href"), name: save.getAttribute("download") } : null };
});
const document_open = () => false;
const isPurple = ([r, g, b]) => r > 40 && r < 130 && g < 30 && b > 50 && b < 110;
const isGreen = ([r, g, b]) => g > 120 && r < 90 && b < 120;

(async () => {
  await new Promise((r) => srv.listen(PORT, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  // the pictures are the organisers' alone, so every run signs in as one
  // unless it says otherwise
  const ORG = (require("./audit/harness.js").loadCompute().cfg.organisers || [])[0] || null;
  const run = async (opts, fn) => {
    const ctx = await b.newContext({ ...(opts.device || devices["iPhone 12"]), serviceWorkers: "block", colorScheme: opts.scheme || "light" });
    const me = opts.me === undefined ? ORG : opts.me;
    await ctx.addInitScript((id) => { try { if (id) localStorage.setItem("go12.me", String(id)); } catch (e) {} }, me);
    const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.goto("http://localhost:" + PORT + "/index.html#stats", { waitUntil: "domcontentloaded" }); await p.waitForTimeout(1200);
    await fn(p, errs); await ctx.close();
  };
  const exportNow = async (p) => {
    await p.click("#stShare");
    await p.waitForFunction(() => document.querySelector("#modalBack.show .shpic img") || document.querySelector(".toast.show, #toast.show"), null, { timeout: 15000 }).catch(() => {});
    return picture(p);
  };

  // 1. the real data, light
  await run({}, async (p, errs) => {
    console.log("-- live data, light theme");
    const where = await p.evaluate(() => { const b = document.querySelector("#stShare"); const l = document.querySelector("#stGwLine");
      return { on: !!b && b.offsetParent !== null, inLine: !!(b && l && l.contains(b)), text: b && b.textContent.trim() }; });
    chk(where.on && where.inLine && where.text === "Export image", "the button sits on the gameweek line", JSON.stringify(where));
    for (const tab of ["value", "season", "fame"]) {
      await p.evaluate((t) => { location.hash = "#stats/" + t; }, tab); await p.waitForTimeout(150);
      const st = await p.evaluate(() => ({ btn: document.querySelector("#stShare").offsetParent !== null,
        sel: document.querySelector("#stGwSel").offsetParent !== null }));
      chk(st.btn && (st.sel === (tab === "value")), tab + " tab: the button shows" + (tab === "value" ? " beside the picker" : " on its own"), JSON.stringify(st));
    }
    await p.evaluate(() => { location.hash = "#stats/gw"; }); await p.waitForTimeout(150);
    const t0 = Date.now(); const pic = await exportNow(p); const ms = Date.now() - t0;
    chk(!!pic && pic.w === 1080 && pic.h === 1920, "Gameweek tab: a 1080 by 1920 picture opens in the sheet", pic && pic.w + "x" + pic.h + " in " + ms + "ms");
    chk(pic && pic.bytes > 200000, "a real PNG, not a blank", pic && pic.bytes + " bytes");
    chk(pic && isPurple(pic.bar), "the purple bar across the top", pic && JSON.stringify(pic.bar));
    chk(pic && isGreen(pic.pitch), "the green pitch under it", pic && JSON.stringify(pic.pitch));
    chk(pic && pic.wall[0] > 220 && pic.wall[1] > 220 && pic.wall[2] > 220, "a light wallpaper in the light theme", pic && JSON.stringify(pic.wall));
    const gw = await p.evaluate(() => +document.querySelector("#stGwSel").value);
    chk(pic && pic.title === "Gameweek " + gw, "the sheet is titled for the gameweek", pic && pic.title);
    chk(pic && pic.save && /^blob:/.test(pic.save.href) && pic.save.name === "gameon-gw" + gw + ".png", "Save is a download of gameon-gw" + gw + ".png", pic && JSON.stringify(pic.save));
    chk(ms < 8000, "made in under eight seconds", ms + "ms");
    // the Picks picture is its own file with its own title
    await p.click("#modalClose"); await p.waitForTimeout(300);
    await p.evaluate(() => { location.hash = "#stats/picks"; }); await p.waitForTimeout(150);
    const pk = await exportNow(p);
    chk(!!pk && pk.w === 1080 && pk.title === "Gameweek " + gw + " picks", "Picks tab: its own picture, titled for the picks", pk && pk.title);
    chk(pk && pk.save && pk.save.name === "gameon-gw" + gw + "-picks.png", "Picks saves as gameon-gw" + gw + "-picks.png", pk && JSON.stringify(pk.save));
    chk(pk && pk.bytes !== pic.bytes && isPurple(pk.bar) && isGreen(pk.pitch), "a different picture, same bar and pitch", pk && pk.bytes + " vs " + pic.bytes);
    // the drawn model: the template XI is eleven
    const model = await p.evaluate((gw) => { const ds = window.GO_STORE.dataset(); const H = window.GO_COMPUTE.highlights(ds, gw);
      return { xi: H.squads.templateXi.reduce((s, l) => s + l.players.length, 0), tw: H.squads.teamOfWeek ? H.squads.teamOfWeek.els.length : 0 }; }, gw);
    chk(model.xi === 11 && model.tw === 11, "the template XI and the team of the week are eleven men each", JSON.stringify(model));
    // the three pictures with no pitch: as tall as they need, the bar and wallpaper the same
    const want = { value: { title: "Gameweek " + gw + " values", file: "gameon-gw" + gw + "-value.png" },
                   season: { title: "Season so far", file: "gameon-season.png" },
                   fame: { title: "All time", file: "gameon-alltime.png" } };
    for (const tab of Object.keys(want)) {
      await p.click("#modalClose"); await p.waitForTimeout(300);
      await p.evaluate((t) => { location.hash = "#stats/" + t; }, tab); await p.waitForTimeout(150);
      const px = await exportNow(p);
      chk(!!px && px.w === 1080 && px.h >= 1400 && px.h <= 2400 && px.title === want[tab].title && px.save && px.save.name === want[tab].file,
          tab + " tab: its own picture, titled and named for it", px && [px.w + "x" + px.h, px.title, px.save && px.save.name].join(" · "));
      chk(px && isPurple(px.bar) && px.wall[0] > 220 && px.wall[1] > 220 && px.wall[2] > 220, tab + ": the bar and the wallpaper", px && JSON.stringify([px.bar, px.wall]));
    }
    await p.click("#modalClose"); await p.waitForTimeout(300);
    await p.evaluate(() => { location.hash = "#stats/picks"; }); await p.waitForTimeout(150);
    // close, then export the first gameweek on both tabs, where nothing moved in and the lists fall back
    await p.selectOption("#stGwSel", "1"); await p.waitForTimeout(300);
    const pk1 = await exportNow(p);
    chk(!!pk1 && pk1.w === 1080 && pk1.title === "Gameweek 1 picks", "gameweek 1 picks export too, with their own fallbacks", pk1 && pk1.title);
    await p.click("#modalClose"); await p.waitForTimeout(300);
    await p.evaluate(() => { location.hash = "#stats/gw"; }); await p.waitForTimeout(150);
    const pic1 = await exportNow(p);
    chk(!!pic1 && pic1.w === 1080 && pic1.title === "Gameweek 1", "gameweek 1 returns export too", pic1 && pic1.title);
    chk(errs.length === 0, "no JS errors", errs.slice(0, 2).join(" | "));
  });

  // 2. dark theme
  await run({ scheme: "dark" }, async (p, errs) => {
    console.log("-- dark theme");
    const pic = await exportNow(p);
    chk(!!pic && pic.w === 1080, "the picture is made", pic && pic.w + "x" + pic.h);
    chk(pic && pic.wall[0] < 40 && pic.wall[1] < 30 && pic.wall[2] < 50, "a dark wallpaper in the dark theme", pic && JSON.stringify(pic.wall));
    chk(pic && isPurple(pic.bar) && isGreen(pic.pitch), "the bar and pitch are the same in both themes", pic && JSON.stringify([pic.bar, pic.pitch]));
    chk(errs.length === 0, "no JS errors", errs.slice(0, 2).join(" | "));
  });

  // 3. a narrow phone keeps the button on the page and the picture in its sheet
  await run({ device: { viewport: { width: 320, height: 568 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } }, async (p, errs) => {
    console.log("-- 320px phone");
    const fit = await p.evaluate(() => { const b = document.querySelector("#stShare").getBoundingClientRect();
      return { right: b.right, left: b.left, over: document.documentElement.scrollWidth > document.documentElement.clientWidth }; });
    chk(fit.left >= 0 && fit.right <= 320 && !fit.over, "the button fits without sideways scroll", JSON.stringify(fit));
    const pic = await exportNow(p);
    const box = await p.evaluate(() => { const im = document.querySelector(".shpic img").getBoundingClientRect(); const bt = document.querySelector("#shSave").getBoundingClientRect();
      return { imgW: im.width, imgH: im.height, btnBottom: bt.bottom, vh: innerHeight }; });
    chk(!!pic && box.imgW <= 320 && box.btnBottom <= box.vh, "picture and its Save button both in view", JSON.stringify(box));
    chk(errs.length === 0, "no JS errors", errs.slice(0, 2).join(" | "));
  });

  // 4. a gameweek nobody has scored in yet: Picks draws, Gameweek says why not
  {
    const real = JSON.parse(fs.readFileSync(path.join(APP, "data.json"), "utf8"));
    const ds = real.dataset, cur = (ds.bootstrap.events.find((e) => e.is_current) || {}).id;
    if (cur) {
      if (ds.livePoints && ds.livePoints[cur]) ds.livePoints[cur] = {};
      Object.keys(ds.history || {}).forEach((id) => { const r = ds.history[id][cur]; if (r) { r.p = 0; r.b = 0; } });
      if (ds.liveBonus) delete ds.liveBonus[cur]; if (ds.breakdown) delete ds.breakdown[cur];
      const f = path.join(GOENV.STATES, "unscored-live.json"); fs.writeFileSync(f, JSON.stringify(real)); DATA = f;
      await run({}, async (p, errs) => {
        console.log("-- before kick-off (nothing scored in GW" + cur + ")");
        await p.click("#stShare"); await p.waitForTimeout(2500);
        const out = await p.evaluate(() => ({ sheet: !!document.querySelector("#modalBack.show .shpic img"), toast: document.querySelector("#toast").textContent.trim() }));
        chk(!out.sheet && /^No scores yet for/.test(out.toast) && /Picks picture/.test(out.toast), "Gameweek tab: a toast says there are no scores yet and points at Picks", JSON.stringify(out));
        await p.evaluate(() => { location.hash = "#stats/picks"; }); await p.waitForTimeout(150);
        const pk = await exportNow(p);
        chk(!!pk && pk.w === 1080 && pk.title === "Gameweek " + cur + " picks", "Picks tab: the picture is made all the same", pk && pk.title);
        chk(errs.length === 0, "no JS errors", errs.slice(0, 2).join(" | "));
      });
      DATA = null;
    }
  }

  // 4b. not an organiser: no export anywhere on the stats page
  DATA = null;
  await run({ me: null }, async (p, errs) => {
    console.log("-- nobody signed in");
    const has = await p.evaluate(() => ({ st: !!document.querySelector("#stShare"), lms: !!document.querySelector("#stLmsShare") }));
    chk(!has.st && !has.lms && errs.length === 0, "no export buttons for a reader who is not an organiser", JSON.stringify(has));
  });
  await run({ me: 1379307 }, async (p, errs) => {
    const has = await p.evaluate(() => ({ st: !!document.querySelector("#stShare"), lms: !!document.querySelector("#stLmsShare") }));
    chk(!has.st && !has.lms && errs.length === 0, "no export buttons for a manager who is not an organiser", JSON.stringify(has));
  });
  await run({}, async (p, errs) => {
    const has = await p.evaluate(() => ({ st: !!document.querySelector("#stShare"), lms: !!document.querySelector("#stLmsShare") }));
    chk(has.st && has.lms && errs.length === 0, "both exports for an organiser", JSON.stringify(has));
  });

  // 5. hostile states: nothing to draw says so; bad names and nulls still draw
  const states = { "no-picks": false, "gw2-current-no-picks": null, "hostile-names": true, "nulls-everywhere": null, "unknown-elements": null, "one-manager": null };
  for (const st of Object.keys(states)) {
    DATA = GOENV.STATES + "/" + st + ".json";
    await run({}, async (p, errs) => {
      console.log("-- state " + st);
      const has = await p.evaluate(() => !!document.querySelector("#stShare"));
      if (!has) { chk(errs.length === 0, "no stats to export from, and no error", errs.slice(0, 2).join(" | ")); return; }
      const t = await p.evaluate(() => { const b = document.querySelector("#stShare"); return b.offsetParent !== null; });
      if (!t) { chk(errs.length === 0, "the button is off the page here, and no error", errs.slice(0, 2).join(" | ")); return; }
      await p.click("#stShare"); await p.waitForTimeout(2500);
      const out = await p.evaluate(() => ({ sheet: !!document.querySelector("#modalBack.show .shpic img"),
        toast: [...document.querySelectorAll(".toast, #toast")].map((x) => x.textContent.trim()).join(" | "),
        enabled: !document.querySelector("#stShare").disabled }));
      const expectPic = states[st];
      if (expectPic === false) chk(!out.sheet && /make the picture/.test(out.toast), "nothing to draw is said in a toast", JSON.stringify(out));
      else if (expectPic === true) chk(out.sheet, "the picture is made", JSON.stringify(out));
      else chk(out.sheet || /make the picture/.test(out.toast), "either a picture or a toast, never silence", JSON.stringify(out));
      chk(out.enabled, "the button is live again afterwards");
      // every other tab too: a picture or a reason, never silence, never an error
      const said = [];
      for (const tab of ["picks", "value", "season", "fame"]) {
        if (out.sheet || document_open(p)) { await p.evaluate(() => { const x = document.querySelector("#modalClose"); if (x) x.click(); }); await p.waitForTimeout(250); }
        await p.evaluate(() => { const t = document.querySelector("#toast"); if (t) { t.textContent = ""; t.classList.remove("show"); } });
        await p.evaluate((t) => { location.hash = "#stats/" + t; }, tab); await p.waitForTimeout(150);
        if (!(await p.evaluate(() => document.querySelector("#stShare").offsetParent !== null))) { said.push(tab + ":hidden"); continue; }
        await p.click("#stShare"); await p.waitForTimeout(2000);
        const o = await p.evaluate(() => ({ sheet: !!document.querySelector("#modalBack.show .shpic img"), toast: document.querySelector("#toast").textContent.trim() }));
        said.push(tab + ":" + (o.sheet ? "picture" : (o.toast ? "toast" : "silence")));
        out.sheet = o.sheet;
      }
      chk(!said.some((x) => /silence/.test(x)), "the other tabs each give a picture or a reason", said.join(" "));
      chk(errs.length === 0, "no JS errors", errs.slice(0, 2).join(" | "));
    });
  }
  DATA = null;

  await b.close(); srv.close();
  console.log(fails ? "\nFAILS: " + fails : "\nthe picture is made");
  process.exit(fails ? 1 : 0);
})();
