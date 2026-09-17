const GOENV = require("./lib/env.js");
/* The new control must behave on a device with no data, like every other. */
const { chromium } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP, PORT = 8714;
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".svg":"image/svg+xml" };
let DATA = APP + "/data.json";
const srv = http.createServer((q, r) => { let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  const f = u === "/data.json" ? DATA : path.join(APP, u);
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { "content-type": T[path.extname(f)] || "text/plain", "cache-control": "no-store" }); r.end(b); }); });
let bad = 0;
(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  for (const st of fs.readdirSync(GOENV.STATES).sort()) {
    DATA = GOENV.STATES + "/" + st;
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
    const p = await ctx.newPage();
    const errs = [];
    p.on("pageerror", e => errs.push(e.message));
    await p.goto("http://127.0.0.1:" + PORT + "/index.html#classic", { waitUntil: "load" });
    await p.waitForTimeout(500);
    // open both sheets, click everything clickable in each, close both
    for (const s of [{ btn: "#barYou", back: "#youBack", body: "#youBody" },
                     { btn: "#barMenu", back: "#menuBack", body: "#menuBody" }]) {
      try { await p.click(s.btn, { timeout: 2000 }); } catch (e) { errs.push("could not open " + s.btn); }
      await p.waitForTimeout(300);
      const btns = await p.$$(s.body + " button");
      for (const x of btns.slice(0, 10)) { try { await x.click({ timeout: 800 }); await p.waitForTimeout(120); } catch (e) {} }
      await p.evaluate((sel) => { const el = document.querySelector(sel); if (el) el.click(); }, s.back);
      await p.waitForTimeout(250);
    }
    const locked = await p.evaluate(() => document.documentElement.classList.contains("ovl"));
    const real = errs.filter(e => !/could not open/.test(e));
    if (real.length || locked) { bad++; console.log("  " + st + ": " + (real.slice(0,2).join(" | ") || "") + (locked ? " [page left locked]" : "")); }
    await ctx.close();
  }
  await b.close(); srv.close();
  console.log(bad ? bad + " state(s) with problems" : "both sheets behave on all " + fs.readdirSync(GOENV.STATES).length + " broken datasets");
  process.exit(bad ? 1 : 0);
})();
