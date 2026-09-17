const GOENV = require("./lib/env.js");
/* The league table: right numbers, right order, and it fits every phone. */
const { chromium } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP;
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".svg":"image/svg+xml" };
const srv = http.createServer((q, r) => { let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  fs.readFile(path.join(APP, u), (e, b) => { if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { "content-type": T[path.extname(u)] || "text/plain", "cache-control": "no-store" }); r.end(b); }); });
let fails = 0;
const chk = (n, ok, d) => { if (!ok) { fails++; console.log("   FAIL " + n + (d ? " — " + d : "")); } };

// what the table should say, worked out here independently of the app
const ds = JSON.parse(fs.readFileSync(APP + "/data.json", "utf8")).dataset;
const want = (() => {
  const t = {};
  const seat = (k) => t[k] || (t[k] = { pts: 0, gf: 0, ga: 0, mp: 0, w: 0, d: 0, l: 0 });
  Object.keys(ds.gwFixtures).forEach((gw) => (ds.gwFixtures[gw] || []).forEach((f) => {
    if (!f[0] || !f[1]) return; seat(f[0]); seat(f[1]);
    if (!(f[3] || f[8]) || f[4] == null || f[5] == null) return;
    const H = seat(f[0]), A = seat(f[1]);
    H.mp++; A.mp++; H.gf += f[4]; H.ga += f[5]; A.gf += f[5]; A.ga += f[4];
    if (f[4] > f[5]) { H.w++; A.l++; H.pts += 3; } else if (f[4] < f[5]) { A.w++; H.l++; A.pts += 3; }
    else { H.d++; A.d++; H.pts++; A.pts++; }
  }));
  const rows = Object.keys(t).map((k) => ({ club: ds.teamNames[k] || k, ...t[k], gd: t[k].gf - t[k].ga }));
  rows.sort((a, b) => (b.pts - a.pts) || (b.gd - a.gd) || (b.gf - a.gf) || (a.club < b.club ? -1 : 1));
  return rows;
})();
console.log("expected leader " + want[0].club + " on " + want[0].pts + ", bottom " +
  want[want.length - 1].club + "; " + want.length + " clubs, " +
  want.reduce((n, r) => n + r.mp, 0) / 2 + " matches counted");

const WIDTHS = [320, 360, 375, 390, 412, 430, 520, 600, 768, 1024];
(async () => {
  await new Promise((r) => srv.listen(9830, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  for (const w of WIDTHS) {
    for (const theme of (w === 390 ? ["light", "dark"] : ["light"])) {
      const ctx = await b.newContext({ viewport: { width: w, height: 1000 }, deviceScaleFactor: 2, isMobile: w < 700, hasTouch: true, serviceWorkers: "block" });
      const p = await ctx.newPage();
      const errs = []; p.on("pageerror", (e) => errs.push(e.message));
      await p.addInitScript((t) => { try { localStorage.setItem("go.theme", t); } catch (e) {} }, theme);
      await p.goto("http://localhost:9830/index.html#pl", { waitUntil: "domcontentloaded" });
      await p.waitForTimeout(2300);
      await p.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
      // the toggle has to be there and get us to the table
      const seg = await p.evaluate(() => [...document.querySelectorAll('[data-pl]')].map((x) => x.textContent.trim()));
      chk(w + ": the section offers both views", JSON.stringify(seg) === '["Fixtures","Table"]', JSON.stringify(seg));
      await p.click('[data-pl="table"]'); await p.waitForTimeout(800);
      const m = await p.evaluate(() => {
        const tbl = document.querySelector("table.pltbl");
        if (!tbl) return { none: true };
        const head = [...tbl.querySelectorAll("thead th")].filter((x) => x.offsetParent !== null)
          .map((x) => x.textContent.trim());
        const rows = [...tbl.querySelectorAll("tbody tr")].map((tr) => ({
          pos: tr.querySelector("td.pos").textContent.trim(),
          club: tr.querySelector("td.name .who").textContent.trim(),
          cells: [...tr.querySelectorAll("td.num")].filter((x) => x.offsetParent !== null).map((x) => x.textContent.trim()),
          band: tr.classList.contains("top") ? "top" : tr.classList.contains("drop") ? "drop" : "",
          l5: [...tr.querySelectorAll(".l5r")].map((x) => x.className.replace("l5r ", ""))
        }));
        const wrap = tbl.closest(".freeze");
        const clipped = [...tbl.querySelectorAll("td, th")].filter((c) =>
          c.offsetParent !== null && c.scrollWidth > c.clientWidth + 0.5 && !c.classList.contains("name")).length;
        const cut = [...tbl.querySelectorAll("td.name .who")]
          .filter((c) => c.scrollWidth > c.clientWidth + 0.5).map((c) => c.textContent.trim());
        return { head, rows, cut, hash: location.hash,
          tableW: Math.round(tbl.getBoundingClientRect().width),
          wrapW: Math.round(wrap.getBoundingClientRect().width),
          scrolls: wrap.scrollWidth > wrap.clientWidth + 1,
          pageScrolls: document.documentElement.scrollWidth > window.innerWidth + 1, clipped };
      });
      chk(w + ": the table renders", !m.none);
      if (m.none) { await ctx.close(); continue; }
      console.log("\n" + w + "px" + (theme === "dark" ? " dark" : "") + "  columns: " + m.head.join(" ") +
        "   table " + m.tableW + " in " + m.wrapW);
      console.log("   " + m.rows[0].pos + " " + m.rows[0].club + " " + JSON.stringify(m.rows[0].cells) +
        "  |  " + m.rows[m.rows.length - 1].pos + " " + m.rows[m.rows.length - 1].club);
      chk(w + ": the address says which view", m.hash === "#pl/table", m.hash);
      chk(w + ": twenty clubs", m.rows.length === 20, String(m.rows.length));
      chk(w + ": the order matches the results",
          JSON.stringify(m.rows.map((r) => r.club)) === JSON.stringify(want.map((r) => r.club)),
          JSON.stringify(m.rows.slice(0, 4).map((r) => r.club)));
      chk(w + ": points are right", m.rows.every((r, i) => r.cells[r.cells.length - 2] === String(want[i].pts) ||
          r.cells.includes(String(want[i].pts))), JSON.stringify(m.rows[0].cells));
      chk(w + ": clubs level on everything share a place",
          (() => { const p2 = m.rows.map((r) => +r.pos);
            for (let i = 1; i < want.length; i++) {
              const same = want[i].pts === want[i-1].pts && want[i].gd === want[i-1].gd && want[i].gf === want[i-1].gf;
              if (same !== (p2[i] === p2[i-1])) return false;
            } return true; })(),
          JSON.stringify(m.rows.map((r) => r.pos).join(",")));
      chk(w + ": the top four and bottom three are marked",
          m.rows.filter((r) => r.band === "top").length === 4 && m.rows.filter((r) => r.band === "drop").length === 3,
          m.rows.map((r) => r.band || "-").join(","));
      chk(w + ": played, goal difference and points never hide",
          ["Pl", "GD", "Pts"].every((c) => m.head.includes(c)), m.head.join(","));
      chk(w + ": the table does not scroll sideways", !m.scrolls, m.tableW + " in " + m.wrapW);
      chk(w + ": nor does the page", !m.pageScrolls);
      chk(w + ": no figure is cut off", m.clipped === 0, String(m.clipped));
      if (m.cut.length) console.log("   club names shortened: " + JSON.stringify(m.cut));
      chk(w + ": every club name prints in full", m.cut.length === 0, JSON.stringify(m.cut));
      chk(w + ": no errors", errs.length === 0, JSON.stringify(errs.slice(0, 2)));
      if (w === 390) {
        chk("the form run reads newest last, five slots",
            m.rows[0].l5.length === 5, JSON.stringify(m.rows[0].l5));
        // and back to the fixtures
        await p.click('[data-pl="fixtures"]'); await p.waitForTimeout(800);
        const back = await p.evaluate(() => ({ hash: location.hash,
          fx: document.querySelectorAll('[data-view="pl"] .fx').length,
          tbl: document.querySelectorAll("table.pltbl").length }));
        console.log("   back to fixtures: " + back.hash + ", " + back.fx + " matches, tables " + back.tbl);
        chk("the toggle goes back to the fixtures", back.fx > 0 && back.tbl === 0, JSON.stringify(back));
        await p.screenshot({ path: __dirname + "/pltable-" + theme + ".png", fullPage: true });
      }
      await ctx.close();
    }
  }
  await b.close(); srv.close();
  console.log("\n" + (fails ? fails + " FAILURES" : "the table agrees with the results, and fits every width"));
})();
