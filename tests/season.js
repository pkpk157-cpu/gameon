/* The season audit as a battery suite: every gameweek's checked end and every
   phase of the pivotal weeks, through every compute entry point. See
   season/audit.js for what is checked and season/sim.js for how the season
   is played out. */
const { spawnSync } = require("child_process");
const path = require("path");
const r = spawnSync(process.execPath, [path.join(__dirname, "season", "audit.js"), "battery"], { stdio: "inherit" });
process.exit(r.status === null ? 1 : r.status);
