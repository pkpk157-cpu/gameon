const GOENV = require("./lib/env.js");
const { chromium, devices } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP, PORT = 8740;
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".svg":"image/svg+xml", ".webp":"image/webp" };
const srv = http.createServer((q, r) => { let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  fs.readFile(path.join(APP, u), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { "content-type": T[path.extname(u)] || "text/plain" }); r.end(b); }); });
let fails = 0; const chk = (ok, m, x) => { console.log((ok ? "  ok   " : "  FAIL ") + m + (x ? "  " + x : "")); if (!ok) fails++; };
(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  const ctx = await b.newContext({ ...devices["iPhone 12"], serviceWorkers: "block" });
  await ctx.addInitScript(() => { try { localStorage.setItem("go12.me", "1255976"); } catch (e) {} });
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
  const go = async (h) => { await p.evaluate(h => location.hash = h, h); await p.waitForTimeout(700); };
  await p.goto("http://localhost:" + PORT + "/index.html#profile/1255976", { waitUntil: "domcontentloaded" }); await p.waitForTimeout(1500);
  chk(await p.evaluate(() => !document.querySelector("#ps-rivals") && !/Pin up to/.test(document.querySelector("section.view.active").textContent)), "own profile has no Rivals section until one is pinned");
  chk(await p.evaluate(() => { const b = document.querySelector("#rvToggle"); return !b || !b.offsetParent; }), "no rival pill on your own profile");
  // pin two from the classic table's top rows
  const ids = await p.evaluate(() => window.GO_STORE.dataset().managers.slice().sort((a, b) => a.rank - b.rank).filter(m => m.id !== 1255976).slice(0, 3).map(m => m.id));
  for (let i = 0; i < 2; i++) {
    await go("#profile/" + ids[i]);
    chk(await p.evaluate(() => { const b = document.querySelector("#rvToggle"); return !!b.offsetParent && b.textContent === "Rival" && !b.classList.contains("on"); }), "profile " + ids[i] + " shows an unlit Rival pill");
    await p.click("#rvToggle"); await p.waitForTimeout(300);
    chk(await p.evaluate(() => { const b = document.querySelector("#rvToggle"); return b.textContent === "Rival" && b.classList.contains("on"); }), "tapping lights the pill");
  }
  await go("#profile/" + ids[2]); await p.click("#rvToggle"); await p.waitForTimeout(300);
  chk(await p.evaluate(() => !document.querySelector("#rvToggle").classList.contains("on") && /already have 2/.test(document.body.textContent)), "a third is refused with a toast, and its pill stays unlit");
  chk(JSON.stringify(await p.evaluate(() => JSON.parse(localStorage.getItem("go12.rivals")))) === JSON.stringify(ids.slice(0, 2)), "storage holds exactly the two, in pin order");
  // the table on my profile: me and both rivals, in classic order, with the classic numbers
  await go("#profile/1255976");
  const strip = await p.evaluate(() => [...document.querySelectorAll(".rvtbl tbody tr")].map(r => ({ id: +r.querySelector("[data-entry]").getAttribute("data-entry"), me: r.classList.contains("me"), cells: [r.children[0].textContent.trim(), r.querySelector(".who").textContent + " " + r.querySelector(".mgr").textContent, r.children[2].textContent.trim(), r.children[3].textContent.trim()], cmp: !!r.querySelector(".rvcmp") })));
  const exp = await p.evaluate((ids) => { const rows = window.GO_COMPUTE.classic(window.GO_STORE.dataset()); const set = rows.filter(r => ids.indexOf(r.id) !== -1 || r.id === 1255976).sort((a, b) => (a.computedRank - b.computedRank) || (a.order - b.order));
    return set.map(r => ({ id: r.id, me: r.id === 1255976, cells: [String(r.computedRank), r.entryName + " " + r.playerName, Number(r.eventTotal).toLocaleString("en-US"), Number(r.total).toLocaleString("en-US")], cmp: r.id !== 1255976 })); }, ids.slice(0, 2));
  chk(strip.length === 3, "three rows: me and two rivals");
  chk(await p.evaluate(() => !!document.querySelector('#profChips [data-go="ps-rivals"]')), "and a Rivals chip in the section row");
  chk(JSON.stringify(strip) === JSON.stringify(exp), "rows are in Classic order with the Classic numbers, me marked, a compare button on each rival", JSON.stringify(strip));
  const liveGw = await p.evaluate(() => window.GO_COMPUTE.currentGw(window.GO_STORE.dataset()));
  chk(await p.evaluate(() => [...document.querySelectorAll(".rvtbl thead th")].map(t => t.textContent.trim()).join(" ").trim()) === "# Team GW" + liveGw + " Total", "headings: #, Team, GW" + liveGw + ", Total");
  await p.screenshot({ path: "rivals-phone.png", clip: { x: 0, y: 0, width: 390, height: 520 } });
  // compare button goes to compare with the pair set; row tap opens the profile
  const firstRival = strip.find(r => !r.me);
  await p.click(".rvtbl .rvcmp"); await p.waitForTimeout(800);
  const cmp = await p.evaluate(() => ({ hash: location.hash, a: document.querySelector("#cmpA") && document.querySelector("#cmpA").value, b: document.querySelector("#cmpB") && document.querySelector("#cmpB").value }));
  chk(cmp.hash === "#compare" && /Roo - United/.test(cmp.a) && cmp.b.indexOf(firstRival.cells[1].split(" ")[0]) === 0, "the compare button opens compare with me vs that rival", JSON.stringify(cmp));
  await go("#profile/1255976"); await p.evaluate(() => document.querySelector(".rvtbl tr:not(.me) td.name").click()); await p.waitForTimeout(700);
  chk(await p.evaluate(() => location.hash) !== "#profile/1255976" && /#profile\//.test(await p.evaluate(() => location.hash)), "tapping a rival's row opens their profile");
  // unpin from their profile removes the row
  await p.click("#rvToggle"); await p.waitForTimeout(300); await go("#profile/1255976");
  chk(await p.evaluate(() => document.querySelectorAll(".rvtbl tbody tr").length) === 2, "unpinning removes the row (me and one rival left)");
  // corrupt storage never breaks the page
  await p.evaluate(() => localStorage.setItem("go12.rivals", '{"bad":1}')); await go("#classic"); await go("#profile/1255976");
  chk(await p.evaluate(() => !document.querySelector("#ps-rivals")), "junk in storage reads as no rivals: no section");
  await p.evaluate(() => localStorage.setItem("go12.rivals", '[999999999, "x", 1255976]')); await go("#classic"); await go("#profile/1255976");
  chk(await p.evaluate(() => document.querySelectorAll(".rvtbl").length === 0 && !document.querySelector("#ps-rivals")), "unknown ids and a stray self-pin are skipped; with nothing left there is no section");
  chk(errs.length === 0, "no JS errors", errs.join(" | "));
  await b.close(); srv.close(); console.log(fails ? "FAILS: " + fails : "ALL OK");
})();
