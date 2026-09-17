const GOENV = require("./lib/env.js");
/* Every broken dataset we know how to make, against every screen and the
   controls added since: stat tabs, the profile's chip row and folds, badges,
   rivals, player cards and both sheets. Nothing may throw. */
const { chromium } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP, PORT = 8761;
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".svg":"image/svg+xml", ".webp":"image/webp", ".png":"image/png" };
let DATA = GOENV.STATES + "/no-dataset-key.json";
const srv = http.createServer((q, r) => { let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  const f = u === "/data.json" ? DATA : path.join(APP, u);
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { "content-type": T[path.extname(f)] || "text/plain", "cache-control": "no-store" }); r.end(b); }); });
const VIEWS = ["classic", "monthly", "lms", "pyramid", "h2h", "vol", "stats", "compare", "prices", "prices/stats",
               "pl", "pl/table", "winnings", "gwstatus", "rules", "chips/1/3xc"];
let fails = 0;
(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  for (const st of fs.readdirSync(GOENV.STATES).sort()) {
    DATA = GOENV.STATES + "/" + st;
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
    const p = await ctx.newPage();
    const hits = []; let where = "boot";
    p.on("pageerror", e => hits.push(where + " :: " + e.message + " | " + (e.stack || "").split("\n")[1]));
    p.on("console", m => { if (m.type() !== "error") return; const u = (m.location() || {}).url || "";
      if (/\/photos\//.test(u) || /ERR_TUNNEL|ERR_NAME|Failed to load resource/.test(m.text())) return;
      hits.push(where + " :: console " + m.text()); });
    await p.goto("http://127.0.0.1:" + PORT + "/index.html#classic", { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(900);
    // whoever this dataset has, if anyone
    const me = await p.evaluate(() => { try { const d = window.GO_STORE.dataset(); const m = d && d.managers && d.managers[0]; if (m) localStorage.setItem("go12.me", String(m.id)); return m ? m.id : null; } catch (e) { return null; } });
    if (me) { await p.evaluate(() => location.reload()); await p.waitForTimeout(1000); }
    for (const v of VIEWS.concat(me ? ["profile/" + me] : [])) {
      where = st + " #" + v;
      await p.evaluate(h => { location.hash = h; }, "#" + v); await p.waitForTimeout(260);
      try { await p.evaluate(async () => {
        const sleep = (ms) => new Promise(r => setTimeout(r, ms));
        const host = document.querySelector("section.view.active");
        if (!host) return;
        for (const sel of host.querySelectorAll("select")) for (let i = 0; i < Math.min(sel.options.length, 4); i++) { sel.selectedIndex = i; sel.dispatchEvent(new Event("change", { bubbles: true })); await sleep(60); }
        // not the ones that reload the page out from under the sweep
        for (const el of [...host.querySelectorAll(".tabbtn, .seg button, summary, .pfoldpeek, .badge, .pcard, .hcard, .chipgo, button")]
          .filter(el => !/^(emptyReload|emptyRefresh|emptyCta)$/.test(el.id)).slice(0, 30)) {
          try { el.click(); } catch (e) {}
          await sleep(35);
          const back = document.querySelector("#modalBack");
          if (back && back.classList.contains("show")) { history.back(); await sleep(90); }
        }
      }); } catch (e) { if (!/context was destroyed|Target closed/.test(e.message)) throw e; await p.waitForTimeout(600); }
      await p.waitForTimeout(200);
    }
    where = st + " sheets";
    for (const btn of ["#barMenu", "#barYou"]) { try { await p.click(btn, { timeout: 1500 }); } catch (e) {} await p.waitForTimeout(350); await p.evaluate(() => history.back()); await p.waitForTimeout(300); }
    where = st + " pinning a rival";
    const other = await p.evaluate(() => { try { const d = window.GO_STORE.dataset(); const m = (d.managers || [])[1]; return m ? m.id : null; } catch (e) { return null; } });
    if (other) {
      await p.evaluate(id => location.hash = "#profile/" + id, other); await p.waitForTimeout(500);
      await p.evaluate(() => { const b = document.querySelector("#rvToggle"); b && b.click(); }); await p.waitForTimeout(250);
      await p.evaluate(id => location.hash = "#profile/" + id, me); await p.waitForTimeout(500);
    }
    if (hits.length) { console.log("  FAIL " + st); hits.slice(0, 5).forEach(h => console.log("        " + h)); fails++; }
    else console.log("  ok   " + st + (me ? "" : "  (no managers to stand in for a reader)"));
    await ctx.close();
  }
  await b.close(); srv.close();
  console.log(fails ? "FAILS: " + fails : "ALL OK");
})();
