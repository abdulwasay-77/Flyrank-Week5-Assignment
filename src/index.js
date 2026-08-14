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
 * required by this assignment's scope. Keeps track of which catalogue page
 * each book URL was first found on, for provenance.
 */
async function discoverBookUrls() {
  const urlToSourcePage = new Map();
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
      if (!urlToSourcePage.has(absoluteUrl)) {
        urlToSourcePage.set(absoluteUrl, pageUrl);
      }
    });

    const nextHref = $("li.next a").attr("href");
    if (nextHref && pageNumber < MAX_CATALOGUE_PAGES) {
      pageUrl = new URL(nextHref, pageUrl).toString();
      pageNumber++;
    } else {
      pageUrl = null;
    }
  }

  return { urlToSourcePage, pagesVisited };
}

/**
 * Turn a book detail URL into a safe, unique cache filename, using the
 * book's own slug from its URL rather than inventing one.
 */
function cacheFilenameForBookUrl(url) {
  const parts = new URL(url).pathname.split("/").filter(Boolean);
  const slug = parts[parts.length - 2] || "unknown-book";
  return `book-${slug}.html`;
}

/**
 * Extract the 8 raw fields for a single book detail page. Selectors are
 * aimed at the product area (div.product_main / #product_description),
 * not the whole document, so they don't accidentally grab an unrelated
 * price or heading elsewhere on the page.
 */
function extractRawRecord(html, productUrl, sourcePage) {
  const $ = cheerio.load(html);
  const main = $("div.product_main");

  const title = main.find("h1").text().trim();
  const priceText = main.find("p.price_color").first().text().trim();

  const availabilityText = main
    .find("p.availability")
    .text()
    .replace(/\s+/g, " ")
    .trim();

  const ratingClass = main.find("p.star-rating").attr("class") || "";
  const ratingText = ratingClass.replace("star-rating", "").trim() || null;

  const descriptionParagraph = $("#product_description").next("p");
  const description = descriptionParagraph.length
    ? descriptionParagraph.text().trim()
    : null;

  return {
    title,
    product_url: productUrl,
    price_text: priceText,
    availability_text: availabilityText,
    rating_text: ratingText,
    description,
    source_page: sourcePage,
    fetched_at: new Date().toISOString(),
  };
}

async function extractAllBooks(urlToSourcePage) {
  const records = [];

  for (const [bookUrl, sourcePage] of urlToSourcePage.entries()) {
    const cacheFilename = cacheFilenameForBookUrl(bookUrl);
    const html = await fetchWithCache(bookUrl, cacheFilename);
    const record = extractRawRecord(html, bookUrl, sourcePage);
    records.push(record);
  }

  return records;
}

async function main() {
  const { urlToSourcePage, pagesVisited } = await discoverBookUrls();

  console.log(`catalogue_pages=${pagesVisited}`);
  console.log(`discovered=${urlToSourcePage.size}`);
  console.log(`unique_urls=${urlToSourcePage.size}`);

  const records = await extractAllBooks(urlToSourcePage);

  console.log("--- sample record ---");
  console.log(JSON.stringify(records[0], null, 2));
  console.log(`detail_pages=${records.length}`);
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});