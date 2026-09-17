const GOENV = require("./lib/env.js");
/* A frozen header you can read through is not frozen. Park a row half-under the
   header, then compare those pixels against the same strip with the rows hidden.
   A byte-exact match is too strict — anti-aliasing at the edges moves a channel
   or two — so measure how far the pixels actually move, and prove the same
   measurement still condemns the translucent header this replaced. */
const { chromium } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP;
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".svg":"image/svg+xml" };
const srv = http.createServer((q, r) => {
  let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  const f = u === "/data.json" ? "/tmp/drawer-rich.json" : path.join(APP, u);
  fs.readFile(f, (e, b) => {
    if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { "content-type": T[path.extname(f)] || "text/plain", "cache-control": "no-store" }); r.end(b);
  });
});
let fails = 0;
const chk = (n, ok, d) => { if (!ok) { fails++; console.log("   FAIL " + n + (d ? " — " + d : "")); } };

async function bleed(p, forceOld, view) {
  view = view || "prices";
  await p.evaluate((v) => {
    const bx = document.querySelector('[data-view="' + v + '"] .freeze');
    const h = document.querySelector('[data-view="' + v + '"] thead th').getBoundingClientRect().height;
    bx.scrollTop = 1200 + h / 2;
  }, view);
  // Navigating by hash does not reload the page, so an injected override would
  // otherwise leak into every view checked after it.
  const oldTag = forceOld ? await p.addStyleTag({ content:
    '.freeze table.t thead th{background:var(--glass-bar)!important}' }) : null;
  await p.waitForTimeout(450);

  const geom = await p.evaluate((v) => {
    const th = document.querySelector('[data-view="' + v + '"] thead th');
    const r = th.getBoundingClientRect();
    const rows = [...document.querySelectorAll('[data-view="' + v + '"] tbody tr')];
    const under = rows.filter((x) => {
      const b = x.getBoundingClientRect();
      return b.top < r.bottom - 1 && b.bottom > r.top + 1;
    });
    return { clip: { x: Math.round(r.left), y: Math.round(r.top) + 3,
                     width: 300, height: Math.max(1, Math.round(r.height) - 6) },
             under: under.length,
             name: under.length ? (under[0].querySelector(".who") || under[0]).textContent.trim().slice(0, 18) : "-",
             bg: getComputedStyle(th).backgroundColor };
  }, view);
  const withRows = await p.screenshot({ clip: geom.clip });
  const tag = await p.addStyleTag({ content: '[data-view="' + view + '"] tbody{visibility:hidden!important}' });
  await p.waitForTimeout(300);
  const alone = await p.screenshot({ clip: geom.clip });
  await p.evaluate((el) => el.remove(), tag);
  if (oldTag) await p.evaluate((el) => el.remove(), oldTag);
  await p.waitForTimeout(200);

  const d = await p.evaluate(async ([a, c]) => {
    const load = (b64) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = "data:image/png;base64," + b64; });
    const [ia, ic] = await Promise.all([load(a), load(c)]);
    const cv = document.createElement("canvas"); cv.width = ia.width; cv.height = ia.height;
    const g = cv.getContext("2d", { willReadFrequently: true });
    g.drawImage(ia, 0, 0); const da = g.getImageData(0, 0, cv.width, cv.height).data;
    g.clearRect(0, 0, cv.width, cv.height); g.drawImage(ic, 0, 0);
    const dc = g.getImageData(0, 0, cv.width, cv.height).data;
    let max = 0, n = 0;
    for (let i = 0; i < da.length; i += 4) for (let k = 0; k < 3; k++) {
      const q = Math.abs(da[i + k] - dc[i + k]); if (q > max) max = q; if (q > 8) n++;
    }
    return { max: max, n: n, samples: (da.length / 4) * 3 };
  }, [withRows.toString("base64"), alone.toString("base64")]);
  return Object.assign(d, geom);
}

(async () => {
  await new Promise((r) => srv.listen(9918, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  for (const [theme, scheme] of [["light", "light"], ["dark", "dark"]]) {
    const ctx = await b.newContext({ viewport: { width: 320, height: 568 }, deviceScaleFactor: 1,
      isMobile: true, hasTouch: true, colorScheme: scheme, serviceWorkers: "block" });
    const p = await ctx.newPage();
    const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    console.log("\n" + theme + ":");
    for (const view of ["classic", "monthly", "lms", "pyramid", "prices"]) {
      await p.goto("http://localhost:9918/index.html#" + view, { waitUntil: "domcontentloaded" });
      await p.waitForTimeout(1700);
      const has = await p.evaluate((v) =>
        !!document.querySelector('[data-view="' + v + '"] .freeze tbody tr'), view);
      if (!has) { console.log("   " + view.padEnd(9) + " (no scrolling table here)"); continue; }

      const now = await bleed(p, false, view);
      const was = await bleed(p, true, view);
      console.log("   " + view.padEnd(9) + now.under + " row(s) beneath (" + now.name +
        ")  shift " + String(now.max).padStart(3) + ", changed " + String(now.n).padStart(4) +
        "   |  translucent would shift " + String(was.max).padStart(3) +
        ", change " + String(was.n).padStart(4));
      chk(theme + "/" + view + ": a row really is underneath", now.under > 0);
      chk(theme + "/" + view + ": nothing reads through the header", now.max <= 6 && now.n === 0,
          "max " + now.max + ", " + now.n + " samples");
      chk(theme + "/" + view + ": the check would catch a translucent header", was.n > 40,
          "only " + was.n + " samples changed");
    }
    chk(theme + ": no errors", errs.length === 0, errs.slice(0, 1).join(""));
    await ctx.close();
  }
  await b.close(); srv.close();
  console.log("\n" + (fails ? fails + " FAILURES" : "the frozen header hides the rows passing under it"));
})();
