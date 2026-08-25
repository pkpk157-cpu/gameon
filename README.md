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

Everything derives from one primitive — each manager's **per-gameweek net
score (hits included) + bench points** — so all tabs stay consistent.

## Quick start

1. Open `gameon/` on any static host (GitHub Pages works out of the box), or
   locally with `python3 -m http.server` and visit `/gameon/`.
2. Go to **Settings** and enter your **Classic League ID** (the number in the
   FPL league URL). Optionally add H2H league IDs and a joining fee.
   Participants pick their own team by name under the gear menu, which
   highlights them across every tab and adds a shortcut to their profile.
3. Tap **↻ Refresh from FPL**. The app pulls the roster and every manager's
   history, then fills in all tabs.

### Why a proxy?

The FPL API is public and **needs no API key**, but it sends no CORS header,
so a browser can't call it directly. Requests route through a public CORS
proxy (default: allorigins). If it's slow or down, pick another in
**Settings → Data source**, or point at your own proxy with a
`https://your-proxy/?url={url}` template.

## Recommended workflow for the organiser (avoids 245 people hammering a proxy)

1. Once per gameweek, open the app and **↻ Refresh**.
2. **Settings → Export data.json**.
3. Commit that file as **`gameon/data.json`**.

Everyone else's app loads `gameon/data.json` automatically (no live FPL calls),
so it's fast and reliable for the whole league. They can still refresh live if
they want the very latest.

## Live gameweek (players played)

While a gameweek is in progress the LMS tab shows a **Live** view with a
**Played** column (e.g. `10/12`, captain counts twice) and highlights the
bottom N managers in the **drop zone** in red. On refresh, for the in-progress
GW the app pulls `event/{gw}/live/` (minutes) and each surviving manager's
`entry/{id}/event/{gw}/picks/`, counting started players (weighted by
multiplier) who have minutes. No API key is needed — all FPL endpoints are
public. Endpoints used: `bootstrap-static`, `fixtures`, `event/{gw}/live`,
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
| `styles.css` | dark "stadium" theme (gold/purple) |
| `config.js` | default rules, prizes, schedules (editable in Settings) |
| `api.js` | CORS-proxied FPL client + concurrency pool |
| `data.js` | settings/overrides (localStorage) + dataset (IndexedDB) + refresh + import/export |
| `compute.js` | all competition math |
| `app.js` | UI rendering, refresh flow, admin panel |
| `sw.js`, `manifest.json`, `icon.svg` | PWA (installable, offline shell) |

Not affiliated with the Premier League or FPL. Data © the Fantasy Premier League.
