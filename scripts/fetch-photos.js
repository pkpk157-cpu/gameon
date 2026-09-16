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
const crypto = require("crypto");

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
// Which club does each stored photograph show? A photograph is filed under the
// player, so a transfer leaves him in the old shirt until the league re-shoots
// him. This record is what lets the app tell the difference: the club the shot
// was taken at, the hash of the league's original so a new one can be spotted,
// and the list the app hides for now.
const KITS = path.join(OUT, "kits.json");
function readKits() {
  try {
    const k = JSON.parse(fs.readFileSync(KITS, "utf8"));
    return { v: 1, at: k.at || null, note: k.note, kit: k.kit || {}, src: k.src || {}, wrong: (k.wrong || []).map(String) };
  } catch (e) {
    return { v: 1, at: null, kit: {}, src: {}, wrong: [] };
  }
}
function writeKits(k) {
  k.at = new Date().toISOString();
  k.note = "kit = the club a stored photograph shows; wrong = photographs still in a club the player has left; src = the hash of the league original, so a new shot can be spotted";
  k.wrong = [...new Set(k.wrong.map(String))].sort();
  fs.writeFileSync(KITS, JSON.stringify(k) + "\n");
}
const sha1 = (buf) => crypto.createHash("sha1").update(buf).digest("hex");

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
  const clubShort = {};
  (bs.body.teams || []).forEach((t) => { clubShort[t.id] = t.short_name; });
  const players = (bs.body.elements || [])
    .filter((e) => e && e.code)
    .map((e) => ({ code: String(e.code), name: e.web_name || String(e.id),
                   club: clubShort[e.team] || null }));
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
  const kitLog = readKits();
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
        kitLog.kit[p.code] = p.club || kitLog.kit[p.code] || null;
        kitLog.src[p.code] = sha1(r.body);
        kitLog.wrong = kitLog.wrong.filter((c) => c !== p.code);
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
  // Transfers: a photograph whose player has since changed club shows the wrong
  // shirt. Ask the league for his picture again each run; when the bytes change
  // the shot has been redone and it can be trusted again. Until then the app
  // holds it back and draws the club jersey instead.
  const moved = players.filter((p) => {
    if (!fs.existsSync(path.join(OUT, "p" + p.code + ".webp"))) return false;
    if (kitLog.wrong.indexOf(p.code) !== -1) return true;
    const shows = kitLog.kit[p.code];
    return !!(shows && p.club && shows !== p.club);
  });
  if (moved.length) {
    console.log("\n" + moved.length + " photograph(s) of players who have changed club since the shot:");
    let refreshed = 0, waiting = 0;
    for (const p of moved) {
      let r = null;
      for (const w of working) {
        const t = await get(w.cand.url(p.code), true);
        if (t.ok && isPng(t.body)) { r = t; break; }
      }
      if (!r) { console.log("  " + p.name.padEnd(18) + "no picture served at all"); continue; }
      const h = sha1(r.body), had = kitLog.src[p.code];
      if (had && h !== had) {
        try {
          const small = await sharp(r.body)
            .resize({ width: WIDE, fit: "inside", withoutEnlargement: true })
            .webp({ quality: QUALITY, alphaQuality: 80, effort: 6 })
            .toBuffer();
          if (small && small.length > 200) {
            fs.writeFileSync(path.join(OUT, "p" + p.code + ".webp"), small);
            kitLog.kit[p.code] = p.club;
            kitLog.src[p.code] = h;
            kitLog.wrong = kitLog.wrong.filter((c) => c !== p.code);
            refreshed++;
            console.log("  " + p.name.padEnd(18) + "a new shot has been published \u2014 taken, now in " + p.club);
            continue;
          }
        } catch (e) { /* fall through to waiting */ }
      }
      if (!had) kitLog.src[p.code] = h;
      if (kitLog.wrong.indexOf(p.code) === -1) kitLog.wrong.push(p.code);
      waiting++;
      console.log("  " + p.name.padEnd(18) + "still the old shirt \u2014 he wears the " + (p.club || "club") + " jersey for now");
    }
    console.log("  " + refreshed + " redone, " + waiting + " still waiting.");
  }
  writeKits(kitLog);
  console.log("\nKit record: " + Object.keys(kitLog.kit).length + " photographs placed at a club, " +
    kitLog.wrong.length + " held back.");

  await fetchBadges(bs.body.teams || [], sharp);

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

// Club crests, mirrored the same way and for the same reasons, named by the
// club's short code (badge-ARS.webp) because that is what the data carries.
// Twenty small files; a club that cannot be fetched simply has no crest and
// its name stands alone, which is how the app looked before crests existed.
const BADGE_WIDE = 56;
const BADGE_CANDIDATES = [
  { name: "badges/70", url: (c) => "https://resources.premierleague.com/premierleague/badges/70/t" + c + ".png" },
  { name: "badges/70@x2", url: (c) => "https://resources.premierleague.com/premierleague/badges/70/t" + c + "@x2.png" },
  { name: "badges/50", url: (c) => "https://resources.premierleague.com/premierleague/badges/50/t" + c + ".png" },
  { name: "pl25/badges/70", url: (c) => "https://resources.premierleague.com/premierleague25/badges/70/t" + c + ".png" },
  { name: "pl26/badges/70", url: (c) => "https://resources.premierleague.com/premierleague26/badges/70/t" + c + ".png" },
  { name: "badges/rb", url: (c) => "https://resources.premierleague.com/premierleague/badges/rb/t" + c + ".svg" }
];
function isSvg(buf) { return buf && buf.length > 5 && /^\s*<(\?xml|svg)/i.test(buf.slice(0, 200).toString("utf8")); }
async function fetchBadges(teams, sharp) {
  const clubs = teams.filter((t) => t && t.code && t.short_name)
    .map((t) => ({ code: String(t.code), short: String(t.short_name).toUpperCase() }));
  if (!clubs.length) { console.log("\nNo clubs in the player list; no crests."); return; }
  const have = new Set(fs.readdirSync(OUT).filter((f) => f.startsWith("badge-") && f.endsWith(".webp")));
  const missing = clubs.filter((c) => !have.has("badge-" + c.short + ".webp"));
  console.log("\nCrests: " + (clubs.length - missing.length) + " of " + clubs.length + " here, " + missing.length + " to fetch.");
  if (!missing.length) return;

  console.log("Which crest URL is the league serving today?");
  const sample = clubs.slice(0, 3);
  const working = [];
  for (const cand of BADGE_CANDIDATES) {
    let hits = 0, bytes = 0, codes = [];
    for (const c of sample) {
      const r = await get(cand.url(c.code), true);
      const ok = r.ok && (isPng(r.body) || isSvg(r.body));
      if (ok) { hits++; bytes += r.body.length; }
      codes.push(r.status);
    }
    console.log("  " + cand.name.padEnd(16) + hits + "/" + sample.length +
      (hits ? "   avg " + (bytes / hits / 1024).toFixed(1) + " KB" : "   (" + codes.join(",") + ")"));
    if (hits === sample.length) working.push({ cand: cand, avg: bytes / hits });
  }
  if (!working.length) { console.log("  None answered; crests wait for another day."); return; }
  working.sort((a, b) => a.avg - b.avg);

  let got = 0, gone = 0;
  for (const c of missing) {
    let r = null;
    for (const w of working) {
      const t = await get(w.cand.url(c.code), true);
      if (t.ok && (isPng(t.body) || isSvg(t.body))) { r = t; break; }
    }
    if (!r) { gone++; continue; }
    try {
      const small = await sharp(r.body, { density: 300 })
        .resize({ width: BADGE_WIDE, height: BADGE_WIDE, fit: "inside", withoutEnlargement: !isSvg(r.body) })
        .webp({ quality: 85, alphaQuality: 90, effort: 6 })
        .toBuffer();
      if (!small || small.length < 120) { gone++; continue; }
      fs.writeFileSync(path.join(OUT, "badge-" + c.short + ".webp"), small);
      got++;
    } catch (e) { gone++; }
  }
  console.log("Crests fetched " + got + ", " + gone + " not served; those clubs show their name alone.");
}

main().catch((e) => {
  // Nothing here is worth failing a build over: the app has a face for every
  // player either way. Say what happened and stop.
  console.error("Stopped: " + (e && e.message ? e.message : e));
  process.exit(1);
});
