#!/usr/bin/env node
/**
 * scripts/productMeta.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests the product meta-description fallback chain (src/lib/productMeta.js).
 * Pure logic — no DB, no network, no framework. Run:
 *   node scripts/productMeta.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  MAX_DESCRIPTION_LENGTH, DEFAULT_META_LANG,
  cleanText, truncateWords, isSameAsTitle,
  generateFallbackDescription, buildProductDescription,
} from "../src/lib/productMeta.js";

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log("  PASS ", n); } else { fail++; console.log("  FAIL ", n); } };

const TITLE = "Lampe LED Solaire";
const P = (over = {}) => ({ title: TITLE, ...over });

console.log("1) priority: shortDescription first:");
{
  const d = buildProductDescription(P({ shortDescription: "Une lampe solaire d'extérieur.", description: "<p>Longue.</p>" }));
  ok("shortDescription beats description", d === "Une lampe solaire d'extérieur.");
  ok("shortDescription is cleaned", buildProductDescription(P({ shortDescription: "  Deux   espaces  " })) === "Deux espaces");
  // The Product model has exactly two description fields — shortDescription and
  // description. There is no metaDescription column, so an unknown key on the
  // object must be ignored rather than silently honoured.
  ok("an unrelated metaDescription key is NOT consulted (no such field)",
     buildProductDescription(P({ metaDescription: "Ignored.", shortDescription: "Short used." })) === "Short used.");
  ok("unknown keys do not pre-empt the generated fallback",
     buildProductDescription(P({ metaDescription: "Ignored." })).startsWith("Découvrez"));
}

console.log("2) priority: description fallback:");
{
  const d = buildProductDescription(P({ description: "<p>Une <b>super</b> lampe.</p>" }));
  ok("description used when shortDescription is empty", d === "Une super lampe.");
  ok("empty shortDescription skipped", buildProductDescription(P({ shortDescription: "   ", description: "<p>Repli.</p>" })) === "Repli.");
}

console.log("3) generated fallback (the actual bug fix):");
{
  const d = buildProductDescription(P());
  ok("no description at all → generated sentence", d.startsWith("Découvrez Lampe LED Solaire avec livraison"));
  ok("generated is NOT the bare title (this was the bug)", d !== TITLE);
  ok("mentions the value props", d.includes("Maroc") && d.includes("Paiement à la livraison"));
  ok("names the product exactly once", d.split(TITLE).length - 1 === 1);
  // The old code produced description === title; Google discards those.
  ok("shortDescription that merely echoes the title is rejected",
     buildProductDescription(P({ shortDescription: TITLE })).startsWith("Découvrez"));
  ok("description that echoes the title is rejected too",
     buildProductDescription(P({ description: `<p>${TITLE}</p>` })).startsWith("Découvrez"));
  ok("title echo check ignores case/punctuation",
     isSameAsTitle("lampe led solaire.", TITLE) === true && isSameAsTitle("Autre texte", TITLE) === false);
  ok("a real description containing the title is still kept",
     buildProductDescription(P({ shortDescription: `${TITLE} pour votre jardin.` })) === `${TITLE} pour votre jardin.`);
}

console.log("4) HTML stripping (never output HTML):");
{
  ok("tags stripped", cleanText("<p>Bonjour <b>monde</b></p>") === "Bonjour monde");
  ok("entity-encoded tags stripped too (not decoded into markup)",
     cleanText("&lt;script&gt;alert(1)&lt;/script&gt;") === "alert(1)");
  ok("basic entities decoded", cleanText("A &amp; B &quot;C&quot;") === 'A & B "C"');
  ok("French accents decoded (not leaked raw)", cleanText("Caf&eacute; cr&egrave;me &agrave; c&ocirc;t&eacute;") === "Café crème à côté");
  ok("typographic entities decoded", cleanText("5&nbsp;&euro; &ndash; 100&deg;") === "5 € – 100°");
  ok("numeric entities decoded (decimal)", cleanText("Caf&#233;") === "Café");
  ok("numeric entities decoded (hex)", cleanText("l&#x27;article") === "l'article");
  ok("no raw entity survives in a built description",
     !/&[a-z]+;|&#\d+;/i.test(buildProductDescription(P({ shortDescription: "Caf&eacute; &amp; th&eacute;" }))));
  ok("nbsp becomes a normal space", cleanText("A&nbsp;&nbsp;B") === "A B");
  ok("no angle brackets survive", !cleanText("<div><span>x</span></div>").includes("<"));
  ok("script content removed with its tags", cleanText("<script>evil()</script>Texte") === "evil() Texte");
  const d = buildProductDescription(P({ description: "<h1>Titre</h1><p>Corps &amp; suite</p>" }));
  ok("built description carries no markup", !/[<>]/.test(d) && d === "Titre Corps & suite");
}

console.log("5) max length + word safety:");
{
  const long = "Mot ".repeat(100).trim();
  const d = buildProductDescription(P({ shortDescription: long }));
  ok(`never exceeds ${MAX_DESCRIPTION_LENGTH} chars`, d.length <= MAX_DESCRIPTION_LENGTH);
  ok("cap is 160", MAX_DESCRIPTION_LENGTH === 160);
  ok("ends with an ellipsis when cut", d.endsWith("…"));
  ok("never cuts a word in half", d.slice(0, -1).split(" ").every((w) => w === "" || w === "Mot"));
  ok("short text is not truncated", truncateWords("Court.", 160) === "Court.");
  ok("exactly-at-limit text is untouched", truncateWords("a".repeat(160), 160).length === 160);
  ok("no trailing punctuation before the ellipsis", !/[ ,;:-]…$/.test(truncateWords("alpha beta, gamma delta", 14)));
  // A single unbroken word longer than the cap can only be hard-cut.
  ok("one giant word is still capped", truncateWords("x".repeat(300), 160).length <= 160);
  // A long title must not push the generated sentence past the cap.
  const longTitle = buildProductDescription(P({ title: "Produit " + "Très Long ".repeat(20) }));
  ok("generated fallback respects the cap with a long title", longTitle.length <= MAX_DESCRIPTION_LENGTH);
}

console.log("6) multilingual output:");
{
  ok("default language is French", DEFAULT_META_LANG === "fr");
  ok("fr", generateFallbackDescription(TITLE, "fr").startsWith("Découvrez Lampe LED Solaire avec livraison rapide partout au Maroc"));
  ok("en", generateFallbackDescription(TITLE, "en") === "Buy Lampe LED Solaire with fast delivery across Morocco. Cash on delivery and secure ordering.");
  ok("ar", generateFallbackDescription(TITLE, "ar").includes("توصيل سريع لجميع مدن المغرب"));
  ok("ar names the product", generateFallbackDescription(TITLE, "ar").includes(TITLE));
  ok("unknown language falls back to French", generateFallbackDescription(TITLE, "de").startsWith("Découvrez"));
  ok("lang option flows through buildProductDescription",
     buildProductDescription(P(), { lang: "en" }).startsWith("Buy Lampe LED Solaire"));
}

console.log("7) empty values:");
{
  ok("no title, no description → generic sentence, no dangling name",
     buildProductDescription({}) === "Découvrez nos produits avec livraison rapide partout au Maroc. Paiement à la livraison et commande sécurisée.");
  ok("no double space where the name would go", !buildProductDescription({}).includes("  "));
  ok("null product is safe", typeof buildProductDescription(null) === "string" && buildProductDescription(null).length > 0);
  ok("null/undefined fields are safe",
     buildProductDescription({ title: TITLE, shortDescription: null, description: undefined }).startsWith("Découvrez"));
  ok("non-string fields ignored", cleanText(123) === "" && cleanText({}) === "" && cleanText([]) === "");
  ok("whitespace-only description is treated as empty", buildProductDescription(P({ description: "<p>   </p>" })).startsWith("Découvrez"));
  ok("empty title in fallback → unnamed variant", generateFallbackDescription("", "en") === "Shop our products with fast delivery across Morocco. Cash on delivery and secure ordering.");
}

console.log("8) whitespace cleanup:");
{
  ok("newlines collapsed", cleanText("Ligne1\n\nLigne2") === "Ligne1 Ligne2");
  ok("tabs collapsed", cleanText("A\t\tB") === "A B");
  ok("runs collapsed to one space", cleanText("A     B") === "A B");
  ok("trimmed", cleanText("   A B   ") === "A B");
  ok("block tags become a space, not a join", cleanText("<p>Un</p><p>Deux</p>") === "Un Deux");
  ok("no leading/trailing space in the result", buildProductDescription(P({ shortDescription: "  \n Texte \t " })) === "Texte");
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
