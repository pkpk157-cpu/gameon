#!/bin/bash
# Every UI suite. A suite passes when it exits 0 and prints no FAIL line.
#
#   battery.sh [logfile] [concurrency] [suite ...]
#
# Suites are independent — each serves the app on its own port — so they run a
# few at a time rather than one after another. Concurrency is capped rather than
# unlimited because each suite drives its own Chromium, and oversubscribing the
# cores makes every suite slower and flakier on timing-sensitive checks.
#
# The set is lopsided: six suites sweep whole matrices (every hostile dataset
# against every view, every table at ten widths) and take minutes, while most
# take seconds. With workers in a pool, the run cannot finish before its longest
# suite does, so the long ones have to start first — which means knowing how
# long each took last time. Every run records that in bat-times.txt and the next
# one sorts by it, longest first; a suite nobody has timed yet sorts to the
# front, where a slow newcomer costs nothing.
#
# Results print in the canonical order however they finish, each with the time
# it took, so a slow suite is visible instead of suspected. bat.progress carries
# them as they land, for watching a run that is still going.
#
# The per-suite timeout is deliberately far above what the slowest one needs.
# It was 420s while statesweep took 407, and the next thing added to the app
# tipped it over — a suite failing because it is near its own budget, rather
# than because anything is wrong, is the worst kind of red. The guard is there
# to catch a hang, not to police how long a matrix takes; run time is visible
# in the log either way. It does not cost wall time: the suites run in
# parallel and the run is bounded by the longest one finishing, not by this.
cd "$(dirname "$(readlink -f "$0")")" || exit 1
LOG=${1:-bat.log}; JOBS=${2:-4}; shift 2 2>/dev/null
TIMES=bat-times.txt; SEED=bat-times.seed.txt; PROG=bat.progress

ALL="tblfit faceaudit facefit face404 realface pitchfit pitchlook cmppitchlook pflags overlap twosheets youme younull drawer drawerfit drawertheme livecard match pstats volun overview profile winnings h2h ko rules domaudit nav views gwstatus plinfo pplayer pltable pltcrests mevents prsplit prnotoggle prmine prfavs prfill lmsstates lmstie ties tiefix stickyhdr sorthdr search audit3 badgecheck badgerecount badgestates badgeform totwcheck rivals livemotion crests ptr bubble profnav sheetcrest splash facehide barpills menuart pfhead errsweep statesweep nullstack2 xplat gcopt snapshot turf usage shareimg grpsync subsplan ppresult blots scored trend theo xitap worth agree season seasonsweep"
SUITES=${*:-$ALL}

# Two batteries at once means two servers on every port, and a page of
# failures that say nothing about the app. One at a time.
LOCK=/tmp/go-battery.lock
if ! mkdir "$LOCK" 2>/dev/null; then
  if [ -f "$LOCK/pid" ] && kill -0 "$(cat "$LOCK/pid")" 2>/dev/null; then
    echo "a battery is already running (pid $(cat "$LOCK/pid")) — not starting a second" >&2; exit 1
  fi
  rm -rf "$LOCK"; mkdir "$LOCK" || { echo "could not take the battery lock" >&2; exit 1; }
fi
echo $$ > "$LOCK/pid"

OUT=$(mktemp -d)
: > "$PROG"

# A few suites share this one static server. The stock handler is single
# threaded, which would serialise exactly the suites we are trying to overlap.
APP=$(node -e 'process.stdout.write(require("./lib/env.js").APP)')

# A killed run used to leave this server behind, because it was stopped on the
# last line of the script rather than on the way out. The next run then could
# not bind the port: its own server died unseen, every suite that uses the
# shared one got 404s, and a dozen suites with nothing wrong with them reported
# red. Take the port back first, and stop the server however this script ends.
if [ -z "$APP" ]; then echo "could not resolve the app directory" >&2; exit 1; fi
pkill -f "python3 - $APP" >/dev/null 2>&1 && sleep 1
python3 - "$APP" <<'PY' >/dev/null 2>&1 &
import http.server, socketserver, os, sys
os.chdir(sys.argv[1])
class S(socketserver.ThreadingTCPServer):
    allow_reuse_address = True; daemon_threads = True
S(("", 8099), http.server.SimpleHTTPRequestHandler).serve_forever()
PY
HS=$!
trap 'kill $HS 2>/dev/null; rm -rf "$OUT" "$LOCK"' EXIT INT TERM
sleep 1

# And never run blind: a battery whose shared server is not answering reports
# failures that say nothing about the app.
if ! node -e 'require("http").get("http://127.0.0.1:8099/index.html",r=>process.exit(r.statusCode===200?0:1)).on("error",()=>process.exit(1))'; then
  echo "the shared server on 8099 is not answering — not running a battery that would blame the suites" >&2
  exit 1
fi

# The hostile datasets are generated from data.json, not stored. Build them if
# this machine has not built them yet, or the sweeps have nothing to sweep.
STATES=$(node -e 'process.stdout.write(require("./lib/env.js").STATES)')
if [ ! -d "$STATES" ] || [ -z "$(ls -A "$STATES" 2>/dev/null)" ]; then
  echo "building hostile datasets in $STATES" >&2
  node mkstates.js >/dev/null 2>&1 || echo "mkstates failed — the sweep suites will report it" >&2
fi

run_one() {
  local s=$1 t0 out rc secs line
  if [ ! -f "$s.js" ]; then printf "=== %-13s MISSING\n" "$s" > "$OUT/$s"; return; fi
  t0=$(date +%s)
  out=$(timeout 900 node "$s.js" 2>&1); rc=$?
  secs=$(( $(date +%s) - t0 ))
  if [ $rc -eq 0 ] && ! echo "$out" | grep -q "FAIL"; then
    line=$(printf "=== %-13s PASS  %3ss" "$s" "$secs")
    echo "$line" > "$OUT/$s"
  else
    line=$(printf "=== %-13s FAIL (rc=%s)  %3ss" "$s" "$rc" "$secs")
    { echo "$line"; echo "$out" | grep -E "FAIL|Error|error" | head -8; } > "$OUT/$s"
  fi
  echo "$s $secs" >> "$OUT/.times"
  echo "$line" >> "$PROG"
}
export -f run_one
export OUT PROG

# Longest first, on last run's clock. An untimed suite sorts to the front.
order() {
  local s t
  for s in $SUITES; do
    t=$(awk -v k="$s" '$1==k {print $2}' "$TIMES" 2>/dev/null | tail -1)
    [ -z "$t" ] && t=$(awk -v k="$s" '$1==k {print $2}' "$SEED" 2>/dev/null | tail -1)
    echo "${t:-99999} $s"
  done | sort -rn | awk '{print $2}'
}

START=$(date +%s)
order | xargs -P "$JOBS" -I{} bash -c 'run_one {}'
WALL=$(( $(date +%s) - START ))

# Remember what each one cost, for the next run's running order.
if [ -f "$OUT/.times" ]; then
  cat "$TIMES" "$OUT/.times" 2>/dev/null | awk '{t[$1]=$2} END {for (k in t) print k, t[k]}' \
    | sort > "$TIMES.new" && mv "$TIMES.new" "$TIMES"
fi

: > "$LOG"
for s in $SUITES; do [ -f "$OUT/$s" ] && cat "$OUT/$s" >> "$LOG"; done
n=$(printf '%s\n' $SUITES | wc -w)
bad=$(grep -c "^=== .*FAIL" "$LOG")
printf "%s suites, %s failed, %sm%ss wall at %s-way\n" "$n" "$bad" $((WALL/60)) $((WALL%60)) "$JOBS" >> "$LOG"
echo "done" >> "$LOG"
