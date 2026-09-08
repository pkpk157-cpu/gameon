// ==========================================================================
// Game On V12 — Cloudflare Worker CORS proxy for the FPL API.
// Free, fast, and reliable for a whole league (public proxies rate-limit / go
// down). Deploy once, then paste your Worker URL in the app:
//   Settings → Data source → Custom proxy template:
//     https://YOUR-WORKER.workers.dev/?url={url}
//
// It also carries a spare hand for the league's clock: a Cron Trigger here
// pokes the GitHub updater every 10 minutes. It is no longer the only thing
// doing so — the clock itself is .github/workflows/heartbeat.yml in the repo,
// because this trigger stopped firing for three and a half hours on
// 8 September 2026 without a word. Two one-time settings on the worker:
//   - a Secret named GH_TOKEN: a fine-grained GitHub token for the gameon
//     repo with Actions: Read and write
//   - a Cron Trigger: */10 * * * *
//
// Deploy (2 min, no card needed):
//   1. Sign in at https://dash.cloudflare.com → Workers & Pages → Create →
//      Create Worker. Give it a name, click Deploy.
//   2. Click "Edit code", delete the sample, paste THIS whole file, Deploy.
//   3. Copy the worker URL (….workers.dev) and use it in the app as above.
// ==========================================================================
export default {
  /* A second hand on the league's clock, not the clock itself.

     This used to be the only thing poking the updater. On 8 September 2026 the
     cron trigger stopped firing — dashboard still showing "Every 10 minutes"
     and a next-run time, no logs, no errors, nothing for three and a half
     hours — and because every failure here was swallowed, the first anyone
     knew was the app saying its numbers were an hour old. The clock now lives
     in the repository (.github/workflows/heartbeat.yml); this is a spare.

     It also says what happened now. A poke that fails writes a line to the
     Worker's logs with the status GitHub returned, so the next time this stops
     there is something to read. */
  async scheduled(event, env, ctx) {
    if (!env.GH_TOKEN) {
      console.error("scheduled: GH_TOKEN is not set — nothing to poke with");
      return;
    }
    const poke = () => fetch(
      "https://api.github.com/repos/pkpk157-cpu/gameon/actions/workflows/update-data.yml/dispatches",
      {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + env.GH_TOKEN,
          "Accept": "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "GameOnV12-cron",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ ref: "main" })
      });

    // One retry: a single dropped connection should not cost a whole cycle,
    // and anything worse is worth seeing in the log rather than guessing at.
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await poke();
        if (res.status === 204) {
          console.log("scheduled: updater poked");
          return;
        }
        const body = await res.text().catch(() => "");
        console.error("scheduled: GitHub said " + res.status + " " +
                      body.slice(0, 300) + (attempt < 2 ? " — retrying" : ""));
      } catch (e) {
        console.error("scheduled: poke failed (" + (e && e.message) + ")" +
                      (attempt < 2 ? " — retrying" : ""));
      }
      if (attempt < 2) await new Promise((r) => setTimeout(r, 2000));
    }
    console.error("scheduled: gave up; the repository's own heartbeat covers this");
  },

  async fetch(request) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*"
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    const target = new URL(request.url).searchParams.get("url");
    if (!target) return new Response("Missing ?url=", { status: 400, headers: cors });

    // Only allow the official FPL API — this is not an open proxy.
    if (!/^https:\/\/fantasy\.premierleague\.com\/api\//.test(target)) {
      return new Response("Forbidden", { status: 403, headers: cors });
    }

    let upstream;
    try {
      upstream = await fetch(target, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; GameOnV12/1.0)",
          "Accept": "application/json"
        },
        cf: { cacheTtl: 45, cacheEverything: true }
      });
    } catch (e) {
      return new Response("Upstream fetch failed: " + e, { status: 502, headers: cors });
    }

    const body = await upstream.arrayBuffer();
    return new Response(body, {
      status: upstream.status,
      headers: Object.assign({}, cors, {
        "Content-Type": upstream.headers.get("Content-Type") || "application/json",
        "Cache-Control": "public, max-age=45"
      })
    });
  }
};
