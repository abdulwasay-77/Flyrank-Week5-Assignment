# FlyRank Week 5 — The Polite Scraper (Assignment 5)

A small, polite scraping pipeline that downloads the first three catalogue
pages of [Books to Scrape](https://books.toscrape.com), visits all 60 book
pages, and turns the messy HTML into clean, schema-checked JSON.

## Target classification

- **Site:** `books.toscrape.com`
- **Why this site is appropriate:** Books to Scrape is a public sandbox built
  specifically for people to practise web scraping on. Its companion site,
  `toscrape.com`, describes it explicitly as a training target — there is no
  real business, no real user data, and no login or paywall involved.
- **Scope:** only the first 3 catalogue pages, and the 60 book detail pages
  linked from them. No other pages on the site are touched.
- **Data collected:** book title, price, availability, star rating,
  description, and the book's own URL — all fields the site displays
  publicly with no login required.
- **`robots.txt` check:** requested `https://books.toscrape.com/robots.txt`
  once on 2026-08-14. Result: **HTTP 404 Not Found** — no robots file exists
  on this site. A missing file is not the same as permission; it simply means
  there are no automated rules published, so this scraper still follows its
  own politeness rules (identifying user-agent, delays, timeouts, and
  respecting status codes) regardless.

I will not reuse this code on another site without checking its rules and
terms first.

## Lane & requirements

- **Language:** Node.js (JavaScript lane)
- **Dependencies:** `cheerio` (HTML parsing), `zod` (schema validation) — both
  installed via npm, no other services or accounts required

## How to run

```powershell
git clone https://github.com/abdulwasay-77/Flyrank-Week5-Assignment.git
cd Flyrank-Week5-Assignment
npm install
node src/index.js
```

This produces `output/books.json`, `output/errors.json`, and
`output/run-report.json`. Re-running the same command is safe — it reads from
`cache/` instead of re-fetching, and rewrites the same 60 records rather than
duplicating them.

## Record schema

Each entry in `books.json` has:

| Field                | Type              | Notes                                        |
|-----------------------|-------------------|-----------------------------------------------|
| `title`               | string            | Book title                                     |
| `product_url`         | string (URL)      | Canonical identity of the record               |
| `price_text`          | string            | Original price as shown on the page            |
| `price_gbp`           | number            | Parsed numeric price                           |
| `availability_text`   | string            | Original stock text                            |
| `rating_text`         | string or null    | Star rating as a word (e.g. "Three")           |
| `description`         | string or null    | `null` when the book has no description        |
| `source_page`         | string (URL)      | Which catalogue page this book was found on     |
| `fetched_at`          | string (ISO 8601) | When this record was fetched                   |

Records that fail this schema are written to `errors.json` with a reason
instead of `books.json`.

## Politeness rules

- Every real request sends an identifying user-agent:
  `FlyRankInternshipA5/1.0 (+https://github.com/abdulwasay-77/Flyrank-Week5-Assignment)`
- Every request has an 8-second timeout — nothing waits forever
- At least 500ms between real requests to the site; cached pages never
  trigger a delay, since they never leave the machine
- Status codes are checked before any parsing; only `200` is treated as
  a valid page
- Timeouts and `5xx` errors are retried once; `404` and `403` are never
  retried

## Honest limitation

At least one book's description text on the source site contains a repeated
sentence (visible in the raw HTML itself, not introduced by this scraper).
The scraper stores exactly what the page contains — it does not invent or
"clean up" text beyond whitespace trimming, so this duplication is preserved
as-is in `books.json`.

## Sample run report

```json
{
  "start_time": "2026-08-15T13:35:28.016Z",
  "duration_ms": 276,
  "catalogue_pages_visited": 3,
  "unique_book_urls_discovered": 60,
  "pages_fetched": 0,
  "cache_hits": 63,
  "valid_records": 60,
  "invalid_records": 0,
  "failed_pages": 0,
  "failed_page_details": []
}
```

## Why this assignment needed no browser

The data used by this scraper is already present in the HTML the server
sends on first response — there is no JavaScript rendering step that adds
fields after page load. A headless browser would only add cost (memory, CPU,
and run time) with no extra data gained.

## Ethics note

This scraper only touches a public sandbox built for practising scraping. In
general: prefer an official API when one exists, never bypass logins,
paywalls, or explicit blocks, and collect only the data actually needed for
the task at hand.