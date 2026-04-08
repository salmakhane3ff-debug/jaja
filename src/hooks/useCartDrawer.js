"use client";

import { useState, useEffect, createContext, useContext } from "react";

const CartDrawerContext = createContext();

const FALLBACK = {
  isDrawerOpen: false,
  openDrawer:   () => {},
  closeDrawer:  () => {},
  cartItems:    [],
  products:     [],
  getProductDetails: () => undefined,
  updateQuantity: () => {},
  removeItem:   () => {},
  getTotalPrice: () => "0.00",
  getTotalItems: () => 0,
  clearCart:    () => {},
};

export const useCartDrawer = () => {
  const context = useContext(CartDrawerContext);
  return context ?? FALLBACK;
};

export const CartDrawerProvider = ({ children }) => {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [cartItems, setCartItems] = useState([]);
  const [products, setProducts] = useState([]);

  // Load cart items from localStorage
  useEffect(() => {
    const loadCartData = () => {
      const localCart = JSON.parse(localStorage.getItem("cart") || "[]");
      setCartItems(localCart);
    };

    loadCartData();
    
    // Listen for cart updates
    window.addEventListener("cartUpdated", loadCartData);
    return () => window.removeEventListener("cartUpdated", loadCartData);
  }, []);

  // Fetch product details
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const res = await fetch("/api/products", {
          cache: "force-cache",
          next: { revalidate: 300 }
        });
        if (!res.ok) throw new Error("Failed to fetch products");
        
        const allProducts = await res.json();
        setProducts(allProducts);
      } catch (error) {
        console.error("Error loading products:", error);
      }
    };

    fetchProducts();
  }, []);

  const openDrawer = () => setIsDrawerOpen(true);
  const closeDrawer = () => setIsDrawerOpen(false);

  const getProductDetails = (productId) => 
    products.find((p) => p._id === productId);

  const updateQuantity = (productId, newQuantity) => {
    if (newQuantity < 1) return;
    
    const updatedCart = cartItems.map((item) =>
      item.productId === productId ? { ...item, quantity: newQuantity } : item
    );
    
    localStorage.setItem("cart", JSON.stringify(updatedCart));
    setCartItems(updatedCart);
    window.dispatchEvent(new Event("cartUpdated"));
  };

  const removeItem = (productId) => {
    const updatedCart = cartItems.filter((item) => item.productId !== productId);
    localStorage.setItem("cart", JSON.stringify(updatedCart));
    setCartItems(updatedCart);
    window.dispatchEvent(new Event("cartUpdated"));
  };

  const getTotalPrice = () => {
    return cartItems.reduce((total, item) => total + (item.price * item.quantity), 0).toFixed(2);
  };

  const getTotalItems = () => {
    return cartItems.reduce((total, item) => total + item.quantity, 0);
  };

  const clearCart = () => {
    localStorage.removeItem("cart");
    setCartItems([]);
    window.dispatchEvent(new Event("cartUpdated"));
  };

  const value = {
    isDrawerOpen,
    openDrawer,
    closeDrawer,
    cartItems,
    products,
    getProductDetails,
    updateQuantity,
    removeItem,
    getTotalPrice,
    getTotalItems,
    clearCart,
  };

  return (
    <CartDrawerContext.Provider value={value}>
      {children}
    </CartDrawerContext.Provider>
  );
};