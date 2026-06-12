import { writeFileSync } from "node:fs";

const SITE = "https://powerpokerleague.com";
const LOCATION_ID = "CMYhTqPA2atsodEaQLzH";
const EXTRA_BLOG_IDS = ["w34xWyyTQYuil8qkNL1l"];
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
  if (!r.ok) { console.log(`[sites] ${r.status}: ${r.text.slice(0,200)}`); return []; }
  const arr = r.json?.data || r.json?.blogs || r.json?.sites || [];
  return arr.map((s) => ({ id: s._id || s.id || s.blogId, name: s.name || s.title || "" }));
}

async function getPosts(blogId) {
  const limit = 50; let offset = 0; const out = [];
  for (;;) {
    const r = await api(`/blogs/posts/all?locationId=${LOCATION_ID}&blogId=${blogId}&limit=${limit}&offset=${offset}`);
    if (!r.ok) { console.log(`[posts] blog ${blogId} -> ${r.status}: ${r.text.slice(0,150)}`); break; }
    const batch = r.json?.blogs || r.json?.posts || r.json?.data || [];
    out.push(...batch);
    if (batch.length < limit) break;
    offset += limit;
  }
  return out;
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
console.log(`[sites] ${sites.length}: ` + sites.map((s) => `${s.id}="${s.name}"`).join(" | "));

const blogIds = [...new Set([...sites.map((s) => s.id).filter(Boolean), ...EXTRA_BLOG_IDS])];
let allPosts = [];
const perBlog = [];
for (const id of blogIds) {
  const ps = await getPosts(id);
  perBlog.push(`${id}:${ps.length}`);
  allPosts.push(...ps);
}
console.log(`[posts] per-blog: ${perBlog.join(", ")} | total=${allPosts.length}`);
const sampleFields = allPosts[0] ? Object.keys(allPosts[0]).join("|") : "none";
console.log(`[posts] sample fields: ${sampleFields}`);

const postUrls = allPosts.filter(isLive).map((p) => {
  const slug = slugOf(p);
  if (!slug) return null;
  const lm = p.updatedAt || p.updated_at || p.publishedAt || p.published_at;
  return { loc: SITE + POST_PATH + slug, lastmod: lm ? new Date(lm).toISOString() : null, priority: "0.7" };
}).filter(Boolean);

const urls = [ ...STATIC.map(([loc, priority]) => ({ loc: SITE + loc, lastmod: null, priority })), ...postUrls ];

const xmlBody = urls.map((u) =>
  "  <url>\n" + `    <loc>${esc(u.loc)}</loc>\n` +
  (u.lastmod ? `    <lastmod>${u.lastmod}</lastmod>\n` : "") +
  `    <priority>${u.priority}</priority>\n` + "  </url>"
).join("\n");

const debug = `sites=${sites.length} perBlog=[${perBlog.join(",")}] rawPosts=${allPosts.length} live=${postUrls.length} fields=[${sampleFields}]`;

const xml = `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<!-- generated ${now} | ${postUrls.length} posts + ${STATIC.length} pages -->\n` +
  `<!-- DEBUG ${esc(debug)} -->\n` +
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${xmlBody}\n</urlset>\n`;

writeFileSync("sitemap.xml", xml);
console.log(`Wrote sitemap.xml — ${urls.length} URLs (${postUrls.length} posts, ${STATIC.length} pages).`);
