import { writeFileSync } from "node:fs";

const SITE = "https://powerpokerleague.com";
const LOCATION_ID = "CMYhTqPA2atsodEaQLzH";
const BLOG_ID = "w34xWyyTQYuil8qkNL1l";
const POST_PATH = "/post/";
const TOKEN = process.env.GHL_TOKEN;

const STATIC = [
  ["/", "1.0"], ["/how-it-works", "0.8"], ["/features", "0.8"], ["/pricing", "0.9"],
  ["/resources", "0.7"], ["/guides", "0.6"], ["/about", "0.6"], ["/download", "0.7"], ["/refer", "0.6"],
];

if (!TOKEN) { console.error("ERROR: GHL_TOKEN secret is not set."); process.exit(1); }

const esc = (s) => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

async function fetchAllPosts() {
  const limit = 50; let offset = 0; const out = [];
  for (;;) {
    const url = `https://services.leadconnectorhq.com/blogs/posts/all?locationId=${LOCATION_ID}&blogId=${BLOG_ID}&limit=${limit}&offset=${offset}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}`, Version: "2021-07-28", Accept: "application/json" } });
    if (!res.ok) throw new Error(`GHL API ${res.status}: ${(await res.text()).slice(0,400)}`);
    const data = await res.json();
    const batch = data.blogs || data.posts || data.data || [];
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
let posts = [];
try { posts = await fetchAllPosts(); }
catch (e) { console.error("Failed to fetch GHL posts:", e.message); process.exit(1); }

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
