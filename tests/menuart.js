const GOENV = require("./lib/env.js");
/* The three section marks in the burger drawer used to be seen changing their
   minds: a drawn glyph for a frame or two, then the real badge dropping over
   it. A lazy <img> inside a drawer that is off screen is never fetched, so the
   first open always paid for the swap. The art is warmed at boot now and the
   glyph is left out once it is ready — with the glyph still standing in if the
   art is slow or missing, which is the whole reason it exists. */
const { chromium } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP, PORT = 8792, ME = 1255976;
const ART = ["pl-lion.webp", "logo-tile.webp", "logo-tile-inv.webp"];
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".svg":"image/svg+xml", ".webp":"image/webp", ".png":"image/png" };
let delayArt = 0, killArt = false;
const srv = http.createServer((q, r) => { let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  const isArt = ART.some(a => u.endsWith("/" + a));
  const send = () => {
    if (isArt && killArt) { r.writeHead(404); r.end(); return; }
    fs.readFile(path.join(APP, u), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { "content-type": T[path.extname(u)] || "text/plain" }); r.end(b); });
  };
  if (isArt && delayArt) setTimeout(send, delayArt); else send();
});
let fails = 0; const chk = (ok, m, x) => { console.log((ok ? "  ok   " : "  FAIL ") + m + (x ? "  " + x : "")); if (!ok) fails++; };

const marks = (p) => p.evaluate(() => [...document.querySelectorAll("#menuBody .mi-mark")].map(m => {
  const img = m.querySelector("img.mi-logo"), tile = m.querySelector("svg.tile");
  return {
    src: img ? img.getAttribute("src") : null,
    lazy: img ? img.getAttribute("loading") : null,
    ready: !!img && img.complete && img.naturalWidth > 0,
    // the drawn tile is defs + backdrop + sheen + border; anything beyond that
    // is a glyph waiting to be covered up
    tileKids: tile ? tile.children.length : -1,
    boxed: m.getBoundingClientRect().width > 0
  };
}));

async function open(p) {
  await p.click("#barMenu");
  await p.waitForSelector("#menuBody .mi-mark", { timeout: 8000 });
}

(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  const mk = async (opts) => {
    const ctx = await b.newContext(Object.assign({ viewport: { width: 390, height: 820 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: "block", reducedMotion: "reduce", colorScheme: "dark" }, opts || {}));
    await ctx.addInitScript((me) => { try { localStorage.setItem("go12.me", JSON.stringify(me)); } catch (e) {} }, ME);
    return ctx;
  };

  /* --- the ordinary open: nothing changes after it is on screen --------- */
  {
    const ctx = await mk(); const p = await ctx.newPage(); const errs = [];
    p.on("pageerror", e => errs.push(e.message));
    await p.goto("http://127.0.0.1:" + PORT + "/index.html#classic", { waitUntil: "domcontentloaded" });
    await p.waitForSelector("table.t tbody tr", { timeout: 15000 });
    await open(p);
    await p.waitForTimeout(260);
    const early = [];
    for (const h of await p.$$("#menuBody .mi-mark")) early.push(await h.screenshot());
    const m1 = await marks(p);
    await p.waitForTimeout(1600);
    const late = [];
    for (const h of await p.$$("#menuBody .mi-mark")) late.push(await h.screenshot());

    chk(m1.length === 3, "three section marks", String(m1.length));
    chk(m1.every(m => m.lazy === null), "the badges are not lazy — a drawer off screen never fetches those", m1.map(m => m.lazy).join(","));
    chk(m1.every(m => m.ready), "every badge is already decoded when the drawer opens", JSON.stringify(m1.map(m => m.ready)));
    chk(m1.every(m => m.tileKids === 4), "and the tile under it carries no glyph to flash", m1.map(m => m.tileKids).join(","));
    chk(early.length === 3 && early.every((buf, i) => buf.equals(late[i])),
      "the marks look identical a moment after opening and a second and a half later");
    chk(errs.length === 0, "no page errors", errs.join(" | "));
    await ctx.close();
  }

  /* --- art that is slow: the drawn glyph still stands in ---------------- */
  {
    delayArt = 4000;
    const ctx = await mk(); const p = await ctx.newPage(); const errs = [];
    p.on("pageerror", e => errs.push(e.message));
    await p.goto("http://127.0.0.1:" + PORT + "/index.html#classic", { waitUntil: "domcontentloaded" });
    await p.waitForSelector("table.t tbody tr", { timeout: 15000 });
    await open(p);
    await p.waitForTimeout(300);
    const m = await marks(p);
    chk(m.length === 3 && m.every(x => x.tileKids > 4), "slow art: the drawn glyph is there to stand in", m.map(x => x.tileKids).join(","));
    chk(m.every(x => x.boxed), "slow art: no mark is an empty box", JSON.stringify(m.map(x => x.boxed)));
    chk(errs.length === 0, "slow art: no page errors", errs.join(" | "));
    delayArt = 0;
    await ctx.close();
  }

  /* --- art that never arrives: the app looks like it did before it -------- */
  {
    killArt = true;
    const ctx = await mk(); const p = await ctx.newPage(); const errs = [];
    p.on("pageerror", e => errs.push(e.message));
    await p.goto("http://127.0.0.1:" + PORT + "/index.html#classic", { waitUntil: "domcontentloaded" });
    await p.waitForSelector("table.t tbody tr", { timeout: 15000 });
    await p.waitForTimeout(600);
    await open(p);
    await p.waitForTimeout(400);
    const m = await marks(p);
    chk(m.length === 3 && m.every(x => x.tileKids > 4), "missing art: every mark keeps its drawn glyph", m.map(x => x.tileKids).join(","));
    // the app's own error handler takes a broken <img> out entirely, so what is
    // left has to be a drawn mark rather than a hole
    chk(m.every(x => !x.ready && x.boxed && x.src === null), "missing art: the broken image is taken out and the drawn mark is what remains", JSON.stringify(m));
    chk(errs.length === 0, "missing art: no page errors", errs.join(" | "));
    await p.screenshot({ path: path.join(GOENV.OUT, "menuart-noart.png") });
    killArt = false;
    await ctx.close();
  }

  /* --- art that warms and then goes away: the glyph comes back ----------- */
  {
    const ctx = await mk(); const p = await ctx.newPage(); const errs = [];
    p.on("pageerror", e => errs.push(e.message));
    await p.goto("http://127.0.0.1:" + PORT + "/index.html#classic", { waitUntil: "domcontentloaded" });
    await p.waitForSelector("table.t tbody tr", { timeout: 15000 });
    await open(p);
    await p.waitForTimeout(300);
    chk((await marks(p)).every(x => x.ready && x.tileKids === 4), "warm first: no glyph, as before");
    // Now say one of them is broken. The server cannot stage this once the
    // browser holds the file — it serves it from memory without asking again,
    // which is also why a bare tile cannot happen in that case. What has to
    // work is the handler: a badge that reports itself broken is taken out and
    // forgotten, so the next drawer draws its glyph again instead of a bare
    // coloured tile.
    const broke = await p.evaluate(() => {
      const img = document.querySelector("#menuBody .mi-mark img.mi-logo");
      const src = img.getAttribute("src");
      img.dispatchEvent(new Event("error", { bubbles: false }));
      return { src: src, gone: !document.querySelector('#menuBody img.mi-logo[src="' + src + '"]') };
    });
    chk(broke.gone, "a broken badge is taken out of the drawer", broke.src);
    await p.evaluate(() => { document.querySelector('#pfTheme [data-th="light"]').click(); });
    await p.waitForTimeout(700);
    const m = await marks(p);
    const one = m.filter(x => x.src === broke.src)[0];
    chk(!!one && one.tileKids > 4, "...and the next drawer draws its glyph again", JSON.stringify(m.map(x => x.tileKids)));
    chk(m.filter(x => x.src !== broke.src).every(x => x.tileKids === 4), "...while the two that are fine keep none");
    chk(errs.length === 0, "lost art: no page errors", errs.join(" | "));
    await ctx.close();
  }

  await b.close(); srv.close();
  console.log(fails ? fails + " FAILURES" : "all ok");
  process.exit(fails ? 1 : 0);
})();
