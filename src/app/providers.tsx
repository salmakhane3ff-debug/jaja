// app/providers.tsx
"use client";

// PERF: HeroUIProvider removed from the global provider tree.
//       It was wrapping every page — including the storefront — and shipping
//       the full HeroUI theme CSS + JS to all visitors.
//       HeroUIProvider is now applied only in:
//         - src/app/admin/layout.jsx   (admin panel uses HeroUI heavily)
//         - src/app/checkout/layout.jsx (checkout uses HeroUI form inputs)
//       Public pages (homepage, product, feedback) no longer download it.
import { CartProvider, useCartDrawer } from "@/hooks/useCart";
import CartDrawer from "@/components/CartDrawer";
import { UIControlProvider } from "@/context/UIControlContext";
import { LanguageProvider } from "@/context/LanguageContext";
import { SettingsProvider } from "@/context/SettingsContext";

function CartDrawerWrapper() {
  const { cartDrawerOpen, setCartDrawerOpen } = useCartDrawer();

  return (
    <CartDrawer
      isOpen={cartDrawerOpen}
      onClose={() => setCartDrawerOpen(false)}
    />
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <LanguageProvider>
      {/* PERF: HeroUIProvider removed — see comment at top of file */}
      <SettingsProvider>
        <UIControlProvider>
          <CartProvider>
            {children}
            <CartDrawerWrapper />
          </CartProvider>
        </UIControlProvider>
      </SettingsProvider>
    </LanguageProvider>
  );
}
