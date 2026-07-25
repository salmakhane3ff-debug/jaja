/**
 * src/lib/whatsappSupport.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure helpers for the affiliate WhatsApp support button. No DOM/network — the
 * message templating + wa.me URL building are deterministic and unit-testable.
 * The support number/message/enabled flag come from platform settings (type
 * `affiliate-support`), never hardcoded.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const DEFAULT_SUPPORT_MESSAGE =
  'Bonjour 👋\n\n' +
  'Je suis affilié sur la plateforme.\n\n' +
  'Nom d’utilisateur : @{{username}}\n' +
  'ID affilié : {{affiliateId}}\n\n' +
  'J’ai besoin d’aide concernant : ';

/** Normalize the stored settings blob into a safe, defaulted shape. */
export function normalizeSupportSettings(raw = {}) {
  const s = raw && typeof raw === 'object' ? raw : {};
  return {
    enabled:        s.enabled === true,
    whatsappNumber: String(s.whatsappNumber || '').trim(),
    defaultMessage: (typeof s.defaultMessage === 'string' && s.defaultMessage.trim())
      ? s.defaultMessage
      : DEFAULT_SUPPORT_MESSAGE,
  };
}

/** Fill {{username}} / {{affiliateId}} placeholders in the template. */
export function buildSupportMessage(template, { username, affiliateId } = {}) {
  const tpl = typeof template === 'string' && template.trim() ? template : DEFAULT_SUPPORT_MESSAGE;
  return tpl
    .replace(/\{\{\s*username\s*\}\}/g, String(username ?? ''))
    .replace(/\{\{\s*affiliateId\s*\}\}/g, String(affiliateId ?? ''));
}

/** Build a wa.me URL. Number is reduced to digits (wa.me requires digits only). */
export function buildWhatsappUrl(whatsappNumber, message) {
  const digits = String(whatsappNumber || '').replace(/\D/g, '');
  if (!digits) return null;
  const text = encodeURIComponent(String(message || ''));
  return `https://wa.me/${digits}?text=${text}`;
}

/**
 * One-shot: from settings + affiliate identity → the ready-to-open link, or null
 * when support is disabled / no number is configured (so the UI can hide it).
 */
export function resolveSupportLink(rawSettings, { username, affiliateId } = {}) {
  const s = normalizeSupportSettings(rawSettings);
  if (!s.enabled || !s.whatsappNumber) return null;
  const message = buildSupportMessage(s.defaultMessage, { username, affiliateId });
  return buildWhatsappUrl(s.whatsappNumber, message);
}
