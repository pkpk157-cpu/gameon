const GOENV = require("./lib/env.js");
/* The profile sheet's own errands. Comparing yourself with someone was a second
   row that only ever meant Head to head with your name already in the first
   box, so there is one row now and it does that. The remaining row needs no
   heading over it, and nobody is ever compared with himself. */
const { chromium } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP, PORT = 8791, ME = 1255976;
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".svg":"image/svg+xml", ".webp":"image/webp" };
const srv = http.createServer((q, r) => { let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  fs.readFile(path.join(APP, u), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { "content-type": T[path.extname(u)] || "text/plain" }); r.end(b); }); });
let fails = 0; const chk = (ok, m, x) => { console.log((ok ? "  ok   " : "  FAIL ") + m + (x ? "  " + x : "")); if (!ok) fails++; };

const sheet = (p) => p.evaluate(() => {
  const body = document.querySelector("#youBody");
  return {
    labels: [...body.querySelectorAll(".lab-sm")].map(e => e.textContent),
    items: [...body.querySelectorAll(".menu > button")].map(e => ({ id: e.id, t: e.textContent.trim() })),
    text: body.textContent
  };
});
const sides = (p) => p.evaluate(() => ({
  a: (document.querySelector("#cmpA") || {}).value,
  b: (document.querySelector("#cmpB") || {}).value,
  view: location.hash
}));

(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  let myName = null;

  for (const w of [390, 768]) {
    const ctx = await b.newContext({ viewport: { width: w, height: 820 }, deviceScaleFactor: 2, isMobile: w < 560, hasTouch: true, serviceWorkers: "block", reducedMotion: "reduce" });
    await ctx.addInitScript((me) => { try { localStorage.setItem("go12.me", JSON.stringify(me)); localStorage.removeItem("go12.rivals"); } catch (e) {} }, ME);
    const p = await ctx.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
    await p.goto("http://127.0.0.1:" + PORT + "/index.html#classic", { waitUntil: "domcontentloaded" });
    await p.waitForSelector("table.t tbody tr", { timeout: 15000 });

    await p.click("#barYou"); await p.waitForTimeout(400);
    let s = await sheet(p);
    chk(!/Compare me with someone/i.test(s.text), w + ": no second compare row in the sheet");
    chk(!s.items.some(i => i.id === "pfMyCompare"), w + ": ...and nothing left wired to it");
    chk(s.labels.indexOf("You") === -1, w + ": no You heading", s.labels.join(" | "));
    chk(s.items.some(i => i.id === "pfMine" && /My profile/i.test(i.t)), w + ": My profile is still there and still says so");
    chk(s.items.some(i => i.id === "pfCompare" && /Head to head/i.test(i.t)), w + ": Head to head is still there");
    chk(s.labels.join("|") === "League insights|League|Players", w + ": the headings left are the ones over more than one row", s.labels.join(" | "));

    // my own name, as the sheet prints it, to check against the compare box
    myName = await p.evaluate(() => (document.querySelector("#youBody .profile-hd .who") || {}).textContent);
    chk(!!myName, w + ": the sheet knows who I am", myName);

    // Head to head from the sheet: I am the first side
    await p.click("#pfCompare"); await p.waitForTimeout(900);
    let v = await sides(p);
    chk(/^#?compare/.test(v.view.replace("#", "")), w + ": Head to head lands on the compare page", v.view);
    chk(v.a && v.a.indexOf(myName) === 0, w + ": my team is in the first box", v.a + "  (me: " + myName + ")");
    chk(v.b && v.b !== v.a, w + ": the second box is somebody else", v.b);

    // change the first side by hand, walk away, come back through the sheet:
    // the menu entry is an errand, so it starts from me again
    const keptB = v.b;
    const other = await p.evaluate(() => {
      const opts = [...document.querySelectorAll("#mgrOpts option")].map(o => o.value);
      const cur = document.querySelector("#cmpA").value;
      return opts.filter(o => o !== cur && o !== document.querySelector("#cmpB").value)[0];
    });
    await p.evaluate((o) => {
      const el = document.querySelector("#cmpA");
      el.value = o; el.dispatchEvent(new Event("change", { bubbles: true }));
    }, other);
    await p.waitForTimeout(500);
    v = await sides(p);
    chk(v.a === other, w + ": the first box takes a name typed into it", v.a);
    await p.evaluate(() => { location.hash = "classic"; });
    await p.waitForTimeout(600);
    await p.click("#barYou"); await p.waitForTimeout(400);
    await p.click("#pfCompare"); await p.waitForTimeout(900);
    v = await sides(p);
    chk(v.a.indexOf(myName) === 0, w + ": coming back through the sheet puts me first again", v.a);
    chk(v.b === keptB, w + ": ...and leaves whoever was in the second box alone", v.b + " (was " + keptB + ")");

    // set the second box to me and come back: the page must not sit me
    // opposite myself, so it finds somebody else for the second box
    await p.evaluate((n) => {
      const el = document.querySelector("#cmpB");
      el.value = n; el.dispatchEvent(new Event("change", { bubbles: true }));
    }, v.a);
    await p.waitForTimeout(500);
    await p.evaluate(() => { location.hash = "classic"; });
    await p.waitForTimeout(600);
    await p.click("#barYou"); await p.waitForTimeout(400);
    await p.click("#pfCompare"); await p.waitForTimeout(900);
    v = await sides(p);
    chk(v.a.indexOf(myName) === 0 && v.b && v.b !== v.a,
      w + ": me in both boxes is not a comparison — the second finds somebody else", v.a + " vs " + v.b);

    // a rival's own compare button still names both sides from that page
    await p.evaluate(() => { location.hash = "classic"; });
    await p.waitForTimeout(500);
    const pick = await p.evaluate(() => {
      const cells = [...document.querySelectorAll("table.t tbody [data-entry]")];
      const c = cells.filter(x => !x.closest("tr").classList.contains("me"))[0];
      return c ? +c.getAttribute("data-entry") : null;
    });
    chk(!!pick, w + ": found somebody else's row to open", String(pick));
    if (pick) {
      await p.evaluate((id) => { location.hash = "profile/" + id; }, pick);
      await p.waitForTimeout(900);
      const has = await p.evaluate(() => !!document.querySelector("#cmpMe"));
      if (has) {
        await p.click("#cmpMe"); await p.waitForTimeout(900);
        v = await sides(p);
        chk(v.a.indexOf(myName) === 0 && v.b && v.b !== v.a, w + ": a rival's compare button still fills both sides", v.a + " vs " + v.b);
      } else chk(true, w + ": that profile has no compare button to press");
    }

    // and the two sides are never the same manager, however you got here
    await p.evaluate(() => { location.hash = "classic"; });
    await p.waitForTimeout(400);
    await p.evaluate(() => { location.hash = "compare"; });
    await p.waitForTimeout(900);
    v = await sides(p);
    chk(v.a !== v.b, w + ": nobody is compared with himself", v.a + " vs " + v.b);

    chk(errs.length === 0, w + ": no page errors", errs.join(" | "));
    await ctx.close();
  }

  // somebody who has not said who he is: the sheet has no My profile row, and
  // Head to head still opens on two real managers
  const ctx = await b.newContext({ viewport: { width: 390, height: 820 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: "block", reducedMotion: "reduce" });
  await ctx.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.goto("http://127.0.0.1:" + PORT + "/index.html#classic", { waitUntil: "domcontentloaded" });
  await p.waitForSelector("table.t tbody tr", { timeout: 15000 });
  await p.click("#barYou"); await p.waitForTimeout(400);
  const s = await sheet(p);
  chk(!s.items.some(i => i.id === "pfMine"), "nameless: no My profile row");
  chk(!/Compare me with someone/i.test(s.text), "nameless: no second compare row either");
  await p.click("#pfCompare"); await p.waitForTimeout(900);
  const v = await sides(p);
  chk(!!v.a && !!v.b && v.a !== v.b, "nameless: Head to head still opens on two managers", v.a + " vs " + v.b);
  chk(errs.length === 0, "nameless: no page errors", errs.join(" | "));
  await ctx.close();

  await b.close(); srv.close();
  console.log(fails ? fails + " FAILURES" : "all ok");
  process.exit(fails ? 1 : 0);
})();
