// FPL news for the menu's News page: headlines, never whole articles, each
// opening on its own site. Three sources, each checked from GitHub's runners
// before this was written (5 Nov 2026):
//   fpl  the Premier League's own FPL articles, the ones the FPL app shows:
//        its content API, filtered on the tag its FPL pieces carry
//   ffs  Fantasy Football Scout's RSS feed
//   gn   Google News, searched for "Fantasy Premier League": everyone else
// Pictures (checked the same way, 7 Nov 2026): the PL's picture service makes
// a small copy on request (about 10-15 KB at 320px wide; its plain address
// is the 2 MB original), and the Scout's own WordPress interface names each
// post's picture in small sizes (about 6-10 KB). Google News has none; the
// app finds its own picture for those. A picture is only ever a small copy
// from one of those two hosts, and a missing one never costs a headline.
// Read at most every NEWS_EVERY minutes. A source that fails keeps what it had
// last time; nothing here may ever throw into the data run, so the caller gets
// the last good news (or none) whatever happens.
const NEWS_EVERY = 15;           // minutes between reads
const KEEP_DAYS = 21;            // older than this is not news
const MAX = { fpl: 12, ffs: 12, gn: 20 };
const OUT_MAX = 40;
// the Scout's posts with their pictures: links matched to the feed's
const FFS_PICS = "https://www.fantasyfootballscout.co.uk/wp-json/wp/v2/posts?per_page=20&_embed=wp:featuredmedia&_fields=link,_links,_embedded";
const PIC_HOSTS = ["resources.premierleague.pulselive.com", "cdn.fantasyfootballscout.co.uk"];
const SOURCES = {
  fpl: "https://api.premierleague.com/content/premierleague/text/EN?pageSize=20&tagNames=" + encodeURIComponent("label:Fantasy Premier League"),
  ffs: "https://www.fantasyfootballscout.co.uk/feed/",
  gn: "https://news.google.com/rss/search?q=%22Fantasy+Premier+League%22&hl=en-GB&gl=GB&ceid=GB:en"
};

// text from feed markup: CDATA unwrapped, tags dropped, entities decoded,
// white space folded
function plain(s) {
  if (s == null) return "";
  let t = String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  // a feed's HTML often arrives escaped once: decode, then drop the tags
  t = decode(t).replace(/<[^>]*>/g, " ");
  return decode(t).replace(/\s+/g, " ").trim();
}
function decode(s) {
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => { const c = parseInt(h, 16); return c > 0 && c < 0x110000 ? String.fromCodePoint(c) : ""; })
    .replace(/&#(\d+);/g, (m, d) => { const c = +d; return c > 0 && c < 0x110000 ? String.fromCodePoint(c) : ""; })
    .replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
function tag(block, name) {
  const m = new RegExp("<" + name + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + name + ">", "i").exec(block);
  return m ? m[1] : null;
}
// a summary in a line or two: cut at a word, never mid-word
function clip(s, n) {
  s = String(s || "");
  if (s.length <= n) return s;
  const cut = s.slice(0, n + 1).replace(/\s+\S*$/, "");
  return (cut || s.slice(0, n)).replace(/[\s,;:–-]+$/, "") + "…";
}
// only a plain https address is ever a link
function safeUrl(u) {
  try { const x = new URL(String(u || "").trim()); return x.protocol === "https:" ? x.href : null; } catch (e) { return null; }
}
function isoOf(d) {
  const t = Date.parse(d);
  return isFinite(t) ? new Date(t).toISOString() : null;
}
function hostName(u) {
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return ""; }
}
// a picture address: https, from a known picture host, a picture file
function safePic(u) {
  const s = safeUrl(u);
  if (!s) return null;
  try {
    const x = new URL(s);
    return PIC_HOSTS.indexOf(x.hostname) !== -1 && /\.(jpe?g|png|webp)$/i.test(x.pathname) && s.length <= 400 ? s : null;
  } catch (e) { return null; }
}
// a link as a key: no query, no trailing slash, any case
function linkKey(u) {
  try { const x = new URL(String(u)); return (x.hostname.replace(/^www\./, "") + x.pathname.replace(/\/+$/, "")).toLowerCase(); } catch (e) { return ""; }
}

// RSS 2.0 items: Fantasy Football Scout and Google News
function parseRss(xml, src) {
  const out = [];
  String(xml || "").split(/<item[\s>]/i).slice(1).forEach((raw) => {
    const block = raw.split(/<\/item>/i)[0];
    let title = plain(tag(block, "title"));
    const url = safeUrl(plain(tag(block, "link")));
    const d = isoOf(plain(tag(block, "pubDate")));
    if (!title || !url || !d) return;
    let outlet = "", summary = "";
    if (src === "gn") {
      // Google names the outlet, and also appends it to the title
      outlet = plain(tag(block, "source"));
      if (outlet && title.endsWith(" - " + outlet)) title = title.slice(0, -(outlet.length + 3)).trim();
      // the search finds any article that mentions FPL somewhere inside it;
      // only one whose headline is about FPL is FPL news (the app checks too)
      if (!/\bFPL\b|fantasy/i.test(title)) return;
    } else {
      outlet = "Fantasy Football Scout";
      // the first paragraph; the rest is WordPress's "The post ... appeared first on ..."
      const desc = tag(block, "description") || "";
      const first = /<p>([\s\S]*?)<\/p>/i.exec(decode(desc.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")));
      summary = clip(plain(first ? first[1] : desc).replace(/\s*The post .* appeared first on .*$/i, ""), 180);
    }
    out.push({ s: src, t: title, u: url, o: outlet, d, x: summary });
  });
  return out;
}

// the Premier League's content API
function parsePl(json) {
  const out = [];
  ((json && json.content) || []).forEach((a) => {
    if (!a || !a.title) return;
    const d = isoOf(a.date);
    if (!d) return;
    // a club's article the PL lists links out to the club; its own live on
    // premierleague.com under the id and the title's address segment
    let url = safeUrl(a.hotlinkUrl);
    if (!url && /^\d+$/.test(String(a.id)) && /^[a-z0-9-]+$/.test(String(a.titleUrlSegment || "")))
      url = "https://www.premierleague.com/en/news/" + a.id + "/" + a.titleUrlSegment;
    if (!url) return;
    const own = /(^|\.)premierleague\.com$/.test(hostName(url));
    const it = { s: "fpl", t: plain(a.title), u: url, o: own ? "Premier League" : hostName(url), d,
               x: clip(plain(a.summary || a.description || ""), 180) };
    // the picture service's small copy (its "photo-resources" address resizes)
    const od = (a.leadMedia && a.leadMedia.onDemandUrl) || a.onDemandUrl;
    const pic = od && /\/photo-resources\//.test(String(od)) && safePic(od);
    if (pic && pic.indexOf("?") === -1) it.i = pic + "?width=320";
    out.push(it);
  });
  return out;
}

// the Scout's pictures by post: link key -> a small copy (about 320px wide)
function parseFfsPics(json) {
  const out = {};
  (Array.isArray(json) ? json : []).forEach((p) => {
    const m = p && p._embedded && p._embedded["wp:featuredmedia"] && p._embedded["wp:featuredmedia"][0];
    const sz = (m && m.media_details && m.media_details.sizes) || {};
    const pick = ["featured_mob", "medium", "featured_mob_slide", "thumbnail"].map((k) => sz[k] && safePic(sz[k].source_url)).filter(Boolean)[0];
    const k = p && linkKey(p.link);
    if (k && pick) out[k] = pick;
  });
  return out;
}

// One list, newest first: each headline once (the FPL's own copy first, then
// the Scout's, then the wider web), nothing older than KEEP_DAYS, nothing
// dated more than an hour ahead.
function merge(bySource, nowMs) {
  const seen = new Set(), all = [];
  const key = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  ["fpl", "ffs", "gn"].forEach((k) => {
    (bySource[k] || []).slice().sort((a, b) => b.d.localeCompare(a.d)).slice(0, MAX[k]).forEach((it) => {
      const t = Date.parse(it.d);
      if (!(t > nowMs - KEEP_DAYS * 864e5 && t < nowMs + 36e5)) return;
      const kk = key(it.t);
      if (!kk || seen.has(kk)) return;
      seen.add(kk); all.push(it);
    });
  });
  return all.sort((a, b) => b.d.localeCompare(a.d)).slice(0, OUT_MAX);
}

async function fetchText(url, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs || 15000);
  try {
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; GameOnV12-bot/1.0)", "Accept": "*/*" }, signal: ctrl.signal });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.text();
  } finally { clearTimeout(t); }
}

// prev: the news published last time (or nothing). Returns the news to
// publish now: fresh where a source answered, last time's where it did not.
async function newsOf(prev, opts) {
  opts = opts || {};
  const nowMs = opts.now || Date.now(), get = opts.fetchText || fetchText;
  try {
    const last = prev && typeof prev === "object" && Array.isArray(prev.items) ? prev : null;
    if (last && last.at && nowMs - Date.parse(last.at) < NEWS_EVERY * 6e4 && !opts.force) return last;
    const bySource = {}, sources = {};
    for (const k of Object.keys(SOURCES)) {
      try {
        const body = await get(SOURCES[k]);
        const items = k === "fpl" ? parsePl(JSON.parse(body)) : parseRss(body, k);
        if (!items.length) throw new Error("no articles read");
        bySource[k] = items; sources[k] = { ok: true, n: items.length };
      } catch (e) {
        // keep the headlines this source gave last time
        bySource[k] = last ? last.items.filter((it) => it.s === k) : [];
        sources[k] = { ok: false, why: String((e && e.message) || e).slice(0, 80) };
      }
    }
    // pictures for the Scout's headlines: fresh where its interface answered,
    // otherwise whatever each headline had last time
    let ffsPics = {};
    if (bySource.ffs && bySource.ffs.length) {
      try { ffsPics = parseFfsPics(JSON.parse(await get(FFS_PICS))); } catch (e) { ffsPics = {}; }
    }
    const lastPic = {};
    (last ? last.items : []).forEach((it) => { if (it && it.i && safePic(it.i)) lastPic[it.u] = it.i; });
    Object.keys(bySource).forEach((k) => {
      bySource[k] = bySource[k].map((it) => {
        if (it.i) return it;
        const pic = (k === "ffs" && ffsPics[linkKey(it.u)]) || lastPic[it.u];
        return pic ? Object.assign({}, it, { i: pic }) : it;
      });
    });
    const items = merge(bySource, nowMs);
    return { at: new Date(nowMs).toISOString(), items, sources };
  } catch (e) {
    return prev || null;
  }
}

module.exports = { newsOf, parseRss, parsePl, parseFfsPics, merge, plain, clip, safeUrl, safePic, SOURCES, FFS_PICS, NEWS_EVERY };
