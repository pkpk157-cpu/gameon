const GOENV = require("./lib/env.js");
/* A player in the team of the week or the template XI opens his own page, as
 * a player on any pitch does, on the gameweek the side belongs to. That holds
 * under Points, Ownership and Value, signed in or not, and after the picker
 * moves to another gameweek. Back comes home to the stats page it left. */
const { chromium } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP, PORT = 8898;
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".svg":"image/svg+xml", ".webp":"image/webp", ".png":"image/png" };
const srv = http.createServer((q, r) => { let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  fs.readFile(path.join(APP, u), (e, b) => { if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { "content-type": T[path.extname(u)] || "text/plain", "cache-control": "no-store" }); r.end(b); }); });
let fails = 0;
const chk = (ok, m, x) => { console.log((ok ? "  ok   " : "  FAIL ") + m + (x ? "  " + x : "")); if (!ok) fails++; };

(async () => {
  await new Promise((r) => srv.listen(PORT, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  for (const who of [21743, null]) {
    const tag = who ? "signed in" : "guest";
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
    await ctx.addInitScript((me) => { try { if (me) localStorage.setItem("go12.me", String(me)); localStorage.setItem("go12.theo", "off"); } catch (e) {} }, who);
    const p = await ctx.newPage(); const errs = [];
    p.on("pageerror", (e) => errs.push(e.message));
    await p.goto("http://127.0.0.1:" + PORT + "/index.html#classic", { waitUntil: "domcontentloaded" });
    await p.waitForFunction(() => document.querySelector("section.view.active table.t tbody tr"), null, { timeout: 20000 }).catch(() => {});
    const block = (key) => p.evaluate((key) => {
      const blk = document.querySelector('.xiblock[data-xi="' + key + '"]'); if (!blk) return null;
      const cards = [...blk.querySelectorAll(".pcard[data-el]")], sel = document.querySelector("#stGwSel");
      return { bgw: blk.getAttribute("data-bgw"), gw: sel && sel.value, n: cards.length,
        el: cards[3] && cards[3].getAttribute("data-el"), name: cards[3] && cards[3].querySelector(".pname").textContent };
    }, key);
    const tapAndBack = async (key, tab, info, what) => {
      const card = await p.$('.xiblock[data-xi="' + key + '"] .pcard[data-el="' + info.el + '"]');
      await card.scrollIntoViewIfNeeded(); await card.tap(); await p.waitForTimeout(700);
      const hash = await p.evaluate(() => location.hash);
      chk(hash === "#player/" + info.el + "/" + info.gw, tag + " " + what + ": a tap on " + info.name + " opens his page on GW" + info.gw, hash);
      await p.goBack(); await p.waitForTimeout(600);
      const back = await p.evaluate(() => location.hash);
      chk(back === "#stats/" + tab, tag + " " + what + ": back comes home to the stats page", back);
    };
    for (const [tab, key] of [["gw", "totw"], ["picks", "template"]]) {
      await p.evaluate((h) => { location.hash = h; }, "#stats/" + tab); await p.waitForTimeout(500);
      for (const metric of ["pts", "eo", "val"]) {
        await p.evaluate(({ key, metric }) => { const x = document.querySelector('.xiblock[data-xi="' + key + '"] .pseg button[data-metric="' + metric + '"]'); if (x) x.click(); }, { key, metric });
        await p.waitForTimeout(150);
        const info = await block(key);
        chk(!!info && info.n === 11 && info.bgw === info.gw, tag + " " + key + " " + metric + ": eleven players, the side carries its gameweek", JSON.stringify(info));
        if (info && info.el) await tapAndBack(key, tab, info, key + " " + metric);
      }
      // an earlier gameweek from the picker: the side and the tap follow it
      const earlier = await p.evaluate(() => { const s = document.querySelector("#stGwSel"); if (!s || s.options.length < 2) return null;
        s.value = s.options[0].value; s.dispatchEvent(new Event("change", { bubbles: true })); return s.value; });
      await p.waitForTimeout(400);
      if (earlier) {
        const info = await block(key);
        if (info) {
          chk(info.bgw === earlier, tag + " " + key + ": GW" + earlier + " from the picker, the side says GW" + info.bgw, JSON.stringify(info));
          await tapAndBack(key, tab, info, key + " GW" + earlier);
        } else console.log("  --   " + tag + " " + key + ": no side drawn for GW" + earlier);
      }
    }
    chk(!errs.length, tag + ": no JS errors", errs.join(" | "));
    await ctx.close();
  }
  await b.close(); srv.close();
  console.log(fails ? "\n" + fails + " FAILURES" : "\nthe elevens lead to their players");
  process.exit(fails ? 1 : 0);
})();
