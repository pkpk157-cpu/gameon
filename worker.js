/* ==========================================================================
   Game On V12 — Cloudflare Worker CORS proxy for the FPL API.
   Free, fast, and reliable for a whole league (public proxies rate-limit / go
   down). Deploy once, then paste your Worker URL in the app:
   Settings → Data source → Custom proxy template:
       https://YOUR-WORKER.workers.dev/?url={url}

   It also carries the league's clock: a Cron Trigger on this worker starts
   the GitHub updater every 10 minutes, because GitHub's own scheduler proved
   itself unreliable (it sat silent for 14 hours on a match day). Needs two
   one-time settings on the worker:
     - a Secret named GH_TOKEN: a fine-grained GitHub token for the gameon
       repo with Actions: Read and write
     - a Cron Trigger: */10 * * * *

   Deploy (2 min, no card needed):
   1. Sign in at https://dash.cloudflare.com  →  Workers & Pages  →  Create  →
      Create Worker.  Give it a name, click Deploy.
   2. Click "Edit code", delete the sample, paste THIS whole file, click Deploy.
   3. Copy the worker URL (…​.workers.dev) and use it in the app as above.
   ========================================================================== */
export default {
  // The league's clock: fired by the Cron Trigger, starts one updater run.
  // Everything is best-effort — a failed poke costs one cycle, nothing more.
  async scheduled(event, env, ctx) {
    if (!env.GH_TOKEN) return;
    try {
      await fetch("https://api.github.com/repos/pkpk157-cpu/gameon/actions/workflows/update-data.yml/dispatches", {
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
    } catch (e) { /* next tick tries again */ }
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
