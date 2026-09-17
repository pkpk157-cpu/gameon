const GOENV = require("./lib/env.js");
/* Crests: drawn beside club names when the files exist, and gone without a
   trace when they do not. The test server fakes the files with tiny PNGs
   (Chrome reads the bytes, not the extension). */
const { chromium, devices } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path"), zlib = require("zlib");
const APP = GOENV.APP, PORT = 8744;
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".svg":"image/svg+xml", ".webp":"image/webp" };
function png(w, h, rgb) { // minimal solid PNG
  const crcT = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
  const crc = b => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = rgb[0]; raw[o + 1] = rgb[1]; raw[o + 2] = rgb[2]; } }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
let fakeCrests = true;
const srv = http.createServer((q, r) => { let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  const m = u.match(/^\/photos\/badge-([A-Z]{3})\.webp$/);
  if (m) { if (fakeCrests) { r.writeHead(200, { "content-type": "image/png" }); r.end(png(40, 40, [200, 30, 90])); } else { r.writeHead(404); r.end(); } return; }
  fs.readFile(path.join(APP, u), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { "content-type": T[path.extname(u)] || "text/plain" }); r.end(b); }); });
let fails = 0; const chk = (ok, m, x) => { console.log((ok ? "  ok   " : "  FAIL ") + m + (x ? "  " + x : "")); if (!ok) fails++; };
(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  for (const withFiles of [true, false]) {
    fakeCrests = withFiles;
    const ctx = await b.newContext({ ...devices["iPhone 12"], serviceWorkers: "block" });
    await ctx.addInitScript(() => { try { localStorage.setItem("go12.me", "1255976"); } catch (e) {} });
    const p = await ctx.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
    await p.goto("http://localhost:" + PORT + "/index.html#pl", { waitUntil: "domcontentloaded" }); await p.waitForTimeout(1800);
    const fx = await p.evaluate(() => ({ rows: document.querySelectorAll(".fx").length, crests: [...document.querySelectorAll(".fx .crest")].filter(i => i.complete && i.naturalWidth > 0).length, anyImg: document.querySelectorAll(".fx img").length,
      first: (function () { const f = document.querySelector(".fx"); return f && f.textContent.trim().replace(/\s+/g, " "); })(),
      fits: [...document.querySelectorAll(".fx")].every(f => f.scrollWidth <= f.clientWidth + 1) }));
    chk(withFiles ? fx.crests === fx.rows * 2 : fx.anyImg === 0, (withFiles ? "fixtures: a crest beside every club name (" + fx.crests + " for " + fx.rows + " rows)" : "fixtures without files: no image left behind"), fx.first);
    chk(fx.fits, "fixture rows do not overflow");
    if (withFiles) await p.screenshot({ path: "crest-fixtures.png" });
    await p.evaluate(() => location.hash = "#pl/table"); await p.waitForTimeout(1200);
    const tb = await p.evaluate(() => ({ rows: document.querySelectorAll("section.view.active table.t tbody tr").length, shown: [...document.querySelectorAll("section.view.active table.t td.name .crest")].filter(i => i.offsetParent).length, imgs: document.querySelectorAll("section.view.active table.t td.name img").length,
      cut: [...document.querySelectorAll("section.view.active table.t td.name .who")].filter(x => x.scrollWidth > x.clientWidth + 0.5).map(x => x.textContent.trim()),
      over: (function () { const t = document.querySelector("section.view.active table.t"); const sc = t.parentElement; return sc.scrollWidth - sc.clientWidth; })(),
      bad: (function () { const out = [];
        document.querySelectorAll("section.view.active table.t tbody tr").forEach(function (tr) {
          const td = tr.querySelector("td.name"), nx = td && td.nextElementSibling; if (!td || !nx) return;
          const rng = document.createRange(); rng.selectNodeContents(td);
          if (Math.round(rng.getBoundingClientRect().right) > Math.round(nx.getBoundingClientRect().left) + 1) out.push(td.textContent.trim());
        }); return out; })() }));
    tb.clash = tb.bad.length;
    chk(withFiles ? tb.shown === tb.rows : tb.imgs === 0,
      withFiles ? "table on a phone: a crest on every club, and the name still in full"
                : "table on a phone without files: no image left behind",
      JSON.stringify({ shown: tb.shown, rows: tb.rows }));
    chk(tb.cut.length === 0, "no club name is cut short");
    chk(tb.clash === 0, "no club name runs under the next column", JSON.stringify(tb.bad));
    chk(tb.over <= 1, "PL table still fits its card", "over " + tb.over);
    if (withFiles) {
      const wide = await b.newContext({ viewport: { width: 1000, height: 900 }, serviceWorkers: "block" });
      const wp = await wide.newPage();
      await wp.goto("http://localhost:" + PORT + "/index.html#pl/table", { waitUntil: "domcontentloaded" }); await wp.waitForTimeout(1500);
      const wt = await wp.evaluate(() => ({ rows: document.querySelectorAll("table.t.pltbl tbody tr").length, crests: [...document.querySelectorAll("table.t.pltbl td.name .crest")].filter(i => i.offsetParent && i.complete && i.naturalWidth > 0).length,
        cut: [...document.querySelectorAll("table.t.pltbl td.name .who")].filter(x => x.scrollWidth > x.clientWidth + 0.5).length }));
      chk(wt.crests === wt.rows && wt.cut === 0, "table on a wide screen: a crest on every club, every name in full", JSON.stringify(wt));
      await wide.close();
    }
    if (withFiles) await p.screenshot({ path: "crest-table.png" });
    await p.evaluate(() => location.hash = "#profile/1255976"); await p.waitForTimeout(1500);
    await p.evaluate(() => { const c = document.querySelector(".pcard[data-el]"); c && c.click(); }); await p.waitForTimeout(900);
    const md = await p.evaluate(() => { const n = document.querySelector(".bdname span"); const i = n && n.querySelector("img.crest"); return { text: n && n.textContent, crest: !!(i && i.complete && i.naturalWidth > 0), img: !!(n && n.querySelector("img")) }; });
    chk(withFiles ? md.crest : !md.img, withFiles ? "player card: crest before the club" : "player card without files: none left behind", md.text);
    if (withFiles) await p.screenshot({ path: "crest-player.png", clip: { x: 0, y: 60, width: 390, height: 240 } });
    chk(errs.length === 0, "no JS errors", errs.join(" | "));
    await ctx.close();
  }
  await b.close(); srv.close(); console.log(fails ? "FAILS: " + fails : "ALL OK");
})();
