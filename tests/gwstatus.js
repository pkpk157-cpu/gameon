const GOENV = require("./lib/env.js");
/* The drawer's Gameweek status page: every gameweek, every milestone, green
   for done and red for not yet. The fixture stages a season with one gameweek
   in each state so the page cannot pass by accident on a quiet week. */
const { chromium } = require("playwright-core");
const fs = require("fs"), http = require("http"), path = require("path");
const APP = GOENV.APP;
const T = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".svg":"image/svg+xml" };

const raw = JSON.parse(fs.readFileSync(GOENV.FIXTURES + "/now.json", "utf8"));
const ds = raw.dataset;
// GW1 fully done, GW2 final but squads not yet stored, GW3 played and waiting
// on bonus, GW4 kicked off, GW5+ untouched.
delete ds.picksFinal["2"];
const fx = ds.gwFixtures;
// a match cannot start before its deadline, so the fixture moves both
ds.bootstrap.events.forEach((e) => { if (e.id === 4) e.deadline_time = "2026-09-06T12:30:00Z"; });
fx["4"].forEach((f, i) => { f[2] = i === 0 ? 1 : 0; f[3] = 0; f[8] = 0; });
ds.bootstrap.events.forEach((e) => {
  if (e.id <= 2) { e.finished = true; e.data_checked = true; e.is_current = false; }
  if (e.id === 3) { e.finished = false; e.data_checked = false; e.is_current = true; }
  if (e.id >= 4) { e.finished = false; e.data_checked = false; e.is_current = false; e.is_next = e.id === 4; }
});
// GW3's three match days each sit at a different stage, so the day list has
// to tell them apart rather than inheriting the gameweek's single verdict
fx["3"].forEach((f) => {
  const day = new Date(f[7]).getUTCDate();
  if (day === 4) { f[2] = 1; f[3] = 1; f[8] = 1; }        // Friday: bonus confirmed
  else if (day === 5) { f[2] = 1; f[3] = 0; f[8] = 1; }   // Saturday: full time, no bonus
  else { f[2] = 1; f[3] = 0; f[8] = 0; }                  // Sunday: still being played
});
const DAYS = [
  { on: true, pill: "Confirmed", n: 1 },
  { on: false, pill: "Awaiting bonus", n: 7 },
  { on: false, pill: "In play", n: 2 }
];
// what we have watched happen before: GW2 in full, GW3 only as far as the
// whistle, so the page has to report the first and predict the rest
ds.gwStamps = {
  2: { ft: "2026-08-31T21:01:03Z", bonus: "2026-09-01T08:20:59Z",
       final: "2026-09-01T13:01:32Z", squads: "2026-09-01T13:01:32Z" },
  3: { ft: "2026-09-06T17:40:35Z" }
};
fs.writeFileSync("/tmp/gwstatus.json", JSON.stringify(raw));
const EXPECT = {
  1: [1,1,1,1,1,1], 2: [1,1,1,1,1,0], 3: [1,1,0,0,0,0], 4: [1,1,0,0,0,0], 5: [0,0,0,0,0,0]
};

const srv = http.createServer((q, r) => {
  let u = q.url.split("?")[0]; if (u === "/") u = "/index.html";
  const f = u === "/data.json" ? "/tmp/gwstatus.json" : path.join(APP, u);
  fs.readFile(f, (e, b) => {
    if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { "content-type": T[path.extname(f)] || "text/plain", "cache-control": "no-store" }); r.end(b);
  });
});
let fails = 0;
const chk = (n, ok, d) => { if (!ok) { fails++; console.log("   FAIL " + n + (d ? " — " + d : "")); } else console.log("   ok   " + n); };

(async () => {
  await new Promise((r) => srv.listen(9964, r));
  const b = await chromium.launch({ executablePath: GOENV.CHROME });
  for (const width of [390, 320]) {
    console.log("-- " + width + "px");
    const ctx = await b.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2,
      isMobile: true, hasTouch: true, serviceWorkers: "block" });
    const p = await ctx.newPage();
    const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.goto("http://localhost:9964/index.html#classic", { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(1500);

    // reached from the drawer, in its own section under Appearance
    await p.evaluate(() => document.querySelector("#barMenu").click());
    await p.waitForTimeout(500);
    const menu = await p.evaluate(() => ({
      sections: [...document.querySelectorAll("#menuBody .menu .lab-sm")].map((x) => x.textContent),
      item: !!document.querySelector("#pfGwStatus"),
      label: (document.querySelector("#pfGwStatus") || {}).textContent || "",
      icon: !!document.querySelector("#pfGwStatus svg")
    }));
    chk("Appearance is the last headed group; Gameweek status sits unheaded beneath it",
        menu.sections.join(" | ").endsWith("Appearance"), menu.sections.join(" | "));
    chk("the item is there, labelled, with an icon", menu.item && /Gameweek status/.test(menu.label) && menu.icon, menu.label);
    await p.evaluate(() => document.querySelector("#pfGwStatus").click());
    await p.waitForTimeout(800);
    chk("it opens its own page", await p.evaluate(() => location.hash) === "#gwstatus", await p.evaluate(() => location.hash));
    chk("the drawer closed behind it", await p.evaluate(() => !document.querySelector("#menuBack").classList.contains("show")));
    chk("the bar names the page", /Gameweek status/.test(await p.evaluate(() => document.querySelector("#barTitle, .bar h1, .bartitle").textContent)));

    const read = async () => p.evaluate(() => {
      const v = document.querySelector('[data-view="gwstatus"]');
      return {
        head: (v.querySelector(".card .hd h3") || {}).textContent || "",
        sub: (v.querySelector(".card .hd .sub") || {}).textContent || "",
        steps: [...v.querySelectorAll(".gwstep")].map((s) => ({
          lab: s.querySelector(".gwlab").childNodes[0].textContent,
          on: s.classList.contains("on"),
          yn: s.querySelector(".gwyn").textContent,
          when: (s.querySelector(".gwwhen") || {}).textContent || "",
          est: !!(s.querySelector(".gwwhen") || {}).classList &&
               s.querySelector(".gwwhen").classList.contains("est") })),
        tables: v.querySelectorAll("table").length,
        cards: v.querySelectorAll(".card").length,
        dsub: [...v.querySelectorAll(".card .hd .sub")].map((x) => x.textContent),
        days: [...v.querySelectorAll(".gwday")].map((d) => ({
          name: d.querySelector(".gwdn b").textContent,
          meta: d.querySelector(".gwdm").textContent,
          pill: d.querySelector(".gwpill").textContent,
          on: d.classList.contains("on"),
          pillW: Math.round(d.querySelector(".gwpill").getBoundingClientRect().width),
          rowR: Math.round(d.getBoundingClientRect().right),
          pillR: Math.round(d.querySelector(".gwpill").getBoundingClientRect().right)
        })),
        sx: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
        note: (v.querySelector(".gwnote") || {}).textContent || ""
      };
    });
    const s = await read();
    chk("the gameweek in flight leads", /Gameweek 3|GW3/.test(s.head) || s.head.indexOf("3") >= 0, s.head);
    chk("and says how many steps are done", /2 of 6 done/.test(s.sub), s.sub);
    chk("six steps, spelled out", s.steps.length === 6, String(s.steps.length));
    chk("the leading card matches the data",
        s.steps.map((x) => x.on ? 1 : 0).join("") === EXPECT[3].join(""),
        s.steps.map((x) => x.lab + "=" + x.on).join(", "));
    chk("each step says Done or Not yet",
        s.steps.every((x) => x.yn === (x.on ? "Done" : "Not yet")), s.steps.map((x) => x.yn).join(","));
    chk("every step carries a time", s.steps.every((x) => x.when), s.steps.map((x) => x.when).join(" | "));
    chk("FPL's own times are not marked as guesses",
        !s.steps[0].est && !s.steps[1].est, s.steps.slice(0, 2).map((x) => x.when).join(" | "));
    // the page prints times in the viewer's own locale and zone, so the
    // expected instants are formatted by the same browser rather than guessed
    const want = await p.evaluate((isos) => isos.map((i) => new Date(i).toLocaleString(undefined,
      { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })),
      ["2026-09-04T17:30:00Z", "2026-09-04T19:00:00Z", "2026-09-06T17:40:35Z",
       "2026-09-07T08:20:59Z", "2026-09-07T13:01:32Z", "2026-09-07T13:01:32Z",
       "2026-09-06T17:30:00Z"]);
    chk("the deadline is FPL's published one", s.steps[0].when === want[0], s.steps[0].when + " vs " + want[0]);
    chk("the first kick-off is FPL's published one", s.steps[1].when === want[1], s.steps[1].when + " vs " + want[1]);
    // GW3 carries a full-time stamp but Sunday is still being played, so the
    // stamp must be ignored rather than dated beside a step reading "not yet"
    chk("a stamp is ignored while its step is not done",
        s.steps[2].est && s.steps[2].when !== "Expected " + want[2], s.steps[2].when);
    chk("full time falls two hours after the last kick-off",
        s.steps[2].when === "Expected " + want[6], s.steps[2].when + " vs " + want[6]);
    chk("a step still to come is marked Expected",
        s.steps.slice(2).every((x) => x.est && /^Expected /.test(x.when)),
        s.steps.slice(2).map((x) => x.when).join(" | "));
    // a gameweek we watched all the way through reports, never predicts
    const past = await p.evaluate(() => {
      const ds = window.GO_STORE.dataset();
      const row = window.GO_COMPUTE.gwStatus(ds).rows.find((r) => r.gw === 2);
      const t = window.GO_COMPUTE.gwTimes(ds, row);
      return Object.keys(t).map((k) => k + ":" + t[k].kind).join(",");
    });
    chk("a gameweek we watched reports its times rather than guessing them",
        past.indexOf("ft:recorded,bonus:recorded,final:recorded") >= 0, past);
    // GW2's squads were never stored and no other gameweek has stored any, so
    // there is nothing to report and nothing to predict from: say nothing
    chk("with nothing watched and nothing reached, no time is invented",
        /squads:null/.test(past), past);
    chk("bonus is expected the morning after, at the hour we watched before",
        s.steps[3].when === "Expected " + want[3], s.steps[3].when + " vs " + want[3]);
    chk("finalising is expected that afternoon",
        s.steps[4].when === "Expected " + want[4], s.steps[4].when + " vs " + want[4]);
    chk("squads follow finalising", s.steps[5].when === "Expected " + want[5], s.steps[5].when);
    chk("only the current gameweek is shown, no season table", s.cards === 2 && s.tables === 0,
        s.cards + " cards, " + s.tables + " tables");
    chk("the gameweek is split into its match days", s.days.length === 3, String(s.days.length));
    // the wording follows the viewer's locale, so assert the parts, not an order
    chk("the days are named and dated in order",
        s.days.every((d, i) => new RegExp(["Friday", "Saturday", "Sunday"][i]).test(d.name) &&
          new RegExp("\\b" + (4 + i) + "\\b").test(d.name) && /Sep/.test(d.name)),
        s.days.map((d) => d.name).join(" | "));
    chk("each day carries its own stage, not the gameweek's",
        s.days.map((d) => d.pill).join(",") === DAYS.map((d) => d.pill).join(","),
        s.days.map((d) => d.pill).join(","));
    chk("only a confirmed day reads green",
        s.days.map((d) => d.on ? 1 : 0).join("") === DAYS.map((d) => d.on ? 1 : 0).join(""),
        s.days.map((d) => d.name + "=" + d.on).join(", "));
    chk("each day counts its matches",
        s.days.every((d, i) => new RegExp("^" + DAYS[i].n + " match(es)?").test(d.meta)),
        s.days.map((d) => d.meta).join(" | "));
    chk("a day in play says how far through it is", /at full time/.test(s.days[2].meta), s.days[2].meta);
    chk("the day card counts what is confirmed", /1 of 3 confirmed/.test(s.dsub.join(" ")), s.dsub.join(" "));
    chk("no pill overruns its row", s.days.every((d) => d.pillR <= d.rowR),
        s.days.map((d) => d.pillR + "/" + d.rowR).join(" "));
    chk("the page points at the information button", /Tap .* for what each step/.test(s.note), s.note);

    // the explanation itself lives behind the button, not on the page
    const info = await p.evaluate(() => {
      document.querySelector("#gwWhat").click();
      const m = document.querySelector("#modalBack");
      return {
        open: m.classList.contains("show"),
        title: document.querySelector("#modalTitle").textContent,
        heads: [...document.querySelectorAll("#modalBody .gwh4")].map((x) => x.textContent),
        terms: [...document.querySelectorAll("#modalBody .gwdl dt")].map((x) => x.textContent),
        defs: [...document.querySelectorAll("#modalBody .gwdl dd")].map((x) => x.textContent),
        sx: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth
      };
    });
    chk("the information button opens an explanation", info.open && /What these mean/.test(info.title),
        info.title);
    chk("it covers the steps, the day badges and the times",
        info.heads.length === 3 && /step by step/.test(info.heads[0]) &&
        /badge/.test(info.heads[1]) && /times/.test(info.heads[2]), info.heads.join(" | "));
    const NEEDED = ["Deadline passed", "First match kicked off", "Every match at full time",
                    "Bonus confirmed", "Gameweek finalised by FPL", "Settled squads stored here"];
    chk("every one of the six steps is explained",
        NEEDED.every((k) => info.terms.includes(k)),
        NEEDED.filter((k) => !info.terms.includes(k)).join(" | ") || "all present");
    chk("all four day badges are explained",
        ["Confirmed", "Awaiting bonus", "In play", "To come"].every((k) => info.terms.includes(k)),
        info.terms.join(" | "));
    chk("it says which times are guesses and what they rest on",
        /worked out from the 1 gameweek/.test(info.defs.join(" ")),
        info.defs.filter((d) => /worked out/.test(d)).join(" "));
    chk("it explains the provisional bonus this app shows",
        /provisional bonus/.test(info.defs.join(" ")));
    chk("the explanation does not scroll sideways", info.sx <= info.cw, info.sx + ">" + info.cw);
    await p.evaluate(() => document.querySelector("#modalBack").click());
    await p.waitForTimeout(300);
    chk("it closes again", await p.evaluate(() => !document.querySelector("#modalBack").classList.contains("show")));
    chk("no sideways scroll", s.sx <= s.cw, s.sx + ">" + s.cw);
    // the colours have to be distinguishable, not just different classes
    const ink = await p.evaluate(() => {
      const c = (sel) => getComputedStyle(document.querySelector(sel)).color;
      return { on: c(".gwstep.on .gwyn"), off: c(".gwstep:not(.on) .gwyn") };
    });
    chk("green and red are different colours", ink.on !== ink.off, JSON.stringify(ink));

    if (width === 390) {
      await p.screenshot({ path: "gwstatus.png", fullPage: false });
      await p.evaluate(() => document.querySelector("#gwWhat").click());
      await p.waitForTimeout(400);
      await p.screenshot({ path: "gwhelp.png", fullPage: false });
      await p.evaluate(() => document.querySelector("#modalBack").click());
      await p.waitForTimeout(300);
      await p.emulateMedia({ colorScheme: "dark" });
      await p.waitForTimeout(300);
      await p.screenshot({ path: "gwstatus-dark.png", fullPage: false });
      await p.emulateMedia({ colorScheme: "light" });
    }
    // back returns where you came from
    await p.evaluate(() => document.querySelector("#barBack").click());
    await p.waitForTimeout(600);
    chk("back leaves the page", await p.evaluate(() => location.hash) !== "#gwstatus", await p.evaluate(() => location.hash));

    // a season whose calendar has not been published yet must explain itself
    // rather than drawing an empty table that reads as everything failed
    await p.evaluate(() => {
      const st = window.GO_STORE;
      const d = st.dataset();
      const bare = Object.assign({}, d, { bootstrap: { events: [] }, gwFixtures: {} });
      window.GO_COMPUTE.gwStatus(bare);
      const host = document.querySelector('[data-view="gwstatus"]');
      host.dataset.probe = "1";
      st.__probe = bare;
    });
    const bare = await p.evaluate(() => {
      const out = window.GO_COMPUTE.gwStatus(window.GO_STORE.__probe);
      return { rows: out ? out.rows.length : -1 };
    });
    chk("an empty calendar yields no rows rather than throwing", bare.rows === 0, String(bare.rows));
    chk("no JS errors", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  await b.close(); srv.close();
  console.log(fails ? "FAILS: " + fails : "ALL OK");
  process.exit(fails ? 1 : 0);
})();
