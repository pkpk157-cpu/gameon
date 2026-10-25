const GOENV = require("./lib/env.js");
/* A deploy reaches a phone whole. GitHub Pages lets a browser keep any file
 * for ten minutes; the service worker must still hand over the new page with
 * the new styles, never the old page beside the new styles (which is what a
 * phone opened mid-deploy showed: the new background behind the old crest).
 * Served here as Pages serves it, max-age=600 on everything: open the app so
 * the worker takes charge, put a new release on the server, open it again,
 * and the page and its styles must both be the new release, the worker's
 * own reload included, with no error. */
const { chromium, devices } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path"), os = require("os");
const APP = GOENV.APP, PORT = 8897;
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".svg":"image/svg+xml", ".webp":"image/webp", ".png":"image/png" };
let fails = 0;
const chk = (ok, m, x) => { console.log((ok ? "  ok   " : "  FAIL ") + m + (x !== undefined ? "  " + x : "")); if (!ok) fails++; };
// two releases of the same app: the second marks its page and its styles
const rel = { 1: {}, 2: {} };
["index.html", "styles.css", "sw.js"].forEach((f) => { rel[1][f] = fs.readFileSync(path.join(APP, f), "utf8"); });
rel[2]["index.html"] = rel[1]["index.html"].replace("<body>", '<body data-release="2">');
rel[2]["styles.css"] = rel[1]["styles.css"] + '\n:root { --release:"2"; }\n';
rel[2]["sw.js"] = rel[1]["sw.js"] + "\n// release 2\n";
let live = 1;
const srv = http.createServer((q, r) => { let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  const f = u.slice(1), head = { "content-type": T[path.extname(u)] || "text/plain", "cache-control": "max-age=600" };
  if (rel[live][f] !== undefined) { r.writeHead(200, head); r.end(rel[live][f]); return; }
  fs.readFile(path.join(APP, u), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, head); r.end(b); }); });

(async () => {
  await new Promise((r) => srv.listen(PORT, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  const ctx = await b.newContext({ ...devices["Pixel 7"], serviceWorkers: "allow" });
  await ctx.addInitScript(() => { try { localStorage.setItem("go12.theo", "off"); } catch (e) {} });
  const p = await ctx.newPage(); const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  const base = "http://127.0.0.1:" + PORT + "/index.html#classic";
  await p.goto(base, { waitUntil: "load" });
  await p.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 15000 }).catch(() => {});
  if (!(await p.evaluate(() => !!navigator.serviceWorker.controller))) { await p.reload({ waitUntil: "load" }); }
  chk(await p.evaluate(() => !!navigator.serviceWorker.controller), "the worker takes charge of the app");
  // the worker's own reload can land mid-read: wait it out and read again
  const read = async () => { for (let k = 0; k < 6; k++) { try { return await read1(); } catch (e) { await p.waitForLoadState("load").catch(() => {}); await p.waitForTimeout(300); } } return read1(); };
  const read1 = () => p.evaluate(() => ({ page: document.body.getAttribute("data-release") || "1",
    css: (getComputedStyle(document.documentElement).getPropertyValue("--release").replace(/["\s]/g, "")) || "1",
    splashImg: (document.querySelector("#splash img") || {}).getAttribute ? document.querySelector("#splash img").getAttribute("src") : "(gone)" }));
  const r1 = await read();
  chk(r1.page === "1" && r1.css === "1", "release 1: its page and its styles", JSON.stringify(r1));

  // the deploy
  live = 2;
  // opened afresh, as from the home screen: an ordinary visit, which the
  // browser may answer from its own copy (a reload would revalidate anyway)
  await p.goto("about:blank");
  await p.goto(base, { waitUntil: "load" });
  const first = await read();
  chk(first.page === first.css, "opened again straight after the deploy: page and styles are one release, not a mix", JSON.stringify(first));
  chk(first.page === "2", "and it is the new one, though the browser could keep the old for ten minutes", JSON.stringify(first));
  // the new worker takes over and reloads the page once; afterwards, the same
  await p.waitForTimeout(4000);
  const after = await read();
  chk(after.page === "2" && after.css === "2", "after the new worker takes over, still the new page with the new styles", JSON.stringify(after));
  const cached = await p.evaluate(async () => { const keys = await caches.keys(); const c = await caches.open(keys[0]);
    const h = await (await c.match("./index.html")).text(); const s = await (await c.match("./styles.css")).text();
    return { keys, page: /data-release="2"/.test(h), css: /--release:"2"/.test(s) }; });
  chk(cached.keys.length === 1 && cached.page && cached.css, "what the worker keeps for offline is the new release, page and styles both", JSON.stringify(cached));
  chk(!errs.length, "no JS errors", errs.join(" | "));
  await b.close(); srv.close();
  console.log(fails ? "\n" + fails + " FAILURES" : "\na deploy reaches the phone whole");
  process.exit(fails ? 1 : 0);
})();
