const GOENV = require("./lib/env.js");
/* UCL: one group, both panels. The group picked on Matches is the group
 * shown on Standings, and the other way round; "All groups" on Matches
 * leaves the standings on the last group picked. The managers drawn in each
 * panel are that group's, not another's. */
const { chromium, devices } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP, PORT = 8812;
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".webp":"image/webp", ".png":"image/png" };
const srv = http.createServer((q, r) => { let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  fs.readFile(path.join(APP, u), (e, b) => { if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { "content-type": T[path.extname(u)] || "text/plain", "cache-control": "no-store" }); r.end(b); }); });
let fails = 0;
const chk = (ok, m, x) => { console.log((ok ? "  ok   " : "  FAIL ") + m + (x ? "  " + x : "")); if (!ok) fails++; };

// what the panel shows: which picker is up, its value, and the manager ids drawn
const read = (p) => p.evaluate(() => {
  const sel = document.querySelector("#grpSel") || document.querySelector("#fxGroup");
  const ids = [...document.querySelectorAll("#grpPanel [data-entry]")].map((e) => +e.getAttribute("data-entry"));
  const mode = [...document.querySelectorAll(".segb")].find((b) => b.classList.contains("active"));
  return { picker: sel ? sel.id : null, value: sel ? sel.value : null, ids, mode: mode ? mode.getAttribute("data-mode") : null,
           groups: window.GO_COMPUTE.h2h(window.GO_STORE.dataset()).groups.map((g) => g.table.map((r) => +r.id)) };
});
const inGroup = (ids, members) => ids.length > 0 && ids.every((id) => members.indexOf(id) !== -1);

(async () => {
  await new Promise((r) => srv.listen(PORT, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  const ctx = await b.newContext({ ...devices["iPhone 12"], serviceWorkers: "block" });
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto("http://localhost:" + PORT + "/index.html#h2h", { waitUntil: "domcontentloaded" }); await p.waitForTimeout(1500);
  let s = await read(p);
  if (s.mode !== "standings") { await p.click('.segb[data-mode="standings"]'); await p.waitForTimeout(300); s = await read(p); }
  chk(s.picker === "grpSel" && s.groups.length > 3, "standings up, with a group picker", s.picker + " · " + s.groups.length + " groups");

  // pick a group on the standings, go to matches: the same group is up
  await p.selectOption("#grpSel", "2"); await p.waitForTimeout(300);
  s = await read(p);
  chk(s.value === "2" && inGroup(s.ids, s.groups[2]), "standings show the group picked", s.value + " · " + s.ids.length + " managers");
  await p.click('.segb[data-mode="matches"]'); await p.waitForTimeout(400);
  s = await read(p);
  chk(s.picker === "fxGroup" && s.value === "2", "matches open on the same group", s.picker + "=" + s.value);
  chk(inGroup(s.ids, s.groups[2]), "and the fixtures drawn are that group's", s.ids.length + " managers");

  // pick another group on matches, go back to standings: it followed
  await p.selectOption("#fxGroup", "5"); await p.waitForTimeout(300);
  s = await read(p);
  chk(s.value === "5" && inGroup(s.ids, s.groups[5]), "matches show the group picked there", s.value);
  await p.click('.segb[data-mode="standings"]'); await p.waitForTimeout(400);
  s = await read(p);
  chk(s.picker === "grpSel" && s.value === "5" && inGroup(s.ids, s.groups[5]), "standings follow to that group", s.picker + "=" + s.value);

  // "All groups" on matches: the standings keep the last group
  await p.click('.segb[data-mode="matches"]'); await p.waitForTimeout(400);
  await p.selectOption("#fxGroup", "all"); await p.waitForTimeout(300);
  s = await read(p);
  chk(s.value === "all" && s.ids.length > s.groups[5].length, "all groups shows every group's fixtures", s.ids.length + " managers");
  await p.click('.segb[data-mode="standings"]'); await p.waitForTimeout(400);
  s = await read(p);
  chk(s.value === "5" && inGroup(s.ids, s.groups[5]), "standings stay on the last group picked", s.value);
  await p.click('.segb[data-mode="matches"]'); await p.waitForTimeout(400);
  s = await read(p);
  chk(s.value === "all", "matches keep All groups, the last choice made there", s.value);
  // a group picked on the standings replaces All groups on matches
  await p.click('.segb[data-mode="standings"]'); await p.waitForTimeout(400);
  await p.selectOption("#grpSel", "7"); await p.waitForTimeout(300);
  await p.click('.segb[data-mode="matches"]'); await p.waitForTimeout(400);
  s = await read(p);
  chk(s.value === "7" && inGroup(s.ids, s.groups[7]), "a group picked on standings replaces All groups on matches", s.value);

  // leaving and returning keeps the choice
  await p.evaluate(() => { location.hash = "#classic"; }); await p.waitForTimeout(500);
  await p.evaluate(() => { location.hash = "#h2h"; }); await p.waitForTimeout(800);
  s = await read(p);
  chk(s.value === "7", "the group survives leaving the tab", s.picker + "=" + s.value);
  chk(errs.length === 0, "no JS errors", errs.slice(0, 2).join(" | "));
  await b.close(); srv.close();
  console.log(fails ? "\nFAILS: " + fails : "\none group, both panels");
  process.exit(fails ? 1 : 0);
})();
