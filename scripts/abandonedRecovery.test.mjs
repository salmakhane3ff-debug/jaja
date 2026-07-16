#!/usr/bin/env node
/**
 * scripts/abandonedRecovery.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit tests for the Abandoned-Cart recovery link in {checkoutLink}.
 * Imports the REAL shared helper + the bot's exported pure helpers (no DB,
 * no WhatsApp). Verifies the bot's {checkoutLink} equals the exact per-cart
 * "Lien" URL and reuses the same draft-order shape as the admin "Générer".
 *
 * Run:  node scripts/abandonedRecovery.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { recoveryLink, buildDraftOrderFields } from "../src/lib/abandonedRecovery.js";
import bot from "../scripts/whatsapp-order-bot.js";
const { buildAbandonedMessage, DEFAULT_ABANDONED_TEMPLATE } = bot;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log("  PASS ", n); } else { fail++; console.log("  FAIL ", n); } };

const ORIGIN = "https://shop.test";
const cart = {
  id: "cart-1", phone: "0612345678", fullName: "Ali", email: "ali@example.com",
  city: "Casa", items: [{ title: "Widget", quantity: 2 }, { title: "Gadget", quantity: 1 }],
  cartTotal: 199, orderId: null,
};

console.log("recoveryLink (exact 'Lien' shape):");
ok("1. builds /checkout/success?orderId=<id>",
   recoveryLink(ORIGIN, "ord-9") === "https://shop.test/checkout/success?orderId=ord-9");
ok("2. matches admin OrderLink shape exactly",
   recoveryLink(ORIGIN, "ord-9") === `${ORIGIN}/checkout/success?orderId=ord-9`);
ok("3. strips trailing slash on origin (no //)",
   recoveryLink("https://shop.test/", "ord-9") === "https://shop.test/checkout/success?orderId=ord-9");
ok("4. no orderId → null (never a generic fallback link)",
   recoveryLink(ORIGIN, null) === null && recoveryLink(ORIGIN, "") === null);

console.log("buildDraftOrderFields (same shape as admin 'Générer'):");
{
  const f = buildDraftOrderFields(cart);
  ok("5. draft is hidden + bank_transfer + totals + items",
     f.paymentDetails.isDraft === true && f.paymentDetails.paymentMethod === "bank_transfer" &&
     f.paymentDetails.total === 199 && f.paymentDetails.cartTotal === 199 &&
     Array.isArray(f.paymentDetails.draftItems) && f.paymentDetails.draftItems.length === 2);
  ok("6. customer + shipping + status + sessionId prefix",
     f.customerName === "Ali" && f.customerPhone === "0612345678" && f.customerEmail === "ali@example.com" &&
     f.shippingAddress.city === "Casa" && f.status === "pending" && f.paymentStatus === "pending" &&
     f.sessionId.startsWith("draft_0612345678_"));
  const bare = buildDraftOrderFields({ phone: "0700000000", items: null, cartTotal: undefined });
  ok("7. no name/email/items → name falls back to phone, email null, totals 0, items []",
     bare.customerName === "0700000000" && bare.customerEmail === null &&
     bare.paymentDetails.total === 0 && bare.paymentDetails.cartTotal === 0 &&
     Array.isArray(bare.paymentDetails.draftItems) && bare.paymentDetails.draftItems.length === 0);
}

console.log("buildAbandonedMessage ({checkoutLink} = exact recovery link):");
{
  const link = recoveryLink(ORIGIN, "ord-42");
  const msg = buildAbandonedMessage(cart, link);
  ok("8. {checkoutLink} renders the exact 'Lien' URL",
     msg.includes(`🔗 Lien: ${link}`) && msg.includes("ord-42"));
  ok("9. never emits the old generic /cart link + {name}{products}{total}{shipping} intact",
     !msg.includes("/cart\n") && !msg.endsWith("/cart") &&
     msg.includes("Ali") && msg.includes("Widget x2, Gadget x1") && msg.includes("199 MAD") && msg.includes("Casa"));
  // Empty link (should never happen — caller skips — but must not crash / leak [object Object]).
  const emptyMsg = buildAbandonedMessage(cart, "");
  ok("10. empty link → blank {checkoutLink}, no crash, never [object Object]",
     typeof emptyMsg === "string" && !emptyMsg.includes("[object Object]") && emptyMsg.includes("🔗 Lien: \n"));
}

console.log("template sanity:");
ok("abandoned template exposes {checkoutLink}", DEFAULT_ABANDONED_TEMPLATE.includes("{checkoutLink}"));

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
