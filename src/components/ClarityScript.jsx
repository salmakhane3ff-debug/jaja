import Script from "next/script";

/**
 * Microsoft Clarity — loaded once, globally, in production only.
 *
 * Project ID is read from NEXT_PUBLIC_CLARITY_ID (inlined at build time).
 * Renders nothing outside production or when the ID is unset, so dev builds
 * and previews stay clean. Uses `afterInteractive` so it never blocks render
 * (no impact on LCP / page performance). Independent of the admin-configured
 * integrations, so it does not touch Meta Pixel / GA / any other tracker.
 */
export default function ClarityScript() {
  const projectId = process.env.NEXT_PUBLIC_CLARITY_ID;

  if (process.env.NODE_ENV !== "production" || !projectId) return null;

  return (
    <Script id="ms-clarity" strategy="afterInteractive">
      {`(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","${projectId}");`}
    </Script>
  );
}
