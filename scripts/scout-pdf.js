/* The scouting reports as PDFs: reports/gw<N>/<pos>.pdf beside each <pos>.json.

   Each is drawn by the same report.js the app uses, on a bare page holding
   only styles.css and the report (no bar, no tabs), in the light theme, and
   printed to A4 by headless Chromium. Run by .github/workflows/scout.yml after
   scripts/scout.js has written a gameweek; by hand:

     node scripts/scout-pdf.js 12          one gameweek
     node scripts/scout-pdf.js             the newest in reports/index.json
     node scripts/scout-pdf.js 12 --force  print again over PDFs already there

   A gameweek is printed once, the first time its report is built: the JSON
   is refreshed through the week (prices, transfers, injuries) but each PDF
   is close to a megabyte, and reprinting it on every refresh would pile
   megabytes into the repository's history for nothing. The PDF says when it
   was built; the page in the app is always the latest.

   Needs playwright-core (or playwright) and a Chromium: CHROME names the
   binary, otherwise Playwright's own is used. A report that fails to print
   is reported and the rest carry on; the exit code says whether any failed. */
"use strict";
const fs = require("fs"), http = require("http"), path = require("path");

const ROOT = path.join(__dirname, "..");
const POS = ["gkp", "def", "mid", "fwd"];
const TYPES = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json",
  ".webp": "image/webp", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2" };

// the bare page: the app's stylesheet and fonts, report.js, nothing else
const PAGE = `<!doctype html><html lang="en" data-theme="light"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Scouting report</title>
<link rel="stylesheet" href="styles.css">
<style>
  /* Inter where the machine has it (the workflow installs it), so the PDF
     looks the same wherever it is printed */
  :root{--sans:Inter,"Inter Variable",-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
  html,body{background:#fff;margin:0}
  body{padding:0 14px}
  #r{max-width:none}
  @page{size:A4;margin:10mm 8mm}
</style></head><body><main id="r"></main><script src="report.js"></script></body></html>`;

function serve() {
  const srv = http.createServer((q, r) => {
    const u = decodeURIComponent(q.url.split("?")[0]);
    if (u === "/__print.html") { r.writeHead(200, { "content-type": "text/html" }); return r.end(PAGE); }
    const f = path.join(ROOT, path.normalize(u).replace(/^([/\\])+/, ""));
    if (!f.startsWith(ROOT + path.sep)) { r.writeHead(403); return r.end(); }
    fs.readFile(f, (e, b) => {
      if (e) { r.writeHead(404); return r.end(); }
      r.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" });
      r.end(b);
    });
  });
  return new Promise((ok) => srv.listen(0, "127.0.0.1", () => ok(srv)));
}

function browserLib() {
  for (const m of ["playwright-core", "playwright"]) { try { return require(m); } catch (e) { /* next */ } }
  throw new Error("playwright-core is not installed");
}

async function printGw(browser, base, gw, force) {
  let failed = 0;
  const ctx = await browser.newContext({ viewport: { width: 794, height: 1123 }, colorScheme: "light", serviceWorkers: "block" });
  // nothing leaves the machine: the report needs only files from the repo
  await ctx.route((u) => !u.toString().startsWith(base), (route) => route.abort());
  for (const pos of POS) {
    const json = path.join(ROOT, "reports", "gw" + gw, pos + ".json");
    const out = path.join(ROOT, "reports", "gw" + gw, pos + ".pdf");
    if (!fs.existsSync(json) || (!force && fs.existsSync(out))) continue;
    const page = await ctx.newPage();
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    try {
      await page.goto(base + "/__print.html", { waitUntil: "load" });
      const rep = JSON.parse(fs.readFileSync(json, "utf8"));
      await page.evaluate((R) => {
        window.GOReport.render(document.getElementById("r"), R, {
          // the team's three letters stand beside it already; a hundred small crests would double the file
          crest: () => "",
          face: () => "",
          pdf: ""
        });
        // everything drawn now, not when scrolled to: print has no scrolling
        document.querySelectorAll("img").forEach((i) => { i.loading = "eager"; });
      }, rep);
      await page.evaluate(() => Promise.all([...document.images].map((i) => i.complete ? 0 : new Promise((ok) => { i.onload = i.onerror = ok; }))));
      await page.evaluate(() => document.fonts && document.fonts.ready);
      if (errs.length) throw new Error(errs.join("; "));
      await page.pdf({ path: out, format: "A4", printBackground: true, preferCSSPageSize: true });
      console.log("wrote " + path.relative(ROOT, out) + " (" + Math.round(fs.statSync(out).size / 1024) + " KB)");
    } catch (e) {
      failed++;
      console.error("GW" + gw + " " + pos + ": " + e.message);
    }
    await page.close();
  }
  await ctx.close();
  return failed;
}

async function main() {
  const args = process.argv.slice(2), force = args.includes("--force");
  let gw = +args.filter((a) => a !== "--force")[0];
  if (!(gw > 0)) {
    const idx = JSON.parse(fs.readFileSync(path.join(ROOT, "reports", "index.json"), "utf8"));
    gw = Math.max(...(Array.isArray(idx.reports) ? idx.reports : []).map((r) => +r.gw).filter((n) => n > 0));
  }
  if (!(gw > 0)) throw new Error("no gameweek to print");
  const { chromium } = browserLib();
  const srv = await serve();
  const base = "http://127.0.0.1:" + srv.address().port;
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  let failed = 0;
  try { failed = await printGw(browser, base, gw, force); }
  finally { await browser.close(); srv.close(); }
  if (failed) process.exitCode = 1;
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
module.exports = { PAGE };
