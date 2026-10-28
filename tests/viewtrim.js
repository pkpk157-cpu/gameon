const GOENV = require("./lib/env.js");
/* A tab left behind is cleared once the phone is idle, so a session does not
   pile up every page it has visited behind the one on screen. Coming back
   draws the tab afresh and whole; views that wait on the network (a team, a
   profile) keep their page. */
const { chromium, devices } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP, PORT = 8761;
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".svg":"image/svg+xml", ".webp":"image/webp", ".png":"image/png" };
const srv = http.createServer((q, r) => { let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  fs.readFile(path.join(APP, u), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { "content-type": T[path.extname(u)] || "application/octet-stream" }); r.end(b); }); });
let fails = 0; const chk = (ok, m, x) => { console.log((ok ? "  ok   " : "  FAIL ") + m + (x ? "  " + x : "")); if (!ok) fails++; };
(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  const c = await b.newContext({ ...devices["Pixel 7"], serviceWorkers: "block" }); const p = await c.newPage(); const er = [];
  p.on("pageerror", (e) => er.push(e.message));
  await p.goto("http://localhost:" + PORT + "/index.html#classic", { waitUntil: "domcontentloaded" });
  await p.waitForSelector("section.view.active table.t tbody tr", { timeout: 20000 });
  const rows0 = await p.evaluate(() => document.querySelectorAll('section.view[data-view="classic"] table.t tbody tr').length);
  for (const v of ["monthly", "lms", "pyramid", "h2h", "stats", "prices", "pl", "classic", "monthly", "lms"]) {
    await p.evaluate((v) => { location.hash = v; }, v);
    await p.waitForFunction((v) => { const s = document.querySelector('section.view[data-view="' + v + '"]'); return s && s.classList.contains("active") && s.childElementCount > 0; }, v, { timeout: 15000 });
    await p.waitForTimeout(700);
  }
  await p.waitForTimeout(3500);
  const st = await p.evaluate(() => ({ hiddenFull: [...document.querySelectorAll("section.view:not(.active)")].filter((s) => s.childElementCount).map((s) => s.getAttribute("data-view")),
    active: document.querySelector("section.view.active").getAttribute("data-view"), els: document.getElementsByTagName("*").length }));
  chk(st.active === "lms" && st.hiddenFull.length === 0, "once idle, the tabs left behind are cleared and only the one on screen holds a page", JSON.stringify(st));
  chk(st.els < 6000, "after a session through every main tab the page carries one tab, not all of them", st.els + " elements (all kept was about 17,700)");
  await p.evaluate(() => { location.hash = "classic"; });
  await p.waitForSelector("section.view.active table.t tbody tr", { timeout: 15000 });
  const rows1 = await p.evaluate(() => document.querySelectorAll('section.view[data-view="classic"] table.t tbody tr').length);
  chk(rows1 === rows0 && rows0 > 0, "coming back draws the tab whole, as it was", rows0 + " rows then, " + rows1 + " now");
  // a view that waits on the network keeps its page
  const kept = await p.evaluate(() => { const s = document.querySelector('section.view[data-view="fpl"]'); s.innerHTML = "<div id=keepme>x</div>"; return true; });
  await p.waitForTimeout(3500);
  chk(kept && await p.evaluate(() => !!document.querySelector("#keepme")), "a view that waits on the network is never cleared");
  chk(!er.length, "no JS errors", er.join(" | "));
  await b.close(); srv.close(); console.log(fails ? "FAILS: " + fails : "ALL OK"); process.exit(fails ? 1 : 0);
})();
