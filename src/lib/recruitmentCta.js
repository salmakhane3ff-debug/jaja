/**
 * src/lib/recruitmentCta.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure helpers for the /tsajlim3ana affiliate-recruitment landing page.
 * Reuses the existing support-WhatsApp configuration (settings type
 * `affiliate-support`) — the recruitment CTAs never hardcode a number. No
 * React/DOM → unit-testable.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { normalizeSupportSettings, buildWhatsappUrl } from './whatsappSupport.js';

// Fixed Darija message opened when a visitor taps a "join us" CTA.
export const RECRUITMENT_WA_MESSAGE =
  'السلام عليكم، دخلت من صفحة التسجيل معاكم وبغيت نعرف كيفاش نبدا كأفلييت.';

/**
 * Build the recruitment WhatsApp link from the platform support settings.
 * Returns null when support is disabled or no number is configured, so the UI
 * can disable the CTA gracefully.
 */
export function buildRecruitmentWhatsappLink(supportSettings) {
  const s = normalizeSupportSettings(supportSettings);
  if (!s.enabled || !s.whatsappNumber) return null;
  return buildWhatsappUrl(s.whatsappNumber, RECRUITMENT_WA_MESSAGE);
}

/** Normalize the stored recruitment-landing config into a safe, defaulted shape. */
export function normalizeRecruitmentConfig(raw = {}) {
  const c = raw && typeof raw === 'object' ? raw : {};
  const videos = (Array.isArray(c.videos) ? c.videos : [])
    .filter((v) => v && typeof v === 'object' && v.url)
    .map((v, i) => ({
      id:        v.id || `v${i}`,
      url:       String(v.url),
      title:     String(v.title || ''),
      thumbnail: String(v.thumbnail || ''),
      order:     Number.isFinite(Number(v.order)) ? Number(v.order) : i,
      active:    v.active !== false,
    }));
  const testimonials = (Array.isArray(c.testimonials) ? c.testimonials : [])
    .filter((t) => t && typeof t === 'object' && (t.text || t.name))
    .map((t, i) => ({
      id:     t.id || `t${i}`,
      name:   String(t.name || ''),
      text:   String(t.text || ''),
      rating: Math.min(5, Math.max(1, Number(t.rating) || 5)),
      active: t.active !== false,
    }));
  return { enabled: c.enabled === true, videos, testimonials };
}

/** Active videos, sorted by order — what the public page renders. */
export function publicVideos(config) {
  return normalizeRecruitmentConfig(config).videos
    .filter((v) => v.active)
    .sort((a, b) => a.order - b.order);
}

/** Active testimonials only — never fabricated; empty ⇒ section hidden. */
export function publicTestimonials(config) {
  return normalizeRecruitmentConfig(config).testimonials.filter((t) => t.active);
}
