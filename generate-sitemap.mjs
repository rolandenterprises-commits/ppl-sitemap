import { writeFileSync } from "node:fs";

const SITE = "https://powerpokerleague.com";
const LOCATION_ID = "CMYhTqPA2atsodEaQLzH";
let BLOG_ID = "w34xWyyTQYuil8qkNL1l"; // fallback; auto-discovered below
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

async function discoverBlogId() {
  const r = await api(`/blogs/site/all?locationId=${LOCATION_ID}&skip=0&limit=50`);
  if (!r.ok) { console.log(`[discover] /blogs/site/all -> ${r.status}: ${r.text.slice(0,300)}`); return null; }
  const sites = r.json?.data || r.json?.blogs || r.json?.sites || [];
  console.log(`[discover] found ${sites.length} blog site(s): ` + sites.map((s)=>`${s._id||s.id}="${s.name||s.title||""}"`).join(" | "));
  return sites[0]?._id || sites[0]?.id || null;
}

async function fetchAllPosts(blogId) {
  const limit = 50; let offset = 0; const out = [];
  for (;;) {
    const r = await api(`/blogs/posts/all?locationId=${LOCATION_ID}&blogId=${blogId}&limit=${limit}&offset=${offset}`);
    if (!r.ok) throw new Error(`GHL posts API ${r.status} (blogId=${blogId}): ${r.text.slice(0,300)}`);
    const batch = r.json?.blogs || r.json?.posts || r.json?.data || [];
    out.push(...batch);
    if (batch.length < limit) break;
    offset += limit;
  }
  return out;
}

function isLive(p) {
  const status = (p.status || "").toUpperCase();
  if (status && status !== "PUBLISHED") return false;
  const pub = p.publishedAt || p.published_at || p.publishedDate;
  if (pub && new Date(pub).getTime() > Date.now()) return false;
  return true;
}

const now = new Date().toISOString();

const discovered = await discoverBlogId();
if (discovered) { console.log(`[discover] using blogId=${discovered}`); BLOG_ID = discovered; }
else { console.log(`[discover] could not auto-discover; falling back to blogId=${BLOG_ID}`); }

let posts = [];
try { posts = await fetchAllPosts(BLOG_ID); }
catch (e) { console.error("Failed to fetch GHL posts:", e.message); process.exit(1); }

if (posts[0]) console.log(`[posts] sample fields:`, Object.keys(posts[0]).join(", "));

const postUrls = posts.filter(isLive).map((p) => {
  const slug = p.urlSlug || p.url_slug || p.slug;
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

const xml = `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<!-- generated ${now} | ${postUrls.length} posts + ${STATIC.length} pages -->\n` +
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${xmlBody}\n</urlset>\n`;

writeFileSync("sitemap.xml", xml);
console.log(`Wrote sitemap.xml — ${urls.length} URLs (${postUrls.length} posts, ${STATIC.length} pages).`);
