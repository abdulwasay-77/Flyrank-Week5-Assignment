const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");

const USER_AGENT = "FlyRankInternshipA5/1.0 (+https://github.com/abdulwasay-77/Flyrank-Week5-Assignment)";
const TIMEOUT_MS = 8000;
const DELAY_MS = 500;
const MAX_CATALOGUE_PAGES = 3;

const CACHE_DIR = path.join(__dirname, "..", "cache");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithCache(url, cacheFilename) {
  const cachePath = path.join(CACHE_DIR, cacheFilename);

  if (fs.existsSync(cachePath)) {
    const html = fs.readFileSync(cachePath, "utf8");
    console.log(`CACHE HIT: ${cacheFilename} (${html.length} bytes)`);
    return html;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response;
  try {
    response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (response.status !== 200) {
    throw new Error(`Fetch failed for ${url}: status ${response.status}`);
  }

  const html = await response.text();

  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
  fs.writeFileSync(cachePath, html, "utf8");

  console.log(`FETCH: ${cacheFilename} (${html.length} bytes)`);

  // Politeness delay only applies to real network requests, never to cache hits.
  await sleep(DELAY_MS);

  return html;
}

/**
 * Discover book URLs across the first MAX_CATALOGUE_PAGES catalogue pages,
 * following the site's own "next" link but stopping at the page limit
 * required by this assignment's scope.
 */
async function discoverBookUrls() {
  const bookUrls = new Set();
  let pageNumber = 1;
  let pageUrl = "https://books.toscrape.com/catalogue/page-1.html";
  let pagesVisited = 0;

  while (pageUrl && pageNumber <= MAX_CATALOGUE_PAGES) {
    const cacheFilename = `catalogue-page-${pageNumber}.html`;
    const html = await fetchWithCache(pageUrl, cacheFilename);
    pagesVisited++;

    const $ = cheerio.load(html);

    $("article.product_pod h3 a").each((_, el) => {
      const href = $(el).attr("href");
      const absoluteUrl = new URL(href, pageUrl).toString();
      bookUrls.add(absoluteUrl);
    });

    const nextHref = $("li.next a").attr("href");
    if (nextHref && pageNumber < MAX_CATALOGUE_PAGES) {
      pageUrl = new URL(nextHref, pageUrl).toString();
      pageNumber++;
    } else {
      pageUrl = null;
    }
  }

  return { bookUrls: Array.from(bookUrls), pagesVisited };
}

async function main() {
  const { bookUrls, pagesVisited } = await discoverBookUrls();

  console.log(`catalogue_pages=${pagesVisited}`);
  console.log(`discovered=${bookUrls.length}`);
  console.log(`unique_urls=${bookUrls.length}`);
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});