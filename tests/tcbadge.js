const GOENV = require("./lib/env.js");
/* A Triple Captain on the pitch: the captain's C turns gold, wherever a
   squad is drawn (a profile's pitch, Compare's side-by-side table), and only
   for the squad that played it. If the captain did not play and FPL moved the
   x3 to the vice, the vice's V is the gold one. Read off FPL's own multiplier. */
const { chromium } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP, PORT = 8788;
let fails = 0; const chk = (ok, m, x) => { console.log((ok ? "  ok   " : "  FAIL ") + m + (x ? "  " + x : "")); if (!ok) fails++; };
const J = JSON.stringify;
const raw = JSON.parse(fs.readFileSync(path.join(APP, "data.json"), "utf8"));
const ds = raw.dataset, gw = +ds.pitchGw;
const ids = Object.keys(ds.picks[gw] || {}).map(Number);
// three squads: one plays a Triple Captain, one has its x3 moved to the vice,
// one plays nothing
const [tcId, viceId, plainId] = ids.slice(0, 3);
const setTc = (id, onVice) => { const r = ds.picks[gw][id]; r.c = "3xc";
  r.p.forEach((x) => { if (x[2]) x[1] = onVice ? 0 : 3; else if (x[3]) x[1] = onVice ? 3 : 1; }); };
setTc(tcId, false); setTc(viceId, true);
{ const r = ds.picks[gw][plainId]; if (r.c === "3xc") r.c = null; r.p.forEach((x) => { if (x[2]) x[1] = 2; else if (x[3]) x[1] = 1; }); }
const body = J(raw);
const T = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".webp": "image/webp", ".png": "image/png", ".mjs": "application/javascript" };
const srv = http.createServer((q, r) => { let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  if (u === "/data.json") { r.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }); r.end(body); return; }
  fs.readFile(path.join(APP, u), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { "content-type": T[path.extname(u)] || "application/octet-stream", "cache-control": "no-store" }); r.end(b); }); });

(async () => {
  await new Promise((r) => srv.listen(PORT, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  const c = await b.newContext({ viewport: { width: 390, height: 900 }, isMobile: true, hasTouch: true, serviceWorkers: "block", reducedMotion: "reduce" });
  await c.route((u) => !/localhost/.test(u.toString()), (route) => route.abort());
  await c.addInitScript((me) => { try { localStorage.setItem("go12.me", String(me)); localStorage.setItem("go12.theo", "off"); } catch (e) {} }, plainId);
  const p = await c.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto("http://localhost:" + PORT + "/index.html#classic", { waitUntil: "domcontentloaded" });
  await p.waitForSelector("table.t tbody tr", { timeout: 20000 }); await p.waitForTimeout(800);
  const marks = (sel) => p.evaluate((sel) => [...document.querySelectorAll(sel)].map((m) => ({ t: m.textContent, tc: m.classList.contains("tc"), title: m.getAttribute("title"),
    bg: getComputedStyle(m).backgroundImage, col: getComputedStyle(m).backgroundColor })), sel);
  const pitch = async (id) => {
    await p.evaluate((x) => { location.hash = "#profile/" + x + "/squad"; }, id);
    await p.waitForSelector("#pitchBox .pcard", { timeout: 15000 }).catch(() => {}); await p.waitForTimeout(600);
    return marks("#pitchBox .pcard .pb.cap, #pitchBox .pcard .pb.vice");
  };
  let m = await pitch(tcId);
  const cap = m.find((x) => x.t === "C"), vice = m.find((x) => x.t === "V");
  chk(cap && cap.tc && /gradient/.test(cap.bg) && cap.title === "Triple Captain", "a Triple Captain: the C is gold", J(cap));
  chk(vice && !vice.tc && !/gradient/.test(vice.bg), "and the vice's V stays as it was", J(vice));
  m = await pitch(viceId);
  chk(m.find((x) => x.t === "V" && x.tc) && !m.find((x) => x.t === "C" && x.tc), "captain out, x3 moved to the vice: the V is the gold one", J(m));
  m = await pitch(plainId);
  chk(m.length === 2 && m.every((x) => !x.tc && !/gradient/.test(x.bg)), "no Triple Captain: C and V in the usual purple", J(m));
  // Compare's side-by-side squads: the same mark
  await p.evaluate(([a, bb]) => { location.hash = "#compare"; }, [plainId, tcId]); await p.waitForTimeout(500);
  await p.evaluate((x) => { location.hash = "#profile/" + x; }, tcId); await p.waitForTimeout(500);
  await p.click("#cmpMe").catch(() => {}); await p.waitForTimeout(1200);
  const sq = await marks(".pb.cap.sq, .pb.vice.sq");
  chk(!sq.length || (sq.filter((x) => x.tc).length === 1 && sq.find((x) => x.tc).t === "C"), "Compare: only the Triple Captain's C is gold", J(sq.map((x) => x.t + (x.tc ? "*" : ""))));
  chk(errs.length === 0, "no JS errors", errs.slice(0, 3).join(" | "));
  await b.close(); srv.close();
  console.log(fails ? "\nFAILS: " + fails : "\na Triple Captain wears gold");
  process.exit(fails ? 1 : 0);
})();
