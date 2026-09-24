# Tests

Sixty browser suites that drive the real app in Chromium and check what it puts
on screen: that every table fits its card at every phone width, that the badges
agree with an independent recount, that no dataset we can imagine makes it
throw, that the Last Manager table is ordered the way the eliminations were
decided.

They are not unit tests. Each one serves the app over HTTP, opens it, taps
through it and measures the result, because that is where the bugs have been:
a column overflowing at 360px, a sticky header leaking a row through its
border, a panel whose `innerHTML` was written after the view had been replaced.

## Running them

```
bash tests/setup.sh                  # once per machine
bash tests/battery.sh bat.log 4      # all sixty, four at a time
bash tests/battery.sh bat.log 4 crests pltcrests   # just these two
```

`bat.log` gets one line per suite with the time it took, then a summary. A
suite passes when it exits 0 and prints no `FAIL` line. `bat.progress` fills in
as suites land, for watching a run that is still going.

The set is lopsided — six suites sweep whole matrices and take minutes, the
rest take seconds — so the runner starts the longest first, on the clock from
last time (`bat-times.txt`). An untimed suite sorts to the front, where a slow
newcomer costs nothing.

## What resolves where

`lib/env.js` finds the four things a suite needs, so none of them is written
into sixty files:

| | Default | Override |
|---|---|---|
| the app | the repo root above `tests/` | `GO_APP` |
| Chromium | newest build under `/opt/pw-browsers` or `PLAYWRIGHT_BROWSERS_PATH` | `GO_CHROME` |
| hostile datasets | `/tmp/states`, built by `mkstates.js` | `GO_STATES` |
| screenshots | a temp directory | `GO_OUT` |

The browser one matters most: it used to be written in with its build number,
so a container with a newer Chromium would have broken all sixty at once — in
an environment where a broken suite means a change goes out unchecked.

## The pieces

- `battery.sh` — the runner
- `bat-times.seed.txt` — how long each suite took here, so a machine that has
  never run them still starts the long ones first; each run then keeps its own
  `bat-times.txt`, which is not committed
- `lib/env.js` — path resolution
- `mkstates.js` — builds the 22 hostile datasets from `data.json`
- `audit/harness.js` — loads `compute.js` in a sandbox, for the suites that
  check arithmetic rather than pixels
- `fixture.js`, `now.json`, `vol.json` — datasets a few suites read
- `season/sim.js` — plays the real dataset forward to GW38, every gameweek at
  every phase (before the deadline, locked, live, full time, bonus, checked),
  with both halves' chips, a double and a blank gameweek, automatic
  substitutions and the standings of every league; `season/audit.js` runs
  every compute entry point over those states and checks the arithmetic
  (`season` in the battery), and `seasonsweep.js` opens every view on the
  pivotal ones with the page's clock set to that moment
- `agree.js` and `worth.js` — the rule that every page tells the same story:
  a figure shown in more than one place (a total, a rank, a gameweek's points,
  bench points, hits, a player's points, a squad's value and bank) is computed
  once in `compute.js` and read everywhere. They check each page's figure
  against that one source on the real data and through the simulated season
- everything else — one suite per file

## One figure, one source

A page never reads FPL's raw fields for a figure another page also shows. It
asks `compute.js`, which holds the one rule for it: `gwScore` for a manager's
points (net of hits, live-aware), `gwBench` for bench points, `playerPts` for
a player's points (provisional bonus in), `squadWorth` for a squad's value
(players only, the bank apart). A new figure gets its rule there first, and a
check in `agree.js` that every page showing it reads the same number.

## Adding one

Copy the shape of a small existing suite (`bubble.js` is a good short one):
serve the app on a port **no other suite uses**, launch `GOENV.CHROME`, assert
with a `chk(ok, message, detail)` helper, print `ALL OK` or `FAILS: n`, and add
the name to `ALL` in `battery.sh`. Ports must be unique — the suites run
concurrently, and two on the same port fail in ways that look like app bugs.

## Not deployed

The app is served from the repo root, so the Pages workflow drops this
directory before it uploads. Nothing here reaches the web.
