const fs = require("fs");
const path = require("path");

const USER_AGENT = "FlyRankInternshipA5/1.0 (+https://github.com/abdulwasay-77/Flyrank-Week5-Assignment)";
const TIMEOUT_MS = 8000;

const CACHE_DIR = path.join(__dirname, "..", "cache");

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
  return html;
}

async function main() {
  const url = "https://books.toscrape.com/catalogue/page-1.html";
  await fetchWithCache(url, "catalogue-page-1.html");
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});