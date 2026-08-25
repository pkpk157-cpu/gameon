/* ==========================================================================
   Game On V12 — Cloudflare Worker CORS proxy for the FPL API.
   Free, fast, and reliable for a whole league (public proxies rate-limit / go
   down). Deploy once, then paste your Worker URL in the app:
   Settings → Data source → Custom proxy template:
       https://YOUR-WORKER.workers.dev/?url={url}

   Deploy (2 min, no card needed):
   1. Sign in at https://dash.cloudflare.com  →  Workers & Pages  →  Create  →
      Create Worker.  Give it a name, click Deploy.
   2. Click "Edit code", delete the sample, paste THIS whole file, click Deploy.
   3. Copy the worker URL (…​.workers.dev) and use it in the app as above.
   ========================================================================== */
export default {
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
