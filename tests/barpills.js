const GOENV = require("./lib/env.js");
/* Compare and Rival, in the bar beside the manager's name. */
const { chromium, devices } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP, PORT = 8777;
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".webp":"image/webp", ".png":"image/png" };
const srv = http.createServer((q, r) => { let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  fs.readFile(path.join(APP, u), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { "content-type": T[path.extname(u)] || "text/plain", "cache-control": "no-store" }); r.end(b); }); });
let fails = 0; const chk = (ok, m, x) => { console.log((ok ? "  ok   " : "  FAIL ") + m + (x ? "  " + x : "")); if (!ok) fails++; };
(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  for (const w of [390, 360, 320]) {
    const ctx = await b.newContext({ viewport: { width: w, height: 800 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: "block" });
    await ctx.addInitScript(() => { try { localStorage.setItem("go12.me", "1255976"); localStorage.removeItem("go12.rivals"); } catch (e) {} });
    const p = await ctx.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
    const go = async (h, ms) => { await p.evaluate(x => { location.hash = x; }, "#" + h); await p.waitForTimeout(ms || 800); };
    await p.goto("http://localhost:" + PORT + "/index.html#classic", { waitUntil: "domcontentloaded" }); await p.waitForTimeout(1800);
    const pills = () => p.evaluate(() => { const box = document.querySelector("#barPills");
      const c = document.querySelector("#cmpMe"), r = document.querySelector("#rvToggle");
      const bar = document.querySelector("header.topbar").getBoundingClientRect();
      const t = document.querySelector("#barTitle").getBoundingClientRect();
      return { shown: !!box.offsetParent, words: [c.textContent, r.textContent],
        on: r.classList.contains("on"), pressed: r.getAttribute("aria-pressed"),
        inBar: !!box.offsetParent && box.getBoundingClientRect().right <= bar.right + 1 && box.getBoundingClientRect().top >= bar.top - 1,
        underName: !!box.offsetParent && box.getBoundingClientRect().top >= t.bottom - 2,
        titleCut: document.querySelector("#barTitle").scrollWidth > document.querySelector("#barTitle").clientWidth + 1,
        title: document.querySelector("#barTitle").textContent }; });
    chk(!(await pills()).shown, w + ": no pills on the Classic table");
    await go("profile/1255976", 1200);
    // your own page carries the one word that says so, and neither control
    const own = await p.evaluate(() => { const y = document.querySelector("#youPill");
      return { you: !!y.offsetParent && y.textContent.trim() === "This is you", cmp: !!document.querySelector("#cmpMe").offsetParent, rv: !!document.querySelector("#rvToggle").offsetParent }; });
    chk(own.you && !own.cmp && !own.rv, w + ": on your own page the bar says This is you, with no Compare or Rival", JSON.stringify(own));
    // a long name, to see what the bar does when it is squeezed
    await go("profile/1273065", 1200);
    let s = await pills();
    chk(s.shown && s.words.join("|") === "Compare|Rival", w + ": one word each, beside the name", JSON.stringify(s.words));
    chk(s.inBar && s.underName, w + ": both sit in the bar, on the line under the name", JSON.stringify(s));
    chk(!s.titleCut, w + ": and the name keeps all its letters", s.title);
    chk(!s.on && s.pressed === "false", w + ": the rival pill starts unlit");
    if (w === 390) await p.screenshot({ path: "barpills-off.png", clip: { x: 0, y: 0, width: w, height: 120 } });
    await p.click("#rvToggle"); await p.waitForTimeout(400);
    s = await pills();
    chk(s.on && s.pressed === "true" && s.words[1] === "Rival", w + ": tapping it lights it, and it still says Rival", JSON.stringify(s.words));
    if (w === 390) await p.screenshot({ path: "barpills-on.png", clip: { x: 0, y: 0, width: w, height: 120 } });
    chk(JSON.stringify(await p.evaluate(() => JSON.parse(localStorage.getItem("go12.rivals")))) === "[1273065]", w + ": and he is pinned");
    // leaving and coming back keeps it lit
    await go("classic"); await go("profile/1273065", 1000);
    chk((await pills()).on, w + ": still lit when you come back to him");
    // your own page now carries the rivals table
    await go("profile/1255976", 1200);
    chk(await p.evaluate(() => !!document.querySelector(".rvtbl")), w + ": your page now has the rivals table");
    // tapping again unpins
    await go("profile/1273065", 1000);
    await p.click("#rvToggle"); await p.waitForTimeout(400);
    chk(!(await pills()).on, w + ": tapping again puts it out");
    // compare takes you there with the pair set
    await p.click("#cmpMe"); await p.waitForTimeout(1200);
    const cmp = await p.evaluate(() => ({ hash: location.hash, a: (document.querySelector("#cmpA") || {}).value, b: (document.querySelector("#cmpB") || {}).value }));
    chk(cmp.hash === "#compare" && /Roo - United/.test(cmp.a || "") && /Waka waka 11/.test(cmp.b || ""), w + ": Compare opens with the two of you", JSON.stringify(cmp));
    chk(!(await pills()).shown, w + ": and the pills step off the compare page");
    chk(errs.length === 0, w + ": no JS errors", errs.join(" | "));
    await ctx.close();
  }
  // nobody has said who they are: Compare asks first
  const ctx = await b.newContext({ ...devices["iPhone 12"], serviceWorkers: "block" });
  const p = await ctx.newPage();
  await p.goto("http://localhost:" + PORT + "/index.html#profile/1273065", { waitUntil: "domcontentloaded" }); await p.waitForTimeout(1800);
  await p.click("#cmpMe"); await p.waitForTimeout(600);
  chk(await p.evaluate(() => /Pick your team first/.test(document.querySelector("#toast").textContent) && document.querySelector("#youBack").classList.contains("show")),
    "no team picked: Compare says so and opens the picker");
  await ctx.close();
  await b.close(); srv.close(); console.log(fails ? "FAILS: " + fails : "ALL OK");
})();
