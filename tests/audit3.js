const GOENV = require("./lib/env.js");
/* Serial sweep: every dataset, every view, one browser, short waits. */
const { chromium } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP;
const OUT = "/tmp/audit3.txt";
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".svg":"image/svg+xml" };
const VIEWS = ["classic","monthly","lms","pyramid","h2h","rules","stats","compare","prices","pl","winnings","gwstatus"];
let DATA = null;

const srv = http.createServer((q, r) => {
  let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  const f = u === "/data.json" ? DATA : path.join(APP, u);
  fs.readFile(f, (e, b) => {
    if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { "content-type": T[path.extname(f)] || "text/plain", "cache-control": "no-store" });
    r.end(b);
  });
});

(async () => {
  fs.writeFileSync(OUT, "");
  await new Promise((r) => srv.listen(8500, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  const files = fs.readdirSync(GOENV.STATES).sort();
  let bad = 0;

  for (const file of files) {
    DATA = GOENV.STATES + "/" + file;
    const name = file.replace(".json", "");
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
    ctx.setDefaultTimeout(2500);
    const p = await ctx.newPage();
    const errs = [], blank = [];
    p.on("pageerror", (e) => errs.push("JS: " + e.message));
    p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|net::ERR_|ERR_TUNNEL/i.test(m.text()) && !/favicon/i.test(m.text())) errs.push("CON: " + m.text()); });
    try {
      await p.goto("http://localhost:8500/index.html", { waitUntil: "domcontentloaded" });
      await p.waitForTimeout(700);
      for (const v of VIEWS) {
        await p.evaluate((vv) => { location.hash = "#" + vv; }, v);
        await p.waitForTimeout(200);
        const n = await p.evaluate(() => (document.querySelector("main.wrap").innerText || "").trim().length);
        if (n < 5) blank.push(v);
        if (await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) errs.push("overflow:" + v);
      }
      await p.evaluate(() => { location.hash = "#h2h"; }); await p.waitForTimeout(250);
      // the tab drives itself now: press every slider half, and the archive
      // chip there and back when the knockouts have taken over
      for (let i = 0; i < 4; i++) {
        const segs = await p.$$(".segb");
        if (!segs[i % (segs.length || 1)]) break;
        await segs[i % segs.length].click({ timeout: 400 }).catch(() => {});
        await p.waitForTimeout(180);
      }
      for (let i = 0; i < 2; i++) {
        const a = await p.$(".archbtn");
        if (!a) break;
        await a.click({ timeout: 400 }).catch(() => {});
        await p.waitForTimeout(220);
      }
      await p.evaluate(() => { location.hash = "#stats"; }); await p.waitForTimeout(250);
      for (const t of await p.$$(".tabbtn")) { await t.click({ timeout: 400 }).catch(() => {}); await p.waitForTimeout(110); }
      await p.evaluate(() => { location.hash = "#classic"; }); await p.waitForTimeout(250);
      const row = await p.$("tbody tr");
      if (row) {
        await row.click({ timeout: 600 }).catch(() => {});
        await p.waitForTimeout(400);
        for (const t of await p.$$(".tabbtn, .segbtn")) { await t.click({ timeout: 350 }).catch(() => {}); await p.waitForTimeout(90); }
        const sel = await p.$("main .view select:visible");
        if (sel) {
          const o = await p.$$eval("select option", (x) => x.map((y) => y.value)).catch(() => []);
          for (const v of o.slice(0, 3)) { await sel.selectOption(v).catch(() => {}); await p.waitForTimeout(110); }
        }
      }
      await p.evaluate(() => { location.hash = "#classic"; }); await p.waitForTimeout(200);
      await p.click("#btnProfile", { timeout: 600 }).catch(() => {});
      await p.waitForTimeout(350);
      await p.evaluate(() => { const s = document.querySelector("#profileBack"); if (s) s.classList.remove("show"); });
      await p.click("#btnSync", { timeout: 600 }).catch(() => {});
      await p.waitForTimeout(800);
      if (await p.evaluate(() => !!(window.__XSS || window.__XSS2))) errs.push("XSS EXECUTED");
    } catch (e) { errs.push("HARNESS: " + e.message.split("\n")[0]); }
    await ctx.close();
    const n = errs.length + blank.length;
    bad += n;
    const line = (n ? "FAIL " : "ok   ") + name.padEnd(24) +
      (blank.length ? " blank:[" + blank.join(",") + "]" : "") +
      (errs.length ? " " + JSON.stringify(errs.slice(0, 3)) : "");
    fs.appendFileSync(OUT, line + "\n");
    console.log(line);
  }
  const tail = "\n" + files.length + " datasets x " + VIEWS.length + " views - " + (bad ? bad + " PROBLEMS" : "0 problems");
  fs.appendFileSync(OUT, tail + "\n");
  console.log(tail);
  await b.close(); srv.close();
})();
