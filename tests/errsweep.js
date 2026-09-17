const GOENV = require("./lib/env.js");
/* A walk over every screen and every control, watching for anything the
   console would call an error: thrown exceptions, failed requests, bad
   markup. Real data, both themes, three widths. */
const { chromium, devices } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP, PORT = 8760;
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".svg":"image/svg+xml", ".webp":"image/webp", ".png":"image/png" };
const srv = http.createServer((q, r) => { let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  fs.readFile(path.join(APP, u), (e, b) => { if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { "content-type": T[path.extname(u)] || "text/plain", "cache-control": "no-store" }); r.end(b); }); });
const VIEWS = ["classic", "monthly", "lms", "pyramid", "h2h", "vol", "stats", "compare", "prices", "prices/stats",
               "pl", "pl/table", "winnings", "gwstatus", "rules", "rules/classic", "rules/monthly", "rules/lms",
               "rules/pyramid", "rules/h2h", "rules/vol", "profile/1255976", "settings", "chips/4/3xc"];
let fails = 0, photo404 = 0;
const chk = (ok, m, x) => { console.log((ok ? "  ok   " : "  FAIL ") + m + (x ? "  " + x : "")); if (!ok) fails++; };
(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  const U = "http://localhost:" + PORT + "/index.html";
  for (const [tag, opts] of [["phone-light", { ...devices["iPhone 12"], colorScheme: "light" }],
                             ["phone-dark", { ...devices["iPhone 12"], colorScheme: "dark" }],
                             ["tablet", { viewport: { width: 768, height: 1024 }, colorScheme: "light" }],
                             ["desktop", { viewport: { width: 1280, height: 900 }, colorScheme: "dark" }]]) {
    const ctx = await b.newContext({ ...opts, serviceWorkers: "block" });
    await ctx.addInitScript(() => { try { localStorage.setItem("go12.me", "1255976"); } catch (e) {} });
    const p = await ctx.newPage();
    const errs = [];
    let where = "boot";
    p.on("pageerror", e => errs.push(where + ": " + e.message));
    p.on("console", m => { if (m.type() !== "error") return;
      const url = (m.location() || {}).url || "";
      if (/\/photos\//.test(url)) { photo404++; return; }          // a player with no picture: by design
      if (/ERR_TUNNEL|ERR_NAME|ERR_INTERNET/.test(m.text())) return; // the sandbox has no outside
      errs.push(where + ": " + m.text() + (url ? " [" + url + "]" : "")); });
    p.on("requestfailed", r => { const u = r.url();
      if (/\/photos\//.test(u) || /^data:/.test(u) || !/localhost/.test(u)) return;
      errs.push(where + ": request failed " + u); });
    await p.goto(U + "#classic", { waitUntil: "domcontentloaded" }); await p.waitForTimeout(1800);

    for (const v of VIEWS) {
      where = tag + " #" + v;
      await p.evaluate(h => { location.hash = h; }, "#" + v); await p.waitForTimeout(650);
      const view = await p.evaluate(() => { const s = document.querySelector("section.view.active"); return { view: s && s.getAttribute("data-view"), empty: !s || !s.textContent.trim().length, undef: /undefined|NaN|\[object Object\]|null null/.test(s ? s.textContent : "") }; });
      chk(!!view.view && !view.empty, where + ": the page drew something", JSON.stringify(view));
      chk(!view.undef, where + ": no undefined, NaN or [object Object] on the page");
      // work every control this page offers
      await p.evaluate(async () => {
        const sleep = (ms) => new Promise(r => setTimeout(r, ms));
        const host = document.querySelector("section.view.active");
        if (!host) return;
        for (const sel of host.querySelectorAll("select")) {
          for (let i = 0; i < Math.min(sel.options.length, 3); i++) { sel.selectedIndex = i; sel.dispatchEvent(new Event("change", { bubbles: true })); await sleep(90); }
        }
        for (const inp of host.querySelectorAll('input[type="search"], input.in')) {
          inp.value = "a"; inp.dispatchEvent(new Event("input", { bubbles: true })); await sleep(90);
          inp.value = "zzzz"; inp.dispatchEvent(new Event("input", { bubbles: true })); await sleep(90);
          inp.value = ""; inp.dispatchEvent(new Event("input", { bubbles: true })); await sleep(60);
        }
        // tabs, chips, toggles, folds and cards — not the links that leave
        const tap = [...host.querySelectorAll("button, summary, .pfoldpeek, details, [role=button], .tabbtn, .chip, .pcard, .badge, .hcard")]
          .filter(el => !el.hasAttribute("data-entry") && !el.hasAttribute("data-go") && !el.hasAttribute("data-plfx") && !el.hasAttribute("data-rules") && !el.hasAttribute("data-chipgo"));
        for (const el of tap.slice(0, 40)) { try { el.click(); } catch (e) {} await sleep(45);
          const back = document.querySelector("#modalBack"); if (back && back.classList.contains("show")) { history.back(); await sleep(120); } }
      });
      await p.waitForTimeout(350);
      const after = await p.evaluate(() => { const s = document.querySelector("section.view.active"); return { stillThere: !!s && !!s.textContent.trim().length, undef: /undefined|NaN|\[object Object\]/.test(s ? s.textContent : "") }; });
      chk(after.stillThere && !after.undef, where + ": survives every control on it being used", JSON.stringify(after));
    }
    // the two sheets, a player card, a badge bubble, a rival pin, and a refresh
    where = tag + " sheets";
    for (const btn of ["#barMenu", "#barYou"]) { await p.click(btn); await p.waitForTimeout(500); await p.evaluate(() => history.back()); await p.waitForTimeout(400); }
    where = tag + " player card";
    await p.evaluate(() => location.hash = "#profile/1255976"); await p.waitForTimeout(900);
    await p.evaluate(() => { const c = document.querySelector(".pcard[data-el]"); c && c.click(); }); await p.waitForTimeout(600);
    chk(await p.evaluate(() => !!document.querySelector(".pphead")), where + ": a player card opens his page");
    await p.evaluate(() => history.back()); await p.waitForTimeout(400);
    where = tag + " rivals";
    // the settings walk above blanks every field and saves, which clears the
    // reader's own team — put it back before asking about their rivals
    await p.evaluate(() => { try { localStorage.setItem("go12.me", "1255976"); } catch (e) {} });
    await p.evaluate(() => location.reload()); await p.waitForTimeout(1600);
    await p.evaluate(() => location.hash = "#profile/130740"); await p.waitForTimeout(900);
    await p.evaluate(() => { const b = document.querySelector("#rvToggle"); b && b.click(); }); await p.waitForTimeout(400);
    await p.evaluate(() => location.hash = "#profile/1255976"); await p.waitForTimeout(800);
    chk(await p.evaluate(() => !!document.querySelector(".rvtbl")), where + ": pinning one draws the rivals table");
    await p.evaluate(() => { try { localStorage.removeItem("go12.rivals"); } catch (e) {} });
    where = tag + " back out";
    for (let i = 0; i < 6; i++) { await p.evaluate(() => history.back()); await p.waitForTimeout(220); }
    chk(await p.evaluate(() => !document.body.classList.contains("locked") && !!document.querySelector("section.view.active")), where + ": walking back leaves a live page, unlocked");
    chk(errs.length === 0, tag + ": nothing the console calls an error", errs.slice(0, 6).join(" | "));
    await ctx.close();
  }
  await b.close(); srv.close();
  console.log("  (player photographs missing by design: " + photo404 + " requests)");
  console.log(fails ? "FAILS: " + fails : "ALL OK");
})();
