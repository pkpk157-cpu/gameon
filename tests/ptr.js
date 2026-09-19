const GOENV = require("./lib/env.js");
/* Pull to refresh, driven with real touch events over CDP. */
const { chromium, devices } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP, PORT = 8745;
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".svg":"image/svg+xml", ".webp":"image/webp" };
const base = JSON.parse(fs.readFileSync(APP + "/data.json", "utf8"));
base.dataset.updatedAt = new Date(Date.now() - 5 * 60000).toISOString(); // fresh, whatever the file's age
let serve = JSON.stringify(base), delay = 0;
const srv = http.createServer((q, r) => { let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  if (u === "/data.json") { setTimeout(() => { r.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }); r.end(serve); }, delay); return; }
  fs.readFile(path.join(APP, u), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { "content-type": T[path.extname(u)] || "text/plain" }); r.end(b); }); });
let fails = 0; const chk = (ok, m, x) => { console.log((ok ? "  ok   " : "  FAIL ") + m + (x ? "  " + x : "")); if (!ok) fails++; };
async function pull(cdp, x, from, to, steps, release) {
  const tp = (y) => [{ x, y, id: 1 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: tp(from) });
  for (let i = 1; i <= steps; i++) { await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: tp(from + (to - from) * i / steps) }); await new Promise(r => setTimeout(r, 16)); }
  if (release) await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}
(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  const ctx = await b.newContext({ ...devices["iPhone 12"], serviceWorkers: "block" });
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
  const cdp = await ctx.newCDPSession(p);
  await p.goto("http://localhost:" + PORT + "/index.html#classic", { waitUntil: "domcontentloaded" }); await p.waitForTimeout(1500);
  const state = () => p.evaluate(() => { const el = document.querySelector("#ptr"); return { show: el.classList.contains("show"), armed: el.classList.contains("armed"), busy: el.classList.contains("busy"), label: el.querySelector("i").textContent, toast: document.querySelector("#toast").textContent, toastShown: document.querySelector("#toast").classList.contains("show") }; });
  chk(!!(await p.$("#ptr")), "the indicator exists (touch device)");
  // a short pull shows the pill but does not arm it
  await pull(cdp, 195, 200, 260, 6, false); let s = await state();
  chk(s.show && !s.armed && s.label === "Pull to refresh", "a short pull shows 'Pull to refresh' and is not armed", JSON.stringify(s));
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); await p.waitForTimeout(200); s = await state();
  chk(!s.show, "letting go before the threshold hides it, nothing runs");
  // a long pull arms; releasing runs the refresh; the publish is unchanged -> up to date
  delay = 600; // a slow network, so the spinner can be seen
  await pull(cdp, 195, 200, 420, 10, false); s = await state();
  chk(s.armed && s.label === "Release to refresh", "a long pull arms it: 'Release to refresh'", s.label);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); await p.waitForTimeout(150); s = await state();
  chk(s.busy && s.label === "Refreshing…", "on release it spins and says Refreshing", JSON.stringify(s));
  await p.waitForTimeout(1800); s = await state(); delay = 0;
  chk(!s.show && s.toastShown && /^Up to date · synced/.test(s.toast), "same publish: toast says Up to date with the age", s.toast);
  // now publish a change: newer updatedAt and a renamed leader
  const nd = JSON.parse(JSON.stringify(base)); nd.dataset.updatedAt = new Date(Date.now() - 60000).toISOString(); nd.dataset.managers[0].entryName = "PULLED IN XI"; serve = JSON.stringify(nd);
  await pull(cdp, 195, 200, 420, 10, true); await p.waitForTimeout(2000); s = await state();
  const shown = await p.evaluate(() => /PULLED IN XI/.test(document.querySelector("section.view.active").textContent));
  chk(s.toast === "Updated" && shown, "a newer publish: toast says Updated and the page shows it", s.toast);
  // stale publish -> honest toast
  const st = JSON.parse(JSON.stringify(nd)); st.dataset.updatedAt = new Date(Date.now() - 50 * 60000).toISOString(); serve = JSON.stringify(st);
  await pull(cdp, 195, 200, 420, 10, true); await p.waitForTimeout(2000); s = await state();
  chk(/^Updated$/.test(s.toast), "an older-but-different publish still counts as an update", s.toast);
  await pull(cdp, 195, 200, 420, 10, true); await p.waitForTimeout(2000); s = await state();
  chk(/^Nothing new published — not synced for 50m$/.test(s.toast), "stale and unchanged: 'Nothing new published — not synced for 50m'", s.toast);
  // scrolled down: no pull. Classic is a fill-mode view whose table scrolls
  // inside its own frame, so the page itself never moves there; the stats
  // page is a plain scroller, and is where a scrolled page can be had.
  await p.evaluate(() => { location.hash = "#stats"; }); await p.waitForTimeout(800);
  const sy = await p.evaluate(() => { window.scrollTo(0, 300); return window.scrollY; });
  await p.waitForTimeout(200);
  await pull(cdp, 195, 400, 600, 8, true); await p.waitForTimeout(200); s = await state();
  chk(sy > 0 && !s.show && !s.busy, "no gesture when the page is scrolled down", "scrollY " + sy + " " + JSON.stringify(s));
  await p.evaluate(() => { window.scrollTo(0, 0); location.hash = "#classic"; }); await p.waitForTimeout(800);
  // a sheet open: no pull
  await p.click("#barMenu"); await p.waitForTimeout(400);
  await pull(cdp, 300, 200, 420, 8, true); await p.waitForTimeout(200); s = await state();
  chk(!s.show && !s.busy, "no gesture with a sheet open");
  await p.evaluate(() => history.back()); await p.waitForTimeout(400);
  // inside a table frame scrolled down: no pull
  await p.evaluate(() => { const f = document.querySelector(".view.active .freeze"); if (f) f.scrollTop = 200; });
  const fz = await p.evaluate(() => { const f = document.querySelector(".view.active .freeze"); const r = f.getBoundingClientRect(); return { y: Math.round(r.top + 100), scrolled: f.scrollTop > 0 }; });
  if (fz.scrolled) { await pull(cdp, 195, fz.y, fz.y + 220, 8, true); await p.waitForTimeout(200); s = await state(); chk(!s.show && !s.busy, "no gesture from inside a table frame that is scrolled"); }
  else console.log("  (table frame does not scroll in this mode; skipped)");
  chk(errs.length === 0, "no JS errors", errs.join(" | "));
  await p.screenshot({ path: "ptr-idle.png", clip: { x: 0, y: 0, width: 390, height: 200 } });
  // one more, caught mid-pull for the eye
  await pull(cdp, 195, 200, 420, 10, false); await p.screenshot({ path: "ptr-armed.png", clip: { x: 0, y: 0, width: 390, height: 200 } });
  delay = 800; delay = 800; await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); await p.waitForTimeout(150);
  await p.screenshot({ path: "ptr-busy.png", clip: { x: 0, y: 0, width: 390, height: 200 } });
  await p.waitForTimeout(1500);
  await b.close(); srv.close(); console.log(fails ? "FAILS: " + fails : "ALL OK");
})();
