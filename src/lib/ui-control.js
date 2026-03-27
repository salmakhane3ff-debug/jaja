/**
 * UI Control — Static fallback / legacy reference.
 *
 * ⚠️  DEPRECATED for runtime use.
 * The live system now reads settings from the database via:
 *   useUIControl() hook  →  /hooks/useUIControl.js
 *   UIControlProvider    →  /context/UIControlContext.jsx
 *   Admin UI             →  /admin/ui-control
 *   API                  →  /api/ui-control
 *
 * This object is kept only for:
 *   1. SSR fallbacks that cannot use hooks
 *   2. Non-React contexts (middleware, etc.)
 *
 * Do NOT change values here to control the UI — use the admin panel.
 */
export const UIControl = {
  stickyAddToCart: true,   // legacy key — DB key is "showStickyAddToCart"
  stickyVariant:   "A",
  quickBuy:        true,
};
