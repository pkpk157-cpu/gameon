#!/bin/bash
# One-time setup on a machine that has not run these before.
#
#   bash tests/setup.sh
#
# Installs the one dependency and builds the hostile datasets the sweep suites
# read. Safe to run again; both steps are idempotent.
set -e
cd "$(dirname "$(readlink -f "$0")")"

echo "· installing playwright-core"
npm install --no-audit --no-fund >/dev/null

echo "· locating the browser and the app"
node -e '
const E = require("./lib/env.js");
console.log("  app     " + E.APP);
console.log("  chromium " + E.CHROME);
console.log("  datasets " + E.STATES);
console.log("  output   " + E.OUT);
'

echo "· building the hostile datasets"
node mkstates.js >/dev/null
node -e '
const fs = require("fs"), E = require("./lib/env.js");
const n = fs.readdirSync(E.STATES).length;
if (!n) { console.error("  none were written"); process.exit(1); }
console.log("  " + n + " datasets in " + E.STATES);
'
echo
echo "Ready. Run the suites with:  bash tests/battery.sh bat.log 4"
