/* ==========================================================================
   Player photographs, mirrored into the repo.

   The app could hotlink the Premier League's own image CDN, but then the
   pictures would live outside our origin: the service worker skips
   cross-origin requests, so they would vanish offline, and the day the league
   moves that path — it has moved before — every face in the app would break at
   once with nothing we could do about it. Mirroring costs a few megabytes,
   once, and after that the pictures are ours: cached like every other asset,
   present offline, and immune to anything happening at the other end.

   This runs on its own schedule, never inside the data updater. The updater is
   the league's lifeline and publishes every ten minutes; nothing here is
   allowed to slow it down or fail it. If this script never runs again, the app
   carries on — every face falls back to initials on its own.

   Usage: node scripts/fetch-photos.js [--probe] [--limit N]
     --probe   work out which URL the league is serving today and stop
     --limit   only fetch this many missing pictures this run
   ========================================================================== */
const fs = require("fs");
const path = require("path");

const OUT = "photos";
// The jersey behind a pitch card is 42 CSS pixels across, so this is already
// generous on the sharpest phone going; every other place a face appears is
// smaller still. The league serves these as PNGs of eighty kilobytes and up,
// whatever size the path claims, which would be fifty megabytes of pictures
// nobody can see at that resolution.
const WIDE = 110, QUALITY = 80;
const BASE = "https://fantasy.premierleague.com/api";
const HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; GameOnV12-bot/1.0)" };

// Every shape the league has served a player photograph from. They are tried in
// order and the first that answers for every player we test is the one used, so
// a move on their side costs a re-run rather than a rewrite.
const CANDIDATES = [
  { name: "pl/110x140", url: (c) => "https://resources.premierleague.com/premierleague/photos/players/110x140/p" + c + ".png" },
  { name: "pl/250x250", url: (c) => "https://resources.premierleague.com/premierleague/photos/players/250x250/p" + c + ".png" },
  { name: "pl25/110x140", url: (c) => "https://resources.premierleague.com/premierleague25/photos/players/110x140/" + c + ".png" },
  { name: "pl25/250x250", url: (c) => "https://resources.premierleague.com/premierleague25/photos/players/250x250/" + c + ".png" },
  { name: "pl26/110x140", url: (c) => "https://resources.premierleague.com/premierleague26/photos/players/110x140/" + c + ".png" },
  { name: "pl26/250x250", url: (c) => "https://resources.premierleague.com/premierleague26/photos/players/250x250/" + c + ".png" },
  { name: "bare/110x140", url: (c) => "https://resources.premierleague.com/photos/players/110x140/p" + c + ".png" }
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, asBuffer) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, { headers: HEADERS, signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return { ok: false, status: res.status };
    const body = asBuffer ? Buffer.from(await res.arrayBuffer()) : await res.json();
    return { ok: true, status: res.status, body: body };
  } catch (e) {
    clearTimeout(t);
    return { ok: false, status: 0, error: e && e.message };
  }
}

// A picture that is not a picture is worse than no picture: a 200 carrying an
// HTML error page would be written to disk and served as a broken image for the
// rest of the season. Check the file really begins the way a PNG begins.
function isPng(buf) {
  return buf && buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 &&
         buf[2] === 0x4e && buf[3] === 0x47;
}

async function main() {
  const argv = process.argv.slice(2);
  const probeOnly = argv.indexOf("--probe") !== -1;
  const li = argv.indexOf("--limit");
  const limit = li !== -1 ? (parseInt(argv[li + 1], 10) || 0) : 0;

  console.log("Reading the player list…");
  const bs = await get(BASE + "/bootstrap-static/");
  if (!bs.ok) {
    console.error("Could not read the player list (HTTP " + bs.status + "). Nothing written.");
    process.exit(1);
  }
  const players = (bs.body.elements || [])
    .filter((e) => e && e.code)
    .map((e) => ({ code: String(e.code), name: e.web_name || String(e.id) }));
  console.log("  " + players.length + " players, " +
    new Set(players.map((p) => p.code)).size + " distinct photo codes");
  if (!players.length) { console.error("No players. Nothing written."); process.exit(1); }

  // Work out which URL is live today, measuring as we go so the choice of size
  // is made on real bytes rather than on what a size sounds like it should be.
  console.log("\nWhich URL is the league serving today?");
  const sample = players.slice(0, 5);
  let chosen = null;
  // Every shape that answered for the whole sample, cheapest first. One shape
  // is asked first for every player, but the day's cheapest path does not
  // carry every player — a hundred and five were missing from it at once,
  // most of them at other shapes that had answered the same probe — so a
  // player it lacks is tried at each of the others before he is given up on.
  const working = [];
  for (const cand of CANDIDATES) {
    const got = [];
    for (const p of sample) {
      const r = await get(cand.url(p.code), true);
      got.push({ p: p, ok: r.ok && isPng(r.body), status: r.status, bytes: r.ok && r.body ? r.body.length : 0 });
    }
    const hits = got.filter((g) => g.ok);
    const avg = hits.length ? Math.round(hits.reduce((s, g) => s + g.bytes, 0) / hits.length) : 0;
    console.log("  " + cand.name.padEnd(16) + hits.length + "/" + sample.length +
      (hits.length ? "   avg " + (avg / 1024).toFixed(1) + " KB" : "   (" + got.map((g) => g.status).join(",") + ")"));
    // Smallest that works, not first that works: it is the same picture at the
    // other end and we re-encode either way, so there is no reason to pull more
    // of somebody else's bandwidth than the job needs.
    if (hits.length === sample.length) {
      working.push({ cand: cand, avg: avg });
      if (!chosen || avg < chosen.avg) chosen = { cand: cand, avg: avg };
    }
  }
  working.sort((a, b) => a.avg - b.avg);
  if (!chosen) {
    console.error("\nNone of the known URLs answered. The league has moved them again.");
    console.error("Nothing was written; the app keeps showing initials, which is what it does");
    console.error("for a player with no picture anyway. Add the new shape to CANDIDATES.");
    process.exit(1);
  }
  console.log("\nUsing " + chosen.cand.name + " — about " + (chosen.avg / 1024).toFixed(1) +
    " KB each, so roughly " + ((chosen.avg * players.length) / 1024 / 1024).toFixed(0) +
    " MB for all " + players.length + "." +
    (working.length > 1 ? " Falling back to " + working.slice(1).map((w) => w.cand.name).join(", ") +
      " for anyone it lacks." : ""));
  if (probeOnly) { console.log("\n--probe: stopping here, nothing written."); return; }

  // Re-encoding is the whole point; without it this commits fifty megabytes.
  // If the tool is missing, stop before writing anything rather than quietly
  // filling the repository with full-size PNGs.
  var sharp;
  try { sharp = require("sharp"); }
  catch (e) {
    console.error("sharp is not installed, so the pictures cannot be re-encoded.");
    console.error("Nothing written. Install it first: npm install sharp");
    process.exit(1);
  }

  fs.mkdirSync(OUT, { recursive: true });
  const have = new Set(fs.readdirSync(OUT).filter((f) => f.endsWith(".webp")));
  let missing = players.filter((p) => !have.has("p" + p.code + ".webp"));
  console.log("\n" + have.size + " already here, " + missing.length + " to fetch.");
  if (limit && missing.length > limit) {
    console.log("  --limit " + limit + ": taking the first " + limit + " this run.");
    missing = missing.slice(0, limit);
  }
  if (!missing.length) { console.log("Nothing to do."); return; }

  // Gently: this is somebody else's CDN and there is no hurry. A picture that
  // does not arrive is skipped, never retried to death and never fatal — the
  // next run picks it up, and until then that player wears his initials.
  let got = 0, gone = 0, raw = 0, kept = 0;
  const viaOther = {};
  for (let i = 0; i < missing.length; i += 8) {
    const batch = missing.slice(i, i + 8);
    await Promise.all(batch.map(async (p) => {
      let r = null;
      for (const w of working) {
        const t = await get(w.cand.url(p.code), true);
        if (t.ok && isPng(t.body)) {
          r = t;
          if (w !== working[0]) viaOther[w.cand.name] = (viaOther[w.cand.name] || 0) + 1;
          break;
        }
      }
      if (!r) { gone++; return; }
      try {
        const small = await sharp(r.body)
          .resize({ width: WIDE, fit: "inside", withoutEnlargement: true })
          .webp({ quality: QUALITY, alphaQuality: 80, effort: 6 })
          .toBuffer();
        // Never write something a browser would refuse to draw: an empty or
        // absurd file is a broken face for the rest of the season.
        if (!small || small.length < 200) { gone++; return; }
        fs.writeFileSync(path.join(OUT, "p" + p.code + ".webp"), small);
        got++; raw += r.body.length; kept += small.length;
      } catch (e) { gone++; }
    }));
    if (i && i % 200 === 0) { console.log("  " + got + " fetched..."); await sleep(400); }
  }
  const all = fs.readdirSync(OUT).filter((f) => f.endsWith(".webp"));
  const total = all.reduce((s, f) => s + fs.statSync(path.join(OUT, f)).size, 0);
  console.log("");
  console.log("Fetched " + got + ", " + gone + " had no picture and will show initials.");
  Object.keys(viaOther).forEach((k) => {
    console.log("  " + viaOther[k] + " came from " + k + " after the first shape lacked them.");
  });
  if (got) {
    console.log("  " + (raw / 1024 / 1024).toFixed(1) + " MB of PNG became " +
      (kept / 1024 / 1024).toFixed(2) + " MB of WebP, " +
      (kept / got / 1024).toFixed(1) + " KB each, " +
      Math.round((1 - kept / raw) * 100) + "% smaller.");
  }
  console.log("  " + all.length + " photographs in " + OUT + "/, " +
    (total / 1024 / 1024).toFixed(2) + " MB in total.");
}

main().catch((e) => {
  // Nothing here is worth failing a build over: the app has a face for every
  // player either way. Say what happened and stop.
  console.error("Stopped: " + (e && e.message ? e.message : e));
  process.exit(1);
});
