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
