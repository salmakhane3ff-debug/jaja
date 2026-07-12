/** Canonical UI Control defaults — shared between API route and Context. */
export const UI_DEFAULTS = {
  showSpecialOffer:      true,
  specialOfferSlug:      "",
  showWishlistButton:    true,
  showShareButton:       true,
  showAddToCartButton:   true,
  showBuyNowButton:      true,
  showStickyAddToCart:   true,
  stickyShowBuyNow:      true,
  stickyVariant:         "A",
  showCartIcon:          true,
  showWishlistIcon:      true,
  showFeedbackBarIcon:   true,
  primaryColor:          "#111827",
  secondaryColor:        "#ffffff",
  showRelatedProducts:   true,
  enableImageZoom:       true,
  enableVideo:           true,
  // ── Floating WhatsApp contact button ──────────────────────────────────────
  showFloatingWhatsapp:     false,
  floatingWhatsappNumber:   "",
  floatingWhatsappMessage:  "",
  floatingWhatsappPosition: "right",
  floatingWhatsappBottom:   24,
  // ── Landing Page Only Mode ────────────────────────────────────────────────
  landingOnlyMode:       false,   // when true, public storefront → configured landing page
  landingRedirectUrl:    "",      // "/landing/my-offer" or "https://…"
  landingAllowedPaths:   "",      // comma-separated extra public paths (e.g. "/checkout/success,/privacy")
};
