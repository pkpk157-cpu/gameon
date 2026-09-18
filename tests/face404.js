const GOENV = require("./lib/env.js");
/* The picture that never arrives. A code we have no file for is exactly what a
   new signing looks like between his transfer and the next photo run, and what
   every player looks like on a first visit with no signal. It must leave no
   broken icon, no gap, and no difference in the size of anything. */
const { chromium } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP;
const S = GOENV.OUT;
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css",
            ".json":"application/json", ".svg":"image/svg+xml", ".webp":"image/webp" };

// Three worlds: every photo present, every photo 404, and no codes at all.
const base = JSON.parse(fs.readFileSync(GOENV.FIXTURES + "/faces.json", "utf8"));
const codes = fs.readdirSync(APP + "/photos").filter(f => f.endsWith(".webp")).map(f => +f.slice(1, -5));
const worlds = {
  present: (ds) => { Object.keys(ds.elements).forEach((id, i) => { ds.elements[id][7] = codes[i % codes.length]; }); },
  gone:    (ds) => { Object.keys(ds.elements).forEach((id, i) => { ds.elements[id][7] = 900000 + i; }); },
  nocode:  (ds) => { Object.keys(ds.elements).forEach((id) => { ds.elements[id].length = 7; }); }
};
let DATA = null;
const srv = http.createServer((q, r) => {
  let u = decodeURIComponent(q.url.split("?")[0]); if (u === "/") u = "/index.html";
  if (u === "/data.json") { r.writeHead(200, {"content-type":"application/json","cache-control":"no-store"}); r.end(DATA); return; }
  fs.readFile(path.join(APP, u), (e, b) => { if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { "content-type": T[path.extname(u)] || "text/plain", "cache-control": "no-store" }); r.end(b); });
});

let fails = 0;
const chk = (n, ok, d) => { console.log((ok ? "   ok   " : "   FAIL ") + n + (ok || !d ? "" : " — " + d)); if (!ok) fails++; };
const ENTRY = fs.readFileSync(GOENV.FIXTURES + "/faces-entry.txt", "utf8").trim();

(async () => {
  await new Promise((r) => srv.listen(8621, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  const geo = {};

  for (const world of ["present", "gone", "nocode"]) {
    console.log("\n" + world);
    const raw = JSON.parse(JSON.stringify(base));
    worlds[world](raw.dataset);
    DATA = JSON.stringify(raw);

    const ctx = await b.newContext({ viewport: { width: 390, height: 880 }, serviceWorkers: "block" });
    const page = await ctx.newPage();
    const errs = [];
    page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
    page.on("console", (m) => { if (m.type() === "error" && !/ERR_TUNNEL|ERR_NAME|404|Failed to load resource/.test(m.text())) errs.push(m.text()); });

    // --- the pitch ---
    await page.goto("http://127.0.0.1:8621/#profile/" + ENTRY, { waitUntil: "networkidle" });
    await page.waitForTimeout(1400);
    // The photos load lazily, and the season card above the squad now puts the
    // lower rows out of the browser's fetch margin — bring the pitch into view
    // so every photo is asked for, and let the 404s come back.
    await page.evaluate(() => { const p = document.querySelector(".pitch"); if (p) p.scrollIntoView({ block: "start" }); });
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(600);
    const pitch = await page.evaluate(() => {
      const cards = [...document.querySelectorAll(".pcard")];
      const r = cards.length ? cards[0].getBoundingClientRect() : null;
      return {
        cards: cards.length,
        imgs: document.querySelectorAll(".pcard img.facepic").length,
        broken: [...document.querySelectorAll(".pcard img.facepic")].filter((i) => i.complete && i.naturalWidth === 0).length,
        jerseys: document.querySelectorAll(".pcard svg.jsy").length,
        // visible, not merely present: hidden is how the slot keeps its height
        jerseyShown: [...document.querySelectorAll(".pcard svg.jsy")]
          .filter((j) => getComputedStyle(j).visibility !== "hidden").length,
        picsDrawn: [...document.querySelectorAll(".pcard img.facepic")]
          .filter((i) => i.complete && i.naturalWidth > 0).length,
        w: r ? Math.round(r.width) : 0, h: r ? Math.round(r.height) : 0
      };
    });
    chk("every card still drawn", pitch.cards === 15, JSON.stringify(pitch));
    // The point of the whole thing: a jersey is what you get INSTEAD of a
    // photograph, never behind one. These are cut-outs on a transparent
    // background, so a jersey left underneath is worn as a backdrop.
    chk("a jersey shows only where a photograph does not",
        pitch.jerseyShown === pitch.cards - pitch.picsDrawn,
        pitch.jerseyShown + " jerseys visible with " + pitch.picsDrawn +
        " photos drawn on " + pitch.cards + " cards");
    chk("no broken image left behind", pitch.broken === 0, JSON.stringify(pitch));
    chk("the jersey is always underneath", pitch.jerseys === 15, JSON.stringify(pitch));
    if (world === "gone") chk("a 404 photo is removed entirely", pitch.imgs === 0, "still " + pitch.imgs);
    if (world === "nocode") chk("no code means no img at all", pitch.imgs === 0, "still " + pitch.imgs);
    geo["pitch-" + world] = pitch.w + "x" + pitch.h;

    // --- the boards ---
    await page.goto("http://127.0.0.1:8621/#prices/stats", { waitUntil: "networkidle" });
    await page.waitForTimeout(1400);
    const boards = await page.evaluate(() => {
      const rows = [...document.querySelectorAll("table.psbtbl tbody tr[data-el]")];
      const r = rows.length ? rows[0].getBoundingClientRect() : null;
      const faces = [...document.querySelectorAll("table.psbtbl .face")];
      const fr = faces.length ? faces[0].getBoundingClientRect() : null;
      return {
        rows: rows.length, faces: faces.length,
        initials: [...document.querySelectorAll("table.psbtbl .face > i")].length,
        iniShown: [...document.querySelectorAll("table.psbtbl .face > i")]
          .filter((i) => getComputedStyle(i).visibility !== "hidden").length,
        picsDrawn: [...document.querySelectorAll("table.psbtbl img.facepic")]
          .filter((i) => i.complete && i.naturalWidth > 0).length,
        broken: [...document.querySelectorAll("table.psbtbl img.facepic")].filter((i) => i.complete && i.naturalWidth === 0).length,
        rowH: r ? Math.round(r.height) : 0,
        faceW: fr ? Math.round(fr.width) : 0, faceH: fr ? Math.round(fr.height) : 0,
        over: document.documentElement.scrollWidth - document.documentElement.clientWidth
      };
    });
    chk("every row has a face box", boards.faces === boards.rows && boards.rows > 0, JSON.stringify(boards));
    chk("initials are always underneath", boards.initials === boards.faces, JSON.stringify(boards));
    chk("initials show only where a photograph does not",
        boards.iniShown === boards.faces - boards.picsDrawn,
        boards.iniShown + " initials visible with " + boards.picsDrawn + " photos on " + boards.faces);
    chk("no broken image left behind", boards.broken === 0, JSON.stringify(boards));
    chk("the face box is the size it says", boards.faceW === 28 && boards.faceH === 28, boards.faceW + "x" + boards.faceH);
    chk("no sideways scroll", boards.over <= 1, "overflow " + boards.over);
    geo["row-" + world] = boards.rowH;

    chk("no script errors", errs.length === 0, errs.slice(0, 3).join(" || "));
    await ctx.close();
  }

  console.log("\nthe layout must not depend on a picture arriving");
  chk("pitch cards are the same size in all three worlds",
      geo["pitch-present"] === geo["pitch-gone"] && geo["pitch-gone"] === geo["pitch-nocode"],
      JSON.stringify(geo));
  chk("board rows are the same height in all three worlds",
      geo["row-present"] === geo["row-gone"] && geo["row-gone"] === geo["row-nocode"],
      JSON.stringify(geo));

  await b.close(); srv.close();
  console.log(fails ? "\n" + fails + " FAILED" : "\nall good");
  process.exit(fails ? 1 : 0);
})();
