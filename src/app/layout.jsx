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
import { getStoreSettings } from "@/lib/getStoreSettings";
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

// Generate metadata dynamically from store settings
export async function generateMetadata() {
  const settings = await getStoreSettings();

  return {
    title: settings?.storeName || "Shop Gold - Online Shopping Experience",
    description:
      settings?.websiteDescription ||
      "Shop Gold is a modern online shopping experience built with Next.js",
    icons: {
      icon: settings?.faviconImage || "/favicon.ico",
    },
  };
}

export default function RootLayout({ children }) {
  return (
    // suppressHydrationWarning: LanguageProvider updates lang/dir client-side.
    // Default to Arabic (RTL) — matches the default language setting.
    <html
      lang="ar"
      dir="rtl"
      className={rubik.variable}
      suppressHydrationWarning
    >
      {/* PERF: <head> is now empty of blocking scripts.
           The language-detection script has been moved to the bottom of <body>
           so it no longer blocks HTML parsing and First Contentful Paint. */}
      <head />
      <body className="antialiased">
        <Providers>
          <AffiliateRefCapture />
          <UtmTracker />
          <Suspense fallback={null}>
            <TrackingCapture />
          </Suspense>
          <ScriptInjector />
          <MainHeaderWrapper />
          {children}
          <MainFooterWrapper />
          <SpinWheelProvider />
          <GiftSystemInit />
        </Providers>

        {/* PERF: Moved from <head> to bottom of <body>.
             Previously this ran synchronously before any HTML was parsed (render-blocking).
             At the bottom of <body> it still executes before DOMContentLoaded
             but no longer delays FCP. LanguageContext reads the data-lang attribute
             in its lazy useState initializer so the first client render still uses
             the correct language with zero layout shift. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
          (function(){
            try {
              var l = localStorage.getItem('store_lang');
              if (l === 'fr' || l === 'ar') {
                var h = document.documentElement;
                h.setAttribute('data-lang', l);
                h.setAttribute('lang', l);
                h.setAttribute('dir', l === 'ar' ? 'rtl' : 'ltr');
              }
            } catch(e) {}
          })();
        `,
          }}
        />
      </body>
    </html>
  );
}
