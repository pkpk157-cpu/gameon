const GOENV = require("./lib/env.js");
/* Where does the app hand out different money to managers who are level? */
const fs = require("fs"), vm = require("vm");
const APP = GOENV.APP;
const s = { window: {}, console, localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
            document: { documentElement: { setAttribute() {} } } };
vm.createContext(s);
vm.runInContext(fs.readFileSync(APP + "/config.js", "utf8"), s);
s.window.GO_STORE = { config: () => s.window.GO_DEFAULT_CONFIG, overrides: () => ({}) };
vm.runInContext(fs.readFileSync(APP + "/compute.js", "utf8"), s);
const C = s.window.GO_COMPUTE, CFG = s.window.GO_DEFAULT_CONFIG;

const file = process.argv[2] || APP + "/data.json";
const ds = JSON.parse(fs.readFileSync(file, "utf8")).dataset;
console.log("dataset:", file.split("/").pop(), "-", ds.managers.length, "managers\n");

// ---- Classic: ties that straddle a prize boundary --------------------------
const cl = C.classic(ds);
let groups = [], cur = [cl[0]];
for (let i = 1; i < cl.length; i++) {
  if (cl[i].total === cur[0].total) cur.push(cl[i]);
  else { if (cur.length > 1) groups.push(cur); cur = [cl[i]]; }
}
if (cur.length > 1) groups.push(cur);

let split = 0;
console.log("CLASSIC — managers level on points but paid differently:");
groups.forEach((g) => {
  const prizes = g.map((r) => r.prize || 0);
  if (new Set(prizes).size > 1) {
    split++;
    if (split <= 5) {
      console.log("  " + g[0].total + " pts, ranks " + g[0].computedRank + "-" + g[g.length - 1].computedRank +
        ": " + g.map((r) => r.entryName.slice(0, 18) + " Rs" + (r.prize || 0)).join("  |  "));
    }
  }
});
console.log("  " + (split ? split + " tie group(s) straddle a prize boundary" : "none right now") +
            "; " + groups.length + " tie groups in total, largest " +
            (groups.length ? Math.max(...groups.map((g) => g.length)) : 0) + " managers\n");

// what a tie at the very top would pay
const P = CFG.classicPrizes;
console.log("  prize steps that ties could straddle: " +
  Object.keys(P.exact).slice(0, 6).map((k) => "#" + k + "=Rs" + P.exact[k]).join(", "));

// ---- Monthly ---------------------------------------------------------------
console.log("\nMONTHLY — same question, per month:");
const mo = C.monthly(ds);
let mSplit = 0;
mo.forEach((m) => {
  const rows = (m.rows || []).filter((r) => r.total != null);
  if (!rows.length) return;
  const top = rows[0].total;
  const level = rows.filter((r) => r.total === top);
  if (level.length > 1) {
    mSplit++;
    console.log("  " + m.key + ": " + level.length + " managers level on " + top +
      " — prizes " + JSON.stringify(level.map((r) => r.prize != null ? r.prize : "?")));
  }
});
if (!mSplit) console.log("  no month currently has a tied leader");

// ---- LMS: elimination boundary --------------------------------------------
console.log("\nLAST MANAGER STANDING — ties at the elimination cut:");
const lms = C.lms(ds);
let cuts = 0;
(lms.perGw || []).forEach((g) => {
  const rows = (g.rows || []).slice().sort((a, b) => a.score - b.score);
  if (rows.length < 2) return;
  const outIds = new Set(Object.keys(lms.eliminatedAt || {}).filter((id) => lms.eliminatedAt[id] === g.gw).map(Number));
  if (!outIds.size) return;
  const worstOut = Math.max(...rows.filter((r) => outIds.has(r.id)).map((r) => r.score));
  const survivedOnSame = rows.filter((r) => !outIds.has(r.id) && r.score === worstOut);
  if (survivedOnSame.length) {
    cuts++;
    console.log("  GW" + g.gw + ": " + outIds.size + " eliminated on " + worstOut +
      " pts, but " + survivedOnSame.length + " survived on the same score");
  }
});
if (!cuts) console.log("  no elimination so far split a tied score");

// ---- Pyramid ---------------------------------------------------------------
console.log("\nPYRAMID — tied at a division's prize line:");
const py = C.pyramid(ds);
let pTies = 0;
(py.seasons || []).forEach((se) => {
  (se.divisions || []).forEach((d) => {
    const rows = (d.rows || []).filter((r) => r.total != null);
    for (let i = 1; i < rows.length; i++) {
      if (rows[i].total === rows[i - 1].total && (rows[i].prize || 0) !== (rows[i - 1].prize || 0)) {
        pTies++;
        if (pTies <= 3) console.log("  " + se.key + "/" + d.name + ": level on " + rows[i].total +
          " but Rs" + (rows[i - 1].prize || 0) + " vs Rs" + (rows[i].prize || 0));
      }
    }
  });
});
if (!pTies) console.log("  none right now");

// ---- H2H group tables ------------------------------------------------------
console.log("\nUCL GROUPS — level on points at a qualification place:");
const h = C.h2h(ds);
let gTies = 0;
const q = (CFG.h2h.qualify || {}).uclPerGroup || 2;
(h.groups || []).forEach((g) => {
  const t = g.table || [];
  if (t.length > q && t[q - 1] && t[q] && t[q - 1].pts === t[q].pts) {
    gTies++;
    if (gTies <= 4) console.log("  " + g.name + ": " + t[q - 1].name.slice(0, 16) + " qualifies and " +
      t[q].name.slice(0, 16) + " does not, both on " + t[q].pts + " pts");
  }
});
console.log("  " + (gTies ? gTies + " group(s) currently decided by a tiebreak" : "none right now"));
