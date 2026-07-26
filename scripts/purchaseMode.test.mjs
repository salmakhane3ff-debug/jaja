#!/usr/bin/env node
/**
 * scripts/purchaseMode.test.mjs
 * Product page Add-to-Cart / Buy-Now gating by purchase mode.
 * Run: node scripts/purchaseMode.test.mjs
 */
import { isInlineCod, showAddToCart, showBuyNow, PURCHASE_MODE } from '../src/lib/purchaseMode.js';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS ', n); } else { fail++; console.log('  FAIL ', n); } };

console.log('Product purchase-mode gating:');
ok('checkout is NOT inline COD', isInlineCod(PURCHASE_MODE.CHECKOUT) === false);
ok('inline_cod is inline COD', isInlineCod(PURCHASE_MODE.INLINE_COD) === true);
ok('undefined (legacy) defaults to checkout behaviour', isInlineCod(undefined) === false);
ok('checkout shows Add to Cart', showAddToCart('checkout') === true);
ok('inline_cod HIDES Add to Cart', showAddToCart('inline_cod') === false);
ok('undefined shows Add to Cart (backward compat)', showAddToCart(undefined) === true);
ok('Buy Now always shown', showBuyNow() === true);

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
