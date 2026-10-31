const GOENV = require("./lib/env.js");
/* The classic standings read while the table moves. FPL serves them fifty to a
   page; during a live gameweek a manager can climb across a page edge between
   two page reads, so he is missed and the one he pushed down is read twice.
   The updater must notice the repeat and read again; if the table never holds
   still, publish every manager exactly once and carry the one it missed from
   the last roster. Run against a stand-in for FPL's standings pages. */
const fs = require("fs"), path = require("path");
const APP = GOENV.APP;
let fails = 0; const chk = (ok, m, x) => { console.log((ok ? "  ok   " : "  FAIL ") + m + (x ? "  " + x : "")); if (!ok) fails++; };
const { classicOf } = require(path.join(APP, "scripts/fetch-data.js"));
const roster = JSON.parse(fs.readFileSync(path.join(APP, "data.json"), "utf8")).dataset.managers.map((m) => Object.assign({}, m));
const N = roster.length, ids = roster.map((m) => m.id);
const row = (m) => ({ entry: m.id, entry_name: m.entryName, player_name: m.playerName, rank: 0, last_rank: 0, total: m.total, event_total: m.eventTotal });

// mode "still": the table holds still. "once": it moves during the first read
// only. "always": it moves during every read. A move: the man 51st climbs to
// 50th after page 1 was read, so page 2 starts with the man who was 50th.
let mode = "still", reads = 0, pageCalls = 0;
global.fetch = async (url) => {
  const m = /page_standings=(\d+)/.exec(String(url)); const page = m ? +m[1] : 1;
  pageCalls++; if (page === 1) reads++;
  const moving = mode === "always" || (mode === "once" && reads === 1);
  let order = ids.slice();
  if (moving && page >= 2) { const t = order[49]; order[49] = order[50]; order[50] = t; }
  const res = order.slice((page - 1) * 50, page * 50).map((id) => row(roster[ids.indexOf(id)]));
  return new Response(JSON.stringify({ league: { name: "Game On" }, standings: { results: res, has_next: page * 50 < N } }), { status: 200 });
};
const pagesPerRead = Math.ceil(N / 50);
const uniq = (g) => new Set(g.managers.map((m) => m.id)).size;

(async () => {
  console.log("-- the table holds still");
  let g = await classicOf(1, roster, 1);
  chk(g.managers.length === N && uniq(g) === N && reads === 1, "one read, every manager once", g.managers.length + " rows, " + uniq(g) + " managers, " + reads + " read(s)");

  console.log("-- it moves during the first read only");
  mode = "once"; reads = 0;
  g = await classicOf(1, roster, 1);
  chk(reads === 2 && g.managers.length === N && uniq(g) === N, "the repeat is noticed and the table read again: every manager once", reads + " reads, " + g.managers.length + " rows, " + uniq(g) + " managers");
  chk(g.managers.some((m) => m.id === ids[50]) && g.managers.some((m) => m.id === ids[49]), "the man who climbed and the man he passed are both there");

  console.log("-- it never holds still");
  mode = "always"; reads = 0;
  g = await classicOf(1, roster, 1);
  const missedId = ids[50];
  const carried = g.managers.find((m) => m.id === missedId);
  chk(reads === 3, "read three times, no more", reads + " reads");
  chk(g.managers.length === N && uniq(g) === N, "still every manager exactly once", g.managers.length + " rows, " + uniq(g) + " managers");
  chk(!!carried && carried.total === roster[50].total, "the one it missed is carried from the last roster", JSON.stringify(carried && { id: carried.id, total: carried.total }));

  console.log("-- it never holds still and there is no last roster");
  reads = 0;
  g = await classicOf(1, null, 1);
  chk(g.managers.length === N - 1 && uniq(g) === N - 1, "each manager read is kept once; nobody is guessed at", g.managers.length + " rows");

  console.log(fails ? "\nFAILS: " + fails : "\na table that moves while it is read is never published with a repeat");
  process.exit(fails ? 1 : 0);
})();
