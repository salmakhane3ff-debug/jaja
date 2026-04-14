"use client";

import { useState, createContext, useContext } from 'react';
import { useDiscountRules } from '@/hooks/useDiscountRules';

// Create cart context for global cart drawer state
const CartContext = createContext();

export const CartProvider = ({ children }) => {
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);

  return (
    <CartContext.Provider value={{ cartDrawerOpen, setCartDrawerOpen }}>
      {children}
    </CartContext.Provider>
  );
};

export const useCartDrawer = () => {
  const context = useContext(CartContext);
  if (!context) {
    return { cartDrawerOpen: false, setCartDrawerOpen: () => {} };
  }
  return context;
};

export const useCart = () => {
  const [addingToCart, setAddingToCart] = useState({});
  const cartDrawerContext = useCartDrawer();
  const { setCartDrawerOpen } = cartDrawerContext || { setCartDrawerOpen: () => {} };
  const { getDiscount } = useDiscountRules();

  const addToCart = (product, quantity = 1) => {
    return new Promise((resolve, reject) => {
      if (!product || !product._id) {
        console.error("Invalid product data:", product);
        reject(new Error("Invalid product data"));
        return;
      }

      setAddingToCart((prev) => ({ ...prev, [product._id]: true }));

      setTimeout(() => {
        try {
          // Add to cart logic
          const cart = JSON.parse(localStorage.getItem("cart") || "[]");
          const existingIndex = cart.findIndex((item) => item.productId === product._id);

          // Gift items always cost 0 — skip discount rules
          const isGift = !!product._isGift;
          const discountRule = isGift ? null : getDiscount(product);
          const effectivePrice = isGift
            ? 0
            : discountRule
              ? discountRule.effectivePrice
              : parseFloat(product.salePrice || product.regularPrice || 0);

          const cartItem = {
            productId: product._id,
            title: product.title,
            quantity: quantity,
            color: null,
            size: null,
            image: product.images?.[0]?.url || product.images?.[0] || "",
            price: effectivePrice,
            currency: product.currencySymbol || process.env.NEXT_PUBLIC_CURRENCY_SYMBOL || "$",
            ...(isGift && { _isGift: true }),
          };

          if (existingIndex !== -1) {
            cart[existingIndex].quantity += quantity;
          } else {
            cart.push(cartItem);
          }

          localStorage.setItem("cart", JSON.stringify(cart));
          
          // Dispatch cart update event for header count
          window.dispatchEvent(new CustomEvent("cartUpdated"));
          
          setAddingToCart((prev) => ({ ...prev, [product._id]: false }));
          
          // Open cart drawer after adding item (if context is available)
          if (setCartDrawerOpen) {
            setCartDrawerOpen(true);
          }
          
          console.log("Product added to cart:", cartItem);
          resolve(cartItem);
        } catch (error) {
          console.error("Error adding to cart:", error);
          setAddingToCart((prev) => ({ ...prev, [product._id]: false }));
          reject(error);
        }
      }, 500);
    });
  };

  const isAddingToCart = (productId) => {
    return addingToCart[productId] || false;
  };

  return {
    addToCart,
    isAddingToCart,
    addingToCart
  };
};