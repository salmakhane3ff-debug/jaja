/**
 * src/app/affiliate/layout.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The Affiliate Dashboard is an internal MANAGEMENT interface — it must ALWAYS
 * render in French and LTR, independent of the public website language. RTL /
 * Arabic here breaks alignment, spacing and layout.
 *
 * This layout wraps every route under /affiliate (dashboard, login, and any
 * future page) in a `dir="ltr" lang="fr"` scope, so the whole subtree is forced
 * LTR regardless of the global <html dir>. The <html> element itself is also
 * pinned to LTR for /affiliate routes (pre-paint script in app/layout.jsx +
 * LanguageContext), so there is no RTL flash. No functionality is changed.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export default function AffiliateLayout({ children }) {
  return (
    <div dir="ltr" lang="fr">
      {children}
    </div>
  );
}
