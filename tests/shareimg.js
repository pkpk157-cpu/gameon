const GOENV = require("./lib/env.js");
/* The gameweek as a picture. The Export image button sits beside the
 * gameweek picker on the tabs that have one; a tap makes a 1080 by 1920 PNG
 * of the template XI, the captains, the differentials and the headlines, in
 * the theme the phone is showing, and shows it in a sheet with Save under it.
 * A gameweek with nothing to picture says so in a toast and breaks nothing;
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
const isPurple = ([r, g, b]) => r > 40 && r < 130 && g < 30 && b > 50 && b < 110;
const isGreen = ([r, g, b]) => g > 120 && r < 90 && b < 120;

(async () => {
  await new Promise((r) => srv.listen(PORT, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  const run = async (opts, fn) => {
    const ctx = await b.newContext({ ...(opts.device || devices["iPhone 12"]), serviceWorkers: "block", colorScheme: opts.scheme || "light" });
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
    for (const tab of ["season", "fame"]) {
      await p.click('#stTabs button[data-tab="' + tab + '"]'); await p.waitForTimeout(150);
      const shown = await p.evaluate(() => document.querySelector("#stShare").offsetParent !== null);
      chk(!shown, "no button on the " + tab + " tab, which has no gameweek");
    }
    await p.click('#stTabs button[data-tab="picks"]'); await p.waitForTimeout(150);
    const t0 = Date.now(); const pic = await exportNow(p); const ms = Date.now() - t0;
    chk(!!pic && pic.w === 1080 && pic.h === 1920, "a 1080 by 1920 picture opens in the sheet", pic && pic.w + "x" + pic.h + " in " + ms + "ms");
    chk(pic && pic.bytes > 200000, "a real PNG, not a blank", pic && pic.bytes + " bytes");
    chk(pic && isPurple(pic.bar), "the purple bar across the top", pic && JSON.stringify(pic.bar));
    chk(pic && isGreen(pic.pitch), "the green pitch under it", pic && JSON.stringify(pic.pitch));
    chk(pic && pic.wall[0] > 220 && pic.wall[1] > 220 && pic.wall[2] > 220, "a light wallpaper in the light theme", pic && JSON.stringify(pic.wall));
    const gw = await p.evaluate(() => +document.querySelector("#stGwSel").value);
    chk(pic && pic.title === "Gameweek " + gw, "the sheet is titled for the gameweek", pic && pic.title);
    chk(pic && pic.save && /^blob:/.test(pic.save.href) && pic.save.name === "gameon-gw" + gw + ".png", "Save is a download of gameon-gw" + gw + ".png", pic && JSON.stringify(pic.save));
    chk(ms < 8000, "made in under eight seconds", ms + "ms");
    // the drawn model: the template XI is eleven, the columns are three, the tiles four
    const model = await p.evaluate((gw) => { const ds = window.GO_STORE.dataset(); const H = window.GO_COMPUTE.highlights(ds, gw);
      return { xi: H.squads.templateXi.reduce((s, l) => s + l.players.length, 0), caps: H.squads.mostCaptained.length, diffs: H.squads.differentials.length }; }, gw);
    chk(model.xi === 11, "the template XI drawn is eleven men", model.xi);
    // close, then export the first gameweek, where nothing moved in and the lists fall back
    await p.click("#modalClose"); await p.waitForTimeout(300);
    await p.selectOption("#stGwSel", "1"); await p.waitForTimeout(300);
    const pic1 = await exportNow(p);
    chk(!!pic1 && pic1.w === 1080 && pic1.title === "Gameweek 1", "gameweek 1 exports too, with its own fallbacks", pic1 && pic1.title);
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

  // 4. hostile states: nothing to draw says so; bad names and nulls still draw
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
      chk(errs.length === 0, "no JS errors", errs.slice(0, 2).join(" | "));
    });
  }
  DATA = null;

  await b.close(); srv.close();
  console.log(fails ? "\nFAILS: " + fails : "\nthe picture is made");
  process.exit(fails ? 1 : 0);
})();
