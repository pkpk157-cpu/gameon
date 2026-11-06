const GOENV = require("./lib/env.js");
/* Motion. Moving between pages runs in a view transition: deeper slides in,
   back slides out, the tabs and the menu's sections fade; a manager's name
   tapped in a table glides into the bar as his profile opens, and both
   names lose the glide once it lands. A pill switch's highlight glides to the
   new pill and leaves nothing behind. Reduced motion has none of it, and a
   browser without view transitions changes page exactly as before. In every
   case the page that ends up on screen is the right one. */
const { chromium } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP, PORT = 8787;
let fails = 0; const chk = (ok, m, x) => { console.log((ok ? "  ok   " : "  FAIL ") + m + (x ? "  " + x : "")); if (!ok) fails++; };
const J = JSON.stringify;
const T = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".webp": "image/webp", ".png": "image/png", ".mjs": "application/javascript" };
const srv = http.createServer((q, r) => { let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  fs.readFile(path.join(APP, u), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { "content-type": T[path.extname(u)] || "application/octet-stream", "cache-control": "no-store" }); r.end(b); }); });

// every view transition the app starts, with the direction it set and the
// names in play when the old page is captured and when the new one is drawn
const SPY = () => {
  window.__vt = [];
  const real = document.startViewTransition && document.startViewTransition.bind(document);
  if (!real) return;
  document.startViewTransition = (cb) => {
    const rec = { nav: document.documentElement.dataset.nav || null, oldHero: [...document.querySelectorAll("*")].filter((e) => e.style && e.style.viewTransitionName === "vt-hero").map((e) => e.id || e.className) };
    window.__vt.push(rec);
    const t = real(() => { cb(); rec.newHero = [...document.querySelectorAll("*")].filter((e) => e.style && e.style.viewTransitionName === "vt-hero").map((e) => e.id || e.className); });
    // read after the app's own clean-up, which hangs off the same promise
    t.finished.then(() => setTimeout(() => { rec.done = true; rec.after = [...document.querySelectorAll("*")].filter((e) => e.style && e.style.viewTransitionName === "vt-hero").length; rec.navAfter = document.documentElement.dataset.nav || null; }, 0));
    return t;
  };
};

(async () => {
  await new Promise((r) => srv.listen(PORT, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  const page = async (opts) => {
    const c = await b.newContext(Object.assign({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" }, opts || {}));
    await c.route((u) => !/localhost/.test(u.toString()), (route) => route.abort());
    await c.addInitScript(() => { try { localStorage.setItem("go12.me", "21743"); localStorage.setItem("go12.theo", "off"); } catch (e) {} });
    await c.addInitScript(SPY);
    if (opts && opts.noVT) await c.addInitScript(() => { try { delete Document.prototype.startViewTransition; document.startViewTransition = undefined; } catch (e) {} });
    const p = await c.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.goto("http://localhost:" + PORT + "/index.html#classic", { waitUntil: "domcontentloaded" });
    await p.waitForSelector('section.view[data-view="classic"] table.t tbody tr', { timeout: 20000 }); await p.waitForTimeout(1500);
    return { c, p, errs };
  };
  const vt = (p) => p.evaluate(() => window.__vt);
  const at = (p) => p.evaluate(() => ({ hash: location.hash, view: (document.querySelector("section.view.active") || {}).getAttribute ? document.querySelector("section.view.active").getAttribute("data-view") : null,
    title: document.querySelector("#barTitle").textContent }));

  console.log("-- with motion");
  let { c, p, errs } = await page();
  // a name in the Classic table, tapped
  const name = await p.evaluate(() => { const w = document.querySelector('section.view[data-view="classic"] table.t tbody tr td.name[data-entry] .who'); return w ? w.textContent : null; });
  await p.click('section.view[data-view="classic"] table.t tbody tr td.name[data-entry] .who'); await p.waitForTimeout(900);
  let v = await vt(p), here = await at(p);
  chk(v.length === 1 && v[0].nav === "fwd", "a profile opens deeper: one transition, sliding in", J(v));
  chk(J(v[0].oldHero) === J(["who"]) && J(v[0].newHero) === J(["barTitle"]), "the tapped name carries the glide out, the bar's title takes it in", J({ old: v[0].oldHero, new: v[0].newHero }));
  chk(v[0].done && v[0].after === 0 && v[0].navAfter === null, "once it lands nothing keeps a glide or a direction", J(v[0]));
  chk(here.view === "profile" && here.title === name, "and the profile is on screen, named in the bar", J(here));
  // back
  await p.evaluate(() => history.back()); await p.waitForTimeout(900);
  v = await vt(p); here = await at(p);
  chk(v.length === 2 && v[1].nav === "back" && here.view === "classic", "back slides the other way, onto Classic", J({ nav: v[1].nav, here }));
  // across the tabs
  await p.click('.navitem[data-tab="lms"]'); await p.waitForTimeout(900);
  v = await vt(p); here = await at(p);
  chk(v.length === 3 && v[2].nav === "side" && here.view === "lms", "a tab is beside the last one: it fades", J({ nav: v[2].nav, here }));
  // the menu's sections, side by side too
  await p.click("#barMenu"); await p.waitForTimeout(500);
  await p.click('#menuBack .menuitem[data-go="news"]'); await p.waitForTimeout(900);
  v = await vt(p); here = await at(p);
  chk(v[v.length - 1].nav === "side" && here.view === "news", "a section from the menu fades in too", J({ nav: v[v.length - 1].nav, here }));
  // the same page with other figures is not a move
  await p.evaluate(() => { location.hash = "#stats/gw"; }); await p.waitForTimeout(700);
  const n0 = (await vt(p)).length;
  await p.evaluate(() => { location.hash = "#stats/picks"; }); await p.waitForTimeout(700);
  chk((await vt(p)).length === n0 && (await at(p)).view === "stats", "a tab inside a page changes in place, no transition", String((await vt(p)).length - n0));
  // a pill: the highlight glides, then nothing is left of it
  await p.evaluate(() => { location.hash = "#market"; }); await p.waitForTimeout(900);
  await p.click('#mkPos [data-pos="2"]');
  const mid = await p.evaluate(() => new Promise((res) => setTimeout(() => res({ g: document.querySelectorAll("#mkPos .pillglide").length, arr: document.querySelectorAll("#mkPos .pillarrive").length }), 90)));
  await p.waitForTimeout(800);
  const end = await p.evaluate(() => ({ g: document.querySelectorAll(".pillglide").length, arr: document.querySelectorAll(".pillarrive").length,
    on: (document.querySelector("#mkPos button.on") || {}).textContent, bg: getComputedStyle(document.querySelector("#mkPos button.on")).backgroundColor }));
  chk(mid.g === 1 && mid.arr === 1, "the highlight is on its way between the pills", J(mid));
  chk(end.g === 0 && end.arr === 0 && end.on === "DEF" && end.bg !== "rgba(0, 0, 0, 0)", "it lands: DEF lit by its own highlight, nothing left behind", J(end));
  chk(errs.length === 0, "no JS errors", errs.slice(0, 3).join(" | "));
  if (process.env.GO_VIDEO) {
    // a recording of it, for a person to look at
    await c.close();
    const vc = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block", recordVideo: { dir: process.env.GO_VIDEO, size: { width: 390, height: 844 } } });
    await vc.route((u) => !/localhost/.test(u.toString()), (route) => route.abort());
    await vc.addInitScript(() => { try { localStorage.setItem("go12.me", "21743"); localStorage.setItem("go12.theo", "off"); } catch (e) {} });
    const vp = await vc.newPage();
    await vp.goto("http://localhost:" + PORT + "/index.html#classic", { waitUntil: "domcontentloaded" });
    await vp.waitForSelector('section.view[data-view="classic"] table.t tbody tr', { timeout: 20000 }); await vp.waitForTimeout(2600);
    await vp.click('section.view[data-view="classic"] table.t tbody tr:nth-child(3) td.name .who'); await vp.waitForTimeout(1300);
    await vp.evaluate(() => history.back()); await vp.waitForTimeout(1200);
    await vp.click('.navitem[data-tab="monthly"]'); await vp.waitForTimeout(1000);
    await vp.click('.navitem[data-tab="lms"]'); await vp.waitForTimeout(1000);
    await vp.evaluate(() => { location.hash = "#market"; }); await vp.waitForTimeout(1200);
    for (const k of ["2", "3", "4", "all"]) { await vp.click('#mkPos [data-pos="' + k + '"]'); await vp.waitForTimeout(650); }
    await vp.evaluate(() => { location.hash = "#profile/21743"; }); await vp.waitForTimeout(1300);
    await vc.close();
  } else await c.close();

  console.log("-- reduced motion");
  ({ c, p, errs } = await page({ reducedMotion: "reduce" }));
  await p.click('section.view[data-view="classic"] table.t tbody tr td.name[data-entry] .who'); await p.waitForTimeout(700);
  here = await at(p);
  chk((await vt(p)).length === 0 && here.view === "profile", "no transition, straight to the profile", J(here));
  await p.evaluate(() => { location.hash = "#market"; }); await p.waitForTimeout(700);
  await p.click('#mkPos [data-pos="3"]');
  const rg = await p.evaluate(() => new Promise((res) => setTimeout(() => res({ g: document.querySelectorAll(".pillglide").length, on: (document.querySelector("#mkPos button.on") || {}).textContent }), 60)));
  chk(rg.g === 0 && rg.on === "MID", "a pill simply switches, nothing glides", J(rg));
  chk(errs.length === 0, "reduced motion: no JS errors", errs.slice(0, 3).join(" | "));
  await c.close();

  console.log("-- a browser without view transitions");
  ({ c, p, errs } = await page({ noVT: true }));
  const has = await p.evaluate(() => typeof document.startViewTransition);
  await p.click('section.view[data-view="classic"] table.t tbody tr td.name[data-entry] .who'); await p.waitForTimeout(600);
  here = await at(p);
  chk(has !== "function" && here.view === "profile", "the profile opens as before", J({ has, here }));
  await p.evaluate(() => history.back()); await p.waitForTimeout(600);
  chk((await at(p)).view === "classic" && !(await p.evaluate(() => document.documentElement.dataset.nav)), "back works, and no direction is left on the page");
  chk(errs.length === 0, "no view transitions: no JS errors", errs.slice(0, 3).join(" | "));
  await c.close();

  await b.close(); srv.close();
  console.log(fails ? "\nFAILS: " + fails : "\nthe pages move, and land where they should");
  process.exit(fails ? 1 : 0);
})();
