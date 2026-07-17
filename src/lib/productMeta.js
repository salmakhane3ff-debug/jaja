/**
 * src/lib/productMeta.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Builds the SEO meta description for a product page.
 *
 * WHY THIS EXISTS: the product page used to do
 *     const description = product.shortDescription || product.title || "";
 * so any product without a shortDescription got a meta description that was a
 * verbatim copy of its <title>. Google discards a description that duplicates the
 * title and synthesises a snippet from page text instead — which is why search
 * results were showing the footer's boilerplate ("Discover premium products with
 * unmatched quality…", Footer.jsx) and stray prices. The rich `description` field
 * was never consulted at all.
 *
 * Priority:  shortDescription → description → generated
 *
 * These are the only description fields the Product model actually has. A
 * candidate is skipped when it is empty or merely echoes the title.
 *
 * Pure — no DB, no React, no network. Unit-testable with plain Node.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// Google truncates around 155–160 chars; this is a hard cap on what we emit,
// including the ellipsis.
export const MAX_DESCRIPTION_LENGTH = 160;

// generateMetadata runs on the SERVER, where the visitor's language choice is
// unknowable: LanguageContext is a client module that only reads localStorage
// after mount, and store settings carry no language. Crawlers always get the
// server render. French matches this page's declared openGraph locale (fr_MA)
// and its "Produit" title fallback, so metadata stays internally consistent.
export const DEFAULT_META_LANG = "fr";

const TEMPLATES = {
  fr: {
    named:   (t) => `Découvrez ${t} avec livraison rapide partout au Maroc. Paiement à la livraison et commande sécurisée.`,
    unnamed: ()  => `Découvrez nos produits avec livraison rapide partout au Maroc. Paiement à la livraison et commande sécurisée.`,
  },
  en: {
    named:   (t) => `Buy ${t} with fast delivery across Morocco. Cash on delivery and secure ordering.`,
    unnamed: ()  => `Shop our products with fast delivery across Morocco. Cash on delivery and secure ordering.`,
  },
  ar: {
    named:   (t) => `اطلب ${t} مع توصيل سريع لجميع مدن المغرب والدفع عند الاستلام.`,
    unnamed: ()  => `اطلب منتجاتنا مع توصيل سريع لجميع مدن المغرب والدفع عند الاستلام.`,
  },
};

// Named entities a rich-text editor realistically emits. The accented set is not
// optional here: the catalogue is French/Arabic, and an undecoded "Caf&eacute;"
// would ship a raw entity straight into the search snippet.
const ENTITIES = {
  "&lt;": "<", "&gt;": ">", "&amp;": "&", "&quot;": '"',
  "&apos;": "'", "&nbsp;": " ",
  // French accents
  "&eacute;": "é", "&egrave;": "è", "&ecirc;": "ê", "&euml;": "ë",
  "&agrave;": "à", "&acirc;": "â", "&ccedil;": "ç",
  "&ugrave;": "ù", "&ucirc;": "û", "&uuml;": "ü",
  "&icirc;": "î", "&iuml;": "ï", "&ocirc;": "ô", "&oelig;": "œ",
  // Typography
  "&laquo;": "«", "&raquo;": "»", "&hellip;": "…",
  "&ndash;": "–", "&mdash;": "—",
  "&rsquo;": "'", "&lsquo;": "'", "&ldquo;": "“", "&rdquo;": "”",
  "&deg;": "°", "&euro;": "€", "&times;": "×",
};

/**
 * HTML → plain text, safe for a meta tag.
 *
 * Order is strip → decode → strip: stripping first removes real markup, and the
 * SECOND strip catches tags that were entity-encoded (`&lt;b&gt;`), which would
 * otherwise decode into literal HTML inside the description. (This is why
 * utils/sanitize.js is not reused here: it decodes *after* stripping, so encoded
 * tags survive, and it hard-slices mid-word.)
 *
 * Trade-off: text like "5 &lt; 10 &gt; 3" decodes to "5 < 10 > 3" and the second
 * strip eats "< 10 >". Emitting no markup matters more than that rare case.
 */
export function cleanText(value) {
  if (!value || typeof value !== "string") return "";
  let out = value.replace(/<[^>]*>/g, " ");
  for (const [entity, char] of Object.entries(ENTITIES)) {
    out = out.replace(new RegExp(entity, "gi"), char);
  }
  // Numeric entities, decimal (&#233;) and hex (&#x27;).
  out = out
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)));
  return out
    .replace(/<[^>]*>/g, " ")     // second pass: previously-encoded markup
    .replace(/\s+/g, " ")         // collapse ALL whitespace runs (incl. newlines)
    .trim();
}

/** Truncate on a word boundary. The returned string is always <= maxLength. */
export function truncateWords(text, maxLength = MAX_DESCRIPTION_LENGTH) {
  const s = (text || "").trim();
  if (s.length <= maxLength) return s;

  const limit = maxLength - 1;              // leave room for the ellipsis
  const slice = s.slice(0, limit + 1);
  const lastSpace = slice.lastIndexOf(" ");
  // No space at all → a single word longer than the cap; a hard cut is the only
  // option left.
  const cut = lastSpace > 0 ? slice.slice(0, lastSpace) : slice.slice(0, limit);
  return cut.replace(/[\s.,;:!?،–—-]+$/u, "") + "…";
}

const normalize = (s) => cleanText(s).toLowerCase().replace(/[.…!?]+$/u, "").trim();

/** True when a candidate would just echo the title back (today's bug). */
export function isSameAsTitle(candidate, title) {
  const c = normalize(candidate);
  const t = normalize(title);
  return c.length > 0 && c === t;
}

/** The natural-language fallback, in the requested language. */
export function generateFallbackDescription(title, lang = DEFAULT_META_LANG) {
  const tpl = TEMPLATES[lang] || TEMPLATES[DEFAULT_META_LANG];
  const name = cleanText(title);
  return name ? tpl.named(name) : tpl.unnamed();
}

/**
 * Resolve a product's meta description.
 *
 * @param {object} product
 * @param {{lang?: string, maxLength?: number}} [opts]
 * @returns {string} plain text, never HTML, never longer than maxLength
 */
export function buildProductDescription(product, { lang = DEFAULT_META_LANG, maxLength = MAX_DESCRIPTION_LENGTH } = {}) {
  const title = cleanText(product?.title || "");

  // Usable only if they say something the title doesn't already.
  for (const raw of [product?.shortDescription, product?.description]) {
    const cleaned = cleanText(raw);
    if (!cleaned) continue;
    if (isSameAsTitle(cleaned, title)) continue;   // never echo the title back
    return truncateWords(cleaned, maxLength);
  }

  return truncateWords(generateFallbackDescription(title, lang), maxLength);
}
