const GOENV = require("./lib/env.js");
const { chromium } = require("playwright-core");
(async () => {
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  const errs = [];
  const p = await b.newPage({ viewport: { width: 430, height: 1000 }, deviceScaleFactor: 2 });
  p.on("pageerror", e => errs.push("PAGEERROR " + e.message));
  p.on("console", m => { if (m.type() === "error" && !/Failed to load resource|net::ERR_|ERR_TUNNEL/i.test(m.text())) errs.push(m.text()); });
  await p.goto("http://localhost:8099/index.html#compare", { waitUntil: "networkidle" });
  await p.waitForSelector(".sqtable");
  // force one side to be a bench-boost manager so we can check the layout
  await p.evaluate(() => {
    const ds = window.GO_STORE.dataset();
    const bb = ds.managers.find(m => { const r = window.GO_COMPUTE.managerPitch(ds, m.id); return r && r.chip === "bboost"; });
    document.querySelector("#cmpA").value = bb.id;
    document.querySelector("#cmpA").dispatchEvent(new Event("change"));
  });
  await p.waitForTimeout(500);
  const info = await p.evaluate(() => ({
    sections: [...document.querySelectorAll(".section-title h2")].map(x => x.textContent.trim()),
    colA: { rows: [...document.querySelectorAll(".cmppitch .col:first-child .prow")].map(r => r.children.length),
            bench: document.querySelectorAll(".cmppitch .col:first-child .pbench .pcell").length,
            chip: (document.querySelector(".cmppitch .col:first-child .colchip") || {}).textContent },
    squadRows: document.querySelectorAll(".sqtable tbody tr").length,
    sharedRows: document.querySelectorAll(".sqtable tr.same").length,
    seasonRows: document.querySelectorAll(".cmptable.seasons tbody tr").length,
    firstSeason: [...document.querySelectorAll(".cmptable.seasons tbody tr:first-child td")].map(t => t.textContent.trim())
  }));
  console.log(JSON.stringify(info, null, 1));
  console.log("errors:", errs.length ? errs.join(" | ") : "none");
  await p.evaluate(() => { document.querySelector(".navbar").style.display = "none"; });
  await (await p.$("#cmpBox")).screenshot({ path: "h2h-new.png" });
  await b.close();
})();
