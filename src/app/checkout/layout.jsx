/**
 * src/app/checkout/layout.jsx
 * Minimal wrapper — each step page manages its own header and progress bar.
 *
 * PERF: HeroUIProvider scoped here (not in global providers.tsx) so only
 *       checkout visitors load the HeroUI theme JS + CSS.
 */
"use client";
import { HeroUIProvider } from "@heroui/react";

export default function CheckoutLayout({ children }) {
  return (
    <HeroUIProvider>
      <div className="min-h-screen bg-gray-50">
        {children}
      </div>
    </HeroUIProvider>
  );
}
