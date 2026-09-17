const GOENV = require("./lib/env.js");
/* One place that builds the dataset the way the updater now builds it, so the
   tests do not each carry their own idea of the shape and do not depend on
   having been run in a particular order. */
const fs = require("fs");
const APP = GOENV.APP;
const TOTAL = 11000000, RISE_AT = 0.04, FALL_AT = 0.05;

function build(opts) {
  opts = opts || {};
  const b = JSON.parse(fs.readFileSync(APP + "/data.json", "utf8"));
  const ds = b.dataset;
  const ids = Object.keys(ds.elements);

  // full names, as the fetcher now keeps them
  const firsts = ["Erling", "Bruno", "Aleix", "Matz", "Cole", "Bukayo", "Alisson", "Virgil"];
  ids.forEach((id, i) => { ds.elements[id][5] = firsts[i % firsts.length] + " " + ds.elements[id][0]; });

  if (opts.bare) { delete ds.prices; delete ds.priceLog; return b; }

  const now = {}, owned = {}, netSince = {}, changeEvent = {}, changeStart = {};
  ids.forEach((id, i) => {
    now[id] = ds.elements[id][3];
    const own = ds.elements[id][4] || 0.5;
    owned[id] = own;
    changeEvent[id] = 0; changeStart[id] = (i % 11 === 0) ? 2 : 0;
    const owners = Math.round(own / 100 * TOTAL);
    // a smooth sweep from well down to well up, so no two players sit together
    const frac = -1.35 + (2.75 * i) / ids.length;
    netSince[id] = Math.round(owners * RISE_AT * frac);
  });
  ds.prices = { at: new Date().toISOString(), now, owned, netSince,
                changeEvent, changeStart, tIn: {}, tOut: {},
                total: opts.noTotal ? undefined : TOTAL };
  if (opts.noTotal) delete ds.prices.total;

  // changes already seen, each carrying the pressure behind it
  // a calibrating night needs changes in both directions, or the threshold
  // stays unmeasured and the table falls back to ordering by pressure
  ds.priceLog = opts.uncalibrated ? [] : ids.slice(0, 12)
    .filter((id) => (ds.elements[id][4] || 0) > 0)
    .slice(0, 10).map((id, i) => {
      const owners = Math.round((ds.elements[id][4] || 0.5) / 100 * TOTAL);
      const at = new Date(Date.now() - i * 3600e3 * 5).toISOString();
      return i < 7
        ? [+id, now[id], now[id] + 1, at, Math.round(owners * RISE_AT), owners]
        : [+id, now[id], now[id] - 1, at, -Math.round(owners * FALL_AT), owners];
    });
  return b;
}

function write(file, opts) {
  const b = build(opts);
  fs.writeFileSync(file, JSON.stringify(b));
  return b;
}

module.exports = { build, write, TOTAL, RISE_AT, FALL_AT,
                   count: () => Object.keys(JSON.parse(fs.readFileSync(APP + "/data.json", "utf8")).dataset.elements).length };
