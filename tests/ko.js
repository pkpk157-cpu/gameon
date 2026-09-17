const GOENV = require("./lib/env.js");
/* The knockout view should show one round at a time, chosen from a dropdown. */
const { chromium, devices } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP;
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".svg":"image/svg+xml" };
let DATA = APP + "/data.json";
const srv = http.createServer((q, r) => {
  let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  const f = u === "/data.json" ? DATA : path.join(APP, u);
  fs.readFile(f, (e, b) => {
    if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { "content-type": T[path.extname(f)] || "text/plain", "cache-control": "no-store" }); r.end(b);
  });
});

(async () => {
  await new Promise((r) => srv.listen(9300, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });

  for (const [label, file] of [["group stage still on", APP + "/data.json"],
                               ["deep into the season", GOENV.STATES + "/gw25-live-full-season.json"]]) {
    DATA = file;
    const ctx = await b.newContext({ ...devices["iPhone 12"], serviceWorkers: "block" });
    ctx.setDefaultTimeout(3000);
    const p = await ctx.newPage();
    const errs = [];
    p.on("pageerror", (e) => errs.push("JS: " + e.message));
    p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|net::ERR_|ERR_TUNNEL/i.test(m.text())) errs.push("CON: " + m.text()); });
    await p.goto("http://localhost:9300/index.html#h2h", { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(1500);

    console.log("\n" + label);
    for (const stage of ["ko-ucl", "ko-uel"]) {
      await p.selectOption("#stageSel", stage).catch(() => {});
      await p.waitForTimeout(500);
      const info = await p.evaluate(() => {
        const sel = document.querySelector("#koRoundSel");
        return {
          hasPicker: !!sel,
          rounds: sel ? [...sel.options].map((o) => o.textContent) : [],
          opensOn: sel ? sel.options[sel.selectedIndex].textContent : null,
          meta: (document.querySelector("#stageMeta") || {}).textContent,
          lines: [...document.querySelectorAll("#grpPanel .koline")].map((x) => x.textContent),
          ties: document.querySelectorAll("#grpPanel .tie").length,
          overflow: document.documentElement.scrollWidth > window.innerWidth + 1
        };
      });
      console.log("  " + stage + ": picker " + info.hasPicker + " [" + info.rounds.join(" | ") + "]");
      console.log("     opens on '" + info.opensOn + "' · meta '" + info.meta + "' · showing " +
                  info.lines.length + " round(s) [" + info.lines.join("; ") + "] · overflow " + info.overflow);
      if (info.lines.length !== 1) console.log("     *** expected exactly one round on screen ***");

      // step through every round
      const n = info.rounds.length;
      for (let i = 0; i < n; i++) {
        await p.selectOption("#koRoundSel", String(i)).catch(() => {});
        await p.waitForTimeout(320);
        const r = await p.evaluate(() => ({
          line: (document.querySelector("#grpPanel .koline") || {}).textContent,
          picked: (() => { const s = document.querySelector("#koRoundSel"); return s ? s.options[s.selectedIndex].textContent : "?"; })(),
          ties: document.querySelectorAll("#grpPanel .tie").length,
          pending: document.querySelectorAll("#grpPanel .tie.pending").length,
          lines: document.querySelectorAll("#grpPanel .koline").length,
          overflow: document.documentElement.scrollWidth > window.innerWidth + 1
        }));
        console.log("       " + String(i) + " " + (r.picked || "?").padEnd(16) +
          (r.line || "") + "  (" + r.pending + " pending)" +
          (r.lines === 1 ? "" : "  *** " + r.lines + " rounds shown ***") +
          (r.overflow ? "  *** OVERFLOW ***" : ""));
      }
    }
    console.log("  JS errors: " + (errs.length ? JSON.stringify(errs.slice(0, 2)) : "none"));
    await p.screenshot({ path: GOENV.OUT + "/ko-" + label.split(" ")[0] + ".png" });
    await ctx.close();
  }
  await b.close(); srv.close();
})();
