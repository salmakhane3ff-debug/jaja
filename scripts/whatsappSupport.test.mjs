#!/usr/bin/env node
/**
 * scripts/whatsappSupport.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Affiliate WhatsApp support link building — message templating, wa.me URL,
 * enable/disable gating. Pure — no DOM/network.
 * Run: node scripts/whatsappSupport.test.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  DEFAULT_SUPPORT_MESSAGE, normalizeSupportSettings, buildSupportMessage,
  buildWhatsappUrl, resolveSupportLink,
} from '../src/lib/whatsappSupport.js';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS ', n); } else { fail++; console.log('  FAIL ', n); } };

console.log('1) normalizeSupportSettings defaults:');
{
  const d = normalizeSupportSettings({});
  ok('disabled by default', d.enabled === false);
  ok('empty number by default', d.whatsappNumber === '');
  ok('falls back to default message', d.defaultMessage === DEFAULT_SUPPORT_MESSAGE);
  ok('enabled coerced strictly (truthy string not enough)', normalizeSupportSettings({ enabled: 'yes' }).enabled === false);
  ok('enabled true respected', normalizeSupportSettings({ enabled: true }).enabled === true);
  ok('number trimmed', normalizeSupportSettings({ whatsappNumber: '  212600  ' }).whatsappNumber === '212600');
}

console.log('2) buildSupportMessage fills username + affiliateId:');
{
  const msg = buildSupportMessage(DEFAULT_SUPPORT_MESSAGE, { username: 'sara', affiliateId: 'aff-123' });
  ok('username injected', msg.includes('@sara'));
  ok('affiliateId injected', msg.includes('aff-123'));
  ok('no leftover placeholders', !msg.includes('{{'));
  ok('custom template honoured', buildSupportMessage('Hi {{username}} / {{affiliateId}}', { username: 'u', affiliateId: 'i' }) === 'Hi u / i');
  ok('missing values → empty', !buildSupportMessage('{{username}}{{affiliateId}}', {}).includes('{{'));
}

console.log('3) buildWhatsappUrl:');
{
  const url = buildWhatsappUrl('+212 600-11-22-33', 'Bonjour 👋');
  ok('digits only in path', url.startsWith('https://wa.me/212600112233?text='));
  ok('message url-encoded', url.includes(encodeURIComponent('Bonjour 👋')));
  ok('no number → null', buildWhatsappUrl('', 'x') === null);
  ok('non-digits only → null', buildWhatsappUrl('abc', 'x') === null);
}

console.log('4) resolveSupportLink gating (enable/disable):');
{
  const base = { enabled: true, whatsappNumber: '212600000000', defaultMessage: 'Salut {{username}}' };
  const link = resolveSupportLink(base, { username: 'sara', affiliateId: 'a1' });
  ok('enabled + number → link', typeof link === 'string' && link.includes('wa.me/212600000000'));
  ok('message carries the username', link.includes(encodeURIComponent('Salut sara')));
  ok('disabled → null (button hidden)', resolveSupportLink({ ...base, enabled: false }, {}) === null);
  ok('enabled but no number → null', resolveSupportLink({ enabled: true, whatsappNumber: '' }, {}) === null);
  ok('null settings → null', resolveSupportLink(null, {}) === null);
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
