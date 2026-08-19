"use client";

import Script  from "next/script";
import { useState, useEffect } from "react";

/**
 * ScriptInjector — injects third-party tracking scripts into the page.
 *
 * Props:
 *   integrations — fetched server-side in layout.jsx via getIntegrationsSettings(),
 *                  which SANITISES the settings row first. Passing it as a prop
 *                  avoids a client-side fetch to the admin-only
 *                  /api/setting?type=integrations endpoint, which returned 401
 *                  for unauthenticated visitors and silently prevented GA/GTM
 *                  from loading on the public storefront.
 *
 *                  This object must never contain a secret: it is a client
 *                  component prop and therefore ends up in the RSC payload.
 *                  Meta is handled by <MetaPixel>, not here.
 */
export default function ScriptInjector({ integrations }) {
  // Guard: only render scripts after the client has mounted.
  // This prevents a hydration mismatch when users have old cached JS bundles
  // that expect this component to render null on first paint.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  if (!mounted || !integrations) return null;

  return (
    <>
      {/* Google Analytics */}
      {integrations.googleAnalytics?.enabled &&
        integrations.googleAnalytics?.trackingIds?.map((ga, index) => ga.id && <Script key={`ga-${index}`} strategy="afterInteractive" src={`https://www.googletagmanager.com/gtag/js?id=${ga.id}`} />)}
      {integrations.googleAnalytics?.enabled &&
        integrations.googleAnalytics?.trackingIds?.map(
          (ga, index) =>
            ga.id && (
              <Script key={`ga-config-${index}`} id={`ga-config-${index}`} strategy="afterInteractive">
                {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${ga.id}');
            `}
              </Script>
            )
        )}

      {/* Meta Pixel is NOT injected here. It lives in <MetaPixel>, which needs
          its own route-change lifecycle for SPA PageView and receives only
          { enabled, pixelIds } — a shape that cannot carry the CAPI token. */}

      {/* Google Tag Manager */}
      {integrations.googleTagManager?.enabled &&
        integrations.googleTagManager?.containerIds?.map(
          (gtm, index) =>
            gtm.id && (
              <Script key={`gtm-${index}`} id={`gtm-${index}`} strategy="afterInteractive">
                {`
              (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
              new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
              j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
              'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
              })(window,document,'script','dataLayer','${gtm.id}');
            `}
              </Script>
            )
        )}

      {/* Google Ads */}
      {integrations.googleAds?.enabled &&
        integrations.googleAds?.conversionIds?.map((ad, index) => ad.id && <Script key={`gads-${index}`} strategy="afterInteractive" src={`https://www.googletagmanager.com/gtag/js?id=${ad.id}`} />)}
      {integrations.googleAds?.enabled &&
        integrations.googleAds?.conversionIds?.map(
          (ad, index) =>
            ad.id && (
              <Script key={`gads-config-${index}`} id={`gads-config-${index}`} strategy="afterInteractive">
                {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${ad.id}');
            `}
              </Script>
            )
        )}

      {/* Custom Code */}
      {integrations.customCode?.enabled &&
        integrations.customCode?.scripts?.map(
          (script, index) =>
            script.code && (
              <Script key={`custom-${index}`} id={`custom-script-${index}`} strategy="afterInteractive">
                {script.code}
              </Script>
            )
        )}
    </>
  );
}
