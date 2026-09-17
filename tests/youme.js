const GOENV = require("./lib/env.js");
/* With a team picked, the You group appears in the right-hand sheet and works. */
const { chromium, devices } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP, PORT = 8713;
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".svg":"image/svg+xml", ".webp":"image/webp" };
const srv = http.createServer((q, r) => { let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  fs.readFile(path.join(APP, u), (e, b) => { if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { "content-type": T[path.extname(u)] || "text/plain", "cache-control": "no-store" }); r.end(b); }); });
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log("  FAIL " + m); } else console.log("  ok   " + m); };
(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  const ctx = await b.newContext({ ...devices["iPhone 12"], serviceWorkers: "block" });
  await ctx.addInitScript(() => { try { localStorage.setItem("go12.me", "1255976"); } catch (e) {} });
  const p = await ctx.newPage();
  const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.goto("http://localhost:" + PORT + "/index.html#classic", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(1500);
  await p.click("#barYou"); await p.waitForTimeout(500);
  const you = await p.evaluate(() => {
    const body = document.querySelector("#youBody");
    return { labels: [...body.querySelectorAll(".lab-sm")].map(e => e.textContent.trim()),
             who: (body.querySelector(".who") || {}).textContent,
             hasMine: !!document.querySelector("#pfMine"),
             hasMyCompare: !!document.querySelector("#pfMyCompare"),
             text: body.innerText };
  });
  console.log("groups: " + JSON.stringify(you.labels) + "  identity: " + you.who);
  ok(you.labels.indexOf("You") !== -1, "the You group is there");
  ok(you.labels.indexOf("League") !== -1, "so is League");
  ok(you.hasMine && you.hasMyCompare, "My profile and Compare me are both offered");
  ok(!/Sections|Appearance|Gameweek status/.test(you.text), "and none of the burger's business");
  await p.evaluate(() => document.querySelector("#pfMine").click());
  await p.waitForTimeout(700);
  const after = await p.evaluate(() => ({ hash: location.hash,
    anyOpen: [...document.querySelectorAll(".modal-back")].some(e => e.classList.contains("show")),
    locked: document.documentElement.classList.contains("ovl") }));
  ok(/^#profile\/1255976/.test(after.hash), "My profile navigates — " + after.hash);
  ok(!after.anyOpen && !after.locked, "sheet closed, page unlocked");
  await p.screenshot({ path: "shot-you-me.png" });
  ok(errs.length === 0, "no JS errors" + (errs.length ? ": " + errs[0] : ""));
  await ctx.close(); await b.close(); srv.close();
  console.log(bad ? bad + " FAILURE(S)" : "all good");
  process.exit(bad ? 1 : 0);
})();
