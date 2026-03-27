"use client";
/**
 * Thin client wrapper so that dynamic({ ssr: false }) is legal here.
 * The server layout imports THIS file; ssr:false prevents MainFooterWrapper
 * from ever being rendered on the server → no hydration mismatch.
 */
import dynamic from "next/dynamic";

const MainFooterWrapper = dynamic(
  () => import("./MainFooterWrapper"),
  { ssr: false, loading: () => null }
);

export default function FooterClientWrapper() {
  return <MainFooterWrapper />;
}
