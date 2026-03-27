// app/providers.tsx
"use client";

import { HeroUIProvider } from "@heroui/react";
import { CartProvider, useCartDrawer } from "@/hooks/useCart";
import CartDrawer from "@/components/CartDrawer";
import { UIControlProvider } from "@/context/UIControlContext";
import { LanguageProvider } from "@/context/LanguageContext";

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
      <HeroUIProvider>
        <UIControlProvider>
          <CartProvider>
            {children}
            <CartDrawerWrapper />
          </CartProvider>
        </UIControlProvider>
      </HeroUIProvider>
    </LanguageProvider>
  );
}
