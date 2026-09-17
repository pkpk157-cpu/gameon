const GOENV = require("./lib/env.js");
/* Duplicate ids, unlabelled controls, and broken nesting — across every view. */
const { chromium } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP;
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".svg":"image/svg+xml" };
const srv = http.createServer((q, r) => { let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  fs.readFile(path.join(APP, u), (e, b) => { if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { "content-type": T[path.extname(u)] || "text/plain", "cache-control": "no-store" }); r.end(b); }); });
const ds = JSON.parse(fs.readFileSync(APP + "/data.json", "utf8")).dataset;
const VIEWS = ["classic", "monthly", "lms", "pyramid", "ucl", "stats", "prices", "pl", "chips",
               "winnings", "gwstatus", "profile/" + ds.managers[0].id];
let fails = 0;
const chk = (n, ok, d) => { if (!ok) { fails++; console.log("   FAIL " + n + (d ? " — " + d : "")); } };
(async () => {
  await new Promise((r) => srv.listen(9812, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  const p = await ctx.newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|net::ERR_/.test(m.text())) errs.push("CON " + m.text()); });
  await p.goto("http://localhost:9812/index.html#classic", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(3000);
  for (const v of VIEWS) {
    await p.evaluate((x) => { location.hash = "#" + x; }, v);
    await p.waitForTimeout(900);
    const m = await p.evaluate(() => {
      const ids = {}, dupes = [];
      document.querySelectorAll("[id]").forEach((el) => {
        ids[el.id] = (ids[el.id] || 0) + 1; if (ids[el.id] === 2) dupes.push(el.id);
      });
      const unlabelled = [];
      document.querySelectorAll("button, select, input, [role=button]").forEach((el) => {
        if (el.offsetParent === null) return;
        const t = (el.textContent || "").trim();
        if (!t && !el.getAttribute("aria-label") && !el.getAttribute("title") &&
            !el.getAttribute("aria-labelledby") && !el.placeholder) unlabelled.push(el.tagName + "." + el.className);
      });
      // a table cell outside a row, a row outside a table: structural mistakes
      // the browser silently reparents, which is how a column goes missing
      const misplaced = [...document.querySelectorAll("td, th")].filter((c) => c.parentElement.tagName !== "TR").length +
                        [...document.querySelectorAll("tr")].filter((r) => !/THEAD|TBODY|TFOOT|TABLE/.test(r.parentElement.tagName)).length;
      // an image with nothing to say when it fails to load
      const noalt = [...document.querySelectorAll("img")].filter((i) => i.alt == null || i.alt === undefined).length;
      return { dupes, unlabelled: unlabelled.slice(0, 5), misplaced, noalt,
               nodes: document.querySelectorAll("*").length };
    });
    console.log("  " + v.padEnd(18) + String(m.nodes).padStart(6) + " nodes" +
      (m.dupes.length ? "  DUP IDS " + JSON.stringify(m.dupes) : "") +
      (m.unlabelled.length ? "  unlabelled " + JSON.stringify(m.unlabelled) : "") +
      (m.misplaced ? "  misplaced " + m.misplaced : ""));
    chk(v + ": no duplicate element ids", m.dupes.length === 0, JSON.stringify(m.dupes));
    chk(v + ": every control says what it does", m.unlabelled.length === 0, JSON.stringify(m.unlabelled));
    chk(v + ": no table cell outside a row", m.misplaced === 0, String(m.misplaced));
  }
  console.log("\nJS errors: " + (errs.length ? JSON.stringify(errs.slice(0, 4)) : "none"));
  chk("no errors in any view", errs.length === 0);
  await b.close(); srv.close();
  console.log("\n" + (fails ? fails + " FAILURES" : "every view is structurally sound and labelled"));
})();
