const GOENV = require("./lib/env.js");
const { chromium } = require("playwright-core");
(async () => {
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  const cdp = await p.context().newCDPSession(p);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await p.goto("http://localhost:8099/index.html", { waitUntil: "networkidle" });
  await p.waitForTimeout(600);
  const r = await p.evaluate(() => {
    const ds = window.GO_STORE.dataset(), K = window.GO_COMPUTE;
    const fns = ["classic","monthly","lms","pyramid","h2h","highlights"];
    const calls = {};
    fns.forEach(f => {
      const orig = K[f];
      let n = 0, ms = 0;
      K[f] = function () { const t = performance.now(); const v = orig.apply(this, arguments); ms += performance.now() - t; n++; return v; };
      calls[f] = () => ({ n, ms: Math.round(ms) });
      K["__orig_" + f] = orig;
    });
    // one cold timing of each
    const cold = {};
    fns.forEach(f => { const t = performance.now(); K["__orig_" + f](ds); cold[f] = Math.round(performance.now() - t); });
    // now count what a few view switches actually invoke
    ["classic","monthly","lms","compare","stats"].forEach(v => { location.hash = v; });
    return { cold, counts: Object.fromEntries(fns.map(f => [f, calls[f]()])) };
  });
  console.log("cold cost of each compute (ms):", JSON.stringify(r.cold));
  console.log("calls during 5 view switches:");
  Object.entries(r.counts).forEach(([k, v]) => { if (v.n) console.log("   " + k.padEnd(11), v.n + " calls", v.ms + "ms total"); });
  await b.close();
})();
