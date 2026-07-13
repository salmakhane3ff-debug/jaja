#!/usr/bin/env node
/**
 * scripts/landingWhatsapp.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit tests for the WhatsApp Landing-Page order template routing + variable
 * resolution. Imports the REAL bot's exported PURE helpers (no DB/WhatsApp).
 *
 * Run:  node scripts/landingWhatsapp.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 */

import bot from "../scripts/whatsapp-order-bot.js";
const {
  renderTemplate, isLandingOrder, buildOrderVars, pickTemplate, resolveOrderMessage,
  DEFAULT_TEMPLATES, DEFAULT_LANDING_NEW_ORDER_TEMPLATE,
} = bot;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log("  PASS ", n); } else { fail++; console.log("  FAIL ", n); } };

const SLUGS   = new Set(["my-offer", "promo-x"]);
const STORE   = { NEW: "STORE-NEW {name}|{products}|{total}", CONFIRMED: "STORE-CONFIRMED {name}", SHIPPED: "STORE-SHIPPED {orderId}", DELIVERED: "STORE-DELIVERED {name}", CANCELLED: "STORE-CANCELLED" };
const LANDING = "LANDING {name}|{product}|{quantity}|{price}|{orderId}|{city}|{address}|{landingPage}|{phone}";
const SITE    = "https://shop.test";
const ITEMS   = { o1: [{ title: "Widget", quantity: 2 }, { title: "Gadget", quantity: 1 }] };

const storeOrder   = { id: "o1", customerName: "Ali",  customerPhone: "0612345678", utmSource: "tiktok",   paymentTotal: 199, shippingAddress: { address: { city: "Casa",  address1: "Rue 1" } } };
const landingOrder = { id: "o1", customerName: "Sara", customerPhone: "0655667788", utmSource: "my-offer", paymentTotal: 299, shippingAddress: { address: { city: "Rabat", address1: "Av 2"  } } };
const oldOrder     = { id: "o1", customerName: "Old",  customerPhone: "0600000000", utmSource: null };
const unknownOrder = { id: "o1", customerName: "Unk",  customerPhone: "0611111111", utmSource: "fb-campaign" };

const resolve = (order, state) =>
  resolveOrderMessage({ order, state, itemsByOrder: ITEMS, storeTemplates: STORE, landingTemplate: LANDING, slugs: SLUGS, siteUrl: SITE });

console.log("routing:");
ok("1. Store NEW → Store template",        resolve(storeOrder, "NEW").startsWith("STORE-NEW"));
ok("2. Landing NEW → Landing template",    resolve(landingOrder, "NEW").startsWith("LANDING "));
ok("3. Landing order NOT Store template",  !resolve(landingOrder, "NEW").includes("STORE-NEW"));
ok("4. Store order NOT Landing template",  !resolve(storeOrder, "NEW").startsWith("LANDING "));
ok("5. Old order (no source) → Store",     resolve(oldOrder, "NEW").startsWith("STORE-NEW"));
ok("6. Unknown source → Store fallback",   resolve(unknownOrder, "NEW").startsWith("STORE-NEW") && isLandingOrder(unknownOrder, SLUGS) === false);
ok("   isLandingOrder true for landing",   isLandingOrder(landingOrder, SLUGS) === true);

console.log("existing statuses unchanged (landing routing is NEW-only):");
ok("7. Confirmed uses Store even for landing order", resolve(landingOrder, "CONFIRMED") === renderTemplate(STORE.CONFIRMED, { name: "Sara" }));
ok("8. Shipped uses Store even for landing order",   resolve(landingOrder, "SHIPPED") === renderTemplate(STORE.SHIPPED, { orderId: "o1" }));
ok("9. Delivered uses Store even for landing order", resolve(landingOrder, "DELIVERED") === renderTemplate(STORE.DELIVERED, { name: "Sara" }));

console.log("variable resolution:");
ok("10. name/phone/product/price/quantity/orderId replaced",
   renderTemplate("{name}|{phone}|{product}|{price}|{quantity}|{orderId}", { name: "A", phone: "P", product: "W", price: "9", quantity: "2", orderId: "X" }) === "A|P|W|9|2|X");
{
  const v = buildOrderVars(landingOrder, ITEMS, SITE);
  ok("11. landing vars resolve (city/address/landingPage/product/quantity/price/phone)",
     v.city === "Rabat" && v.address === "Av 2" && v.landingPage === "my-offer" && v.landingPageSlug === "my-offer" &&
     v.product === "Widget" && v.quantity === "3" && v.price === "299 MAD" && v.phone === "0655667788" && v.orderId === "o1");
  ok("    products join preserved (Store-compatible)", v.products === "Widget x2, Gadget x1");
}
{
  // Missing optional values → empty string, no crash, never "[object Object]".
  const bare = { id: "o2", customerName: "NoCity" }; // no phone/address/items/total
  const msg = resolveOrderMessage({ order: bare, state: "NEW", itemsByOrder: {}, storeTemplates: STORE, landingTemplate: LANDING, slugs: SLUGS, siteUrl: SITE });
  ok("12. missing optionals don't break + no [object Object]", typeof msg === "string" && !msg.includes("[object Object]"));
  ok("    object value coerces to empty (never [object Object])", renderTemplate("{name}", { name: { a: 1 } }) === "");
}

console.log("saved values preserved / not overwritten:");
ok("13. saved Store template value is used (not clobbered)",
   resolve(storeOrder, "NEW") === renderTemplate(STORE.NEW, buildOrderVars(storeOrder, ITEMS, SITE)));
ok("14. saved Landing template is used, NOT the default",
   pickTemplate({ state: "NEW", order: landingOrder, storeTemplates: STORE, landingTemplate: LANDING, slugs: SLUGS }) === LANDING &&
   LANDING !== DEFAULT_LANDING_NEW_ORDER_TEMPLATE);
ok("15. default landing template exists with expected variables",
   typeof DEFAULT_LANDING_NEW_ORDER_TEMPLATE === "string" &&
   ["{name}", "{product}", "{quantity}", "{price}", "{orderId}"].every((k) => DEFAULT_LANDING_NEW_ORDER_TEMPLATE.includes(k)));
ok("    empty saved landing template → NEW falls back to Store (never blank)",
   pickTemplate({ state: "NEW", order: landingOrder, storeTemplates: STORE, landingTemplate: "", slugs: SLUGS }) === STORE.NEW);

console.log("Store defaults untouched:");
ok("Store DEFAULT NEW still the original", DEFAULT_TEMPLATES.NEW.includes("Wsalna talab dyalk"));

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
