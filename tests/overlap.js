const GOENV = require("./lib/env.js");
const { chromium } = require("playwright-core");
(async () => {
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  // a short viewport is where fill-mode squeezing bites
  for (const h of [900, 620]) {
    const p = await b.newPage({ viewport: { width: 430, height: h } });
    for (const v of ["lms", "pyramid", "h2h", "monthly"]) {
      await p.goto("http://localhost:8099/index.html#" + v, { waitUntil: "networkidle" });
      await p.waitForTimeout(500);
      const r = await p.evaluate(() => {
        const view = document.querySelector(".view.active");
        // every laid-out block in the view, in document order
        const els = [...view.querySelectorAll(".statrow, .pickrow, .selrow, .pickmeta, .freeze, .card")]
          .filter(e => e.getBoundingClientRect().height > 0);
        const bad = [];
        for (let i = 0; i < els.length; i++) {
          for (let j = i + 1; j < els.length; j++) {
            if (els[i].contains(els[j]) || els[j].contains(els[i])) continue;
            const a = els[i].getBoundingClientRect(), c = els[j].getBoundingClientRect();
            const vOverlap = Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top);
            const hOverlap = Math.min(a.right, c.right) - Math.max(a.left, c.left);
            if (vOverlap > 1 && hOverlap > 1) {
              bad.push(els[i].className.split(" ")[0] + " ↔ " + els[j].className.split(" ")[0] + " (" + Math.round(vOverlap) + "px)");
            }
          }
        }
        // does any content spill out of the view box?
        const vb = view.getBoundingClientRect();
        const spill = [...view.children].filter(e => {
          const r2 = e.getBoundingClientRect();
          return r2.height > 0 && r2.bottom > vb.bottom + 2;
        }).length;
        return { bad, spill };
      });
      console.log(("h" + h + " " + v).padEnd(14), r.bad.length ? "OVERLAP: " + r.bad.join(", ") : "clean",
                  r.spill ? "| spill:" + r.spill : "");
    }
    await p.close();
  }
  await b.close();
})();
