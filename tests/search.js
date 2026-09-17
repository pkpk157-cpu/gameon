const GOENV = require("./lib/env.js");
const { chromium } = require("playwright-core");
(async () => {
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  const p = await b.newPage({ viewport: { width: 430, height: 900 } });
  const errs = []; p.on("pageerror", e => errs.push("PAGEERROR " + e.message));
  for (const [view, box, panel] of [["monthly","#monthSearch","#monthPanel"],["lms","#lmsSearch","#lmsGwPanel"]]) {
    await p.goto("http://localhost:8099/index.html#" + view, { waitUntil: "networkidle" });
    await p.waitForSelector(box); await p.waitForTimeout(400);
    const before = await p.evaluate(s => document.querySelectorAll(s + " tbody tr").length, panel);
    await p.fill(box, "karan"); await p.waitForTimeout(300);
    const shown = await p.evaluate(s => [...document.querySelectorAll(s + " tbody tr")].filter(t => t.style.display !== "none").length, panel);
    await p.fill(box, "zzzzz"); await p.waitForTimeout(300);
    const none = await p.evaluate(s => ({
      shown: [...document.querySelectorAll(s + " tbody tr")].filter(t => t.style.display !== "none").length,
      note: !!document.querySelector(s + " .nohits") }), panel);
    await p.fill(box, ""); await p.waitForTimeout(300);
    const restored = await p.evaluate(s => [...document.querySelectorAll(s + " tbody tr")].filter(t => t.style.display !== "none").length, panel);
    console.log(view.padEnd(8), "rows:" + before, "| 'karan' ->", shown, "| 'zzzzz' ->", none.shown, "note:" + none.note, "| cleared ->", restored);
  }
  // filter must survive changing the gameweek
  await p.goto("http://localhost:8099/index.html#lms", { waitUntil: "networkidle" });
  await p.waitForSelector("#lmsSearch"); await p.fill("#lmsSearch", "karan"); await p.waitForTimeout(300);
  const opts = await p.$$eval("#lmsGwSel option", o => o.map(x => x.value));
  if (opts.length > 1) { await p.selectOption("#lmsGwSel", opts[1]); await p.waitForTimeout(400); }
  console.log("filter survives gw change:", await p.evaluate(() =>
    [...document.querySelectorAll("#lmsGwPanel tbody tr")].filter(t => t.style.display !== "none").length));
  console.log("errors:", errs.length ? errs.join(" | ") : "none");
  await b.close();
})();
