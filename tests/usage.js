const GOENV = require("./lib/env.js");
/* The league's own usage counter, end to end: the app's beacons go through
   the real worker code (usage-worker.mjs) into a real SQLite, and the
   organiser's page reads the totals back. A phone with a team set is named;
   one without is counted; one that switched counting off sends nothing; the
   same phone counts once however often it comes back; localhost is silent
   unless asked; and the stats answer only to the key. */
const { chromium, devices } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const { DatabaseSync } = require("node:sqlite");
const APP = GOENV.APP, PORT = 8809, KEY = "secret-k";
const T = { ".html":"text/html", ".js":"application/javascript", ".mjs":"application/javascript", ".css":"text/css", ".json":"application/json", ".webp":"image/webp", ".png":"image/png" };
let fails = 0;
const chk = (ok, m, x) => { console.log((ok ? "  ok   " : "  FAIL ") + m + (x ? "  " + x : "")); if (!ok) fails++; };

// D1's shape over node's SQLite: prepare/bind/run/all/first and batch.
function d1(db) {
  return {
    // bind() hands back a new statement, as D1 does, so a batch of binds
    // from one prepare() keeps each row's own values
    prepare(sql, args) { args = args || []; return {
      bind(...a) { return this.constructor === Object ? d1(db).prepare(sql, a) : null; },
      async run() { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: r.changes } }; },
      async all() { return { results: db.prepare(sql).all(...args) }; },
      async first() { return db.prepare(sql).get(...args) || null; } }; },
    async batch(stmts) { const out = []; for (const s of stmts) out.push(await s.run()); return out; }
  };
}

(async () => {
  const worker = (await import(path.join(APP, "usage-worker.mjs"))).default;
  const env = { USAGE: d1(new DatabaseSync(":memory:")), ADMIN_KEY: KEY };
  const srv = http.createServer((q, r) => {
    let u = q.url.split("?")[0];
    if (u.startsWith("/u/")) {
      let body = ""; q.on("data", (c) => { body += c; }); q.on("end", async () => {
        const headers = {}; for (const [k, v] of Object.entries(q.headers)) if (typeof v === "string") headers[k] = v;
        const req = new Request("http://localhost:" + PORT + q.url, { method: q.method, headers, body: q.method === "POST" ? body : undefined });
        const res = await worker.fetch(req, env);
        const h = {}; res.headers.forEach((v, k) => { h[k] = v; });
        r.writeHead(res.status, h); r.end(Buffer.from(await res.arrayBuffer()));
      }); return;
    }
    if (u === "/") u = "/index.html";
    fs.readFile(path.join(APP, u), (e, b) => { if (e) { r.writeHead(404); r.end(); return; }
      r.writeHead(200, { "content-type": T[path.extname(u)] || "text/plain", "cache-control": "no-store" }); r.end(b); });
  });
  await new Promise((r) => srv.listen(PORT, r));
  const ds = JSON.parse(fs.readFileSync(APP + "/data.json", "utf8")).dataset;
  const M1 = ds.managers[0].id;
  const stats = async () => (await fetch("http://localhost:" + PORT + "/u/stats?key=" + KEY)).json();
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  const open = async (init, hash) => {
    const ctx = await b.newContext({ ...devices["iPhone 12"], serviceWorkers: "block" });
    await ctx.addInitScript((i) => { localStorage.setItem("go12.config", JSON.stringify({ usageUrl: "http://localhost:" + i.port + "/u" }));
      if (i.me) localStorage.setItem("go12.me", JSON.stringify(i.me)); if (i.skip) localStorage.setItem("skipgc", "t");
      if (i.admin) { localStorage.setItem("go12.admin", "true"); localStorage.setItem("go12.usagekey", JSON.stringify(i.key)); } }, { port: PORT, ...init });
    const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.goto("http://localhost:" + PORT + "/index.html" + (init.plain ? "" : "?usagedev=1") + "#" + (hash || "classic"), { waitUntil: "domcontentloaded" });
    await p.waitForFunction(() => document.querySelector("section.view.active table.t tbody tr, section.view.active .card, section.view.active .callout"), null, { timeout: 15000 });
    return { ctx, p, errs };
  };
  const go = async (p, h, ms) => { await p.evaluate((x) => { location.hash = "#" + x; }, h); await p.waitForTimeout(ms || 400); };

  // A: a phone with its team set
  const A = await open({ me: M1 });
  await go(A.p, "monthly"); await go(A.p, "lms"); await A.p.waitForTimeout(1200);
  await A.p.evaluate(() => window.GO_USAGE.flush()); await A.p.waitForTimeout(500);
  let S = await stats();
  chk(A.p && (await A.p.evaluate(() => window.GO_USAGE.state())).enabled, "A: beacons are on with a worker set and ?usagedev");
  chk(S.totals.devices === 1 && S.totals.managers === 1 && S.managers.length === 1 && S.managers[0].m === M1, "A: one device, named as its manager", JSON.stringify(S.totals) + " " + JSON.stringify(S.managers[0]));
  chk(S.totals.views >= 3 && ["/classic", "/monthly", "/lms"].every((v) => S.views.some((r) => r.p === v)), "A: each tab opened is a view", JSON.stringify(S.views.map((r) => r.p)));
  chk(S.totals.sessions >= 1 && S.totals.seconds >= 1 && S.managers[0].seconds >= 1, "A: time on screen is a session, in seconds", S.totals.sessions + " sessions, " + S.totals.seconds + "s");
  chk(S.byDay.length === 1 && S.byDay[0].devices === 1 && S.today.devices === 1, "A: today has one device", JSON.stringify(S.byDay));

  // the same phone, back again: still one device
  await go(A.p, "pyramid"); await A.p.waitForTimeout(1100); await A.p.evaluate(() => window.GO_USAGE.flush()); await A.p.waitForTimeout(400);
  S = await stats();
  chk(S.totals.devices === 1 && S.managers[0].sessions >= 2, "A again: the same phone counts once, sessions add up", S.totals.devices + " devices, " + S.managers[0].sessions + " sessions");
  const before = { views: S.totals.views, devices: S.totals.devices };

  // B: counting switched off
  const B = await open({ skip: true });
  chk(!(await B.p.evaluate(() => window.GO_USAGE.state())).enabled, "B: a phone that switched counting off sends nothing");
  await go(B.p, "monthly"); await B.p.waitForTimeout(1100); await B.p.evaluate(() => window.GO_USAGE.flush()); await B.p.waitForTimeout(400);
  S = await stats();
  chk(S.totals.views === before.views && S.totals.devices === before.devices, "B: and the totals did not move", JSON.stringify(S.totals));
  await B.ctx.close();

  // C: no team set — counted, not named
  const C = await open({});
  await go(C.p, "h2h"); await C.p.waitForTimeout(1100); await C.p.evaluate(() => window.GO_USAGE.flush()); await C.p.waitForTimeout(400);
  S = await stats();
  chk(S.totals.devices === 2 && S.totals.managers === 1 && S.anon.devices === 1 && S.anon.views >= 2, "C: a phone without a team is a device, not a name", JSON.stringify(S.anon));
  await C.ctx.close();

  // D: plain localhost, no flag — silent
  const D = await open({ me: M1, plain: true });
  chk(!(await D.p.evaluate(() => window.GO_USAGE.state())).enabled, "D: localhost without ?usagedev sends nothing");
  await D.ctx.close();

  // the worker's doors
  const r401 = await fetch("http://localhost:" + PORT + "/u/stats"); const r401b = await fetch("http://localhost:" + PORT + "/u/stats?key=wrong");
  chk(r401.status === 401 && r401b.status === 401, "stats answer only to the key", r401.status + "/" + r401b.status);
  const r403 = await fetch("http://localhost:" + PORT + "/u/beacon", { method: "POST", headers: { origin: "https://evil.example", "content-type": "text/plain" }, body: JSON.stringify({ d: "abcdefgh12", ev: [{ t: "view", p: "/x" }] }) });
  chk(r403.status === 403, "a beacon from a stranger's site is refused", String(r403.status));
  const rbad = await fetch("http://localhost:" + PORT + "/u/beacon", { method: "POST", headers: { origin: "http://localhost:" + PORT, "content-type": "text/plain" }, body: JSON.stringify({ d: "x", ev: [{ t: "hack", p: "/x", s: 999999 }] }) });
  S = await stats();
  chk(rbad.status === 400 && S.totals.devices === 2, "a malformed beacon is dropped, not stored", rbad.status + " devices " + S.totals.devices);

  // E: the organiser's page lives on the worker, not in the app: nothing in
  // the app answers to #usage, and the worker's page asks for the key
  const E = await open({ me: M1, admin: true }, "usage");
  chk((await E.p.evaluate(() => location.hash)) === "#classic" && !(await E.p.evaluate(() => document.querySelector('[data-view="usage"]'))), "E: the app has no usage page; #usage lands on the league", await E.p.evaluate(() => location.hash));
  await go(E.p, "settings", 800);
  chk(!(await E.p.evaluate(() => document.querySelector("#cfgUsage, #openUsage"))), "E: no organiser controls in Settings");
  const dash = await E.ctx.newPage(); const derrs = []; dash.on("pageerror", (e) => derrs.push(e.message));
  await dash.goto("http://localhost:" + PORT + "/u/?data=http://localhost:" + PORT + "/data.json", { waitUntil: "domcontentloaded" });
  await dash.waitForSelector("#gate", { state: "visible" });
  chk(!(await dash.evaluate(() => document.querySelector("#out").textContent.trim())), "E: the worker's page shows nothing before the key");
  await dash.fill("#key", "wrong"); await dash.click("#go"); await dash.waitForFunction(() => document.querySelector("#err").textContent);
  chk(/refused/.test(await dash.evaluate(() => document.querySelector("#err").textContent)), "E: a wrong key is refused, and says so");
  await dash.fill("#key", KEY); await dash.click("#go");
  await dash.waitForFunction(() => document.querySelector("#out table"), null, { timeout: 15000 });
  const page = await dash.evaluate(() => {
    const tiles = {}; document.querySelectorAll(".tile").forEach((c) => { tiles[c.querySelector(".l").textContent.trim()] = c.querySelector(".v").textContent.trim(); });
    const rows = [...document.querySelector("#out table").querySelectorAll("tbody tr")].map((tr) => tr.querySelector(".who").textContent.trim());
    return { tiles, rows, bars: document.querySelectorAll("#out svg rect").length, gate: document.querySelector("#gate").style.display };
  });
  chk(page.tiles["People"] === "1" && page.tiles["Devices"] === "2" && page.tiles["Today"] === "2", "E: the tiles match the counter", JSON.stringify(page.tiles));
  chk(page.rows[0] === ds.managers[0].entryName && page.rows[1] === "Not identified", "E: the manager is named from data.json, the other phone is counted", JSON.stringify(page.rows));
  chk(page.bars === 30 && page.gate === "none", "E: thirty bars, one a day, and the gate is gone", page.bars + " " + page.gate);
  await dash.reload({ waitUntil: "domcontentloaded" }); await dash.waitForFunction(() => document.querySelector("#out table"), null, { timeout: 15000 });
  chk(true, "E: the key is remembered in that browser");
  chk(derrs.length === 0, "E: no errors on the worker's page", derrs.join(" | "));
  // the rules page says what is counted
  await go(E.p, "rules", 800);
  chk(/counts which tabs are opened/.test(await E.p.evaluate(() => document.querySelector('[data-view="rules"]').textContent)), "the rules page says what is counted");
  chk(A.errs.length === 0 && E.errs.length === 0, "no JS errors", A.errs.concat(E.errs).slice(0, 2).join(" | "));
  await A.ctx.close(); await E.ctx.close();
  await b.close(); srv.close();
  console.log(fails ? "\nFAILS: " + fails : "\nthe counter counts");
  process.exit(fails ? 1 : 0);
})();
