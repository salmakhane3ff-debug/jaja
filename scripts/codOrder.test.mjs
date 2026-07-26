#!/usr/bin/env node
/**
 * scripts/codOrder.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Inline COD order payload builder — shared by the landing form and the new
 * product-page inline form. Proves both modes post the SAME shape to /api/order
 * (identical orders), plus price/quantity/variant handling and validation.
 * Run: node scripts/codOrder.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { resolveCodPrice, validateCodForm, buildCodOrderPayload } from '../src/lib/codOrder.js';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS ', n); } else { fail++; console.log('  FAIL ', n); } };

const product = { _id: 'p1', title: 'Montre', images: ['/u/a.jpg', { url: '/u/b.jpg' }], salePrice: 199, regularPrice: 299 };
const form = { name: ' Sara ', phone: ' 0612345678 ', city: ' Rabat ', address: ' Rue 1 ' };

console.log('1) resolveCodPrice:');
{
  ok('sale price preferred', resolveCodPrice(product) === 199);
  ok('falls back to regular', resolveCodPrice({ regularPrice: 149 }) === 149);
  ok('override wins', resolveCodPrice(product, 120) === 120);
  ok('missing → 0', resolveCodPrice({}) === 0);
}

console.log('2) validateCodForm:');
{
  ok('valid when name + phone present', validateCodForm({ name: 'A', phone: '06' }).valid === true);
  ok('name required', validateCodForm({ phone: '06' }).errors.includes('name'));
  ok('phone required', validateCodForm({ name: 'A' }).errors.includes('phone'));
  ok('whitespace is not enough', validateCodForm({ name: '  ', phone: '  ' }).valid === false);
}

console.log('3) Landing payload (defaults) matches the working checkout shape:');
{
  const p = buildCodOrderPayload({ product, form, sessionId: 's1', landingPage: { slug: 'promo' }, bemobClickId: 'bm1', affiliateId: 'aff1', images: ['/u/a.jpg'] });
  ok('orderSource landing (default)', p.orderSource === 'landing');
  ok('quantity 1 (default)', p.products.items[0].quantity === 1);
  ok('unit price from sale', p.products.items[0].price === 199);
  ok('total = price × 1', p.paymentDetails.total === 199);
  ok('COD payment method', p.paymentDetails.paymentMethod === 'COD' && p.paymentDetails.status === 'pending');
  ok('nested shipping with city/address', p.shipping.address.city === 'Rabat' && p.shipping.address.address1 === 'Rue 1');
  ok('trimmed name/phone', p.name === 'Sara' && p.phone === '0612345678');
  ok('utm_source from landing slug', p.utm_source === 'promo');
  ok('no variants key on landing item', !('variants' in p.products.items[0]));
  ok('bemobClickId carried', p.bemobClickId === 'bm1');
}

console.log('4) Product payload (quantity + variant + product source):');
{
  const variants = [{ name: 'Couleur', value: 'Noir' }];
  const p = buildCodOrderPayload({ product, form, quantity: 3, variant: variants, price: 180, orderSource: 'product', sessionId: 's2', images: ['/u/a.jpg'] });
  ok('orderSource product', p.orderSource === 'product');
  ok('quantity respected', p.products.items[0].quantity === 3);
  ok('price override used', p.products.items[0].price === 180);
  ok('total = 180 × 3', p.paymentDetails.total === 540);
  ok('variants attached', JSON.stringify(p.products.items[0].variants) === JSON.stringify(variants));
  ok('no landing slug → utm null', p.utm_source === null);
  ok('quantity floored to >= 1', buildCodOrderPayload({ product, form, quantity: 0, sessionId: 'x' }).products.items[0].quantity === 1);
}

console.log('5) Both modes create IDENTICAL orders (only orderSource/sessionId differ):');
{
  const common = { product, form, quantity: 1, variant: null, images: ['/u/a.jpg'], bemobClickId: 'bm', affiliateId: 'aff' };
  const landing = buildCodOrderPayload({ ...common, orderSource: 'landing', sessionId: 'A' });
  const productP = buildCodOrderPayload({ ...common, orderSource: 'product', sessionId: 'B' });

  // Strip the two intentionally-different keys, then require deep equality.
  const strip = (o) => { const { orderSource, sessionId, ...rest } = o; return rest; };
  ok('same endpoint target (/api/order) — same body shape', JSON.stringify(strip(landing)) === JSON.stringify(strip(productP)));
  ok('same COD paymentDetails', JSON.stringify(landing.paymentDetails) === JSON.stringify(productP.paymentDetails));
  ok('same product item', JSON.stringify(landing.products.items[0]) === JSON.stringify(productP.products.items[0]));
  ok('only orderSource differs', landing.orderSource === 'landing' && productP.orderSource === 'product');
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
