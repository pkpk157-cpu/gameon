const GOENV = require("./lib/env.js");
const { chromium } = require("playwright-core");
(async () => {
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  const p = await b.newPage({ viewport: { width: 430, height: 900 }, deviceScaleFactor: 2 });
  for (const v of ["lms", "pyramid", "h2h"]) {
    await p.goto("http://localhost:8099/index.html#" + v, { waitUntil: "networkidle" });
    await p.waitForTimeout(600);
    await p.screenshot({ path: "v-" + v + ".png" });
  }
  // measure the overlap on LMS and the UCL select width
  await p.goto("http://localhost:8099/index.html#lms", { waitUntil: "networkidle" });
  await p.waitForTimeout(500);
  const lms = await p.evaluate(() => {
    const sel = document.querySelector("#lmsGwSel");
    const cards = document.querySelector(".statrow") || document.querySelector(".grid");
    if (!sel || !cards) return { missing: [!sel, !cards] };
    const a = sel.getBoundingClientRect(), c = cards.getBoundingClientRect();
    return { selBottom: Math.round(a.bottom), cardsTop: Math.round(c.top), gap: Math.round(c.top - a.bottom) };
  });
  console.log("LMS  select/cards:", JSON.stringify(lms));
  await p.goto("http://localhost:8099/index.html#h2h", { waitUntil: "networkidle" });
  await p.waitForTimeout(500);
  const ucl = await p.evaluate(() => {
    const s = document.querySelector("#grpSel");
    if (!s) return null;
    const r = s.getBoundingClientRect();
    return { width: Math.round(r.width), text: s.options[s.selectedIndex].textContent,
             scrollW: s.scrollWidth };
  });
  console.log("UCL  select:", JSON.stringify(ucl));
  await b.close();
})();
