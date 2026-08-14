const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");
const { z } = require("zod");

const USER_AGENT = "FlyRankInternshipA5/1.0 (+https://github.com/abdulwasay-77/Flyrank-Week5-Assignment)";
const TIMEOUT_MS = 8000;
const DELAY_MS = 500;
const MAX_CATALOGUE_PAGES = 3;

const CACHE_DIR = path.join(__dirname, "..", "cache");
const OUTPUT_DIR = path.join(__dirname, "..", "output");

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

/**
 * Turn "£51.77" into 51.77. Returns null if the text can't be parsed,
 * so validation can reject it explicitly rather than silently storing NaN.
 */
function parsePriceGbp(priceText) {
  const match = priceText.replace(/[^0-9.]/g, "");
  const value = parseFloat(match);
  return Number.isFinite(value) ? value : null;
}

/**
 * Normalize a raw record into the clean shape, keeping the original text
 * fields alongside the new numeric/derived ones.
 */
function normalizeRecord(raw) {
  return {
    ...raw,
    price_gbp: parsePriceGbp(raw.price_text),
  };
}

// Schema for a finished, storable record. product_url is this record's
// canonical URL / identity.
const BookRecordSchema = z.object({
  title: z.string().min(1),
  product_url: z.string().url().startsWith("https://"),
  price_text: z.string().min(1),
  price_gbp: z.number().positive(),
  availability_text: z.string().min(1),
  rating_text: z.string().nullable(),
  description: z.string().nullable(),
  source_page: z.string().url().startsWith("https://"),
  fetched_at: z.string().datetime(),
});

/**
 * Validate every normalized record against the schema. Valid records go to
 * one array, invalid ones to another with a human-readable reason. Also
 * dedupes by canonical URL (product_url), keeping the first occurrence,
 * so the same book never counts twice even across runs.
 */
function validateRecords(normalizedRecords) {
  const validRecords = [];
  const invalidRecords = [];
  const seenUrls = new Set();

  for (const record of normalizedRecords) {
    if (seenUrls.has(record.product_url)) {
      invalidRecords.push({ record, reason: "Duplicate product_url" });
      continue;
    }

    const result = BookRecordSchema.safeParse(record);
    if (result.success) {
      validRecords.push(result.data);
      seenUrls.add(record.product_url);
    } else {
      const reason = result.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ");
      invalidRecords.push({ record, reason });
    }
  }

  return { validRecords, invalidRecords };
}

function writeOutput(validRecords, invalidRecords) {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Always overwrite (never append), so reruns produce the same set of
  // records instead of duplicating them — that's what makes this idempotent.
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "books.json"),
    JSON.stringify(validRecords, null, 2),
    "utf8"
  );
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "errors.json"),
    JSON.stringify(invalidRecords, null, 2),
    "utf8"
  );
}

async function main() {
  const { urlToSourcePage, pagesVisited } = await discoverBookUrls();

  console.log(`catalogue_pages=${pagesVisited}`);
  console.log(`discovered=${urlToSourcePage.size}`);
  console.log(`unique_urls=${urlToSourcePage.size}`);

  const rawRecords = await extractAllBooks(urlToSourcePage);
  console.log(`detail_pages=${rawRecords.length}`);

  const normalizedRecords = rawRecords.map(normalizeRecord);
  const { validRecords, invalidRecords } = validateRecords(normalizedRecords);

  writeOutput(validRecords, invalidRecords);

  console.log(`valid_records=${validRecords.length}`);
  console.log(`invalid_records=${invalidRecords.length}`);
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});