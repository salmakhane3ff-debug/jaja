/**
 * useProductScarcity
 * ─────────────────────────────────────────────────────────────────────────────
 * Returns stable, realistic "stock sold / total stock" scarcity data for a
 * product page.
 *
 * Priority:
 *   1. Admin-configured DB values  (conversionEnabled = true, sold > 0, total > 0)
 *   2. localStorage-cached randoms  (generated once per productId, persisted)
 *   3. In-memory fallback           (when localStorage is blocked / unavailable)
 *
 * Generation bias:
 *   We deliberately skew toward 50 – 85 % sold so the bar looks urgent without
 *   being suspiciously perfect.  Distribution buckets:
 *
 *    8%  → 15 – 44 %  (occasionally low, avoids "always high" suspicion)
 *   47%  → 50 – 79 %  (bulk of products — medium-high urgency)
 *   35%  → 80 – 92 %  (high urgency zone)
 *   10%  → 93 – 97 %  (nearly sold-out — rare but believable)
 *
 * @param {string}  productId   — Prisma UUID used as localStorage key
 * @param {boolean} dbEnabled   — product.conversionEnabled from DB
 * @param {number}  dbSold      — product.conversionSold from DB
 * @param {number}  dbTotal     — product.conversionStock from DB
 *
 * @returns {{ sold: number, total: number, pct: number, source: 'db'|'random' } | null}
 *   null while hydrating (SSR / first render before useEffect fires)
 */

import { useState, useEffect } from 'react';

const LS_PREFIX = 'pscarcity_';

// ── Biased percentage generator ───────────────────────────────────────────────
function biasedPct() {
  const r = Math.random();
  if (r < 0.08) return 15 + Math.floor(Math.random() * 30);  //  8 % →  15 – 44 %
  if (r < 0.55) return 50 + Math.floor(Math.random() * 30);  // 47 % →  50 – 79 %
  if (r < 0.90) return 80 + Math.floor(Math.random() * 13);  // 35 % →  80 – 92 %
  return             93 + Math.floor(Math.random() *  5);     // 10 % →  93 – 97 %
}

// ── Generate a full { sold, total } pair ─────────────────────────────────────
function generatePair() {
  const total = 20 + Math.floor(Math.random() * 41); // 20 – 60
  const pct   = biasedPct();
  // Clamp so sold is always 1 … total-1  (never 0 % or 100 %)
  const sold  = Math.max(1, Math.min(total - 1, Math.round((pct / 100) * total)));
  return { sold, total };
}

// ── Safe localStorage helpers ─────────────────────────────────────────────────
function lsGet(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
function lsSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* blocked */ }
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useProductScarcity(productId, dbEnabled = false, dbSold = 0, dbTotal = 0) {
  const [result, setResult] = useState(null); // null = SSR / hydrating

  useEffect(() => {
    if (!productId) return;

    // ── Priority 1: admin-set DB values ───────────────────────────────────────
    if (dbEnabled && Number(dbSold) > 0 && Number(dbTotal) > 0) {
      const sold  = Number(dbSold);
      const total = Number(dbTotal);
      const pct   = Math.min(100, Math.round((sold / total) * 100));
      setResult({ sold, total, pct, source: 'db' });
      return;
    }

    // ── Priority 2 / 3: localStorage-cached or fresh random ──────────────────
    const key    = `${LS_PREFIX}${productId}`;
    const cached = lsGet(key);

    if (cached && Number(cached.sold) > 0 && Number(cached.total) > 0) {
      // Re-use the previously generated pair (stable across page refreshes)
      const sold  = Number(cached.sold);
      const total = Number(cached.total);
      const pct   = Math.min(100, Math.round((sold / total) * 100));
      setResult({ sold, total, pct, source: 'random' });
    } else {
      // First visit for this product — generate & persist
      const pair = generatePair();
      lsSet(key, pair);
      const pct = Math.min(100, Math.round((pair.sold / pair.total) * 100));
      setResult({ ...pair, pct, source: 'random' });
    }
  }, [productId, dbEnabled, dbSold, dbTotal]);

  return result; // null while SSR — component renders nothing until hydrated
}
