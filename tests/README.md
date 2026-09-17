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
- `lib/env.js` — path resolution
- `mkstates.js` — builds the 22 hostile datasets from `data.json`
- `audit/harness.js` — loads `compute.js` in a sandbox, for the suites that
  check arithmetic rather than pixels
- `fixture.js`, `now.json`, `vol.json` — datasets a few suites read
- everything else — one suite per file

## Adding one

Copy the shape of a small existing suite (`bubble.js` is a good short one):
serve the app on a port **no other suite uses**, launch `GOENV.CHROME`, assert
with a `chk(ok, message, detail)` helper, print `ALL OK` or `FAILS: n`, and add
the name to `ALL` in `battery.sh`. Ports must be unique — the suites run
concurrently, and two on the same port fail in ways that look like app bugs.

## Not deployed

The app is served from the repo root, so the Pages workflow drops this
directory before it uploads. Nothing here reaches the web.
