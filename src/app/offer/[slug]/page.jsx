/**
 * src/app/offer/[slug]/page.jsx  — SERVER COMPONENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Fetches landing-page data at request time (server-side) so the page HTML
 * already contains the full content — zero client-side loading skeleton.
 *
 * Architecture:
 *   page.jsx (Server Component)
 *     ↳ fetches LandingPage + Product via service layer (no HTTP round-trip)
 *     ↳ passes initial data as props to OfferClient (Client Component)
 *
 * OfferClient receives initialLandingPage + initialProduct:
 *   → initialises state directly (loading = false)
 *   → skips the client-side fetch effect
 *   → renders content on first paint — no flicker, no skeleton
 * ─────────────────────────────────────────────────────────────────────────────
 */

// PERF: prose.css scoped to this route only — not loaded elsewhere.
import "@/app/prose.css";

import { Suspense }              from "react";
import OfferClient               from "./OfferClient";
import { getLandingPageBySlug }  from "@/lib/services/landingPageService";
import prisma                    from "@/lib/prisma";

// ── Server-side data fetch ────────────────────────────────────────────────────

async function getInitialData(slug) {
  // 1. Try landing page (also increments view counter atomically)
  try {
    const lp = await getLandingPageBySlug(slug);
    if (lp) {
      return {
        landingPage: lp,
        product:     lp.product || null,
      };
    }
  } catch (err) {
    console.error("[offer/page] landing-page fetch failed:", err?.message ?? err);
  }

  // 2. Fallback: product by slug
  try {
    const row = await prisma.product.findFirst({ where: { slug } });
    if (row) {
      // Map to the same shape the client expects (_id alias)
      return { landingPage: null, product: { ...row, _id: row.id } };
    }
  } catch (err) {
    console.error("[offer/page] product fallback failed:", err?.message ?? err);
  }

  return { landingPage: null, product: null };
}

// ── Page component ────────────────────────────────────────────────────────────

export default async function OfferPage({ params }) {
  const slug = (await params).slug;
  const { landingPage, product } = await getInitialData(slug);

  return (
    /*
      OfferClient uses useSearchParams → must be inside Suspense.
      fallback={null}: data already available from server so no skeleton needed.
      If server fetch failed (rare), client falls back to its own fetch and
      renders null until data arrives (no skeleton by design).
    */
    <Suspense fallback={null}>
      <OfferClient
        initialLandingPage={landingPage}
        initialProduct={product}
      />
    </Suspense>
  );
}
