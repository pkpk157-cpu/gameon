const GOENV = require("./lib/env.js");
/* The usage counter's opt-out. GoatCounter keeps no identity, so the only
   way to keep one person's visits out of the totals is to stop counting on
   their phone: the Settings button sets the key count.js honours, the app's
   own reporter stops calling out, and the button reads back the state. */
const { chromium, devices } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP, PORT = 8799;
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".webp":"image/webp", ".png":"image/png" };
const srv = http.createServer((q, r) => { let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  fs.readFile(path.join(APP, u), (e, b) => { if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { "content-type": T[path.extname(u)] || "text/plain", "cache-control": "no-store" }); r.end(b); }); });
let fails = 0;
const chk = (ok, m, x) => { console.log((ok ? "  ok   " : "  FAIL ") + m + (x ? "  " + x : "")); if (!ok) fails++; };
(async () => {
  await new Promise((r) => srv.listen(PORT, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  const ctx = await b.newContext({ ...devices["iPhone 12"], serviceWorkers: "block" });
  const p = await ctx.newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  // a stand-in for count.js, so what the app reports can be read back
  await p.addInitScript(() => { window.__gc = []; window.goatcounter = { count: (o) => window.__gc.push(o.path) }; });
  await p.goto("http://localhost:" + PORT + "/index.html#classic", { waitUntil: "domcontentloaded" });
  await p.waitForFunction(() => document.querySelector("section.view.active table.t tbody tr"), null, { timeout: 15000 });
  await p.evaluate(() => { location.hash = "#monthly"; }); await p.waitForTimeout(500);
  const before = await p.evaluate(() => window.__gc.length);
  chk(before >= 1, "visits are reported while counting is on", String(before));

  await p.evaluate(() => { location.hash = "#settings"; }); await p.waitForTimeout(600);
  const lab0 = await p.evaluate(() => document.querySelector("#btnCount").textContent);
  chk(lab0 === "Stop counting my visits", "the button offers to stop", lab0);
  await p.click("#btnCount"); await p.waitForTimeout(200);
  const st = await p.evaluate(() => ({ key: localStorage.getItem("skipgc"), lab: document.querySelector("#btnCount").textContent,
    note: document.querySelector("#countNote").textContent }));
  chk(st.key === "t", "the GoatCounter opt-out key is set", String(st.key));
  chk(st.lab === "Count my visits again", "the button now offers to count again", st.lab);
  chk(/not counted/.test(st.note), "the note says this phone is not counted", st.note);

  const n0 = await p.evaluate(() => window.__gc.length);
  for (const v of ["classic", "lms", "pyramid", "prices"]) { await p.evaluate((x) => { location.hash = "#" + x; }, v); await p.waitForTimeout(400); }
  const n1 = await p.evaluate(() => window.__gc.length);
  chk(n1 === n0, "nothing is reported while counting is off", n0 + " -> " + n1);

  // it holds across a reload, and switches back
  await p.reload({ waitUntil: "domcontentloaded" });
  await p.waitForFunction(() => document.querySelector("section.view.active table.t tbody tr, section.view.active .card"), null, { timeout: 15000 });
  await p.evaluate(() => { location.hash = "#h2h"; }); await p.waitForTimeout(500);
  chk(await p.evaluate(() => window.__gc.length) === 0, "still off after a reload");
  await p.evaluate(() => { location.hash = "#settings"; }); await p.waitForTimeout(600);
  await p.click("#btnCount"); await p.waitForTimeout(200);
  chk(await p.evaluate(() => localStorage.getItem("skipgc")) === null, "switching back clears the key");
  await p.evaluate(() => { location.hash = "#classic"; }); await p.waitForTimeout(500);
  chk(await p.evaluate(() => window.__gc.length) >= 1, "and visits are reported again");
  chk(errs.length === 0, "no JS errors", errs.slice(0, 2).join(" | "));
  await b.close(); srv.close();
  console.log(fails ? "\nFAILS: " + fails : "\nthe opt-out holds");
  process.exit(fails ? 1 : 0);
})();
