/* Where the suites find the things they need, resolved rather than written in.
 *
 * Every suite used to name four absolute paths: the app, the Chromium binary,
 * the hostile datasets and somewhere to drop screenshots. Three of them move.
 * The browser path is the dangerous one — it carries the build number
 * (chromium-1194), so a container with a newer browser would have broken all
 * sixty suites at once, in an environment where a broken suite means changes go
 * out unchecked. Each is now looked up here, with an override for anyone whose
 * machine is laid out differently.
 */
const fs = require("fs"), path = require("path");

// The app: the directory holding index.html and compute.js. Found by walking up
// from this file, so tests/ can sit anywhere inside the repo.
function findApp() {
  if (process.env.GO_APP) return process.env.GO_APP;
  let d = __dirname;
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(d, "index.html")) && fs.existsSync(path.join(d, "compute.js"))) return d;
    const up = path.dirname(d);
    if (up === d) break;
    d = up;
  }
  return "/home/user/gameon";
}

// Chromium: the newest build under whichever browsers directory this machine
// uses. Playwright's own env var is honoured first.
function findChrome() {
  if (process.env.GO_CHROME) return process.env.GO_CHROME;
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, "/opt/pw-browsers",
                 path.join(process.env.HOME || "/root", ".cache/ms-playwright")].filter(Boolean);
  const found = [];
  for (const root of roots) {
    let names = [];
    try { names = fs.readdirSync(root); } catch (e) { continue; }
    for (const n of names) {
      if (!/^chromium/.test(n)) continue;
      for (const rel of ["chrome-linux/chrome", "chrome-linux/headless_shell", "chrome-mac/Chromium"]) {
        const p = path.join(root, n, rel);
        if (fs.existsSync(p)) {
          // chromium-1194 -> 1194, so the newest build wins over an older one
          found.push({ p: p, v: parseInt((n.match(/(\d+)/) || [0, 0])[1], 10) || 0 });
        }
      }
    }
  }
  if (!found.length) {
    throw new Error("No Chromium found. Looked under " + roots.join(", ") +
      ". Set GO_CHROME to the binary, or PLAYWRIGHT_BROWSERS_PATH to its directory.");
  }
  found.sort((a, b) => b.v - a.v);
  return found[0].p;
}

// The hostile datasets, rebuilt by mkstates.js when they are not there.
function findStates() {
  return process.env.GO_STATES || "/tmp/states";
}

// Somewhere to drop screenshots. Not a fixture directory — nothing is read back
// out of it, so it is fine for it to be empty or thrown away.
function findOut() {
  const d = process.env.GO_OUT || path.join(require("os").tmpdir(), "go-test-out");
  try { fs.mkdirSync(d, { recursive: true }); } catch (e) {}
  return d;
}

module.exports = { APP: findApp(), CHROME: findChrome(), STATES: findStates(), OUT: findOut(),
                   FIXTURES: __dirname.replace(/lib$/, "").replace(/\/$/, "") };
