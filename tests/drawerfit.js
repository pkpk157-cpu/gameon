const GOENV = require("./lib/env.js");
/* The drawer now carries everything the gear used to. On a short landscape
   screen or a 320px phone that content is taller than the panel: it must
   scroll inside the drawer, and the credit line at the bottom must be
   reachable. Admin mode adds a whole extra group, so test that too. */
const { chromium } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP;
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".svg":"image/svg+xml" };
const srv = http.createServer((q, r) => {
  let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  fs.readFile(path.join(APP, u), (e, b) => {
    if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { "content-type": T[path.extname(u)] || "text/plain", "cache-control": "no-store" }); r.end(b);
  });
});
const SCREENS = [
  ["iPhone SE           ", 320, 568, 2],
  ["Galaxy S9+          ", 320, 658, 4.5],
  ["Pixel 7 landscape   ", 863, 360, 2.625],
  ["iPhone 15 landscape ", 734, 343, 3],
  ["Z Flip cover        ", 474, 448, 2],
  ["iPad Pro 11         ", 834, 1194, 2]
];
let fails = 0;
const chk = (n, ok, d) => { if (!ok) { fails++; console.log("   FAIL " + n + (d ? " — " + d : "")); } };

(async () => {
  await new Promise((r) => srv.listen(9902, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  for (const admin of [false, true]) {
    console.log("\n" + (admin ? "with admin mode on (extra group)" : "as an ordinary reader"));
    for (const [name, w, h, dpr] of SCREENS) {
     for (const sheet of [{ btn: "#barMenu", back: "#menuBack", body: "#menuBody", tag: "burger", side: "left" },
                          { btn: "#barYou",  back: "#youBack",  body: "#youBody",  tag: "you",    side: "right" }]) {
      const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr,
        isMobile: w < 700, hasTouch: true, serviceWorkers: "block" });
      const p = await ctx.newPage();
      const errs = [];
      p.on("pageerror", (e) => errs.push(e.message));
      if (admin) await p.addInitScript(() => { try { localStorage.setItem("go.admin", "1"); } catch (e) {} });
      await p.goto("http://localhost:9902/index.html#classic", { waitUntil: "domcontentloaded" });
      await p.waitForTimeout(1400);
      await p.click(sheet.btn); await p.waitForTimeout(500);

      const r = await p.evaluate((sh) => {
        const back = document.querySelector(sh.back);
        const m = back.querySelector(".modal");
        const body = back.querySelector(sh.body) || m;
        const box = m.getBoundingClientRect();
        const scroller = [m, body].find((el) => el.scrollHeight > el.clientHeight + 1) || null;
        return {
          left: Math.round(box.left), width: Math.round(box.width),
          fitsWidth: box.right <= window.innerWidth + 1,
          fullHeight: Math.round(box.height) >= window.innerHeight - 2,
          overflows: m.scrollHeight > m.clientHeight + 1 || body.scrollHeight > body.clientHeight + 1,
          scrollable: !!scroller,
          which: scroller ? (scroller.id || scroller.className) : "-",
          right: Math.round(box.right),
          pageOverflow: document.documentElement.scrollWidth > window.innerWidth + 1
        };
      }, sheet);

      // if it overflows, prove the bottom can actually be reached
      let reached = true;
      if (r.overflows) {
        reached = await p.evaluate((sh) => {
          const back = document.querySelector(sh.back);
          const el = [back.querySelector(sh.body), back.querySelector(".modal")]
            .find((x) => x && x.scrollHeight > x.clientHeight + 1);
          el.scrollTop = el.scrollHeight;
          // Whatever the sheet ends with: the You sheet signs off with where
          // the numbers came from, the burger with its last group.
          const groups = back.querySelectorAll(".menu");
          const last = back.querySelector(".pffoot") || groups[groups.length - 1];
          if (!last) return false;
          const f = last.getBoundingClientRect();
          return f.bottom <= window.innerHeight + 2 && f.top >= -2;
        }, sheet);
      }

      const who = name.trim() + " " + sheet.tag;
      console.log("  " + who + " " + w + "x" + h +
        "  x=" + r.left + " w=" + r.width +
        (r.overflows ? "  scrolls in " + r.which + ", bottom reachable " + reached : "  fits"));
      if (sheet.side === "left") chk(who + ": flush to the left edge", r.left === 0, String(r.left));
      else chk(who + ": flush to the right edge", Math.abs(r.right - w) <= 1, String(r.right) + " vs " + w);
      chk(who + ": stays on screen", r.fitsWidth && !r.pageOverflow);
      chk(who + ": full height", r.fullHeight);
      if (r.overflows) {
        chk(who + ": tall content scrolls", r.scrollable);
        chk(who + ": the bottom can be reached", reached);
      }
      chk(who + ": no errors", errs.length === 0, errs.slice(0, 1).join(""));
      await ctx.close();
     }
    }
  }
  await b.close(); srv.close();
  console.log("\n" + (fails ? fails + " FAILURES" : "the drawer fits, scrolls and reaches its bottom on every screen"));
})();
