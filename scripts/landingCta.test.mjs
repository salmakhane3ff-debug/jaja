#!/usr/bin/env node
/**
 * scripts/landingCta.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Landing Page CTA Button block — decision logic. Proves that MULTIPLE CTA
 * blocks on the SAME page (empty Custom URL) all resolve to the same "scroll to
 * form" action and are all independently clickable (never disabled by the shared
 * `buying` flag) — the bug where only one instance worked.
 * Run: node scripts/landingCta.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { resolveCtaAction, isCtaDisabled } from '../src/lib/landingCta.js';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS ', n); } else { fail++; console.log('  FAIL ', n); } };

console.log('1) Action resolution (empty URL + order form → scroll):');
{
  ok('empty URL + order form → scroll', resolveCtaAction({ hasOrderForm: true, buttonUrl: '' }) === 'scroll');
  ok('placeholder-only (whitespace) treated as empty → scroll', resolveCtaAction({ hasOrderForm: true, buttonUrl: '   ' }) === 'scroll');
  ok('Custom URL ALWAYS wins, even if an order form exists → redirect', resolveCtaAction({ hasOrderForm: true, buttonUrl: 'https://x.com' }) === 'redirect');
  ok('URL, no form → redirect', resolveCtaAction({ hasOrderForm: false, buttonUrl: '/x' }) === 'redirect');
  ok('no form, no URL → buyNow', resolveCtaAction({ hasOrderForm: false, buttonUrl: '' }) === 'buyNow');
}

console.log('2) Two CTA blocks on the SAME page behave IDENTICALLY & independently:');
{
  // A landing page with an order form + TWO CTA blocks (middle + bottom), both
  // with an empty Custom URL. They must resolve the same and both be enabled.
  const page = { hasOrderForm: true };
  const middle = { buttonUrl: '' };   // "/checkout/address" is only placeholder text → empty
  const bottom = { buttonUrl: '' };

  ok('middle CTA → scroll', resolveCtaAction({ ...page, ...middle }) === 'scroll');
  ok('bottom CTA → scroll', resolveCtaAction({ ...page, ...bottom }) === 'scroll');
  ok('both resolve to the SAME action', resolveCtaAction({ ...page, ...middle }) === resolveCtaAction({ ...page, ...bottom }));

  // Neither is disabled — not even after a Buy Now flow flipped the shared flag,
  // and even when the landing page has no linked product.
  ok('middle NOT disabled (form present)', isCtaDisabled({ ...middle, ...page, buying: false, product: null }) === false);
  ok('bottom NOT disabled (form present)', isCtaDisabled({ ...bottom, ...page, buying: false, product: null }) === false);
  ok('middle NOT disabled even while buying=true', isCtaDisabled({ ...middle, ...page, buying: true, product: null }) === false);
  ok('bottom NOT disabled even while buying=true', isCtaDisabled({ ...bottom, ...page, buying: true, product: null }) === false);
  ok('clicking one never changes the other\'s enabled state', isCtaDisabled({ ...middle, ...page, buying: true, product: null }) === isCtaDisabled({ ...bottom, ...page, buying: true, product: null }));
}

console.log('3) Disable rule only applies to the real checkout (buyNow) path:');
{
  ok('buyNow + buying → disabled', isCtaDisabled({ buttonUrl: '', hasOrderForm: false, buying: true, product: { id: 'p' } }) === true);
  ok('buyNow + no product → disabled', isCtaDisabled({ buttonUrl: '', hasOrderForm: false, buying: false, product: null }) === true);
  ok('buyNow ready → enabled', isCtaDisabled({ buttonUrl: '', hasOrderForm: false, buying: false, product: { id: 'p' } }) === false);
  ok('redirect path never disabled', isCtaDisabled({ buttonUrl: '/x', hasOrderForm: false, buying: true, product: null }) === false);
  ok('scroll path never disabled', isCtaDisabled({ buttonUrl: '', hasOrderForm: true, buying: true, product: null }) === false);
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
