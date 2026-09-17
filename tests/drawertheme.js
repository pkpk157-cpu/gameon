const GOENV = require("./lib/env.js");
/* The section cards must stay legible and distinguishable in every theme:
   the inactive card needs a visible edge, and the current one must stand
   apart from it rather than both washing into the panel. */
const { chromium, devices } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP;
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".svg":"image/svg+xml" };
const srv = http.createServer((q, r) => {
  let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  fs.readFile(path.join(APP, u), (e, b) => {
    if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { "content-type": T[path.extname(u)] || "text/plain", "cache-control": "no-store" }); r.end(b);
  });
});
let fails = 0;
const chk = (n, ok, d) => { if (!ok) { fails++; console.log("   FAIL " + n + (d ? " — " + d : "")); } };
const rgb = (s) => (s.match(/[\d.]+/g) || []).map(Number);
const lum = (c) => { const [r, g, b] = c.map((v) => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); });
  return .2126 * r + .7152 * g + .0722 * b; };
const contrast = (a, b) => { const L1 = lum(a), L2 = lum(b); return (Math.max(L1, L2) + .05) / (Math.min(L1, L2) + .05); };

(async () => {
  await new Promise((r) => srv.listen(9904, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  for (const [theme, scheme] of [["light", "light"], ["dark", "dark"], ["system", "dark"]]) {
    const ctx = await b.newContext({ ...devices["iPhone 12"], colorScheme: scheme, serviceWorkers: "block" });
    const p = await ctx.newPage();
    const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.goto("http://localhost:9904/index.html#classic", { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(1400);
    await p.click("#barMenu"); await p.waitForTimeout(500);
    await p.click('#pfTheme button[data-th="' + theme + '"]'); await p.waitForTimeout(400);
    const r = await p.evaluate(() => {
      // The marked card is whichever carries .on — on #classic that is the
      // tournament, the second one, not the first. Assuming index 0 measured an
      // inactive card and called its plain edge a missing accent.
      const all = [...document.querySelectorAll(".menuitem")];
      const on = all.find((x) => x.classList.contains("on")) || all[0];
      const off = all.find((x) => x !== on);
      const it = [on, off];
      const c = (el, k) => getComputedStyle(el)[k];
      return {
        onBg: c(it[0], "backgroundColor"), onBorder: c(it[0], "borderTopColor"),
        offBg: c(it[1], "backgroundColor"), offBorder: c(it[1], "borderTopColor"),
        title: c(it[1], "color"), sub: c(it[1].querySelector(".mi-s"), "color"),
        panel: c(document.querySelector("#menuBack .modal"), "backgroundColor"),
        accent: getComputedStyle(document.documentElement).getPropertyValue("--accent").trim(),
        applied: document.documentElement.getAttribute("data-theme") || "(none)"
      };
    });
    const titleVsPanel = contrast(rgb(r.title), rgb(r.panel).slice(0, 3));
    const subVsPanel = contrast(rgb(r.sub), rgb(r.panel).slice(0, 3));
    console.log("\n" + theme + " (browser " + scheme + ", applied " + r.applied + ")");
    console.log("  current card : " + r.onBg + "  edge " + r.onBorder);
    console.log("  other card   : " + r.offBg + "  edge " + r.offBorder);
    console.log("  title/sub contrast against the panel: " +
      titleVsPanel.toFixed(1) + " / " + subVsPanel.toFixed(1));
    chk(theme + ": the two cards differ", r.onBg !== r.offBg || r.onBorder !== r.offBorder);
    // whatever this theme's accent is, the current card must be edged in it
    const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const want = r.accent.charAt(0) === "#" ? hexToRgb(r.accent) : rgb(r.accent).slice(0, 3);
    chk(theme + ": the current card is marked in this theme's accent",
        rgb(r.onBorder).slice(0, 3).join() === want.join(), r.onBorder + " vs " + r.accent);
    chk(theme + ": the inactive card has an edge", rgb(r.offBorder)[3] !== 0 && r.offBorder !== "rgba(0, 0, 0, 0)", r.offBorder);
    chk(theme + ": the title is readable", titleVsPanel >= 4.5, titleVsPanel.toFixed(2));
    chk(theme + ": the subtitle is readable", subVsPanel >= 3, subVsPanel.toFixed(2));
    chk(theme + ": no errors", errs.length === 0, errs.slice(0, 1).join(""));
    await p.screenshot({ path: GOENV.OUT + "/drawer-" + theme + ".png" });
    await ctx.close();
  }
  await b.close(); srv.close();
  console.log("\n" + (fails ? fails + " FAILURES" : "the section cards read correctly in every theme"));
})();
