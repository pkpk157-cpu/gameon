const GOENV = require("./lib/env.js");
/* The Premier League table used to explain itself in small print under the
   last row. That explanation now lives behind the information button in the
   card head, so: the foot is clear, the button is there, it opens the whole
   explanation, and it belongs to the table tab only. */
const { chromium } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP;
const SCRATCH = GOENV.OUT;
const DATA = GOENV.FIXTURES + "/live5.json";
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".svg":"image/svg+xml" };

const srv = http.createServer((q, r) => {
  let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  const f = u === "/data.json" ? DATA : path.join(APP, u);
  fs.readFile(f, (e, b) => {
    if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { "content-type": T[path.extname(f)] || "text/plain", "cache-control": "no-store" });
    r.end(b);
  });
});

let fails = 0;
const chk = (n, ok, d) => { console.log((ok ? "   ok   " : "   FAIL ") + n + (ok || !d ? "" : " — " + d)); if (!ok) fails++; };
// the sentences that used to be printed under the table
const MOVED = ["points", "goal difference", "goals scored", "share the place",
               "Fixtures", "final whistle", "top four", "relegation"];

(async () => {
  await new Promise((r) => srv.listen(8612, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  const errs = [];

  for (const w of [320, 390, 768]) {
    console.log("\n" + w + "px");
    const ctx = await b.newContext({ viewport: { width: w, height: 844 }, serviceWorkers: "block" });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errs.push(w + "px pageerror: " + e.message));
    page.on("console", (m) => {
      if (m.type() === "error" && !/ERR_TUNNEL|ERR_NAME_NOT_RESOLVED/.test(m.text()) && !/\/photos\//.test((m.location() || {}).url || "")) errs.push(w + "px console: " + m.text());
    });
    await page.goto("http://127.0.0.1:8612/#pl/table", { waitUntil: "networkidle" });
    await page.waitForTimeout(700);

    const view = await page.evaluate(() => {
      const s = document.querySelector('section.view.active');
      return { view: s && s.dataset.view, text: s ? s.innerText : "",
               rows: s ? s.querySelectorAll("tr.plrow").length : 0,
               koline: s ? s.querySelectorAll(".koline").length : 0,
               info: !!(s && s.querySelector("#plWhat")),
               head: s ? (s.querySelector(".card .hd") || {}).innerText : "" };
    });
    chk("the table is the page", view.view === "pl" && view.rows === 20, JSON.stringify({ v: view.view, rows: view.rows }));
    chk("no small print left under the table", view.koline === 0, "koline blocks: " + view.koline);
    chk("nothing of the old text is still on the page",
        !MOVED.some((k) => new RegExp("share the place|final whistle|goal difference", "i").test(view.text)),
        view.text.slice(-260).replace(/\n/g, " | "));
    chk("the information button is in the head", view.info, JSON.stringify(view.head));

    // the button must be reachable and on-screen, not clipped off the card
    const fit = await page.evaluate(() => {
      const btn = document.querySelector("#plWhat");
      if (!btn) return null;
      const r = btn.getBoundingClientRect();
      return { x: Math.round(r.x), right: Math.round(r.right), w: Math.round(r.width),
               h: Math.round(r.height), vw: innerWidth };
    });
    chk("it is drawn inside the screen", fit && fit.x >= 0 && fit.right <= fit.vw && fit.w >= 12,
        JSON.stringify(fit));

    await page.click("#plWhat");
    await page.waitForTimeout(400);
    const m = await page.evaluate(() => {
      const back = document.querySelector("#modalBack");
      return { open: !!(back && back.classList.contains("show")),
               title: (document.querySelector("#modalTitle") || {}).textContent,
               body: (document.querySelector("#modalBody") || {}).innerText || "",
               terms: document.querySelectorAll("#modalBody dt").length,
               heads: document.querySelectorAll("#modalBody .gwh4").length };
    });
    chk("it opens a help sheet", m.open && /how this table works/i.test(m.title || ""), JSON.stringify({ o: m.open, t: m.title }));
    chk("laid out like the app's other help", m.heads === 3 && m.terms >= 8,
        "sections " + m.heads + ", terms " + m.terms);
    const missing = MOVED.filter((k) => m.body.toLowerCase().indexOf(k.toLowerCase()) === -1);
    chk("everything the foot used to say is in it", missing.length === 0, "missing: " + missing.join(", "));
    const over = await page.evaluate(() => {
      const el = document.querySelector("#modalBody");
      return el ? { over: el.scrollWidth - el.clientWidth } : null;
    });
    chk("the sheet does not scroll sideways", over && over.over <= 1, JSON.stringify(over));

    // and it must not follow the user over to the fixtures tab
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
    await page.goto("http://127.0.0.1:8612/#pl/4", { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    const fx = await page.evaluate(() => ({
      info: !!document.querySelector("#plWhat"),
      fixtures: document.querySelectorAll(".fx").length
    }));
    chk("the fixtures tab is unchanged", !fx.info && fx.fixtures > 0, JSON.stringify(fx));
    await ctx.close();
  }

  console.log("\nno script errors");
  chk("clean console", errs.length === 0, errs.slice(0, 5).join(" || "));

  await b.close(); srv.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})();
