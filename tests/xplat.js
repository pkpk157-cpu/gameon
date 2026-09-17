const GOENV = require("./lib/env.js");
/* The same app on an iPhone and on an Android phone. Only Chromium runs here,
   so this cannot see WebKit paint — what it can hold to is everything that
   makes the two drift apart in practice: a page wider than the screen at each
   phone's width, a control that escaped the font stack and fell to the
   phone's own default, a glyph typed from a symbol or emoji font (each phone
   owns a different one), and a tap target iOS would not answer. iOS Safari
   turns a tap into a click for a document-level handler only when the element
   under the finger is a control, a link, or carries cursor:pointer — so every
   thing the document listens for has to be marked. */
const { chromium, devices } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP, PORT = 8797;
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".svg":"image/svg+xml", ".webp":"image/webp", ".png":"image/png" };
const srv = http.createServer((q, r) => { let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  fs.readFile(path.join(APP, u), (e, b) => { if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { "content-type": T[path.extname(u)] || "text/plain", "cache-control": "no-store" }); r.end(b); }); });
const ds = JSON.parse(fs.readFileSync(APP + "/data.json", "utf8")).dataset;
let fails = 0;
const chk = (ok, m, x) => { console.log((ok ? "  ok   " : "  FAIL ") + m + (x ? "  " + x : "")); if (!ok) fails++; };

// a forward who has played, and a fixture that has kicked off, so the player
// page and the match page both have something to draw
const EL = Object.keys(ds.elements).filter((k) => ds.elements[k][1] === 4)
  .sort((a, b) => ds.elements[b][3] - ds.elements[a][3])[0];
const gws = Object.keys(ds.gwFixtures || {}).map(Number).filter((g) => (ds.gwFixtures[g] || []).some((f) => f[2])).sort((a, b) => b - a);
const mgw = gws[0], mf = mgw ? ds.gwFixtures[mgw].find((f) => f[2]) : null;
const VIEWS = ["classic", "monthly", "lms", "pyramid", "h2h", "vol", "stats", "compare", "prices", "prices/stats",
               "pl", "pl/table", "winnings", "gwstatus", "rules", "rules/classic", "rules/lms", "rules/pyramid",
               "rules/h2h", "profile/" + ds.managers[0].id, "settings", "chips", "player/" + EL]
  .concat(mf ? ["pl/" + mgw + "/" + mf[0] + "-" + mf[1]] : []);
const PHONES = ["iPhone SE", "Galaxy S8", "iPhone 12", "Pixel 7"];

// the document-level tap handlers' targets (app.js: the player card, the
// match rows, rules and chip links, and any row that names a manager)
const TAPS = ".pcard[data-el], .mrow[data-el], .mevrow[data-el], [data-rules], [data-chipgo], [data-entry], table.t tr:has(td.name[data-entry])";
// glyphs no font on the stack owns: emoji, geometric shapes, dingbats, the
// star, the heavy arrows. The plain arrows (U+2190-2199) are in both SF and
// Roboto, so they are the page's own font on each phone and stay allowed.
const GLYPH = /[\u219a-\u21ff\u2500-\u27bf\u2b00-\u2bff\u{1f000}-\u{1faff}]/u;

const sweep = ({ taps, src, flags }) => {
  const glyph = new RegExp(src, flags);
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden"; };
  const W = innerWidth, out = { wide: document.documentElement.scrollWidth - W, spill: [], font: [], tap: [], glyph: [] };
  const scroller = (el) => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const o = getComputedStyle(p).overflowX; if (o === "auto" || o === "scroll") return true; } return false; };
  const hidden = (el) => el.closest("#splash, .modal-back:not(.show), [hidden], #toast") || el.closest("svg") && el.tagName !== "svg";
  for (const el of document.querySelectorAll("body *")) {
    if (hidden(el) || !vis(el)) continue;
    const r = el.getBoundingClientRect();
    if ((r.right > W + 1 || r.left < -1) && !scroller(el) && getComputedStyle(el).position !== "fixed")
      out.spill.push(el.tagName.toLowerCase() + (el.className && typeof el.className === "string" ? "." + el.className.split(" ")[0] : "") + " " + Math.round(r.left) + ".." + Math.round(r.right));
    const cs = getComputedStyle(el);
    if (!/^(-apple-system|ui-monospace)/.test(cs.fontFamily) && el.tagName !== "svg" && !el.closest("svg"))
      out.font.push(el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + " → " + cs.fontFamily.slice(0, 30));
    for (const ps of ["::before", "::after"]) { const c = getComputedStyle(el, ps).content; if (c && c !== "none" && glyph.test(c)) out.glyph.push(el.tagName + ps + " " + c); }
  }
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = walker.nextNode());) {
    const m = n.nodeValue.match(glyph); if (!m) continue;
    const el = n.parentElement; if (!el || hidden(el) || !vis(el)) continue;
    out.glyph.push(m[0] + " in " + el.tagName.toLowerCase() + "." + (el.className || "").toString().split(" ")[0]);
  }
  for (const el of document.querySelectorAll(taps)) {
    if (hidden(el) || !vis(el)) continue;
    if (/^(BUTTON|A)$/.test(el.tagName)) continue;
    if (getComputedStyle(el).cursor !== "pointer") out.tap.push(el.tagName.toLowerCase() + "." + (el.className || "").toString().split(" ")[0]);
  }
  const bar = document.querySelector(".topbar").getBoundingClientRect(), nav = document.querySelector(".navbar").getBoundingClientRect();
  out.bars = Math.round(bar.top) === 0 && Math.abs(Math.round(nav.bottom) - innerHeight) <= 1;
  const uniq = (a) => [...new Set(a)];
  return { wide: out.wide, spill: uniq(out.spill).slice(0, 4), font: uniq(out.font).slice(0, 4), tap: uniq(out.tap).slice(0, 4), glyph: uniq(out.glyph).slice(0, 4), bars: out.bars };
};

(async () => {
  await new Promise((r) => srv.listen(PORT, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  for (const name of PHONES) {
    const dev = devices[name];
    const ctx = await b.newContext({ ...dev, serviceWorkers: "block" });
    const p = await ctx.newPage();
    const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.goto("http://localhost:" + PORT + "/index.html#classic", { waitUntil: "domcontentloaded" });
    await p.waitForFunction(() => document.querySelector("section.view.active table.t tbody tr"), null, { timeout: 15000 }).catch(() => {});
    const bad = [];
    for (const v of VIEWS) {
      await p.evaluate((x) => { location.hash = "#" + x; }, v);
      await p.waitForTimeout(v.indexOf("prices") === 0 ? 1500 : 700);
      // measured at the top and again at the foot, where the bars must still be in place
      let m = await p.evaluate(sweep, { taps: TAPS, src: GLYPH.source, flags: GLYPH.flags }).catch((e) => ({ err: e.message }));
      if (!m.err) {
        await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await p.waitForTimeout(150);
        const foot = await p.evaluate(sweep, { taps: TAPS, src: GLYPH.source, flags: GLYPH.flags }).catch((e) => ({ err: e.message }));
        if (!foot.err) { m.bars = m.bars && foot.bars; m.spill = m.spill.concat(foot.spill.filter((s) => m.spill.indexOf(s) < 0)).slice(0, 4); }
        await p.evaluate(() => window.scrollTo(0, 0));
      }
      const probs = [];
      if (m.err) probs.push("sweep threw " + m.err);
      if (m.wide > 1) probs.push("page " + m.wide + "px wider than the screen");
      if (m.spill && m.spill.length) probs.push("off the screen: " + m.spill.join(", "));
      if (m.font && m.font.length) probs.push("off the font stack: " + m.font.join(", "));
      if (m.glyph && m.glyph.length) probs.push("typed symbol: " + m.glyph.join(", "));
      if (m.tap && m.tap.length) probs.push("tap iOS would drop: " + m.tap.join(", "));
      if (m.bars === false) probs.push("a bar left its edge");
      if (probs.length) bad.push(v + ": " + probs.join("; "));
    }
    console.log("  " + name.padEnd(10) + dev.viewport.width + "x" + dev.viewport.height + " @" + dev.deviceScaleFactor + "  " + VIEWS.length + " views" + (bad.length ? "" : "  clean"));
    chk(bad.length === 0, name + ": every view fits, sits on the font stack, draws its symbols, and answers a tap", bad.length ? "\n         " + bad.join("\n         ") : "");
    chk(errs.length === 0, name + ": no JS errors", errs.slice(0, 2).join(" | "));
    await ctx.close();
  }
  await b.close(); srv.close();
  console.log(fails ? "\nFAILS: " + fails : "\nall phones agree");
  process.exit(fails ? 1 : 0);
})();
