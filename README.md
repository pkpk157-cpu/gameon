# FPL Game On V12 — League Tracker

A static, installable (PWA) tracker for the private **Game On V12** Fantasy
Premier League. It reads the official FPL API and computes every competition
your league runs:

- **Classic League** — overall standings + full prize breakdown
- **Monthly Winners** — per-month podiums (Aug–May), hits included
- **Last Manager Standing** — weekly elimination, survivors, the elimination grid
- **Game On UCL (H2H)** — 16 groups + UCL/UEL knockout brackets
- **Pyramid Battle** — 4 divisions × 3 mini-seasons, promotion/relegation
- **General Rules** + every prize table for reference

Alongside those, from the burger menu and from any manager's name:

- **Stats & highlights** — the gameweek and the season in cards, with the
  league sorted into bands
- **Premier League** — the 20 clubs' fixtures, live scores and minutes
- **Player prices** — every player's ownership and how close his price is to
  moving, taken from FPL's own figure
- **A manager's profile** — the pitch for any gameweek, points, ownership or
  value on each card, the transfers that built it, form, and a head-to-head
  against your own team

Everything derives from one primitive — each manager's **per-gameweek net
score (hits included) + bench points** — so all tabs stay consistent.

## Quick start

1. Open `gameon/` on any static host (GitHub Pages works out of the box), or
   locally with `python3 -m http.server` and visit `/gameon/`.
2. Go to **Settings** and enter your **Classic League ID** (the number in the
   FPL league URL). Optionally add H2H league IDs and a joining fee.
   Participants pick their own team by name under the gear menu, which
   highlights them across every tab and adds a shortcut to their profile.
3. That is usually all. The app loads the published `data.json` and fills in
   every tab; the ↻ button is there to pull straight from the FPL API yourself
   if you want the very latest, or to set the league up the first time.

### Where the data comes from

`data.json` is built for everyone by a GitHub Action, not by a person: on each
run `scripts/fetch-data.js` reads the FPL API from the runner (which reaches it
directly, so no proxy and no API key), `scripts/verify-data.js` checks the
result against FPL's own totals, and the file is committed and deployed to
Pages in the same job. Nobody has to export anything by hand, and 245 phones
never hit the FPL API for the same numbers.

The workflow carries its own `schedule:`, but GitHub drops and delays scheduled
runs badly — enough to miss a deadline — so a Cloudflare Worker cron dispatches
it every ten minutes as well. That same worker is the CORS proxy the browser
uses, and it accepts only `fantasy.premierleague.com/api/` URLs: the FPL API
sends no CORS header, so a page cannot call it directly, and an open proxy is
not something to leave lying about. `config.js` lists fallback proxies if it is
ever unreachable.

## Live gameweek (players played)

While a gameweek is in play every tab scores live. The published file carries
the slow half — squads, standings, history — and the browser folds the fast
half over it every two minutes through the proxy: each player's points and
minutes from `event/{gw}/live/`, plus `fixtures/` to know which matches have
started. Bonus is worked out from bps before FPL publishes it, and drops back
to FPL's own the moment a fixture is finalised.

The LMS tab additionally shows a **Played** column (e.g. `10/12`, captain
counts twice) and highlights the bottom N managers in the **drop zone** in red.
No API key is needed — all FPL endpoints are public. Endpoints used: `bootstrap-static`, `fixtures`, `event/{gw}/live`,
`entry/{id}`, `entry/{id}/history`, `entry/{id}/event/{gw}/picks`,
`element-summary/{id}`, `leagues-classic/{id}/standings`,
`leagues-h2h/{id}/standings`.

## Custom rules & overrides

The app auto-computes what it can and lets an admin lock the rest
(**Settings → Admin**). Each opens a JSON editor pre-filled with the current
auto value:

- **Month → GW map & prizes** — ⚠️ set the gameweek ranges to match the real
  fixture calendar for your season (the defaults are placeholders).
- **Classic prizes** — exact ranks + inclusive ranges.
- **LMS manual eliminations** — `{ "5": [entryId, …] }` to override a GW.
- **Pyramid rosters** — set Season-1 division rosters; S2/S3 then follow
  promotion/relegation automatically. Defaults auto-assign by overall rank.
- **H2H groups** — the 16 groups of 15; defaults auto-seed by rank.
- **H2H bracket** — use *Auto-seed* on the Game On UCL tab, then fine-tune.

Import/Export moves the whole bundle (config + overrides + data) as one file.

## The clock — what keeps the data fresh

`data.json` is republished every ten minutes by the **Update FPL data**
workflow. Three things can start it, in order of how much they can be trusted:

1. **`heartbeat.yml`** — the clock. One run pokes the updater every ten
   minutes for the best part of an hour, then hands over to a fresh copy of
   itself. Only one chain exists at a time. It also watches its own work: if
   `data.json` has not been published for 45 minutes the run fails, and GitHub
   emails the repository owner.
2. **GitHub's own `schedule`** — a backstop that restarts the chain if it ever
   breaks. Do not rely on it: this repository asks for twice an hour and gets
   three to six firings a day, sometimes with five-hour gaps.
3. **The Cloudflare Worker cron** — a spare. It pokes the updater directly and
   now logs what happened when it fails.

**One secret makes this work: `CRON_PAT`.** A workflow cannot start another
workflow with the built-in `GITHUB_TOKEN` — GitHub blocks it to prevent runaway
loops — so the chain needs a personal access token to hand over. Settings →
Secrets and variables → Actions → New repository secret, named `CRON_PAT`,
holding a fine-grained token with **Actions: read and write** on this
repository. Without it the heartbeat fails on its first step and says so.

### Why it is built this way

The Worker cron was the only clock until 8 September 2026, when it stopped
firing. The dashboard still showed "Every 10 minutes" and a next-run time,
there were no logs and no errors, and nothing ran for three and a half hours.
Free Workers give no execution guarantee for cron. Nobody noticed for an hour
because every failure in the Worker was swallowed silently; the first sign was
the app's own banner saying its numbers were an hour old.

So: the clock moved into the repository, next to the work; the Worker says when
it fails instead of going quiet; and the heartbeat checks that data is actually
being published rather than only that it is running.

### If the data goes stale anyway

The app's top bar reads **"not synced for …"** in amber once the data is over
half an hour old, on every page. That is the signal to check:

- **Actions → Heartbeat** — is a run in progress? If not, run it by hand
  (Run workflow) and it will chain from there.
- **Actions → Update FPL data** — are runs failing? The heartbeat's watchdog
  will have failed too and emailed.
- **`CRON_PAT`** — a token that has expired or been revoked stops the handover.

## Files

| File | Purpose |
|------|---------|
| `index.html` | app shell + tab layout |
| `styles.css` | the theme — light, dark or whatever the phone is set to |
| `config.js` | default rules, prizes, schedules (editable in Settings) |
| `api.js` | CORS-proxied FPL client + concurrency pool |
| `data.js` | settings/overrides (localStorage) + dataset (IndexedDB) + the live overlay + import/export |
| `compute.js` | all competition math |
| `app.js` | UI rendering, refresh flow, admin panel |
| `data.json` | what the Action publishes; what every phone actually reads |
| `scripts/fetch-data.js` | the Action's fetcher — builds `data.json` from the FPL API |
| `scripts/verify-data.js` | checks that file against FPL's own totals before it ships |
| `scripts/bonus.js` | provisional bonus from bps, shared by the fetcher and the app |
| `worker.js` | the Cloudflare Worker: FPL-only CORS proxy, and the cron that dispatches the Action |
| `.github/workflows/` | fetch-and-publish, and the Pages deploy |
| `sw.js`, `manifest.json`, `icon.svg` | PWA (installable, offline shell) |

Not affiliated with the Premier League or FPL. Data © the Fantasy Premier League.
