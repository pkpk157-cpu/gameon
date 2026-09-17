const GOENV = require("./lib/env.js");
const { chromium } = require("playwright-core");
(async () => {
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errs = []; p.on("pageerror", e => errs.push(e.message));
  for (const t of ["monthly","h2h"]) {
    await p.goto("http://localhost:8099/index.html#rules/" + t, { waitUntil: "networkidle" });
    await p.waitForTimeout(350);
    const txt = await p.evaluate(() => document.querySelector(".view.active").innerText);
    console.log("=== " + t + " rules ===");
    console.log("  mentions hits:", /includes hits/i.test(txt),
                "| bench tie-break:", /bench points/i.test(txt),
                "| UCL/UEL split:", /UEL/.test(txt),
                "| points 3/1/0:", /3\/1\/0|\(3\/1\/0\)/.test(txt));
  }
  console.log("errors:", errs.length ? errs.join(" | ") : "none");
  await b.close();
})();
