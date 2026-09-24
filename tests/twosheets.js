const GOENV = require("./lib/env.js");
/* The burger keeps Sections, Appearance and Gameweek status; the new control
   on the right opens You and League. Neither should hold anything of the other. */
const { chromium, devices } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP, PORT = 8711;
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".svg":"image/svg+xml", ".webp":"image/webp" };
const srv = http.createServer((q, r) => {
  let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  fs.readFile(path.join(APP, u), (e, b) => { if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { "content-type": T[path.extname(u)] || "text/plain", "cache-control": "no-store" }); r.end(b); });
});
let bad = 0;
const ok = (c, m) => { if (!c) { bad++; console.log("  FAIL " + m); } else console.log("  ok   " + m); };

(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  for (const dev of [{ name: "iPhone 12", opts: devices["iPhone 12"] },
                     { name: "360px", opts: { viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true } },
                     { name: "desktop", opts: { viewport: { width: 1280, height: 900 } } }]) {
    const ctx = await b.newContext({ ...dev.opts, serviceWorkers: "block" });
    const p = await ctx.newPage();
    const errs = [];
    p.on("pageerror", e => errs.push("JS: " + e.message));
    p.on("console", m => { if (m.type() === "error" && !/Failed to load resource|net::ERR_|\.webp/i.test(m.text())) errs.push("CON: " + m.text()); });
    await p.goto("http://localhost:" + PORT + "/index.html#classic", { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(1400);
    console.log("\n--- " + dev.name + " ---");

    // the button exists, and sits to the right of sync
    const geo = await p.evaluate(() => {
      const y = document.querySelector("#barYou");
      if (!y) return null;
      const a = y.getBoundingClientRect();
      // the refresh button is gone; You is the last control on the bar
      const others = [...document.querySelectorAll(".topbar button")]
        .filter((b) => b !== y && b.offsetParent !== null);
      const rightmostOther = others.reduce((m, b) => Math.max(m, b.getBoundingClientRect().left), -1);
      return { youLeft: a.left, syncLeft: rightmostOther, noSyncButton: !document.querySelector("#btnSync"),
               youVisible: a.width > 0 && a.height > 0,
               hasIcon: !!y.querySelector("svg"),
               overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
               titleClipped: (document.querySelector("#barTitle") || {}).scrollWidth >
                             ((document.querySelector("#barTitle") || {}).clientWidth + 1) };
    });
    ok(geo && geo.youVisible, "You button is on the bar");
    ok(geo && geo.hasIcon, "it carries an icon");
    ok(geo && geo.noSyncButton, "the refresh button is gone");
    ok(geo && geo.youLeft > geo.syncLeft, "You is the last control on the bar");
    ok(geo && !geo.overflow, "the bar does not overflow the page");

    // burger holds exactly the three groups
    await p.click("#barMenu"); await p.waitForTimeout(450);
    const menu = await p.evaluate(() => {
      const body = document.querySelector("#menuBody");
      return { open: document.querySelector("#menuBack").classList.contains("show"),
               labels: [...body.querySelectorAll(".lab-sm")].map(e => e.textContent.trim()),
               text: body.innerText, fromLeft: document.querySelector("#menuBack .modal").getBoundingClientRect().left };
    });
    ok(menu.open, "burger opens");
    ok(JSON.stringify(menu.labels) === JSON.stringify(["Sections", "Appearance"]),
       "burger heads exactly Sections / Appearance, Gameweek status unheaded — got " + JSON.stringify(menu.labels));
    ok(!/My profile|Compare me|League insights|Winnings|Head to head|Game rules|Who are you/.test(menu.text),
       "burger holds nothing of You or League");
    await p.keyboard.press("Escape").catch(() => {});
    await p.evaluate(() => document.querySelector("#menuBack").click());
    await p.waitForTimeout(400);

    // the You sheet holds you and the league, and comes from the right
    await p.click("#barYou"); await p.waitForTimeout(450);
    const you = await p.evaluate(() => {
      const body = document.querySelector("#youBody");
      const m = document.querySelector("#youBack .modal").getBoundingClientRect();
      return { open: document.querySelector("#youBack").classList.contains("show"),
               labels: [...body.querySelectorAll(".lab-sm")].map(e => e.textContent.trim()),
               text: body.innerText, right: Math.abs(m.right - window.innerWidth) < 2,
               leak: (body.innerText.match(/\b(undefined|NaN|\[object Object\])\b/) || [null])[0] };
    });
    ok(you.open, "You sheet opens");
    ok(you.labels.indexOf("League") !== -1, "it holds League — got " + JSON.stringify(you.labels));
    ok(you.labels.indexOf("Appearance") === -1 && you.labels.indexOf("Gameweek status") === -1,
       "it holds neither Appearance nor Gameweek status");
    ok(/Who are you|My profile/.test(you.text), "it holds the identity block");
    ok(!/Sections/.test(you.text), "it holds no Sections list");
    ok(you.right, "it is flush to the right edge");
    ok(!you.leak, "no undefined/NaN in it" + (you.leak ? " — " + you.leak : ""));

    // navigating out of it works, and the page is not left locked
    await p.evaluate(() => document.querySelector("#pfWinnings").click());
    await p.waitForTimeout(600);
    const after = await p.evaluate(() => ({
      hash: location.hash,
      locked: document.documentElement.classList.contains("ovl"),
      anyOpen: [...document.querySelectorAll(".modal-back")].some(e => e.classList.contains("show"))
    }));
    ok(after.hash === "#winnings", "League item navigates — " + after.hash);
    ok(!after.anyOpen && !after.locked, "sheet closed and the page is not left locked");

    // back gesture closes the sheet rather than leaving the page
    await p.click("#barYou"); await p.waitForTimeout(400);
    await p.goBack(); await p.waitForTimeout(450);
    const popped = await p.evaluate(() => ({
      open: document.querySelector("#youBack").classList.contains("show"),
      locked: document.documentElement.classList.contains("ovl")
    }));
    ok(!popped.open && !popped.locked, "back closes the You sheet and unlocks the page");

    // and the same for the burger
    await p.click("#barMenu"); await p.waitForTimeout(400);
    await p.goBack(); await p.waitForTimeout(450);
    const popped2 = await p.evaluate(() => ({
      open: document.querySelector("#menuBack").classList.contains("show"),
      locked: document.documentElement.classList.contains("ovl")
    }));
    ok(!popped2.open && !popped2.locked, "back closes the burger and unlocks the page");

    // theme still switches from inside the burger
    await p.click("#barMenu"); await p.waitForTimeout(400);
    await p.evaluate(() => document.querySelector('#pfTheme button[data-th="dark"]').click());
    await p.waitForTimeout(400);
    const th = await p.evaluate(() => ({ attr: document.documentElement.getAttribute("data-theme"),
                                          stillOpen: document.querySelector("#menuBack").classList.contains("show") }));
    ok(th.attr === "dark" && th.stillOpen, "theme switches and the burger stays open");
    await p.evaluate(() => document.querySelector('#pfTheme button[data-th="system"]').click());
    await p.waitForTimeout(300);
    // gameweek status still reachable from the burger
    await p.evaluate(() => document.querySelector("#pfGwStatus").click());
    await p.waitForTimeout(600);
    const gw = await p.evaluate(() => ({ hash: location.hash,
      anyOpen: [...document.querySelectorAll(".modal-back")].some(e => e.classList.contains("show")) }));
    ok(gw.hash === "#gwstatus" && !gw.anyOpen, "Gameweek status navigates from the burger — " + gw.hash);

    console.log("  JS errors: " + (errs.length ? JSON.stringify(errs.slice(0, 3)) : "none"));
    if (errs.length) bad++;
    await p.screenshot({ path: GOENV.OUT + "/sheets-" + dev.name.replace(/\W/g, "") + ".png" });
    await ctx.close();
  }
  await b.close(); srv.close();
  console.log(bad ? "\n" + bad + " FAILURE(S)" : "\nall good");
  process.exit(bad ? 1 : 0);
})();
