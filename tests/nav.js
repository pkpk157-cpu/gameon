const GOENV = require("./lib/env.js");
const { chromium } = require("playwright-core");
(async () => {
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  const errs = [];
  const p = await b.newPage({ viewport: { width: 430, height: 900 } });
  p.on("pageerror", e => errs.push("PAGEERROR " + e.message));
  await p.goto("http://localhost:8099/index.html#lms", { waitUntil: "networkidle" });
  await p.waitForTimeout(300);
  const barOnTab = await p.evaluate(() => ({
    sub: document.querySelector("#barSub").style.display,
    back: document.querySelector("#barBack").style.display }));
  console.log("on a tab -> back:", barOnTab.back || "shown", "| sub:", barOnTab.sub || "shown");

  // tab -> competition rules -> back should return to that competition
  await p.click("#barInfo"); await p.waitForTimeout(400);
  console.log("rules title:", await p.$eval("#barTitle", e => e.textContent));
  await p.click("#barBack"); await p.waitForTimeout(400);
  console.log("back from rules ->", location = await p.evaluate(() => location.hash));

  // tab -> profile -> back returns to the tab
  const id = await p.evaluate(() => window.GO_STORE.dataset().managers[0].id);
  await p.goto("http://localhost:8099/index.html#lms", { waitUntil: "networkidle" });
  await p.evaluate((i) => { location.hash = "profile/" + i; }, id);
  await p.waitForTimeout(500);
  await p.click("#barBack"); await p.waitForTimeout(400);
  console.log("back from profile ->", await p.evaluate(() => location.hash));
  console.log("errors:", errs.length ? errs.join(" | ") : "none");
  await b.close();
})();
