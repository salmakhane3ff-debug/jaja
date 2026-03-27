"use client";

import { useState, useEffect, createContext, useContext } from "react";

const AddressContext = createContext();

export function AddressProvider({ children }) {
  const [savedAddress, setSavedAddress] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadAddress = () => {
    try {
      const billingDetails = localStorage.getItem("checkoutBillingDetails");
      if (billingDetails) {
        const parsedDetails = JSON.parse(billingDetails);
        setSavedAddress(parsedDetails);
      } else {
        setSavedAddress(null);
      }
    } catch (error) {
      console.error("Error loading saved address:", error);
      setSavedAddress(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAddress();

    // Listen for changes in localStorage
    const handleStorageChange = (e) => {
      if (e.key === "checkoutBillingDetails") {
        loadAddress();
      }
    };

    window.addEventListener("storage", handleStorageChange);
    
    // Also listen for custom events for same-tab updates
    const handleAddressUpdate = () => {
      loadAddress();
    };
    
    window.addEventListener("addressUpdated", handleAddressUpdate);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("addressUpdated", handleAddressUpdate);
    };
  }, []);

  const updateAddress = (newAddress) => {
    try {
      localStorage.setItem("checkoutBillingDetails", JSON.stringify(newAddress));
      setSavedAddress(newAddress);
      
      // Dispatch custom event for same-tab updates
      window.dispatchEvent(new CustomEvent("addressUpdated"));
    } catch (error) {
      console.error("Error saving address:", error);
    }
  };

  const clearAddress = () => {
    try {
      localStorage.removeItem("checkoutBillingDetails");
      setSavedAddress(null);
      window.dispatchEvent(new CustomEvent("addressUpdated"));
    } catch (error) {
      console.error("Error clearing address:", error);
    }
  };

  const hasAddress = () => {
    return savedAddress && 
           savedAddress.customer?.fullName && 
           savedAddress.customer?.phone &&
           savedAddress.address?.address1 &&
           savedAddress.address?.city &&
           savedAddress.address?.state &&
           savedAddress.address?.zip;
  };

  return (
    <AddressContext.Provider value={{
      savedAddress,
      isLoading,
      updateAddress,
      clearAddress,
      hasAddress: hasAddress(),
      loadAddress
    }}>
      {children}
    </AddressContext.Provider>
  );
}

export function useAddress() {
  const context = useContext(AddressContext);
  if (!context) {
    throw new Error("useAddress must be used within an AddressProvider");
  }
  return context;
}