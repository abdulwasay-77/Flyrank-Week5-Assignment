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

## Status

🚧 Work in progress — stages will be documented here as they're completed.