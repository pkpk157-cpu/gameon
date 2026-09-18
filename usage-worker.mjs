// ==========================================================================
// Game On V12 — usage beacons (Cloudflare Worker + D1)
//
// The app sends small beacons here: which tab was opened, and how long the
// app was on screen. They land in a D1 table, and the organiser's page in the
// app reads totals back from /stats with a key. Nothing here touches the
// league's data; it is a usage counter the league owns.
//
// One-time setup in the Cloudflare dashboard (no card needed):
//   1. Storage & Databases → D1 → Create database, name it gameon-usage.
//   2. Workers & Pages → Create → Create Worker, name it gameon-usage, Deploy.
//   3. Edit code: delete the sample, paste THIS whole file, Deploy.
//   4. The worker's Settings → Bindings → Add → D1 database:
//        variable name USAGE, database gameon-usage.
//   5. Settings → Variables and Secrets → Add → type Secret:
//        name ADMIN_KEY, value: any long password you choose.
//   6. Send the worker URL (https://gameon-usage….workers.dev) to be put in
//      the app's config.js as usageUrl. Nothing in the app shows the totals.
//
// Reading the totals: open the worker URL itself in a browser. It asks for
// the key once, keeps it in that browser, and shows who has used the app,
// when, for how long, and which tabs get opened. Names come from the app's
// published data.json; the counter itself stores only entry ids.
// ==========================================================================

// Where beacons may come from. The app's own address, and localhost for the
// test suites. A beacon from anywhere else is refused.
const ORIGINS = ["https://pkpk157-cpu.github.io"];
const isLocal = (o) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o || "");

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS ev (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     ts INTEGER NOT NULL,      -- server time, ms
     d  TEXT NOT NULL,         -- device id, random, kept on the phone
     m  INTEGER,               -- manager (FPL entry id) when the phone has one set
     t  TEXT NOT NULL,         -- 'view' or 'session'
     p  TEXT,                  -- the tab for a view, the last tab for a session
     s  INTEGER,               -- seconds on screen, for a session
     a  TEXT,                  -- 'app' (installed) or 'web'
     th TEXT                   -- 'dark' or 'light'
   )`,
  `CREATE INDEX IF NOT EXISTS ev_ts ON ev (ts)`,
  `CREATE INDEX IF NOT EXISTS ev_d ON ev (d, ts)`,
  `CREATE INDEX IF NOT EXISTS ev_m ON ev (m, ts)`
];
let ready = null;
function ensure(db) {
  if (!ready) ready = (async () => { for (const s of SCHEMA) await db.prepare(s).run(); })().catch((e) => { ready = null; throw e; });
  return ready;
}

const DAY = 86400000;
const MAX_EVENTS = 50, MAX_SESSION = 6 * 3600;
const json = (o, status, extra) => new Response(JSON.stringify(o), { status: status || 200,
  headers: Object.assign({ "content-type": "application/json", "cache-control": "no-store" }, extra || {}) });

function cors(origin) {
  const ok = ORIGINS.indexOf(origin) >= 0 || isLocal(origin);
  return ok ? { "access-control-allow-origin": origin, "access-control-allow-methods": "GET, POST, OPTIONS",
                "access-control-allow-headers": "content-type", "access-control-max-age": "86400", "vary": "origin" } : null;
}

// What a beacon may say. Anything outside these shapes is dropped, not stored.
function clean(body) {
  if (!body || typeof body !== "object") return null;
  const d = typeof body.d === "string" && /^[A-Za-z0-9_-]{8,40}$/.test(body.d) ? body.d : null;
  if (!d) return null;
  const m = Number.isInteger(body.m) && body.m > 0 && body.m < 1e9 ? body.m : null;
  const a = body.a === "app" ? "app" : "web";
  const th = body.th === "dark" ? "dark" : "light";
  const ev = Array.isArray(body.ev) ? body.ev.slice(0, MAX_EVENTS) : [];
  const rows = [];
  for (const e of ev) {
    if (!e || typeof e !== "object") continue;
    const t = e.t === "view" || e.t === "session" ? e.t : null;
    if (!t) continue;
    const p = typeof e.p === "string" ? e.p.slice(0, 60) : null;
    const s = t === "session" && Number.isFinite(e.s) ? Math.max(0, Math.min(MAX_SESSION, Math.round(e.s))) : null;
    if (t === "session" && s === null) continue;
    rows.push({ t, p, s });
  }
  return { d, m, a, th, rows };
}

async function beacon(request, env, headers) {
  let body = null;
  try { body = JSON.parse(await request.text()); } catch (e) { return json({ error: "bad json" }, 400, headers); }
  const b = clean(body);
  if (!b) return json({ error: "bad beacon" }, 400, headers);
  if (!b.rows.length) return new Response(null, { status: 204, headers });
  await ensure(env.USAGE);
  const now = Date.now();
  const stmt = env.USAGE.prepare("INSERT INTO ev (ts, d, m, t, p, s, a, th) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  await env.USAGE.batch(b.rows.map((r) => stmt.bind(now, b.d, b.m, r.t, r.p, r.s, b.a, b.th)));
  return new Response(null, { status: 204, headers });
}

async function stats(url, env, headers) {
  const key = url.searchParams.get("key") || "";
  if (!env.ADMIN_KEY || key !== env.ADMIN_KEY) return json({ error: "no" }, 401, headers);
  await ensure(env.USAGE);
  const db = env.USAGE;
  const days = Math.max(7, Math.min(120, parseInt(url.searchParams.get("days") || "30", 10) || 30));
  const since = Date.now() - days * DAY;
  const today = Date.now() - (Date.now() % DAY);
  const rows = async (sql, ...args) => (await db.prepare(sql).bind(...args).all()).results || [];
  const one = async (sql, ...args) => (await db.prepare(sql).bind(...args).first()) || {};
  const totals = await one(
    `SELECT COUNT(DISTINCT d) AS devices, COUNT(DISTINCT m) AS managers,
            SUM(t='view') AS views, SUM(t='session') AS sessions, COALESCE(SUM(s),0) AS seconds, MIN(ts) AS since
       FROM ev`);
  const todayRow = await one(`SELECT COUNT(DISTINCT d) AS devices, SUM(t='view') AS views, COALESCE(SUM(s),0) AS seconds FROM ev WHERE ts >= ?`, today);
  const byDay = await rows(
    `SELECT (ts / ${DAY}) * ${DAY} AS day, COUNT(DISTINCT d) AS devices, SUM(t='view') AS views, COALESCE(SUM(s),0) AS seconds
       FROM ev WHERE ts >= ? GROUP BY day ORDER BY day`, since);
  const managers = await rows(
    `SELECT m, COUNT(DISTINCT d) AS devices, SUM(t='view') AS views, SUM(t='session') AS sessions,
            COALESCE(SUM(s),0) AS seconds, MAX(ts) AS last, MIN(ts) AS first
       FROM ev WHERE m IS NOT NULL GROUP BY m ORDER BY last DESC`);
  // devices that have never said who they are
  const anon = await one(
    `SELECT COUNT(DISTINCT d) AS devices, SUM(t='view') AS views, COALESCE(SUM(s),0) AS seconds, MAX(ts) AS last
       FROM ev WHERE d NOT IN (SELECT DISTINCT d FROM ev WHERE m IS NOT NULL)`);
  const views = await rows(`SELECT p, COUNT(*) AS n, COUNT(DISTINCT d) AS devices FROM ev WHERE t='view' AND p IS NOT NULL GROUP BY p ORDER BY n DESC LIMIT 40`);
  const apps = await rows(`SELECT a, COUNT(DISTINCT d) AS devices FROM ev GROUP BY a`);
  const themes = await rows(`SELECT th, COUNT(DISTINCT d) AS devices FROM ev GROUP BY th`);
  return json({ at: Date.now(), days, totals, today: todayRow, byDay, managers, anon, views, apps, themes }, 200, headers);
}


// The organiser's page, served at the worker's own address. One file, no
// dependencies: it asks for the key, reads /stats, and names the managers
// from the league's published data.
const DATA_URL = "https://pkpk157-cpu.github.io/gameon/data.json";
const DASH = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Game On V12 · who uses the app</title>
<style>
:root{color-scheme:light dark;--ink:#191922;--soft:#54545f;--faint:#6f6f7d;--line:rgba(20,20,45,.12);--card:#fff;--bg:#f3f1f8;--bar:#d0004f;--head:#37003c}
@media(prefers-color-scheme:dark){:root{--ink:#f3f2f8;--soft:#c1c0cc;--faint:#8a8996;--line:rgba(255,255,255,.12);--card:#1c1c28;--bg:#0f0d16;--bar:#ff2882;--head:#f2d9ff}}
*{box-sizing:border-box}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:var(--ink);background:var(--bg);padding:16px;max-width:720px;margin:0 auto}
h1{font-size:20px;margin:6px 0 14px;color:var(--head)}h2{font-size:15px;margin:22px 0 8px;color:var(--head)}
.note{font-size:12.5px;color:var(--faint);line-height:1.5}.tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.tile{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px 12px;min-width:0}.tile .l{font-size:10px;font-weight:800;letter-spacing:.4px;text-transform:uppercase;color:var(--faint)}
.tile .v{font-size:20px;font-weight:800;margin:2px 0;font-variant-numeric:tabular-nums;white-space:nowrap}.tile .s{font-size:11px;color:var(--faint)}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px}table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:13.5px}
th{font-size:10.5px;text-transform:uppercase;letter-spacing:.4px;color:var(--faint);text-align:left;padding:6px 6px;border-bottom:1px solid var(--line)}
td{padding:9px 6px;border-bottom:1px solid var(--line);vertical-align:middle}th.n,td.n{text-align:right;width:64px;white-space:nowrap;font-variant-numeric:tabular-nums}
td .who{font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}td .mgr{font-size:11.5px;color:var(--faint);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}tr.dim td{color:var(--faint)}
svg{display:block;width:100%;height:auto}rect{fill:var(--bar)}rect:hover{opacity:.75}text{font-size:9px;font-weight:600;fill:var(--faint)}
input{font:inherit;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--ink);width:100%}button{font:inherit;font-weight:700;padding:10px 16px;border-radius:10px;border:0;background:var(--bar);color:#fff;margin-top:8px}
.err{color:#d1483a;font-weight:600;margin-top:8px}.row{display:flex;gap:8px;flex-wrap:wrap}.row .tile{flex:1 1 30%}
</style></head><body>
<h1>Who uses the app</h1>
<div id="gate" class="card" style="display:none"><div class="note">The organiser key (the ADMIN_KEY secret on this worker). It stays in this browser.</div>
<input id="key" type="password" placeholder="key" autocomplete="off"><button id="go">Open</button><div id="err" class="err"></div></div>
<div id="out"></div>
<script>
(function(){
var qs=new URLSearchParams(location.search),DATA=qs.get("data")||${JSON.stringify(DATA_URL)};
var K="gameon-usage-key",out=document.getElementById("out"),gate=document.getElementById("gate"),err=document.getElementById("err");
function esc(s){return String(s==null?"":s).replace(/[&<>"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]});}
function num(n){return Number(n||0).toLocaleString("en-US");}
function hm(sec){sec=Math.round(+sec||0);if(sec<60)return sec+"s";var m=Math.round(sec/60);if(m<60)return m+"m";var h=Math.floor(m/60);m=m%60;return h+"h"+(m?" "+m+"m":"");}
function ago(ms){if(ms<0)ms=0;var m=Math.round(ms/60000);if(m<1)return"just now";if(m<60)return m+"m ago";var h=Math.round(m/60);if(h<48)return h+"h ago";return Math.round(h/24)+"d ago";}
function tile(l,v,s){return'<div class="tile"><div class="l">'+esc(l)+'</div><div class="v">'+esc(v)+'</div><div class="s">'+esc(s)+'</div></div>';}
function render(U,names){var T=U.totals||{},D=U.today||{},A={},TH={};(U.apps||[]).forEach(function(r){A[r.a]=+r.devices});(U.themes||[]).forEach(function(r){TH[r.th]=+r.devices});
var h='<div class="tiles">'+tile("People",num(T.managers),"set their team")+tile("Devices",num(T.devices),(U.anon&&U.anon.devices?num(U.anon.devices)+" not identified":"all identified"))+tile("Today",num(D.devices),(D.devices===1?"device, ":"devices, ")+hm(D.seconds))+tile("Opens",num(T.sessions),"stretches on screen")+tile("Views",num(T.views),"tab openings")+tile("Time",hm(T.seconds),"on screen, in all")+'</div>';
var days=U.days||30,DAY=86400000,today=Date.now()-(Date.now()%DAY),by={};(U.byDay||[]).forEach(function(r){by[+r.day]=r});var bars=[],max=1;
for(var i=days-1;i>=0;i--){var d=today-i*DAY,r=by[d]||{devices:0,views:0,seconds:0};bars.push({d:d,n:+r.devices||0,v:+r.views||0,s:+r.seconds||0});max=Math.max(max,+r.devices||0);}
var W=600,H=120,gap=3,bw=(W-gap*(days-1))/days,fmt=function(d){return new Date(d).toLocaleDateString(undefined,{day:"numeric",month:"short"})};
h+='<h2>Devices a day</h2><div class="card"><svg viewBox="0 0 '+W+' '+(H+16)+'" role="img" aria-label="Devices a day">'+bars.map(function(b,k){var bh=Math.max(b.n?2:0,Math.round(b.n/max*H)),x=k*(bw+gap);return'<rect x="'+x.toFixed(1)+'" y="'+(H-bh)+'" width="'+bw.toFixed(1)+'" height="'+bh+'" rx="3"><title>'+esc(fmt(b.d))+': '+b.n+(b.n===1?" device, ":" devices, ")+b.v+' views, '+hm(b.s)+'</title></rect>';}).join("")+'<text x="0" y="'+(H+12)+'">'+esc(fmt(bars[0].d))+'</text><text x="'+W/2+'" y="'+(H+12)+'" text-anchor="middle">peak '+max+'</text><text x="'+W+'" y="'+(H+12)+'" text-anchor="end">today</text></svg></div>';
var M=U.managers||[];h+='<h2>Who</h2>';
if(M.length){h+='<div class="card"><table><thead><tr><th>Manager</th><th class="n">Seen</th><th class="n">Opens</th><th class="n">Time</th></tr></thead><tbody>'+M.map(function(r){var m=names[+r.m];return'<tr><td><div class="who">'+esc(m?m.entryName:"Entry "+r.m)+'</div><div class="mgr">'+esc(m?m.playerName:"not in the league")+(r.devices>1?" · "+r.devices+" devices":"")+'</div></td><td class="n">'+esc(ago(Date.now()-r.last))+'</td><td class="n">'+num(r.sessions)+'</td><td class="n">'+hm(r.seconds)+'</td></tr>';}).join("")+(U.anon&&U.anon.devices?'<tr class="dim"><td><div class="who">Not identified</div><div class="mgr">'+num(U.anon.devices)+(U.anon.devices===1?" device":" devices")+' without a team set</div></td><td class="n">'+(U.anon.last?esc(ago(Date.now()-U.anon.last)):"—")+'</td><td class="n">'+num(U.anon.views)+'</td><td class="n">'+hm(U.anon.seconds)+'</td></tr>':"")+'</tbody></table><div class="note" style="margin-top:8px">Opens are stretches with the app on screen; a phone counts under a manager once it has set its team.</div></div>';}
else h+='<div class="card note">Nobody has set their team on a phone that has sent a beacon yet'+(U.anon&&U.anon.devices?", though "+num(U.anon.devices)+(U.anon.devices===1?" device has":" devices have")+" been in":"")+'.</div>';
var V=U.views||[];if(V.length)h+='<h2>Tabs</h2><div class="card"><table><thead><tr><th>Tab</th><th class="n">Opens</th><th class="n">Devices</th></tr></thead><tbody>'+V.map(function(r){return'<tr><td>'+esc(String(r.p).replace(/^\\//,"")||"home")+'</td><td class="n">'+num(r.n)+'</td><td class="n">'+num(r.devices)+'</td></tr>';}).join("")+'</tbody></table></div>';
h+='<p class="note">'+num(A.app)+' installed on a home screen, '+num(A.web)+' in a browser · '+num(TH.dark)+' dark, '+num(TH.light)+' light · counting since '+(T.since?esc(fmt(T.since)):"—")+' · <a href="#" id="forget">forget the key</a></p>';
out.innerHTML=h;document.getElementById("forget").onclick=function(e){e.preventDefault();localStorage.removeItem(K);location.reload();};}
function load(key){out.innerHTML='<p class="note">Reading the counter…</p>';
var names={};var nm=fetch(DATA,{cache:"no-store"}).then(function(r){return r.json()}).then(function(j){((j.dataset||j).managers||[]).forEach(function(m){names[+m.id]=m});}).catch(function(){});
fetch(new URL("stats?days=30&key="+encodeURIComponent(key),location.href),{cache:"no-store"}).then(function(r){if(r.status===401)throw new Error("That key was refused.");if(!r.ok)throw new Error("The counter answered "+r.status+".");return r.json()})
.then(function(U){return nm.then(function(){localStorage.setItem(K,key);gate.style.display="none";render(U,names);})})
.catch(function(e){out.innerHTML="";gate.style.display="";err.textContent=e.message||"Could not read the counter.";});}
document.getElementById("go").onclick=function(){load(document.getElementById("key").value.trim());};
document.getElementById("key").addEventListener("keydown",function(e){if(e.key==="Enter")document.getElementById("go").click();});
var saved=null;try{saved=localStorage.getItem(K)}catch(e){}if(saved)load(saved);else gate.style.display="";
})();
</script></body></html>`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("origin");
    const headers = cors(origin);
    if (request.method === "OPTIONS") return new Response(null, { status: headers ? 204 : 403, headers: headers || {} });
    try {
      if (request.method === "POST" && url.pathname.endsWith("/beacon")) {
        if (!headers) return json({ error: "origin" }, 403);
        return await beacon(request, env, headers);
      }
      if (request.method === "GET" && url.pathname.endsWith("/stats")) {
        return await stats(url, env, headers || {});
      }
      if (request.method === "GET") return new Response(DASH, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
      return json({ error: "method" }, 405, headers || {});
    } catch (e) {
      return json({ error: String(e && e.message || e) }, 500, headers || {});
    }
  }
};
