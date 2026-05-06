import { Rubik } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
// PERF: SunEditor CSS removed from global layout.
//       It is now imported only inside admin pages that use the editor
//       (admin/blog/new, admin/pages/new, admin/product/new).
//       This removes ~300 KB from every public page load.
import MainFooterWrapper from "@/components/template/FooterClientWrapper";
import MainHeaderWrapper from "@/components/template/MainHeaderWrapper";
import ScriptInjector from "@/components/ScriptInjector";
import UtmTracker from "@/components/UtmTracker";
import AffiliateRefCapture from "@/components/AffiliateRefCapture";
import TrackingCapture from "@/components/tracking/TrackingCapture";
import SpinWheelProvider from "@/components/SpinWheel/SpinWheelProvider";
import GiftSystemInit from "@/components/GiftSystem/GiftSystemInit";
import PreloaderWrapper from "@/components/PreloaderWrapper";
import { getStoreSettings } from "@/lib/getStoreSettings";
import { getPreloaderSettings } from "@/lib/getPreloaderSettings";
import { getIntegrationsSettings } from "@/lib/getIntegrationsSettings";
import { Suspense } from "react";

// Rubik supports both Latin and Arabic scripts — load both subsets.
// PERF: Added display:"swap" → text renders in fallback font immediately,
//       preventing invisible-text flash (FOIT) which contributes to FCP delay.
// PERF: Removed weight "500" (font-medium) — not used in core UI paths;
//       eliminates one extra font file download.
const rubik = Rubik({
  variable: "--font-rubik",
  subsets: ["latin", "arabic"],
  weight: ["400", "600", "700"],
  display: "swap",
});

// Force dynamic rendering so favicon/title always reflect latest DB settings
export const dynamic = "force-dynamic";

// Generate metadata dynamically from store settings
export async function generateMetadata() {
  const settings = await getStoreSettings();

  const title       = settings?.storeName        || "Shop Gold - Online Shopping Experience";
  const description = settings?.websiteDescription || "Shop Gold is a modern online shopping experience built with Next.js";
  const image       = settings?.ogImage || settings?.logoImage || null;

  return {
    title,
    description,
    icons: {
      icon: settings?.faviconImage || "/favicon.ico",
    },
    openGraph: {
      title,
      description,
      url:      "https://proprogiftvip.com",
      siteName: title,
      ...(image ? { images: [{ url: image, alt: title }] } : {}),
      locale:   "fr_MA",
      type:     "website",
    },
  };
}

export default async function RootLayout({ children }) {
  const preloaderConfig  = await getPreloaderSettings();
  const integrations     = await getIntegrationsSettings();
  return (
    // suppressHydrationWarning: LanguageProvider updates lang/dir client-side.
    // Default to Arabic (RTL) — matches the default language setting.
    <html
      lang="ar"
      dir="rtl"
      translate="no"
      className={rubik.variable}
      suppressHydrationWarning
    >
      {/* This tiny inline script runs in <head> — BEFORE the browser renders
           any content. This is intentionally render-blocking because it must
           set <html dir> before the first paint to prevent RTL flash on admin
           pages and LTR flash on Arabic storefront pages.
           ~200 bytes of JS: negligible parse/exec cost, huge UX benefit. */}
      <head>
        {/* Block Chrome/Google Translate popup — site has its own AR/FR switcher */}
        <meta name="google" content="notranslate" />
        {/* Facebook Domain Verification — loaded dynamically from DB */}
        {integrations?.metaPixel?.domainVerificationCode && (
          <meta name="facebook-domain-verification" content={integrations.metaPixel.domainVerificationCode} />
        )}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var l=localStorage.getItem('store_lang');var h=document.documentElement;if(l==='fr'||l==='ar'){h.setAttribute('data-lang',l);h.setAttribute('lang',l);var a=window.location.pathname.startsWith('/admin');h.setAttribute('dir',(!a&&l==='ar')?'rtl':'ltr');}else{var a=window.location.pathname.startsWith('/admin');if(a)h.setAttribute('dir','ltr');}}catch(e){}}())`,
          }}
        />
      </head>
      <body className="antialiased">
        <Providers>
          {/*
            PreloaderWrapper wraps ALL visible content so it can:
            1. Keep content hidden (opacity-0) while the preloader is shown
            2. Crossfade both simultaneously once the page is ready
            Non-visual providers (trackers, scripts) stay outside so they
            are never blocked by the opacity wrapper.
          */}
          <AffiliateRefCapture />
          <UtmTracker />
          <Suspense fallback={null}>
            <TrackingCapture />
          </Suspense>
          <ScriptInjector integrations={integrations} />
          <Suspense fallback={null}>
            <PreloaderWrapper config={preloaderConfig}>
              <MainHeaderWrapper />
              {children}
              <MainFooterWrapper />
            </PreloaderWrapper>
          </Suspense>
          <SpinWheelProvider />
          <GiftSystemInit />
        </Providers>
      </body>
    </html>
  );
}
