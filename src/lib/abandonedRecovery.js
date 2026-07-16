/**
 * src/lib/abandonedRecovery.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Single source of truth for the Abandoned-Cart recovery link ("Lien" column in
 * Admin → Paniers Abandonnés) and the draft order that backs it.
 *
 * CommonJS on purpose: it is `require()`d by the standalone WhatsApp bot
 * (scripts/whatsapp-order-bot.js — raw `pg`, no Prisma) AND `import`ed by the
 * Next.js/Prisma route (src/app/api/abandoned-carts/route.js) via CJS interop.
 * Both callers persist the SAME logical draft-order shape with their own DB
 * client, so the admin "Générer" button and the bot never diverge.
 *
 * Pure functions only — no DB, no network, no side effects.
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

// The exact recovery URL shown in the admin "Lien" column and sent as
// {checkoutLink}. Derived from the cart's OWN draft orderId — never a generic
// homepage/cart/checkout link. Returns null when there is no orderId yet.
function recoveryLink(origin, orderId) {
  if (!orderId) return null;
  const base = String(origin || "").replace(/\/+$/, "");
  return `${base}/checkout/success?orderId=${orderId}`;
}

// The exact draft-order field shape used by the admin "Générer" endpoint (_PUT).
// Returned as a plain logical object; the caller persists it (Prisma or pg).
// Keeping this here means one place defines what a recovery draft order looks
// like — the bot cannot invent a second, divergent shape.
function buildDraftOrderFields(cart) {
  const safeItems = Array.isArray(cart && cart.items) ? cart.items : [];
  const total     = Number(cart && cart.cartTotal) || 0;
  const phone     = (cart && cart.phone) || "";
  return {
    customerName:    (cart && cart.fullName) || phone,
    customerPhone:   phone,
    customerEmail:   (cart && cart.email) || null,
    shippingAddress: { city: (cart && cart.city) || "" },
    status:          "pending",
    paymentStatus:   "pending",
    paymentDetails:  {
      isDraft:       true,              // ← hides from admin orders list
      paymentMethod: "bank_transfer",
      total,
      cartTotal:     total,
      draftItems:    safeItems,
    },
    // Timestamp + random suffix so two concurrent generations never collide on
    // the unique sessionId — the compare-and-set below is then the SOLE gate on
    // "one draft per cart", not an accidental unique-constraint failure.
    sessionId: `draft_${phone}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  };
}

// Thrown internally when a concurrent caller won the claim; never leaks out.
class RecoveryRaceLost extends Error {}

// Race-safe recovery-draft generation. Guarantees AT MOST ONE draft order per
// abandoned cart under concurrent callers, WITHOUT a schema change or an HTTP
// hop. DB-agnostic: the caller injects ops bound to its own layer (Prisma in the
// admin route, raw pg in the bot), but the ordering — create → conditional claim
// → roll back on loss → reuse the winner — is defined here, once.
//
//   run(work)          → run `work(tx)` atomically; if it throws, roll back every
//                        write it made (Prisma $transaction / pg BEGIN..COMMIT).
//   createDraft(tx)    → insert the draft order, return its new id.
//   claim(tx, orderId) → compare-and-set: set cart.orderId = orderId ONLY if it is
//                        still NULL; return true iff THIS caller set it.
//   readExisting()     → read the cart's current orderId (used after a lost race).
//
// Returns the winning orderId — ours if we claimed it, otherwise the concurrent
// winner's. The loser's draft is rolled back by `run`, so it never persists.
async function claimRecoveryDraft({ run, createDraft, claim, readExisting }) {
  try {
    return await run(async (tx) => {
      const orderId = await createDraft(tx);
      const won = await claim(tx, orderId);
      if (!won) throw new RecoveryRaceLost(); // roll back our draft — no orphan, no 2nd draft
      return orderId;
    });
  } catch (e) {
    if (!(e instanceof RecoveryRaceLost)) throw e;
    const existing = await readExisting();
    if (!existing) throw new Error("recovery draft race lost but cart has no orderId");
    return existing;
  }
}

module.exports = { recoveryLink, buildDraftOrderFields, claimRecoveryDraft };
