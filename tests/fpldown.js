const GOENV = require("./lib/env.js");
/* FPL down, not just busy. Around a deadline FPL answers 503 to everything for
   an hour or more. The updater must notice within a handful of calls, keep the
   data already live, end the run green and quickly, and publish nothing. A
   404 is FPL answering, and never counts towards that. Run against a stand-in
   for FPL, with the waits between tries shortened. */
const fs = require("fs"), os = require("os"), path = require("path");
const { spawnSync } = require("child_process");
const APP = GOENV.APP;
let fails = 0; const chk = (ok, m, x) => { console.log((ok ? "  ok   " : "  FAIL ") + m + (x ? "  " + x : "")); if (!ok) fails++; };

const live = JSON.parse(fs.readFileSync(path.join(APP, "data.json"), "utf8"));
const events = (live.dataset.bootstrap && live.dataset.bootstrap.events) || [];
const STUB = `
const SC = process.env.FPLSC, EV = JSON.parse(process.env.FPLEV);
let n = 0, hist = 0;
const _st = global.setTimeout;
global.setTimeout = (f, ms, ...a) => _st(f, ms >= 100 && ms < 30000 ? 1 : ms, ...a);
global.fetch = async (url) => {
  n++;
  const p = String(url).replace(/^https:\\/\\/fantasy\\.premierleague\\.com\\/api/, "");
  if (/\\/history\\//.test(p)) hist++;
  if (p === "/bootstrap-static/") return new Response(JSON.stringify({ events: EV }), { status: 200, headers: { "content-type": "application/json" } });
  if (SC === "notfound" && /\\/history\\//.test(p)) return new Response("{}", { status: 404 });
  return new Response("The game is being updated.", { status: 503 });
};
process.on("exit", () => require("fs").writeFileSync("calls.json", JSON.stringify({ n, hist })));
`;

function run(sc) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fpldown-"));
  fs.copyFileSync(path.join(APP, "data.json"), path.join(dir, "data.json"));
  fs.writeFileSync(path.join(dir, "stub.js"), STUB);
  const out = path.join(dir, "gh_output");
  const t0 = Date.now();
  const r = spawnSync(process.execPath, ["-r", path.join(dir, "stub.js"), path.join(APP, "scripts/fetch-data.js")],
    { cwd: dir, encoding: "utf8", timeout: 240000, env: Object.assign({}, process.env, { FPLSC: sc, FPLEV: JSON.stringify(events), GITHUB_OUTPUT: out }) });
  const res = { code: r.status, secs: (Date.now() - t0) / 1000, log: (r.stdout || "") + (r.stderr || ""),
    gh: fs.existsSync(out) ? fs.readFileSync(out, "utf8") : "",
    same: fs.readFileSync(path.join(dir, "data.json"), "utf8") === fs.readFileSync(path.join(APP, "data.json"), "utf8"),
    calls: fs.existsSync(path.join(dir, "calls.json")) ? JSON.parse(fs.readFileSync(path.join(dir, "calls.json"), "utf8")) : {} };
  fs.rmSync(dir, { recursive: true, force: true });
  return res;
}

const managers = (live.dataset.managers || []).length;
console.log("-- FPL down: everything but the bootstrap answers 503");
let r = run("down");
chk(r.code === 0, "the run ends green", "exit " + r.code + " " + r.log.split("\n").slice(-4).join(" | "));
chk(/skip=true/.test(r.gh) && /FPL is unavailable/.test(r.gh), "it says FPL is unavailable and skips publishing", r.gh.trim());
chk(/FPL is not answering: 6 calls in a row/.test(r.log), "it notices after six calls in a row", "");
chk(r.same, "the data already live is kept, byte for byte");
chk(r.calls.hist > 0 && r.calls.hist <= 6 * 7 + 6, "it stops asking: " + r.calls.hist + " history calls, not " + managers * 7, JSON.stringify(r.calls));
chk(!/histories done/.test(r.log) && !/Wrote data\.json/.test(r.log), "nothing after the histories runs, nothing is written");
chk(r.secs < 60, "and quickly", r.secs.toFixed(1) + "s");

console.log("-- FPL answering 404 to every history (it is up, the pages are not there)");
r = run("notfound");
chk(/histories done, failed /.test(r.log), "a 404 never counts as FPL down: every history is asked for", (r.log.match(/histories done[^\n]*/) || [""])[0]);
chk(r.calls.hist >= managers, "each manager's history asked (" + r.calls.hist + " calls for " + managers + ")", JSON.stringify(r.calls));
chk(r.code === 0, "the run still ends green", "exit " + r.code);

console.log(fails ? "\nFAILS: " + fails : "\nFPL down stops the run at once and keeps what is live");
process.exit(fails ? 1 : 0);
