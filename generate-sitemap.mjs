import { writeFileSync } from "node:fs";

const SITE = "https://powerpokerleague.com";
const LOCATION_ID = "CMYhTqPA2atsodEaQLzH";
const POST_PATH = "/post/";
const TOKEN = process.env.GHL_TOKEN;
const API = "https://services.leadconnectorhq.com";

const STATIC = [
  ["/", "1.0"], ["/how-it-works", "0.8"], ["/features", "0.8"], ["/pricing", "0.9"],
  ["/resources", "0.7"], ["/guides", "0.6"], ["/about", "0.6"], ["/download", "0.7"], ["/refer", "0.6"],
];

if (!TOKEN) { console.error("ERROR: GHL_TOKEN secret is not set."); process.exit(1); }

const HEADERS = { Authorization: `Bearer ${TOKEN}`, Version: "2021-07-28", Accept: "application/json" };
const esc = (s) => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

async function api(path) {
  const res = await fetch(API + path, { headers: HEADERS });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { ok: res.ok, status: res.status, json, text };
}

async function getSites() {
  const r = await api(`/blogs/site/all?locationId=${LOCATION_ID}&skip=0&limit=50`);
  if (!r.ok) return [];
  const arr = r.json?.data || r.json?.blogs || r.json?.sites || [];
  return arr.map((s) => ({ id: s._id || s.id || s.blogId, name: s.name || s.title || "" }));
}

let apiDiag = "";
async function getPosts(blogId) {
  const limit = 20; let offset = 0; const out = [];
  for (;;) {
    const r = await api(`/blogs/posts/all?locationId=${LOCATION_ID}&blogId=${blogId}&limit=${limit}&offset=${offset}&skip=${offset}`);
    if (!apiDiag) apiDiag = `${r.status}:${(r.text||"").slice(0,140)}`;
    if (!r.ok) break;
    const batch = r.json?.blogs || r.json?.posts || r.json?.data || [];
    out.push(...batch);
    if (batch.length < limit) break;
    offset += limit;
  }
  return out;
}

// Fallback: scrape the public blog list for /post/ links (no API needed)
async function scrapePosts() {
  const found = new Set();
  for (const path of ["/guides", "/guides?page=2", "/guides?page=3"]) {
    try {
      const res = await fetch(SITE + path, { headers: { "User-Agent": "Mozilla/5.0 ppl-sitemap" } });
      if (!res.ok) continue;
      const html = await res.text();
      const re = /\/post\/[a-z0-9\-]+/gi;
      let m; while ((m = re.exec(html))) found.add(m[0].toLowerCase());
    } catch {}
  }
  return [...found];
}

const slugOf = (p) => p.urlSlug || p.url_slug || p.slug || p.seoSlug || p.path || "";
function isLive(p) {
  const st = (p.status || "").toUpperCase();
  if (st && st !== "PUBLISHED") return false;
  const pub = p.publishedAt || p.published_at || p.publishedDate;
  if (pub && new Date(pub).getTime() > Date.now()) return false;
  return true;
}

const now = new Date().toISOString();
const sites = await getSites();
const blogIds = [...new Set(sites.map((s) => s.id).filter(Boolean))];

let allPosts = [];
for (const id of blogIds) allPosts.push(...await getPosts(id));

let postUrls = allPosts.filter(isLive).map((p) => {
  const slug = slugOf(p); if (!slug) return null;
  const lm = p.updatedAt || p.updated_at || p.publishedAt || p.published_at;
  return { loc: SITE + POST_PATH + slug, lastmod: lm ? new Date(lm).toISOString() : null, priority: "0.7" };
}).filter(Boolean);

let method = "api";
if (postUrls.length === 0) {
  method = "scrape";
  const paths = await scrapePosts();
  postUrls = paths.map((p) => ({ loc: SITE + p, lastmod: null, priority: "0.7" }));
}

const urls = [ ...STATIC.map(([loc, priority]) => ({ loc: SITE + loc, lastmod: null, priority })), ...postUrls ];

const xmlBody = urls.map((u) =>
  "  <url>\n" + `    <loc>${esc(u.loc)}</loc>\n` +
  (u.lastmod ? `    <lastmod>${u.lastmod}</lastmod>\n` : "") +
  `    <priority>${u.priority}</priority>\n` + "  </url>"
).join("\n");

const debug = `method=${method} sites=${sites.length} blogIds=[${blogIds.join(",")}] apiPosts=${allPosts.length} postUrls=${postUrls.length} apiResp=[${apiDiag}]`;

const xml = `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<!-- generated ${now} | ${postUrls.length} posts + ${STATIC.length} pages -->\n` +
  `<!-- DEBUG ${esc(debug)} -->\n` +
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${xmlBody}\n</urlset>\n`;

writeFileSync("sitemap.xml", xml);
console.log(`Wrote sitemap.xml — ${urls.length} URLs (${postUrls.length} posts via ${method}).`);
