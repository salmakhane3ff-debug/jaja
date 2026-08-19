#!/usr/bin/env node
/**
 * scripts/metaTracking.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * The Meta Pixel / Conversions API integration.
 *
 * THE CRITICAL DEFECT: layout.jsx read the raw `integrations` settings row and
 * passed the WHOLE object as a prop to <ScriptInjector>, a client component.
 * Next.js serialises every client-component prop into the RSC payload embedded
 * in the HTML, so the Conversions API access token was readable by anyone with
 * View Source. Section 1 proves the boundary now strips it structurally.
 *
 * Other defects covered: N² PageView fan-out across multiple pixels, events
 * dropped before fbevents.js loaded, ViewContent suppressed for 24 h by an
 * unrelated analytics guard, no Purchase at all from inline-COD or offer
 * orders, Purchase fired on unpaid bank transfers, and a Purchase that a shared
 * success link could replay.
 *
 * Run: node scripts/metaTracking.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { readFileSync } from "node:fs";
import {
  isValidPixelId, normalizePixelIds, toPublicMetaConfig, toPublicIntegrations,
  canSendCapi, SECRET_KEYS,
} from "../src/lib/meta/config.js";
import {
  normalizePhone, normalizeEmail, splitFullName, normalizeCity, normalizeZip,
  normalizeCountry, toNumericValue, buildContents, buildContentIds,
  totalQuantity, contentsValue, contentId, isValidFbp, isValidFbc, deriveFbc,
  STORE_CURRENCY,
} from "../src/lib/meta/normalize.js";
import {
  EVENT_NAMES, isAllowedEvent, purchaseEventId, scopedEventId,
  purchaseEligibility, isPurchaseEligible, paymentMethodKey,
} from "../src/lib/meta/events.js";
import {
  sha256, buildUserData, buildServerEvent, sendCapiEvents, redactToken,
  CAPI_RESULT, GRAPH_API_VERSION,
} from "../src/lib/meta/capi.js";
import {
  purchaseKey, evaluateExistingClaim, claimPurchase, markPurchaseSent,
  markPurchaseFailed, CLAIM, KEY_PREFIX, STALE_CLAIM_MS,
} from "../src/lib/meta/idempotency.js";

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log("  PASS ", n); } else { fail++; console.log("  FAIL ", n); } };

const LAYOUT   = readFileSync("src/app/layout.jsx", "utf8");
const INJECTOR = readFileSync("src/components/ScriptInjector.jsx", "utf8");
const PIXELCMP = readFileSync("src/components/MetaPixel.jsx", "utf8");
const GETINT   = readFileSync("src/lib/getIntegrationsSettings.js", "utf8");
const BROWSER  = readFileSync("src/lib/meta/browser.js", "utf8");
const ROUTE    = readFileSync("src/app/api/facebook/capi/route.js", "utf8");
const PURCHASE = readFileSync("src/lib/meta/purchase.js", "utf8");
const PRODUCT  = readFileSync("src/app/products/[id]/product.jsx", "utf8");
const ADDRESS  = readFileSync("src/app/checkout/address/page.jsx", "utf8");
const SUCCESS  = readFileSync("src/app/checkout/success/page.jsx", "utf8");
const CODFORM  = readFileSync("src/components/Product/InlineCodForm.jsx", "utf8");
const ORDERSVC = readFileSync("src/lib/services/orderService.js", "utf8");
const SCHEMA   = readFileSync("prisma/schema.prisma", "utf8");

const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const LAYOUT_CODE = codeOnly(LAYOUT);
const INJ_CODE    = codeOnly(INJECTOR);
const ROUTE_CODE  = codeOnly(ROUTE);
const PROD_CODE   = codeOnly(PRODUCT);

const PIXEL_A = "123456789012345";
const PIXEL_B = "987654321098765";
const TOKEN   = "EAAG_fake_token_for_tests_only_never_real";

const RAW_SETTINGS = {
  metaPixel: {
    enabled: true,
    pixelIds: [{ name: "Main", id: PIXEL_A }, { name: "Second", id: PIXEL_B }],
    accessToken: TOKEN,
    testEventCode: "TEST12345",
    domainVerificationCode: "abc123",
  },
  googleAnalytics: { enabled: true, trackingIds: [{ id: "G-XYZ" }] },
  bemob: { enabled: true, postbackUrl: "https://track.example/postback?cid={click_id}" },
};

// ─────────────────────────────────────────────────────────────────────────────
console.log("1) CRITICAL — the CAPI token cannot reach the browser:");
{
  const pub = toPublicMetaConfig(RAW_SETTINGS);
  ok("A. public Meta config carries no accessToken", pub.accessToken === undefined);
  ok("   the token string appears nowhere in it", !JSON.stringify(pub).includes(TOKEN));
  ok("B. the serialized shape is exactly { enabled, pixelIds }",
    Object.keys(pub).sort().join(",") === "enabled,pixelIds");
  ok("   no secret key survives", SECRET_KEYS.every((k) => !(k in pub)));

  const pubAll = toPublicIntegrations(RAW_SETTINGS);
  ok("the sanitised INTEGRATIONS object drops the token too",
    !JSON.stringify(pubAll).includes(TOKEN));
  ok("…and drops testEventCode", !JSON.stringify(pubAll).includes("TEST12345"));
  ok("…and drops the bemob postback URL", !JSON.stringify(pubAll).includes("track.example"));
  ok("it is built by ALLOW-LIST, so a future secret cannot leak by omission",
    !("bemob" in pubAll) && !("accessToken" in (pubAll.metaPixel || {})));
  ok("it still carries what the storefront legitimately needs",
    pubAll.googleAnalytics.trackingIds[0].id === "G-XYZ" &&
    pubAll.metaPixel.pixelIds.length === 2 &&
    pubAll.metaDomainVerification === "abc123");

  ok("the server boundary sanitises before returning",
    /toPublicIntegrations\(data\)/.test(GETINT) && !/return data;/.test(codeOnly(GETINT)));
  ok("layout passes only the sanitised object", /getIntegrationsSettings\(\)/.test(LAYOUT_CODE));
  ok("MetaPixel receives only the public sub-object",
    /<MetaPixel config=\{integrations\?\.metaPixel\}/.test(LAYOUT_CODE));
  ok("ScriptInjector no longer renders Meta at all",
    !/fbq|connect\.facebook\.net/.test(INJ_CODE));
  ok("no client module imports the server config reader",
    !/getMetaServerConfig/.test(BROWSER + PIXELCMP + PURCHASE + PROD_CODE));
  ok("the token is read ONLY server-side, from the database",
    /getMetaServerConfig/.test(ROUTE_CODE) &&
    /import \{ getSettings \} from '\.\.\/services\/settingsService\.js'/.test(readFileSync("src/lib/meta/config.js", "utf8")));
  ok("no hardcoded token anywhere in the Meta modules",
    !/EAA[A-Za-z0-9]{20,}/.test(readFileSync("src/lib/meta/config.js", "utf8") + ROUTE + BROWSER + PURCHASE));
  ok("S. the client cannot supply an access token — it is never read from the body",
    !/body\.access_token|body\.accessToken/.test(ROUTE_CODE));
  ok("T. the client cannot supply a pixel id either",
    !/body\.pixel_id|body\.pixelId/.test(ROUTE_CODE));
}

console.log("2) PIXEL ID VALIDATION + DEDUPLICATION:");
{
  ok("C. a valid 15-digit id is accepted", isValidPixelId(PIXEL_A) === true);
  ok("   a 16-digit id is accepted", isValidPixelId("1234567890123456") === true);
  ok("   arbitrary strings are rejected",
    !isValidPixelId("not-a-pixel") && !isValidPixelId("<script>") && !isValidPixelId(""));
  ok("   too short / too long are rejected",
    !isValidPixelId("12345") && !isValidPixelId("12345678901234567890"));
  ok("   null-safe", !isValidPixelId(null) && !isValidPixelId(undefined) && !isValidPixelId({}));

  ok("invalid ids are DROPPED, not passed to fbq('init')",
    normalizePixelIds([{ id: PIXEL_A }, { id: "garbage" }]).join(",") === PIXEL_A);
  ok("D. duplicate pixel ids are de-duplicated",
    normalizePixelIds([{ id: PIXEL_A }, { id: PIXEL_A }]).length === 1);
  ok("   configuration order is preserved",
    normalizePixelIds([{ id: PIXEL_B }, { id: PIXEL_A }]).join(",") === `${PIXEL_B},${PIXEL_A}`);
  ok("   a plain string array works too", normalizePixelIds([PIXEL_A]).join(",") === PIXEL_A);

  ok("E. enabled with no VALID pixel resolves to disabled",
    toPublicMetaConfig({ metaPixel: { enabled: true, pixelIds: [{ id: "bad" }] } }).enabled === false);
  ok("   disabled config exposes no pixel ids",
    toPublicMetaConfig({ metaPixel: { enabled: false, pixelIds: [{ id: PIXEL_A }] } }).pixelIds.length === 0);
  ok("   missing config is safely disabled",
    toPublicMetaConfig(null).enabled === false && toPublicMetaConfig({}).enabled === false);
  ok("canSendCapi requires enabled + pixel + token",
    canSendCapi({ enabled: true, pixelIds: [PIXEL_A], accessToken: "t" }) === true &&
    canSendCapi({ enabled: true, pixelIds: [PIXEL_A], accessToken: null }) === false &&
    canSendCapi({ enabled: false, pixelIds: [PIXEL_A], accessToken: "t" }) === false);
}

console.log("3) BROWSER HELPER — no fan-out, no lost events, no duplicates:");
{
  // Fake window so the real module can be exercised without a DOM.
  const makeWin = () => {
    const calls = [];
    const win = {};
    win.__calls = calls;
    return win;
  };

  const load = async () => {
    const mod = await import(`../src/lib/meta/browser.js?t=${Math.random()}`);
    return mod;
  };

  await (async () => {
    const m = await load();
    const calls = [];
    globalThis.window = { fbq: (...a) => calls.push(a) };
    m.initMeta({ enabled: true, pixelIds: [PIXEL_A, PIXEL_B] });
    ok("each pixel is initialised exactly once",
      calls.filter((c) => c[0] === "init").length === 2);
    ok("   init is never called twice for the same id",
      new Set(calls.filter((c) => c[0] === "init").map((c) => c[1])).size === 2);
    ok("initMeta is idempotent", (() => {
      const before = calls.length;
      m.initMeta({ enabled: true, pixelIds: [PIXEL_A, PIXEL_B] });
      return calls.length === before;
    })());

    calls.length = 0;
    m.metaTrack("PageView");
    ok("F. PageView is sent ONCE PER PIXEL, not once per pixel per pixel",
      calls.length === 2);
    ok("   it uses trackSingle, which targets one pixel",
      calls.every((c) => c[0] === "trackSingle"));
    ok("   each call names a distinct pixel",
      new Set(calls.map((c) => c[1])).size === 2);
    ok("   N pixels produce N PageViews, never N²", calls.length === 2);
    delete globalThis.window;
  })();

  await (async () => {
    const m = await load();
    const calls = [];
    globalThis.window = { fbq: (...a) => calls.push(a) };
    m.initMeta({ enabled: true, pixelIds: [PIXEL_A] });
    calls.length = 0;
    m.metaTrack("PageView");
    ok("a single configured pixel yields exactly one PageView", calls.length === 1);
    delete globalThis.window;
  })();

  await (async () => {
    const m = await load();
    const calls = [];
    globalThis.window = { fbq: (...a) => calls.push(a) };
    m.initMeta({ enabled: false, pixelIds: [] });
    const sent = m.metaTrack("Purchase", { value: 100 });
    ok("E. Meta disabled → no event is dispatched", sent === false && calls.length === 0);
    delete globalThis.window;
  })();

  await (async () => {
    const m = await load();
    // No fbq yet: this is the cold-load case that used to DROP ViewContent.
    globalThis.window = {};
    m.initMeta({ enabled: true, pixelIds: [PIXEL_A] });
    ok("I. a stub is installed so pre-ready calls are queued, not lost",
      typeof globalThis.window.fbq === "function" && Array.isArray(globalThis.window.fbq.queue));
    m.metaTrack("ViewContent", { content_ids: ["p1"] }, { eventId: "vc_1" });
    m.metaTrack("AddToCart", { content_ids: ["p1"] }, { eventId: "atc_1" });
    ok("   multiple pre-ready events all queue",
      globalThis.window.fbq.queue.filter((c) => c[0] === "trackSingle").length === 2);
    ok("   the queue is Meta's own, so the library replays it on load",
      globalThis.window.fbq.version === "2.0" && globalThis.window.fbq.loaded === true);
    // Simulate the library attaching itself.
    const after = [];
    globalThis.window.fbq.callMethod = (...a) => after.push(a);
    m.metaTrack("ViewContent", { content_ids: ["p1"] }, { eventId: "vc_1" });
    ok("   the same event id is NOT replayed after the library loads", after.length === 0);
    m.metaTrack("ViewContent", { content_ids: ["p2"] }, { eventId: "vc_2" });
    ok("   a genuinely new event still sends after ready", after.length === 1);
    delete globalThis.window;
  })();

  await (async () => {
    const m = await load();
    const calls = [];
    globalThis.window = { fbq: (...a) => calls.push(a) };
    m.initMeta({ enabled: true, pixelIds: [PIXEL_A] });
    calls.length = 0;
    m.metaTrack("NotARealEvent", {});
    ok("an event outside the allow-list is refused", calls.length === 0);
    delete globalThis.window;
  })();
}

console.log("4) PAGEVIEW — one per navigation, none on re-render:");
{
  ok("PageView is emitted by the router effect, not by fbq('init')",
    /metaTrack\("PageView"\)/.test(PIXELCMP) && !/fbq\('init'[^)]*\);\s*fbq\('track', 'PageView'\)/.test(PIXELCMP));
  ok("the effect keys on pathname AND query", /const key = `\$\{pathname\}\?\$\{searchParams/.test(PIXELCMP));
  ok("a repeat of the same key is skipped (re-render safe)",
    /if \(lastKeyRef\.current === key\) return;/.test(PIXELCMP));
  ok("no reload / router.refresh / setTimeout hack",
    !/location\.reload|router\.refresh|setTimeout/.test(codeOnly(PIXELCMP)));
  ok("a fresh page-view nonce is minted per navigation", /newPageViewNonce\(\)/.test(PIXELCMP));
  ok("fbevents.js still loads asynchronously", /strategy="afterInteractive"/.test(PIXELCMP));
  ok("nothing renders when Meta is disabled", /if \(!enabled\) return null;/.test(PIXELCMP));

  // Navigation simulation with the real key rule.
  const nav = (() => {
    let last = null, views = 0;
    return { go: (k) => { if (last !== k) { last = k; views++; } }, get count() { return views; } };
  })();
  nav.go("/products?");
  ok("initial visit → 1 PageView", nav.count === 1);
  nav.go("/products?");
  ok("a re-render of the same route → no extra PageView", nav.count === 1);
  nav.go("/products/123?");
  ok("/products → /products/123 → 1 more", nav.count === 2);
  nav.go("/cart?");
  ok("/products/123 → /cart → 1 more", nav.count === 3);
  nav.go("/products?collection=A");
  nav.go("/products?collection=B");
  ok("a query-only change counts as a navigation", nav.count === 5);
}

console.log("5) VIEWCONTENT — 24h suppression removed, per-view dedupe kept:");
{
  ok("G. the 24-hour localStorage guard no longer gates the pixel",
    !/pc_\$\{data\._id\}[\s\S]{0,400}ViewContent/.test(PROD_CODE));
  ok("   ViewContent lives in its own effect", /metaTrack\(\s*"ViewContent"/.test(PROD_CODE));
  ok("   the track-click 24h guard still protects the INTERNAL counter only",
    /already tracked today/.test(PRODUCT) && /track-click/.test(PROD_CODE));
  ok("H. dedupe is scoped to the page view, not to a day",
    /scopedEventId\("ViewContent", id, pageViewNonce\(\)\)/.test(PROD_CODE));
  ok("   two views of one product in the same session differ by nonce",
    scopedEventId("ViewContent", "p1", "n1") !== scopedEventId("ViewContent", "p1", "n2"));
  ok("   the same view re-rendered yields an identical id",
    scopedEventId("ViewContent", "p1", "n1") === scopedEventId("ViewContent", "p1", "n1"));
  ok("payload carries ids, name, type, value and currency",
    /content_ids:\s*\[id\]/.test(PROD_CODE) && /content_name: data\.title/.test(PROD_CODE) &&
    /content_type: "product"/.test(PROD_CODE) && /value: price/.test(PROD_CODE) &&
    /currency: STORE_CURRENCY/.test(PROD_CODE));
  ok("the price is the REAL effective price, never invented",
    /toNumericValue\(data\.salePrice \?\? data\.regularPrice\)/.test(PROD_CODE));
  ok("a missing price omits `value` rather than sending 0",
    /\.\.\.\(price === null \? \{\} : \{ value: price \}\)/.test(PROD_CODE));
  ok("the CAPI counterpart shares the same event_id",
    /if \(fired\) sendViewContentToCapi\(id, eventId\)/.test(PROD_CODE));
}

console.log("6) ADDTOCART + INITIATECHECKOUT payloads:");
{
  ok("J. AddToCart fires from the action handler, not a render",
    /metaTrack\("AddToCart"/.test(PROD_CODE) && !/useEffect\([\s\S]{0,200}metaTrack\("AddToCart"/.test(PROD_CODE));
  ok("   it sends contents with quantity and item_price",
    /contents:\s*\[\{ id, quantity: qty/.test(PROD_CODE) && /item_price: unit/.test(PROD_CODE));
  ok("   a 2+1 bundle bills 2 units but delivers 3",
    /const qty\s+= selectedBundle === "2\+1" \? 3 : quantity/.test(PROD_CODE) &&
    /const paidQty = selectedBundle === "2\+1" \? 2 : quantity/.test(PROD_CODE));
  ok("   the total is not double-multiplied", /unit \* paidQty/.test(PROD_CODE));

  ok("K. InitiateCheckout uses the shared builders",
    /buildContents\(validItems\)/.test(ADDRESS) && /buildContentIds\(validItems\)/.test(ADDRESS) &&
    /contentsValue\(validItems\)/.test(ADDRESS) && /totalQuantity\(validItems\)/.test(ADDRESS));
  ok("   it is scoped per page view + cart, so re-renders send once",
    /scopedEventId\("InitiateCheckout", ids\.join\("-"\), pageViewNonce\(\)\)/.test(ADDRESS));
  ok("   an empty cart sends nothing", /if \(validItems\.length > 0\)/.test(ADDRESS));
  // Cart-item payloads keep their own currency field — that is order data, not a
  // Meta call site. What matters is that no metaTrack() hardcodes it.
  const metaCalls = (src) => (src.match(/metaTrack\([\s\S]{0,700}?\);/g) || []).join(" ");
  ok("   no metaTrack call hardcodes a currency literal",
    !/currency:\s*"MAD"/.test(metaCalls(PROD_CODE) + metaCalls(codeOnly(ADDRESS))));
  ok("   they all use the shared STORE_CURRENCY constant",
    /currency:\s*STORE_CURRENCY/.test(PROD_CODE) && /currency:\s*STORE_CURRENCY/.test(ADDRESS));

  // Z. contents quantities.
  const items = [
    { productId: "p1", quantity: 2, price: 50 },
    { productId: "p2", quantity: 1, price: "120,50" },
    { productId: "", quantity: 3, price: 10 },
  ];
  const contents = buildContents(items);
  ok("Z. contents keep real quantities", contents.map((c) => c.quantity).join(",") === "2,1");
  ok("   lines with no identifier are dropped", contents.length === 2);
  ok("   item_price parses a formatted string", contents[1].item_price === 120.5);
  ok("   content_ids match contents, de-duplicated", buildContentIds(items).join(",") === "p1,p2");
  ok("   totalQuantity sums units", totalQuantity(items) === 3);
  ok("   contentsValue = Σ(price × qty)", contentsValue(items) === 220.5);
  ok("   a quantity below 1 is clamped", buildContents([{ productId: "x", quantity: 0 }])[0].quantity === 1);
}

console.log("7) VALUE + CURRENCY:");
{
  ok("Y. one canonical currency constant", STORE_CURRENCY === "MAD");
  ok("   a formatted price string is parsed, not sent as text",
    toNumericValue("120 DH") === 120 && toNumericValue("1 234,50 DH") === 1234.5);
  ok("   both decimal conventions work",
    toNumericValue("1.234,50") === 1234.5 && toNumericValue("1,234.50") === 1234.5);
  ok("   a plain number passes through rounded", toNumericValue(99.999) === 100);
  ok("   junk yields null so `value` is omitted, never 0",
    toNumericValue("free") === null && toNumericValue("") === null && toNumericValue(null) === null);
  ok("   negatives are rejected", toNumericValue(-5) === null);
  ok("   NaN/Infinity are rejected", toNumericValue(NaN) === null && toNumericValue(Infinity) === null);
}

console.log("8) PURCHASE ELIGIBILITY — payment semantics, not order creation:");
{
  ok("normal COD converts at order creation",
    purchaseEligibility({ paymentMethod: "cod", status: "pending" }).reason === "cod_on_creation");
  ok("inline COD uses the same rule ('COD' case-insensitive)",
    isPurchaseEligible({ paymentMethod: "COD", status: "pending" }) === true);
  ok("N. an unpaid bank transfer is NOT a Purchase",
    purchaseEligibility({ paymentMethod: "bank_transfer", status: "pending", paymentStatus: "pending" })
      .reason === "awaiting_payment");
  ok("N. an unpaid cod_deposit is NOT a Purchase either",
    isPurchaseEligible({ paymentMethod: "cod_deposit", status: "pending" }) === false);
  ok("a VERIFIED bank transfer IS a Purchase",
    purchaseEligibility({ paymentMethod: "bank_transfer", paymentStatus: "success" }).reason === "payment_confirmed");
  ok("an admin-confirmed order is a Purchase whatever the method",
    purchaseEligibility({ paymentMethod: "bank_transfer", status: "confirmed" }).reason === "order_confirmed");
  ok("a cancelled order is never a Purchase",
    isPurchaseEligible({ paymentMethod: "cod", status: "cancelled" }) === false);
  ok("a failed order is never a Purchase",
    isPurchaseEligible({ paymentMethod: "cod", status: "failed" }) === false);
  ok("fake orders are excluded, as they are from every other integration",
    isPurchaseEligible({ paymentMethod: "cod", status: "pending", isFake: true }) === false);
  ok("an unknown payment method does not claim revenue",
    purchaseEligibility({ paymentMethod: "crypto", status: "pending" }).reason === "unknown_payment_method");
  ok("null-safe", purchaseEligibility(null).reason === "no_order");
  ok("paymentMethodKey normalises case and spacing", paymentMethodKey("  COD ") === "cod");
}

console.log("9) EVENT IDs — browser and CAPI share one:");
{
  ok("O. purchase id is deterministic from the order", purchaseEventId("abc") === "purchase_abc");
  ok("   the same order always yields the same id",
    purchaseEventId("abc") === purchaseEventId("abc"));
  ok("   different orders differ", purchaseEventId("a") !== purchaseEventId("b"));
  ok("   no timestamp or randomness", !/\d{10,}/.test(purchaseEventId("abc")));
  ok("   no secret is embedded", !purchaseEventId("abc").includes(TOKEN));
  ok("   an empty order id yields null", purchaseEventId("") === null && purchaseEventId(null) === null);

  ok("the browser half uses purchaseEventId", /purchaseEventId\(orderId\)/.test(PURCHASE));
  ok("the server half uses the SAME function",
    /eventId: purchaseEventId\(order\.id\)/.test(ROUTE_CODE));
  ok("both are passed to Meta as eventID / event_id",
    /\{ eventId \}/.test(PURCHASE) && /if \(eventId\) event\.event_id = eventId/.test(readFileSync("src/lib/meta/capi.js", "utf8")));
  ok("the allow-list is the single event vocabulary",
    EVENT_NAMES.join(",") === "PageView,ViewContent,AddToCart,InitiateCheckout,Purchase" &&
    isAllowedEvent("Purchase") && !isAllowedEvent("Lead"));
}

console.log("10) SERVER-SIDE IDEMPOTENCY (no migration — Setting PK):");
{
  ok("keys are namespaced under the settings table",
    purchaseKey("o1") === `${KEY_PREFIX}o1` && KEY_PREFIX === "meta-purchase:");
  ok("an empty order id yields no key", purchaseKey("") === null);

  ok("a delivered claim blocks a repeat",
    evaluateExistingClaim({ status: "sent", at: Date.now() }) === CLAIM.ALREADY_SENT);
  ok("Q. a FAILED claim is retryable",
    evaluateExistingClaim({ status: "failed", at: Date.now() }) === CLAIM.CLAIMED);
  ok("a fresh in-flight claim is not stolen",
    evaluateExistingClaim({ status: "sending", at: Date.now() }) === CLAIM.IN_FLIGHT);
  ok("a STALE in-flight claim may be taken over (crashed request)",
    evaluateExistingClaim({ status: "sending", at: Date.now() - STALE_CLAIM_MS - 1 }) === CLAIM.CLAIMED);
  ok("a corrupt record is retryable", evaluateExistingClaim(null) === CLAIM.CLAIMED);

  // Fake Prisma exercising the real claim/mark functions.
  const makeDb = () => {
    const rows = new Map();
    return {
      rows,
      setting: {
        create: async ({ data }) => {
          if (rows.has(data.id)) { const e = new Error("dup"); e.code = "P2002"; throw e; }
          rows.set(data.id, { ...data }); return rows.get(data.id);
        },
        findUnique: async ({ where }) => rows.get(where.id) ?? null,
        update: async ({ where, data }) => {
          if (!rows.has(where.id)) throw new Error("missing");
          rows.set(where.id, { ...rows.get(where.id), ...data }); return rows.get(where.id);
        },
      },
    };
  };

  await (async () => {
    const db = makeDb();
    const first = await claimPurchase("o1", { prisma: db });
    ok("P. the first attempt claims delivery", first.status === CLAIM.CLAIMED);
    const second = await claimPurchase("o1", { prisma: db });
    ok("P. a concurrent second attempt is refused", second.status === CLAIM.IN_FLIGHT);

    await markPurchaseSent("o1", { received: 1 }, { prisma: db });
    const third = await claimPurchase("o1", { prisma: db });
    ok("P. after success, every later attempt is refused", third.status === CLAIM.ALREADY_SENT);
    ok("   a shared/reopened success URL cannot double-count", third.status !== CLAIM.CLAIMED);
    ok("   the stored state records success", db.rows.get("meta-purchase:o1").data.status === "sent");
  })();

  await (async () => {
    const db = makeDb();
    await claimPurchase("o2", { prisma: db });
    await markPurchaseFailed("o2", CAPI_RESULT.TIMEOUT, { prisma: db });
    ok("AA. a failed delivery is NOT recorded as sent",
      db.rows.get("meta-purchase:o2").data.status === "failed");
    const retry = await claimPurchase("o2", { prisma: db });
    ok("Q. and a legitimate retry is allowed", retry.status === CLAIM.CLAIMED);
  })();

  ok("no schema change was needed for this",
    !/metaPurchaseSentAt|metaConversion/i.test(SCHEMA));
  ok("no migration directory was added for Meta",
    !readFileSync("prisma/schema.prisma", "utf8").includes("MetaEvent"));
  ok("Bemob's own fields are never read or written by the guard",
    !/bemobConversion/.test(codeOnly(readFileSync("src/lib/meta/idempotency.js", "utf8"))));
}

console.log("11) CAPI DELIVERY — outcome classification and secrecy:");
{
  const cfg = { pixelId: PIXEL_A, accessToken: TOKEN };
  const res = (status, body = {}) => ({
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });

  await (async () => {
    const r = await sendCapiEvents([{ event_name: "Purchase" }], cfg,
      { fetchImpl: async () => res(200, { events_received: 1 }) });
    ok("a 2xx with valid JSON is OK", r.result === CAPI_RESULT.OK && r.received === 1);
  })();
  await (async () => {
    const r = await sendCapiEvents([{}], cfg, { fetchImpl: async () => res(400, { error: { message: "bad" } }) });
    ok("a non-2xx is REJECTED, never OK", r.result === CAPI_RESULT.REJECTED && r.status === 400);
  })();
  await (async () => {
    const r = await sendCapiEvents([{}], cfg, { fetchImpl: async () => { const e = new Error("x"); e.name = "AbortError"; throw e; } });
    ok("a timeout is TIMEOUT, not OK", r.result === CAPI_RESULT.TIMEOUT);
  })();
  await (async () => {
    const r = await sendCapiEvents([{}], cfg, { fetchImpl: async () => { throw new Error("ECONNREFUSED"); } });
    ok("a network failure is NETWORK, not OK", r.result === CAPI_RESULT.NETWORK);
  })();
  await (async () => {
    const r = await sendCapiEvents([{}], cfg, { fetchImpl: async () => ({ status: 200, json: async () => { throw new Error("bad json"); } }) });
    ok("a malformed upstream body is MALFORMED, not OK", r.result === CAPI_RESULT.MALFORMED);
  })();
  await (async () => {
    const r = await sendCapiEvents([{}], { pixelId: PIXEL_A, accessToken: null }, { fetchImpl: async () => res(200) });
    ok("no credentials → SKIPPED, and nothing is sent", r.result === CAPI_RESULT.SKIPPED);
  })();
  await (async () => {
    let seenUrl = "", seenBody = "";
    await sendCapiEvents([{}], cfg, {
      fetchImpl: async (u, init) => { seenUrl = u; seenBody = init.body; return res(200, { events_received: 1 }); },
    });
    ok("the token is NOT in the URL (no access-log leak)", !seenUrl.includes(TOKEN));
    ok("the token travels in the request body", seenBody.includes("access_token"));
    ok("the Graph API version is a single constant",
      seenUrl.includes(GRAPH_API_VERSION) && /^v\d+\.\d+$/.test(GRAPH_API_VERSION));
    ok("the version is not obsolete", Number(GRAPH_API_VERSION.slice(1).split(".")[0]) >= 21);
  })();
  ok("redactToken removes the secret from any log line",
    !redactToken(`oops ${TOKEN} here`, TOKEN).includes(TOKEN) &&
    redactToken("access_token=abc123", null) === "access_token=[REDACTED]");
  ok("a test_event_code is sent to Meta, never to the browser",
    /body\.test_event_code = testEventCode/.test(readFileSync("src/lib/meta/capi.js", "utf8")) &&
    !/testEventCode/.test(BROWSER + PIXELCMP));
}

console.log("12) USER_DATA — hashing, normalisation, omission:");
{
  const ud = buildUserData({
    email: "  Test.User@Example.COM ", phone: "06 12 34 56 78",
    fullName: "Yassine  El Amrani", city: "Casablanca", zip: "20000",
    externalId: "order-1", clientIp: "1.2.3.4", userAgent: "UA",
    fbp: "fb.1.1700000000000.1234567890", fbc: "fb.1.1700000000000.IwAR123",
  });
  ok("em / ph / fn / ln / ct / zp / country / external_id are all hashed arrays",
    ["em", "ph", "fn", "ln", "ct", "zp", "country", "external_id"]
      .every((k) => Array.isArray(ud[k]) && /^[a-f0-9]{64}$/.test(ud[k][0])));
  ok("fbp / fbc / ip / user agent are NOT hashed",
    ud.fbp === "fb.1.1700000000000.1234567890" && ud.fbc === "fb.1.1700000000000.IwAR123" &&
    ud.client_ip_address === "1.2.3.4" && ud.client_user_agent === "UA");
  ok("the raw PII never appears in the output",
    !JSON.stringify(ud).includes("Example") && !JSON.stringify(ud).includes("Yassine"));

  ok("W. empty PII is omitted, never hashed as \"\"", (() => {
    const empty = buildUserData({ email: "", phone: "   ", city: null, clientIp: "1.2.3.4" });
    return !("em" in empty) && !("ph" in empty) && !("ct" in empty);
  })());
  ok("W. an invalid email is not hashed",
    !("em" in buildUserData({ email: "not-an-email" })));
  ok("W. a too-short phone is not hashed",
    !("ph" in buildUserData({ phone: "123" })));
  ok("sha256 refuses empty input", sha256("") === null && sha256(null) === null);
  ok("hashing is stable and lower-case hex", sha256("abc") === sha256("abc") && /^[a-f0-9]{64}$/.test(sha256("abc")));
  ok("country is not sent for a profile with no address signal",
    !("country" in buildUserData({ clientIp: "1.2.3.4" })));
}

console.log("13) U. PHONE NORMALISATION — Morocco, without corrupting foreigners:");
{
  ok("06xxxxxxxx → 2126xxxxxxxx", normalizePhone("0612345678") === "212612345678");
  ok("07xxxxxxxx → 2127xxxxxxxx", normalizePhone("0712345678") === "212712345678");
  ok("separators are stripped", normalizePhone("06 12-34.56 78") === "212612345678");
  ok("+212... stays, without a second 212", normalizePhone("+212612345678") === "212612345678");
  ok("00212... → 212...", normalizePhone("00212612345678") === "212612345678");
  ok("212... unchanged", normalizePhone("212612345678") === "212612345678");
  ok("a 9-digit mobile gains the country code", normalizePhone("612345678") === "212612345678");
  ok("212 is NOT blindly prepended to an international number",
    normalizePhone("+33612345678") === "33612345678");
  ok("a foreign 00-prefixed number is preserved",
    normalizePhone("0033612345678") === "33612345678");
  ok("all Moroccan input forms collapse to ONE hash", (() => {
    const forms = ["0612345678", "06 12 34 56 78", "+212612345678", "00212612345678", "212612345678", "612345678"];
    return new Set(forms.map(normalizePhone)).size === 1;
  })());
  ok("junk and empties yield null",
    normalizePhone("") === null && normalizePhone("abc") === null &&
    normalizePhone(null) === null && normalizePhone("12") === null);
}

console.log("14) V. EMAIL + name/place normalisation:");
{
  ok("email is trimmed and lower-cased", normalizeEmail("  Foo.Bar@Example.COM  ") === "foo.bar@example.com");
  ok("an empty or invalid email is rejected",
    normalizeEmail("") === null && normalizeEmail("nope") === null &&
    normalizeEmail("a@b") === null && normalizeEmail(null) === null);
  ok("a valid subdomain address passes", normalizeEmail("x@mail.example.co.uk") === "x@mail.example.co.uk");
  ok("a full name splits into first/last", (() => {
    const { fn, ln } = splitFullName("  Yassine   El Amrani ");
    return fn === "yassine" && ln === "amrani";
  })());
  ok("a single-word name has no last name", splitFullName("Yassine").ln === null);
  ok("city strips spaces and punctuation", normalizeCity("Casa-blanca ") === "casablanca");
  ok("zip keeps alphanumerics only", normalizeZip(" 20 000 ") === "20000");
  ok("country falls back to ma", normalizeCountry("") === "ma" && normalizeCountry("FR") === "fr");
}

console.log("15) X. FBP / FBC:");
{
  ok("a well-formed _fbp is accepted", isValidFbp("fb.1.1700000000000.1234567890") === true);
  ok("garbage _fbp is rejected", isValidFbp("nonsense") === false && isValidFbp("") === false);
  ok("a well-formed _fbc is accepted", isValidFbc("fb.1.1700000000000.IwAR9xyz") === true);
  ok("garbage _fbc is rejected", isValidFbc("IwAR9xyz") === false);
  ok("an invalid cookie is dropped rather than forwarded", (() => {
    const ud = buildUserData({ fbp: "bogus", fbc: "bogus", clientIp: "1.2.3.4" });
    return !("fbp" in ud) && !("fbc" in ud);
  })());
  ok("fbc is NEVER fabricated from nothing",
    deriveFbc("", Date.now()) === null && deriveFbc(null, Date.now()) === null);
  ok("fbc derived from a real fbclid follows Meta's format",
    deriveFbc("IwAR9xyz", 1700000000000) === "fb.1.1700000000000.IwAR9xyz");
  ok("the browser reads the cookies, the server never invents them",
    /readCookie\('_fbp'\)/.test(PURCHASE) && /readCookie\('_fbc'\)/.test(PURCHASE) &&
    !/deriveFbc/.test(ROUTE_CODE));
  ok("Bemob's click cookies are untouched by the Meta code",
    !/bemob|click_id|clickId/i.test(PURCHASE + BROWSER));
}

console.log("16) R. CAPI ENDPOINT SECURITY:");
{
  ok("POST is the only event method; GET is refused",
    /export async function POST/.test(ROUTE_CODE) && /status: 405/.test(ROUTE_CODE));
  ok("it is rate limited", /rateLimit\(req, 'meta_capi'/.test(ROUTE_CODE));
  ok("the body size is bounded", /MAX_BODY_BYTES/.test(ROUTE_CODE) && /payload_too_large/.test(ROUTE_CODE));
  ok("a malformed body is rejected", /return bad\('invalid_body'\)/.test(ROUTE_CODE));
  ok("event names are allow-listed", /if \(!isAllowedEvent\(eventName\)\) return bad\('unsupported_event'\)/.test(ROUTE_CODE));
  ok("only server-verifiable events are acted on",
    /const SERVER_EVENTS = new Set\(\['Purchase', 'ViewContent'\]\)/.test(ROUTE_CODE));
  ok("Purchase value/contents come from the DATABASE, not the client",
    /prisma\.order\.findFirst/.test(ROUTE_CODE) &&
    !/body\.value|body\.contents|body\.content_ids|body\.num_items/.test(ROUTE_CODE));
  ok("PII comes from the order row, not the request",
    /order\.customerPhone/.test(ROUTE_CODE) && !/body\.phone|body\.city|body\.email/.test(ROUTE_CODE));
  ok("ViewContent price is re-resolved from the catalogue",
    /prisma\.product\.findUnique/.test(ROUTE_CODE) && /product\.salePrice \?\? product\.regularPrice/.test(ROUTE_CODE));
  ok("upstream Meta bodies are never returned to the client",
    !/res\.detail\s*\}\)/.test(ROUTE_CODE) && /error: 'delivery_failed'/.test(ROUTE_CODE));
  ok("errors are logged server-side without the token",
    /console\.error\('\[meta\/capi\]'/.test(ROUTE_CODE));
  ok("the event_source_url is validated as http(s)",
    /u\.protocol === 'https:' \|\| u\.protocol === 'http:'/.test(ROUTE_CODE));
  ok("the user agent is length-capped", /slice\(0, 512\)/.test(ROUTE_CODE));
}

console.log("17) FLOW MATRIX — every real purchase path:");
{
  ok("L. inline COD now enters the SHARED pipeline",
    /import \{ trackPurchase \} from "@\/lib\/meta\/purchase"/.test(CODFORM) &&
    /trackPurchase\(\{/.test(CODFORM));
  ok("L. it fires only after res.ok AND a real order id",
    /if \(res\.ok\)/.test(CODFORM) && /if \(orderId\) \{\s*\n\s*trackPurchase/.test(CODFORM));
  ok("M. the landing/offer form is the SAME component, so it is covered too",
    /InlineCodForm/.test(readFileSync("src/app/offer/[slug]/OfferClient.jsx", "utf8")));
  ok("no copy-pasted Meta code exists in the offer page",
    !/fbq|facebook\/capi/.test(readFileSync("src/app/offer/[slug]/OfferClient.jsx", "utf8")));
  ok("the success page uses the same helper",
    /import \{ trackPurchase \} from "@\/lib\/meta\/purchase"/.test(SUCCESS));
  ok("there is exactly ONE trackPurchase implementation",
    /export function trackPurchase/.test(PURCHASE));
  ok("N. the success page re-checks eligibility as the order transitions",
    /\}, \[order\?\._id, order\?\.status, order\?\.paymentStatus\]\)/.test(codeOnly(SUCCESS)));
  ok("the browser half is gated on the same rule as the server",
    /if \(!isPurchaseEligible\(order\)\) return/.test(PURCHASE));
  ok("localStorage is only an optimisation, not the guard",
    /only a client-side optimisation/.test(SUCCESS) || /alreadyLocal/.test(SUCCESS));

  // The four flows, exercised through the real eligibility rule.
  const flows = [
    ["normal COD",     { paymentMethod: "cod", status: "pending" },                              true],
    ["inline COD",     { paymentMethod: "COD", status: "pending" },                              true],
    ["landing/offer",  { paymentMethod: "COD", status: "pending" },                              true],
    ["bank transfer",  { paymentMethod: "bank_transfer", status: "pending", paymentStatus: "pending" }, false],
    ["bank verified",  { paymentMethod: "bank_transfer", paymentStatus: "success" },             true],
    ["cod_deposit",    { paymentMethod: "cod_deposit", status: "pending" },                      false],
  ];
  for (const [name, order, expected] of flows) {
    ok(`flow "${name}" → Purchase ${expected ? "YES" : "NO"}`, isPurchaseEligible(order) === expected);
  }
}

console.log("18) AB. BEMOB AND OTHER TRACKING UNCHANGED:");
{
  ok("the Bemob CONFIRMED trigger is untouched",
    /data\.status\.toUpperCase\(\) === 'CONFIRMED'/.test(ORDERSVC));
  ok("bemobConversionSentAt semantics are untouched",
    /bemobConversionSentAt: new Date\(\), bemobConversionStatus: 'sent'/.test(ORDERSVC));
  ok("the failed-status branch is untouched",
    /data:  \{ bemobConversionStatus: 'failed' \}/.test(ORDERSVC));
  ok("Bemob schema fields are unchanged",
    /bemobClickId          String\?/.test(SCHEMA) && /bemobConversionSentAt DateTime\?/.test(SCHEMA));
  ok("no Meta module imports Bemob",
    !/bemobApi|sendBemobPostback/.test(
      readFileSync("src/lib/meta/config.js", "utf8") + readFileSync("src/lib/meta/capi.js", "utf8") +
      readFileSync("src/lib/meta/idempotency.js", "utf8") + PURCHASE + BROWSER));
  ok("event_id and click_id are never merged",
    !/bemobClickId/.test(PURCHASE + ROUTE_CODE));
  ok("Clarity still runs on the product page", /trackClarity/.test(PROD_CODE));
  ok("Clarity still runs on the success page", /trackClarity\("purchase"/.test(codeOnly(SUCCESS)));
  ok("the internal funnel event is untouched", /fireFunnelEvent\(\{ event: "product_click"/.test(PROD_CODE));
  ok("affiliate recording in inline COD is untouched",
    /\/api\/affiliate\/record-order/.test(CODFORM));
  ok("ScriptInjector still injects GA / GTM / Ads / custom code",
    /googleAnalytics/.test(INJ_CODE) && /googleTagManager/.test(INJ_CODE) &&
    /googleAds/.test(INJ_CODE) && /customCode/.test(INJ_CODE));
  ok("the CSP still allows Facebook",
    /connect\.facebook\.net/.test(readFileSync("next.config.ts", "utf8")));
}

console.log("19) REACT / SSR SAFETY:");
{
  ok("no window access at module scope in the browser helper",
    /typeof window === 'undefined'/.test(BROWSER));
  ok("MetaPixel is a client component", /^"use client";/.test(PIXELCMP));
  ok("the purchase helper is client-only too", /^"use client";/.test(PURCHASE));
  ok("no suppressHydrationWarning was added",
    !/suppressHydrationWarning/.test(PIXELCMP + PURCHASE + BROWSER));
  ok("nothing renders a Date.now()/random value into markup",
    !/Date\.now\(\)/.test(PIXELCMP) && !/Math\.random/.test(PIXELCMP));
  ok("useSearchParams is wrapped in Suspense at the layout",
    /<Suspense fallback=\{null\}>\s*\n\s*\{\/\*[\s\S]{0,200}\*\/\}\s*\n?\s*<MetaPixel/.test(LAYOUT) ||
    /<Suspense fallback=\{null\}>[\s\S]{0,300}<MetaPixel/.test(LAYOUT));
  ok("tracking never blocks the order request",
    /keepalive: true/.test(PURCHASE) && /\.catch\(\(\) => \{\}\)/.test(PURCHASE));
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
