const GOENV = require("./lib/env.js");
/* The rest of the season, on screen. The simulator plays the real dataset
   forward and this opens the app on the moments that matter — the end of a
   mini-season, the week the draw is made, a double and a blank gameweek, the
   knockout rounds, the final and the checked end of the season — with the
   page's clock set to that moment. Every view, tab, sheet and export is
   opened. Nothing may throw, and no NaN, undefined or null may reach the
   page as text. */
const { chromium } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const sim = require("./season/sim.js");
const APP = GOENV.APP, PORT = 8817;
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".svg":"image/svg+xml", ".webp":"image/webp", ".png":"image/png" };
let DATA = "";
const srv = http.createServer((q, r) => { let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  if (u === "/data.json") { r.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }); r.end(DATA); return; }
  fs.readFile(path.join(APP, u), (e, b) => { if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { "content-type": T[path.extname(u)] || "text/plain", "cache-control": "no-store" }); r.end(b); }); });

// the moments
const STATES = [[6, "pre"], [12, "final"], [13, "live"], [19, "final"], [20, "locked"], [24, "live"], [24, "final"],
                [26, "final"], [29, "live"], [29, "final"], [30, "live"], [31, "final"], [33, "bonus"], [37, "final"],
                [38, "live"], [38, "bonus"], [38, "final"]];
const VIEWS = ["classic", "monthly", "lms", "pyramid", "h2h", "vol", "stats", "compare", "prices", "prices/stats",
               "stats/gw", "stats/picks", "stats/value", "stats/season", "stats/fame",
               "pl", "pl/table", "winnings", "gwstatus", "rules", "chips/1/3xc"];
let fails = 0;
const chk = (ok, m, x) => { if (!ok) { fails++; console.log("  FAIL " + m + (x ? "  " + String(x).slice(0, 300) : "")); } };

(async () => {
  await new Promise((r) => srv.listen(PORT, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  const base = sim.loadBase();
  const S = sim.season(base);
  for (const [gw, phase] of STATES) {
    const st = sim.stateAt(S, gw, phase);
    DATA = JSON.stringify({ generatedAt: st.dataset.updatedAt, dataset: st.dataset });
    // signed in as an organiser, so the pages that are theirs alone open too
    const orgs = (require(GOENV.APP + "/tests/audit/harness.js").loadCompute().cfg.organisers) || [];
    const me = (st.dataset.managers.find((m) => orgs.indexOf(m.id) !== -1) || st.dataset.managers[Math.floor(st.dataset.managers.length / 2)]).id;
    const label = "GW" + gw + " " + phase;
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
    // the page's clock reads the moment the state describes
    await ctx.addInitScript(({ off, me }) => {
      const Real = Date;
      function D() { if (!(this instanceof D)) return Real(); if (!arguments.length) return new Real(Real.now() + off);
        return new (Function.prototype.bind.apply(Real, [null].concat(Array.prototype.slice.call(arguments))))(); }
      D.prototype = Real.prototype; D.now = () => Real.now() + off; D.parse = Real.parse; D.UTC = Real.UTC;
      window.Date = D;
      try { localStorage.setItem("go12.me", String(me)); localStorage.setItem("go12.theo", "off"); } catch (e) {}
    }, { off: st.now - Date.now(), me });
    const p = await ctx.newPage();
    const hits = []; let where = "boot";
    p.on("pageerror", (e) => hits.push(where + " :: " + e.message + " | " + (e.stack || "").split("\n")[1]));
    p.on("console", (m) => { if (m.type() !== "error") return; const u = (m.location() || {}).url || "";
      if (/\/photos\//.test(u) || /ERR_TUNNEL|ERR_NAME|Failed to load resource|ERR_CONNECTION|net::/.test(m.text())) return;
      hits.push(where + " :: console " + m.text()); });
    await p.goto("http://127.0.0.1:" + PORT + "/index.html#classic", { waitUntil: "domcontentloaded" });
    await p.waitForFunction(() => document.querySelector("section.view.active table.t tbody tr"), null, { timeout: 20000 }).catch(() => {});
    const texts = [];
    const sweep = async (name) => {
      where = label + " #" + name;
      await p.waitForTimeout(150);
      // open what the page offers: segments, selects, tabs, tiles, exports
      try {
        await p.evaluate(async () => {
          const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
          const host = document.querySelector("section.view.active");
          if (!host) return;
          const click = async (el) => { el.click(); await sleep(120); };
          for (const el of [...host.querySelectorAll(".segb, .pseg [data-metric], [data-stab]")].slice(0, 14)) await click(el);
          for (const sel of [...host.querySelectorAll("select")].slice(0, 4)) {
            const opts = [...sel.options];
            for (const o of opts.slice(0, Math.min(opts.length, 6))) { sel.value = o.value; sel.dispatchEvent(new Event("change", { bubbles: true })); await sleep(120); }
          }
          for (const el of [...host.querySelectorAll("details:not([open]) summary")].slice(0, 6)) await click(el);
          const trend = host.querySelector("[data-trend]"); if (trend) { await click(trend); await sleep(200); }
          const share = host.querySelector("#stShare"); if (share) { await click(share); await sleep(900); }
          const lmsShare = host.querySelector("#stLmsShare"); if (lmsShare) { await click(lmsShare); await sleep(900); }
          const card = host.querySelector(".pcard[data-el]"); if (card) { await click(card); await sleep(300); }
        });
      } catch (e) { hits.push(where + " :: sweep " + e.message); }
      const txt = await p.evaluate(() => document.body.innerText || "");
      const bad = txt.match(/\bNaN\b|\bundefined\b|\[object |\bnull\b/g);
      if (bad) texts.push(where + " :: " + bad.slice(0, 3).join(","));
      // close whatever opened
      await p.evaluate(() => { for (let i = 0; i < 4; i++) { const c = document.querySelector(".modal .close, #modalClose, [data-close]"); if (c) c.click(); } location.hash = "#classic"; }).catch(() => {});
      await p.waitForTimeout(120);
    };
    for (const v of VIEWS.concat(["profile/" + me, "stats"])) {
      await p.evaluate((h) => { location.hash = h; }, "#" + v);
      await sweep(v);
    }
    chk(!hits.length, label + ": no page or console errors", hits.slice(0, 4).join("\n      "));
    chk(!texts.length, label + ": no broken text on any page", texts.slice(0, 4).join("\n      "));
    if (!hits.length && !texts.length) console.log("  ok   " + label);
    await ctx.close();
  }
  await b.close(); srv.close();
  console.log(fails ? "FAILS: " + fails : "ALL OK");
  process.exit(fails ? 1 : 0);
})();
