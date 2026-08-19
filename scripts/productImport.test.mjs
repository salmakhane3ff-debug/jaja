#!/usr/bin/env node
/**
 * scripts/productImport.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * The manual product-URL importer: SSRF gate, Mercari extraction, normalization,
 * the media-pipeline reuse, and the admin-form wiring.
 *
 * The network is never touched: safeFetch takes an injected `fetchImpl`, so
 * redirects, timeouts, oversized bodies and malformed documents are all driven
 * deterministically here. Structural assertions cover the parts that live in
 * React/Prisma code this runner cannot execute.
 *
 * Run: node scripts/productImport.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { readFileSync, readdirSync } from "node:fs";
import {
  validateUrl, isBlockedHost, isPrivateAddress, safeFetch, ERR,
} from "../src/lib/productImport/security.js";
import {
  parseJsonLdProducts, parseMetaTags, parseMetaImages, parseNextData,
  normalizePrice, toAmount, dedupeImages, decodeEntities, cleanText,
  normalizeResult, MAX_IMAGES,
} from "../src/lib/productImport/normalize.js";
import {
  extractMercari, MERCARI_PAGE_HOSTS, MERCARI_IMAGE_HOSTS, mercariSource,
} from "../src/lib/productImport/mercari.js";
import { importFromUrl, resolveSource, allPageHosts, SOURCES } from "../src/lib/productImport/index.js";

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log("  PASS ", n); } else { fail++; console.log("  FAIL ", n); } };

const ROUTE   = readFileSync("src/app/api/admin/products/import-url/route.js", "utf8");
const INGEST  = readFileSync("src/lib/services/imageIngestService.js", "utf8");
const IMGROUTE= readFileSync("src/app/api/image/route.js", "utf8");
const PAGE    = readFileSync("src/app/admin/products/new/page.jsx", "utf8");

/** Strip comments — several assertions below are about CODE, not prose. */
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const ROUTE_CODE  = codeOnly(ROUTE);
const INGEST_CODE = codeOnly(INGEST);
const IMG_CODE    = codeOnly(IMGROUTE);

// ── Fixtures ─────────────────────────────────────────────────────────────────

const ITEM_URL = "https://www.mercari.com/us/item/m12345678901/";
const IMG = (n) => `https://static.mercdn.net/item/detail/orig/photos/m12345678901_${n}.jpg`;

const jsonLdPage = ({
  name = "Vintage Denim Jacket &amp; Liner",
  price = "48.00",
  currency = "USD",
  availability = "https://schema.org/InStock",
  images = [IMG(1), IMG(2), IMG(3)],
} = {}) => `<!doctype html><html><head>
<meta property="og:title" content="ignored when JSON-LD wins">
<script type="application/ld+json">${JSON.stringify({
  "@context": "https://schema.org", "@type": "Product",
  name, image: images,
  offers: { "@type": "Offer", price, priceCurrency: currency, availability },
  // Fields the extractor must NOT read:
  seller: { "@type": "Person", name: "someseller99" },
  aggregateRating: { "@type": "AggregateRating", ratingValue: "4.8", reviewCount: "212" },
})}</script>
</head><body>page</body></html>`;

const ogOnlyPage = ({ title = "Leather Boots", amount = "75.50", currency = "EUR", images = [IMG(1), IMG(2)] } = {}) =>
  `<!doctype html><html><head>
<meta property="og:title" content="${title} | Mercari">
${images.map((i) => `<meta property="og:image" content="${i}">`).join("\n")}
<meta property="product:price:amount" content="${amount}">
<meta property="product:price:currency" content="${currency}">
<meta name="twitter:description" content="Sold by someseller99 — ships in 2 days">
</head><body></body></html>`;

const okResponse = (body, { contentType = "text/html", status = 200 } = {}) => ({
  status,
  headers: { get: (k) => (k.toLowerCase() === "content-type" ? contentType : null) },
  arrayBuffer: async () => new TextEncoder().encode(body).buffer,
});
const redirectTo = (loc) => ({
  status: 302,
  headers: { get: (k) => (k.toLowerCase() === "location" ? loc : null) },
});

// ─────────────────────────────────────────────────────────────────────────────
console.log("1) URL VALIDATION — supported sources only:");
{
  ok("a valid Mercari listing URL is accepted", validateUrl(ITEM_URL, MERCARI_PAGE_HOSTS).ok === true);
  ok("the bare apex host is accepted too",
    validateUrl("https://mercari.com/us/item/m1/", MERCARI_PAGE_HOSTS).ok === true);
  ok("resolveSource finds the Mercari adapter", resolveSource(ITEM_URL)?.id === "mercari");

  ok("an unsupported marketplace is rejected",
    validateUrl("https://www.ebay.com/itm/123", MERCARI_PAGE_HOSTS).code === ERR.UNSUPPORTED_SOURCE);
  ok("a look-alike suffix host is rejected (mercari.com.evil.test)",
    validateUrl("https://www.mercari.com.evil.test/us/item/m1/", MERCARI_PAGE_HOSTS).code === ERR.UNSUPPORTED_SOURCE);
  ok("a look-alike prefix host is rejected (notmercari.com)",
    validateUrl("https://notmercari.com/us/item/m1/", MERCARI_PAGE_HOSTS).code === ERR.UNSUPPORTED_SOURCE);
  ok("resolveSource returns null for an unsupported host", resolveSource("https://www.ebay.com/itm/1") === null);

  ok("http:// is rejected", validateUrl("http://www.mercari.com/us/item/m1/", MERCARI_PAGE_HOSTS).code === ERR.NOT_HTTPS);
  ok("file:// is rejected", validateUrl("file:///etc/passwd", MERCARI_PAGE_HOSTS).code === ERR.NOT_HTTPS);
  ok("ftp:// is rejected", validateUrl("ftp://www.mercari.com/x", MERCARI_PAGE_HOSTS).code === ERR.NOT_HTTPS);
  ok("data: is rejected", validateUrl("data:text/html,<h1>x", MERCARI_PAGE_HOSTS).code === ERR.NOT_HTTPS);
  ok("garbage input is rejected", validateUrl("not a url", MERCARI_PAGE_HOSTS).code === ERR.INVALID_URL);
  ok("an empty string is rejected", validateUrl("", MERCARI_PAGE_HOSTS).code === ERR.INVALID_URL);

  ok("embedded credentials are rejected",
    validateUrl("https://admin:pw@www.mercari.com/us/item/m1/", MERCARI_PAGE_HOSTS).code === ERR.BLOCKED_HOST);
  ok("a non-443 port is rejected",
    validateUrl("https://www.mercari.com:8080/us/item/m1/", MERCARI_PAGE_HOSTS).code === ERR.BLOCKED_HOST);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("2) SSRF — internal destinations are unreachable:");
{
  ok("localhost is blocked", isBlockedHost("localhost") === true);
  ok("a *.localhost subdomain is blocked", isBlockedHost("api.localhost") === true);
  ok("*.internal is blocked", isBlockedHost("db.internal") === true);
  ok("*.local is blocked", isBlockedHost("printer.local") === true);
  ok("a bare hostname with no dot is blocked", isBlockedHost("intranet") === true);
  ok("the GCE metadata name is blocked", isBlockedHost("metadata.google.internal") === true);
  ok("a normal public host is NOT blocked", isBlockedHost("www.mercari.com") === false);

  ok("127.0.0.1 is private", isPrivateAddress("127.0.0.1") === true);
  ok("0.0.0.0 is private", isPrivateAddress("0.0.0.0") === true);
  ok("10.x is private", isPrivateAddress("10.1.2.3") === true);
  ok("172.16-31.x is private", isPrivateAddress("172.20.0.1") === true && isPrivateAddress("172.32.0.1") === false);
  ok("192.168.x is private", isPrivateAddress("192.168.1.1") === true);
  ok("169.254.169.254 (cloud metadata) is private", isPrivateAddress("169.254.169.254") === true);
  ok("100.64/10 CGNAT is private", isPrivateAddress("100.100.0.1") === true);
  ok("multicast/reserved is private", isPrivateAddress("224.0.0.1") === true && isPrivateAddress("240.0.0.1") === true);
  ok("IPv6 loopback is private", isPrivateAddress("::1") === true && isPrivateAddress("[::1]") === true);
  ok("IPv6 unique-local is private", isPrivateAddress("fd00::1") === true);
  ok("IPv6 link-local is private", isPrivateAddress("fe80::1") === true);
  ok("an IPv4-mapped loopback is private", isPrivateAddress("::ffff:127.0.0.1") === true);
  ok("a public IP is not private", isPrivateAddress("8.8.8.8") === false);

  ok("a raw private IP URL never passes the hostname allow-list",
    validateUrl("https://169.254.169.254/latest/meta-data/", MERCARI_PAGE_HOSTS).code === ERR.BLOCKED_HOST);
  ok("a raw loopback URL is blocked", validateUrl("https://127.0.0.1/", MERCARI_PAGE_HOSTS).code === ERR.BLOCKED_HOST);
  ok("https://localhost is blocked", validateUrl("https://localhost/x", MERCARI_PAGE_HOSTS).code === ERR.BLOCKED_HOST);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("3) GUARDED FETCH — redirects, timeouts, size, content type:");
{
  const run = (fetchImpl, opts = {}) => safeFetch(ITEM_URL, {
    allowedHosts: MERCARI_PAGE_HOSTS, fetchImpl, ...opts,
  });

  await (async () => {
    const res = await run(async () => okResponse(jsonLdPage()));
    ok("a plain 200 HTML response is read", res.ok === true && res.buffer.length > 0);
  })();

  await (async () => {
    let hops = 0;
    const res = await run(async (u) => {
      hops++;
      if (hops === 1) return redirectTo("https://www.mercari.com/us/item/m999/");
      return okResponse(jsonLdPage());
    });
    ok("a redirect WITHIN the allow-list is followed", res.ok === true && hops === 2);
    ok("the final URL is reported, not the original", res.finalUrl.includes("m999"));
  })();

  await (async () => {
    const res = await run(async () => redirectTo("https://169.254.169.254/latest/meta-data/"));
    ok("a redirect to cloud metadata is REJECTED", res.ok === false && res.code === ERR.BLOCKED_HOST);
  })();
  await (async () => {
    const res = await run(async () => redirectTo("http://localhost:8080/admin"));
    ok("a redirect to localhost is REJECTED", res.ok === false && res.code === ERR.NOT_HTTPS);
  })();
  await (async () => {
    const res = await run(async () => redirectTo("https://evil.test/steal"));
    ok("a redirect off the allow-list is REJECTED", res.ok === false && res.code === ERR.UNSUPPORTED_SOURCE);
  })();
  await (async () => {
    const res = await run(async () => redirectTo("https://www.mercari.com/loop"));
    ok("a redirect loop stops at the hop limit", res.ok === false && res.code === ERR.TOO_MANY_REDIRECTS);
  })();

  await (async () => {
    const res = await run(async () => { const e = new Error("aborted"); e.name = "AbortError"; throw e; });
    ok("a timeout yields TIMEOUT, not a crash", res.ok === false && res.code === ERR.TIMEOUT);
  })();
  await (async () => {
    const res = await run(async () => { throw new Error("ECONNREFUSED"); });
    ok("a network error yields UPSTREAM_ERROR", res.ok === false && res.code === ERR.UPSTREAM_ERROR);
  })();

  await (async () => {
    const res = await run(async () => okResponse("x".repeat(5000)), { maxBytes: 1000 });
    ok("an oversized body is rejected", res.ok === false && res.code === ERR.TOO_LARGE);
  })();
  await (async () => {
    const big = {
      status: 200,
      headers: { get: (k) => (k.toLowerCase() === "content-type" ? "text/html" : k.toLowerCase() === "content-length" ? "99999999" : null) },
      arrayBuffer: async () => new ArrayBuffer(10),
    };
    const res = await run(async () => big, { maxBytes: 1000 });
    ok("an oversized content-length is rejected before reading", res.ok === false && res.code === ERR.TOO_LARGE);
  })();
  await (async () => {
    // Streaming path: the cap must trip mid-stream without buffering it all.
    let cancelled = false;
    const chunk = new Uint8Array(600);
    const streamed = {
      status: 200,
      headers: { get: (k) => (k.toLowerCase() === "content-type" ? "text/html" : null) },
      body: { getReader: () => ({
        read: async () => ({ done: false, value: chunk }),
        cancel: async () => { cancelled = true; },
      }) },
    };
    const res = await run(async () => streamed, { maxBytes: 1000 });
    ok("a streaming body is capped mid-stream", res.ok === false && res.code === ERR.TOO_LARGE);
    ok("the stream is cancelled when the cap trips", cancelled === true);
  })();

  await (async () => {
    const res = await run(async () => okResponse("{}", { contentType: "application/json" }));
    ok("a non-HTML content type is rejected", res.ok === false && res.code === ERR.BAD_CONTENT_TYPE);
  })();
  await (async () => {
    const res = await run(async () => okResponse("", { status: 404 }));
    ok("404 maps to UNAVAILABLE", res.ok === false && res.code === ERR.UNAVAILABLE);
  })();
  await (async () => {
    const res = await run(async () => okResponse("boom", { status: 500 }));
    ok("500 maps to UPSTREAM_ERROR", res.ok === false && res.code === ERR.UPSTREAM_ERROR);
  })();
  await (async () => {
    let sawManual = false;
    await run(async (_u, init) => { sawManual = init?.redirect === "manual"; return okResponse(jsonLdPage()); });
    ok("redirects are NEVER auto-followed by the runtime", sawManual === true);
  })();
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("4) MERCARI EXTRACTION — JSON-LD first:");
{
  const r = extractMercari(jsonLdPage(), ITEM_URL);
  ok("title comes from JSON-LD, entity-decoded", r.title === "Vintage Denim Jacket & Liner");
  ok("price amount is numeric", r.price?.amount === 48);
  ok("currency is read, not assumed", r.price?.currency === "USD");
  ok("all three images are extracted", r.imageUrls.length === 3);
  ok("images keep their source order", r.imageUrls[0] === IMG(1) && r.imageUrls[2] === IMG(3));
  ok("the listing is not flagged unavailable", r.unavailable === false);
  ok("no warnings on a complete page", r.warnings.length === 0);

  const sold = extractMercari(jsonLdPage({ availability: "https://schema.org/SoldOut" }), ITEM_URL);
  ok("a sold-out listing is flagged unavailable", sold.unavailable === true);

  // The fields V1 must NOT import.
  const serialized = JSON.stringify(r);
  ok("no seller data is extracted", !/someseller99/.test(serialized));
  ok("no rating/review data is extracted", !/4\.8|212/.test(serialized));
  ok("the result carries ONLY title, price, images, availability and warnings",
    Object.keys(r).sort().join(",") === "imageUrls,price,title,unavailable,warnings");
}

console.log("5) MERCARI EXTRACTION — Open Graph fallback:");
{
  const r = extractMercari(ogOnlyPage(), ITEM_URL);
  ok("title comes from og:title when JSON-LD is absent", r.title === "Leather Boots");
  ok("the ' | Mercari' site suffix is stripped", !/mercari/i.test(r.title));
  ok("price comes from product:price:amount", r.price?.amount === 75.5);
  ok("currency comes from product:price:currency (EUR, not assumed USD)", r.price?.currency === "EUR");
  ok("images come from repeated og:image tags", r.imageUrls.length === 2);
  ok("the seller mentioned in the description is not imported", !JSON.stringify(r).includes("someseller99"));
}

console.log("6) MERCARI EXTRACTION — __NEXT_DATA__ gap filler:");
{
  const nextPage = `<!doctype html><html><head></head><body>
<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
    props: { pageProps: { item: { name: "Retro Camera", price: 130, currency: "USD", photos: [IMG(4), IMG(5)] } } },
  })}</script></body></html>`;
  const r = extractMercari(nextPage, ITEM_URL);
  ok("title is recovered from __NEXT_DATA__", r.title === "Retro Camera");
  ok("price is recovered from __NEXT_DATA__", r.price?.amount === 130 && r.price?.currency === "USD");
  ok("images are recovered from __NEXT_DATA__", r.imageUrls.length === 2);
}

console.log("7) MISSING / MALFORMED DATA is graceful:");
{
  const noPrice = extractMercari(
    `<html><head><meta property="og:title" content="Some Item">
     <meta property="og:image" content="${IMG(1)}"></head><body></body></html>`, ITEM_URL);
  ok("a page with no price still yields title + images", noPrice.title === "Some Item" && noPrice.imageUrls.length === 1);
  ok("the missing price is flagged, not invented", noPrice.price === null && noPrice.warnings.includes("PRICE_MISSING"));

  const noCurrency = extractMercari(
    `<html><head><meta property="og:title" content="X"><meta property="og:image" content="${IMG(1)}">
     <meta property="product:price:amount" content="20"></head></html>`, ITEM_URL);
  ok("an amount without a currency does NOT default to USD", noCurrency.price?.currency === null);
  ok("the missing currency is flagged", noCurrency.warnings.includes("CURRENCY_MISSING"));

  ok("broken JSON-LD does not throw",
    extractMercari(`<script type="application/ld+json">{ not json </script>`, ITEM_URL).title === "");
  ok("a good JSON-LD block survives a broken sibling",
    extractMercari(`<script type="application/ld+json">{oops</script>${jsonLdPage()}`, ITEM_URL).title.includes("Denim"));
  ok("empty input does not throw", extractMercari("", ITEM_URL).warnings.length === 3);
  ok("non-string input does not throw", extractMercari(null, ITEM_URL).title === "");
  ok("malformed __NEXT_DATA__ is ignored", parseNextData("<script id=\"__NEXT_DATA__\">{bad</script>") === null);
}

console.log("8) IMAGE NORMALIZATION:");
{
  const dupes = [IMG(1), `${IMG(1)}?w=240`, `${IMG(1)}?w=1200`, IMG(2), IMG(2), IMG(3)];
  const out = dedupeImages(dupes, { allowedHosts: MERCARI_IMAGE_HOSTS });
  ok("the same photo at different sizes counts once", out.length === 3);
  ok("the first occurrence is the one kept", out[0].startsWith(IMG(1)));

  ok("an off-CDN image host is dropped",
    dedupeImages(["https://evil.test/x.jpg", IMG(1)], { allowedHosts: MERCARI_IMAGE_HOSTS }).length === 1);
  ok("http image URLs are dropped",
    dedupeImages(["http://static.mercdn.net/a.jpg"], { allowedHosts: MERCARI_IMAGE_HOSTS }).length === 0);
  ok("garbage entries are skipped",
    dedupeImages([null, "", "nope", 42, IMG(1)], { allowedHosts: MERCARI_IMAGE_HOSTS }).length === 1);
  ok(`the image count is capped at ${MAX_IMAGES}`,
    dedupeImages(Array.from({ length: 40 }, (_, i) => IMG(i)), { allowedHosts: MERCARI_IMAGE_HOSTS }).length === MAX_IMAGES);
  ok("a page with 20 photos never imports more than the cap",
    extractMercari(jsonLdPage({ images: Array.from({ length: 20 }, (_, i) => IMG(i)) }), ITEM_URL).imageUrls.length === MAX_IMAGES);
}

console.log("9) PRICE NORMALIZATION — never guess a currency:");
{
  ok("a numeric amount is kept", normalizePrice(48, "USD").amount === 48);
  ok("a formatted amount is parsed", toAmount("$1,234.50") === 1234.5);
  ok("a plain decimal string is parsed", toAmount("75.50") === 75.5);
  ok("a non-numeric amount yields null", toAmount("free") === null && toAmount(null) === null);
  ok("a negative amount is rejected", toAmount("-5") === null);
  ok("a missing currency yields currency:null, NOT 'USD'", normalizePrice(10, "").currency === null);
  ok("an invalid currency code yields null", normalizePrice(10, "dollars").currency === null);
  ok("a lower-case code is upper-cased", normalizePrice(10, "jpy").currency === "JPY");
  ok("no amount means no price object at all", normalizePrice("n/a", "USD") === null);
  ok("USD is never hardcoded anywhere in the extraction layer",
    !/["']USD["']/.test(readFileSync("src/lib/productImport/normalize.js", "utf8")) &&
    !/["']USD["']/.test(readFileSync("src/lib/productImport/mercari.js", "utf8")));
}

console.log("10) END TO END through importFromUrl (injected fetch):");
{
  await (async () => {
    const r = await importFromUrl(ITEM_URL, { fetchImpl: async () => okResponse(jsonLdPage()) });
    ok("a valid listing imports", r.ok === true);
    ok("the normalized shape is source/sourceUrl/title/price/imageUrls/warnings",
      Object.keys(r.result).sort().join(",") === "imageUrls,price,source,sourceUrl,title,warnings");
    ok("source is tagged", r.result.source === "mercari");
    ok("title survives normalization", r.result.title === "Vintage Denim Jacket & Liner");
    ok("price survives normalization", r.result.price.amount === 48 && r.result.price.currency === "USD");
    ok("images are still SOURCE urls at this layer (route replaces them)",
      r.result.imageUrls.every((u) => u.startsWith("https://static.mercdn.net/")));
  })();

  await (async () => {
    const r = await importFromUrl("https://www.ebay.com/itm/1", { fetchImpl: async () => okResponse("x") });
    ok("an unsupported domain never reaches fetch", r.ok === false && r.code === ERR.UNSUPPORTED_SOURCE);
  })();
  await (async () => {
    const r = await importFromUrl("http://www.mercari.com/us/item/m1/", { fetchImpl: async () => okResponse("x") });
    ok("a non-https URL is rejected", r.ok === false && r.code === ERR.NOT_HTTPS);
  })();
  await (async () => {
    const r = await importFromUrl(ITEM_URL, { fetchImpl: async () => okResponse(jsonLdPage({ availability: "https://schema.org/SoldOut" })) });
    ok("a sold-out listing reports UNAVAILABLE", r.ok === false && r.code === ERR.UNAVAILABLE);
  })();
  await (async () => {
    const r = await importFromUrl(ITEM_URL, { fetchImpl: async () => okResponse("<html><body>nothing here</body></html>") });
    ok("an unreadable page fails cleanly instead of importing an empty product",
      r.ok === false && r.code === ERR.UPSTREAM_ERROR);
  })();
  await (async () => {
    const r = await importFromUrl(ITEM_URL, { fetchImpl: async () => okResponse("<html> �<script type=\"application/ld+json\">[[[</script>" + ogOnlyPage()) });
    ok("a mangled upstream document still imports what it can", r.ok === true && r.result.title === "Leather Boots");
  })();
  await (async () => {
    const r = await importFromUrl(ITEM_URL, { fetchImpl: async () => { throw new Error("boom"); } });
    ok("an upstream throw becomes a code, never an exception", r.ok === false && r.code === ERR.UPSTREAM_ERROR);
  })();
  await (async () => {
    const noPricePage = `<html><head><meta property="og:title" content="Item"><meta property="og:image" content="${IMG(1)}"></head></html>`;
    const r = await importFromUrl(ITEM_URL, { fetchImpl: async () => okResponse(noPricePage) });
    ok("a missing price is a WARNING, not a failure",
      r.ok === true && r.result.price === null && r.result.warnings.includes("PRICE_MISSING"));
  })();
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("11) THE ROUTE — admin-only, never publishes, no leaked internals:");
{
  ok("the endpoint exists at /api/admin/products/import-url", ROUTE.length > 0);
  ok("POST is wrapped in withAdminAuth", /export const POST = withAdminAuth\(/.test(ROUTE));
  ok("no unauthenticated export exists on the route",
    !/export (const|async function) (GET|PUT|DELETE|PATCH)/.test(ROUTE));
  ok("it is rate limited", /rateLimit\(req, 'product-import'/.test(ROUTE));

  ok("the route NEVER writes a product", !/prisma\.product|\/api\/products|createProduct/.test(ROUTE));
  ok("the route never sets a published/active status", !/status:\s*['"]Active['"]|publish/i.test(ROUTE));

  ok("upstream status codes are not forwarded to the browser",
    !/res\.status\b/.test(ROUTE) && /messageFor\(/.test(ROUTE));
  ok("upstream bodies are never echoed", !/upstreamBody|res\.text\(\)/.test(ROUTE));
  ok("the server logs detail but returns generic copy",
    /console\.error\('\[\/api\/admin\/products\/import-url\]', err\)/.test(ROUTE) &&
    /error: 'Could not read this listing\.'/.test(ROUTE));

  ok("'Unsupported product source.' is the unsupported-domain copy",
    /\[ERR\.UNSUPPORTED_SOURCE\]:\s*'Unsupported product source\.'/.test(ROUTE));
  ok("'Listing unavailable.' is the gone-listing copy",
    /\[ERR\.UNAVAILABLE\]:\s*'Listing unavailable\.'/.test(ROUTE));
  ok("a blocked host reuses the neutral copy (no internal detail)",
    /\[ERR\.BLOCKED_HOST\]:\s*'Unsupported product source\.'/.test(ROUTE));

  ok("images are re-validated against the SOURCE's own CDN allow-list",
    /allowedHosts: source\?\.imageHosts \|\| \[\]/.test(ROUTE));
  ok("only image content types are accepted for images",
    /const IMAGE_TYPES = \['image\/jpeg'/.test(ROUTE) && /allowedContentTypes: IMAGE_TYPES/.test(ROUTE));
  ok("image fetches carry their own byte/time limits", /IMAGE_LIMITS\.maxBytes/.test(ROUTE) && /IMAGE_LIMITS\.timeoutMs/.test(ROUTE));
  ok("a failed image is a warning, not an abort", /warnings\.push\('IMAGE_FETCH_FAILED'\); continue;/.test(ROUTE));
  ok("successful images survive a partial failure",
    /const \{ urls: images, failed \} = await ingestImageBuffers\(fetched\)/.test(ROUTE));
  ok("the response reports how many images were requested vs imported",
    /imagesRequested: requested/.test(ROUTE) && /imagesFailed: requested - images\.length/.test(ROUTE));
}

console.log("12) MEDIA PIPELINE REUSE — one uploader, not two:");
{
  ok("the ingest service reuses saveMedia (the existing R2/Cloudinary/local facade)",
    /from '\.\.\/cloudinary\.js'/.test(INGEST) && /await saveMedia\(/.test(INGEST));
  ok("it does NOT construct its own S3/R2 client",
    !/S3Client|PutObjectCommand|@aws-sdk/.test(INGEST));
  ok("R2 prefix/category conventions stay inside saveMedia (not passed by callers)",
    !/R2_PREFIX|buildObjectKey|categoryFor/.test(INGEST));
  ok("the existing security validation is reused", /validateImage|validateVideo/.test(INGEST));
  ok("the existing optimizer is reused", /optimizeImageBuffer/.test(INGEST));
  ok("the existing watermark step is reused", /applyWatermark/.test(INGEST));
  ok("thumbnails/responsive variants are still generated", /writeThumbnails/.test(INGEST));
  // Compare inside the function body — the import block lists them in another order.
  const body = INGEST_CODE.slice(INGEST_CODE.indexOf("export async function ingestImageBuffer"));
  ok("optimize runs BEFORE watermark (unchanged order)",
    body.indexOf("optimizeImageBuffer") < body.indexOf("applyWatermark"));
  ok("imported media lands in the existing images library", /prisma\.image\.create/.test(INGEST));
  ok("a watermark failure is non-fatal, as before", /console\.warn\('\[watermark\] Skipped:'/.test(INGEST));

  ok("/api/image now delegates to the SAME service", /ingestImageBuffer/.test(IMGROUTE));
  ok("/api/image no longer has its own copy of the pipeline",
    !/optimizeImageBuffer|applyWatermark|saveMedia|writeThumbnails/.test(IMG_CODE));
  ok("/api/image keeps its response shape", /Response\.json\(res\.record, \{ status: 201 \}\)/.test(IMGROUTE));
  ok("/api/image keeps admin auth and rate limiting",
    /withAdminAuth/.test(IMGROUTE) && /rateLimit\(req, 'upload'/.test(IMGROUTE));
  ok("/api/image still handles video without re-encoding it", /isVideo/.test(IMGROUTE));

  ok("the importer route never persists a source image URL as a product image",
    /images,\n/.test(ROUTE) && !/imageUrls: result\.imageUrls/.test(ROUTE));
  ok("batch ingest keeps successes and collects failures",
    /urls\.push\(res\.record\.url\)/.test(INGEST) && /failed\.push\(/.test(INGEST));
  ok("one bad image can never reject the batch", /catch \(err\) \{[\s\S]{0,200}failed\.push\(/.test(INGEST));
}

console.log("13) ADMIN UI — populates the EXISTING form, publishes nothing:");
{
  ok("an Import from URL section exists", /Import from URL/.test(PAGE) && /function ImportFromUrl\(/.test(PAGE));
  ok("it only appears when creating, not editing", /\{!isUpdate && \(\s*<ImportFromUrl/.test(PAGE));
  ok("it posts to the importer endpoint", /fetch\("\/api\/admin\/products\/import-url"/.test(PAGE));
  ok("the importer NEVER posts to the product API",
    !/ImportFromUrl[\s\S]*?fetch\("\/api\/products"/.test(PAGE.slice(PAGE.indexOf("function ImportFromUrl"), PAGE.indexOf("function ProductForm"))));
  ok("saving is still a separate, manual admin action",
    /onPress=\{addOrUpdateProduct\}/.test(PAGE) && /Save Product/.test(PAGE));
  ok("addOrUpdateProduct is the ONLY caller of /api/products", (PAGE.match(/fetch\("\/api\/products"/g) || []).length === 1);

  ok("the imported title feeds the EXISTING productData.title", /title: title \|\| prev\.title/.test(PAGE));
  ok("imported images are APPENDED to the existing selection, not replacing it",
    /setSelectedImages\(\(prev\) => \[\.\.\.prev, \.\.\.images\.filter/.test(PAGE));
  ok("no separate product editor was created",
    (PAGE.match(/const \[productData, setProductData\]/g) || []).length === 1);
  ok("every imported field remains editable (the same inputs as before)",
    /value=\{productData\.title\}/.test(PAGE) && /value=\{productData\.salePrice\}/.test(PAGE) &&
    /selectedKeys=\{categories\}/.test(PAGE));

  const importer = PAGE.slice(PAGE.indexOf("function ImportFromUrl"), PAGE.indexOf("function ProductForm"));
  ok("all five states exist",
    ["idle", "importing", "success", "partial", "error"].every((st) => importer.includes(`"${st}"`)));
  ok("progress reports reading, title, price, images and category",
    /Reading product…/.test(importer) && /Found title/.test(importer) &&
    /Found price/.test(importer) && /Imported \$\{got\}\/\$\{want\} images/.test(importer) &&
    /Detecting category…/.test(importer));
  ok("a failed response shows a message instead of throwing",
    /setState\("error"\)/.test(importer) && /catch \{/.test(importer));
  ok("a non-OK response is handled before parsing succeeds",
    /res\.json\(\)\.catch\(\(\) => \(\{\}\)\)/.test(importer));
}

console.log("14) CATEGORY — the EXISTING detector is reused, not duplicated:");
{
  ok("there is still exactly ONE detectCollection definition",
    (PAGE.match(/function detectCollection\(/g) || []).length === 1);
  ok("no second detector was added",
    !/detectCategory|guessCollection|classifyProduct|inferCategory/.test(PAGE));
  ok("the importer does not call a detector itself",
    !PAGE.slice(PAGE.indexOf("function ImportFromUrl"), PAGE.indexOf("function ProductForm")).includes("detectCollection"));
  ok("the existing debounced effect still watches productData.title",
    /const detected = detectCollection\(productData\.title, fetchingCollection\)/.test(PAGE) &&
    /\}, \[productData\.title, fetchingCollection, isUpdate\]\)/.test(PAGE));
  ok("setting the imported title is what re-runs that effect",
    /setProductData\(\(prev\) => \(\{[\s\S]{0,120}title: title \|\| prev\.title/.test(PAGE));
  ok("the detected category shows up in the importer's progress",
    /categoryDetected=\{autoDetected\}/.test(PAGE) && /Category detected/.test(PAGE));
  ok("the admin can still override the category by hand", /onSelectionChange=\{handleCategoryChange\}/.test(PAGE));
  ok("the importer never writes `categories` directly",
    !/setCategories/.test(PAGE.slice(PAGE.indexOf("function ImportFromUrl"), PAGE.indexOf("function ProductForm"))));
}

console.log("15) PRICE → FORM: no invented conversion:");
{
  const importer = PAGE.slice(PAGE.indexOf("function ImportFromUrl"), PAGE.indexOf("function ProductForm"));
  ok("the price is applied ONLY when the currency matches the store",
    /data\.price\.currency === storeCurrency/.test(importer));
  ok("a mismatch is surfaced to the admin instead of converted",
    /No conversion was applied — enter the price manually\./.test(importer));
  ok("no conversion arithmetic exists anywhere in the feature",
    !/exchangeRate|convertCurrency|\* rate|fxRate/.test(importer + ROUTE));
  ok("an amount with no currency is not applied", /Price found without a currency, not applied/.test(importer));
  ok("the applied price goes to the existing salePrice field",
    /salePrice: String\(priceForForm\)/.test(PAGE));
  ok("the store currency comes from the form's existing hook",
    /storeCurrency=\{currencyCode\}/.test(PAGE) && /useStoreCurrency\(\)/.test(PAGE));
}

console.log("16) EXTENSIBILITY + NO SCHEMA CHANGE:");
{
  ok("sources live in a registry", Array.isArray(SOURCES) && SOURCES.length === 1);
  ok("the Mercari descriptor exposes id/pageHosts/imageHosts/extract",
    mercariSource.id === "mercari" && mercariSource.pageHosts.length === 2 &&
    mercariSource.imageHosts.length > 0 && typeof mercariSource.extract === "function");
  ok("allPageHosts aggregates every source", allPageHosts().includes("www.mercari.com"));
  ok("the route is source-agnostic (no 'mercari' literal in its code)", !/mercari/i.test(ROUTE_CODE));
  ok("the admin UI is source-agnostic apart from the placeholder",
    (PAGE.match(/mercari/gi) || []).length <= 3);

  const schema = readFileSync("prisma/schema.prisma", "utf8");
  ok("no new Prisma model was added for the importer",
    !/model ProductImport|model ImportJob|sourceUrl/i.test(schema));
  ok("no migration directory was added for this feature",
    !readdirSync("prisma/migrations").some((d) => /import|source_url|product_import/i.test(d)));
  ok("the importer touches no product columns at all",
    !/regularPrice|salePrice|collections|slug/.test(ROUTE_CODE));
  ok("imported media reuses the existing images table only", /prisma\.image\.create/.test(INGEST));
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
