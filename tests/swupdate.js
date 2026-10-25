const GOENV = require("./lib/env.js");
/* A deploy reaches a phone whole, and opening never waits on it. The app
 * opens from the release the worker keeps on the phone, so it is never the
 * old page beside the new styles (which a phone opened mid-deploy showed:
 * the new background behind the old crest). A new release comes down in the
 * background without reloading the app in front of anyone, and is what the
 * next open shows, offline too. Served here as GitHub Pages serves it,
 * max-age=600 on everything. */
const { chromium, devices } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path"), os = require("os");
const APP = GOENV.APP, PORT = 8897;
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".svg":"image/svg+xml", ".webp":"image/webp", ".png":"image/png" };
let fails = 0;
const chk = (ok, m, x) => { console.log((ok ? "  ok   " : "  FAIL ") + m + (x !== undefined ? "  " + x : "")); if (!ok) fails++; };
// two releases of the same app: the second marks its page and its styles
const rel = { 1: {}, 2: {} };
["index.html", "styles.css", "sw.js"].forEach((f) => { rel[1][f] = fs.readFileSync(path.join(APP, f), "utf8"); });
// each release marks its page and its styles, so a stylesheet still loading
// reads as nothing rather than as the old release
const base1 = rel[1]["index.html"], css1 = rel[1]["styles.css"];
rel[1]["index.html"] = base1.replace("<body>", '<body data-release="1">');
rel[1]["styles.css"] = css1 + '\n:root { --release:"1"; }\n';
rel[2]["index.html"] = base1.replace("<body>", '<body data-release="2">');
rel[2]["styles.css"] = css1 + '\n:root { --release:"2"; }\n';
// a new release carries a new BUILD, as stamp-sw.js gives every release
rel[2]["sw.js"] = rel[1]["sw.js"].replace(/const BUILD = "([^"]*)";/, 'const BUILD = "$1-r2";');
let live = 1;
const srv = http.createServer((q, r) => { let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  const f = u.slice(1), head = { "content-type": T[path.extname(u)] || "text/plain", "cache-control": "max-age=600" };
  if (rel[live][f] !== undefined) { r.writeHead(200, head); r.end(rel[live][f]); return; }
  fs.readFile(path.join(APP, u), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, head); r.end(b); }); });

(async () => {
  await new Promise((r) => srv.listen(PORT, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  const ctx = await b.newContext({ ...devices["Pixel 7"], serviceWorkers: "allow" });
  await ctx.addInitScript(() => { window.__SW_DELAY = 0; try { localStorage.setItem("go12.theo", "off"); } catch (e) {} });
  const p = await ctx.newPage(); const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  const base = "http://127.0.0.1:" + PORT + "/index.html#classic";
  await p.goto(base, { waitUntil: "load" });
  await p.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 15000 }).catch(() => {});
  if (!(await p.evaluate(() => !!navigator.serviceWorker.controller))) { await p.reload({ waitUntil: "load" }); }
  chk(await p.evaluate(() => !!navigator.serviceWorker.controller), "the worker takes charge of the app");
  // the worker's own reload can land mid-read: wait it out and read again
  const read = async () => { for (let k = 0; k < 20; k++) { try { const r = await read1(); if (r.page && r.css) return r; } catch (e) {}
      await p.waitForLoadState("load").catch(() => {}); await p.waitForTimeout(300); } return read1(); };
  const read1 = () => p.evaluate(() => ({ page: document.body.getAttribute("data-release") || "",
    css: (getComputedStyle(document.documentElement).getPropertyValue("--release").replace(/["\s]/g, "")) || "",
    splashImg: (document.querySelector("#splash img") || {}).getAttribute ? document.querySelector("#splash img").getAttribute("src") : "(gone)" }));
  const r1 = await read();
  chk(r1.page === "1" && r1.css === "1", "release 1: its page and its styles", JSON.stringify(r1));

  // the deploy
  live = 2;
  const open = async () => { await p.goto("about:blank"); await p.goto(base, { waitUntil: "load" }); return read(); };
  const reloads = [];
  p.on("framenavigated", (f) => { if (f === p.mainFrame() && /index\.html/.test(f.url())) reloads.push(Date.now()); });
  const t0 = Date.now();
  const first = await open();
  chk(first.page === first.css, "opened straight after the deploy: page and styles are one release, never a mix", JSON.stringify(first));
  chk(first.page === "1", "and it opens from the phone, not held waiting on the new release", JSON.stringify(first));
  // the new release comes down in the background and takes over the worker
  const n0 = reloads.length;
  // (asked in a loop of real waits: the answer is a promise, which a plain
  // truthy check would take as yes at once)
  let took = false;
  for (let k = 0; k < 60 && !took; k++) {
    took = await p.evaluate(() => caches.keys().then((ks) => ks.some((x) => /-r2$/.test(x)) && !ks.some((x) => /^gameon-[0-9a-f]{12}$/.test(x)))).catch(() => false);
    if (!took) await p.waitForTimeout(500);
  }
  await p.waitForTimeout(800);
  chk(took, "the new release is stored in the background and the old one dropped");
  chk(reloads.length === n0, "without reloading the app in front of the reader", (reloads.length - n0) + " reloads");
  const next = await open();
  chk(next.page === "2" && next.css === "2", "the next open is the new release, page and styles both", JSON.stringify(next));
  await p.context().setOffline(true);
  const off = await open().catch((e) => ({ page: "error", css: e.message.slice(0, 40) }));
  await p.context().setOffline(false);
  chk(off.page === "2" && off.css === "2", "and so is an open with no signal", JSON.stringify(off));
  chk(!errs.length, "no JS errors", errs.join(" | "));
  await b.close(); srv.close();
  console.log(fails ? "\n" + fails + " FAILURES" : "\na deploy reaches the phone whole");
  process.exit(fails ? 1 : 0);
})();
