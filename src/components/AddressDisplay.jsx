"use client";
import React, { useState, useEffect, useRef } from "react";
import { Button } from "@heroui/react";
import Link from "next/link";

export default function AddressDisplay({ onAddressChange = null }) {
  const [savedAddress, setSavedAddress] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const onAddressChangeRef = useRef(onAddressChange);

  useEffect(() => {
    onAddressChangeRef.current = onAddressChange;
  }, [onAddressChange]);

  const loadSavedAddress = () => {
    try {
      const billingDetails = localStorage.getItem("checkoutBillingDetails");
      if (billingDetails) {
        const parsedDetails = JSON.parse(billingDetails);
        setSavedAddress(parsedDetails);
        if (onAddressChangeRef.current) onAddressChangeRef.current(parsedDetails);
      } else {
        setSavedAddress(null);
        if (onAddressChangeRef.current) onAddressChangeRef.current(null);
      }
    } catch (error) {
      console.error("Error loading saved address:", error);
      setSavedAddress(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSavedAddress();
    const handleStorageChange = (e) => {
      if (e.key === "checkoutBillingDetails") loadSavedAddress();
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  if (isLoading) {
    return (
      <div className="p-4 border border-gray-200 rounded-md animate-pulse">
        <div className="h-3 bg-gray-200 rounded w-24 mb-2"></div>
        <div className="h-3 bg-gray-200 rounded w-48 mb-1"></div>
        <div className="h-3 bg-gray-200 rounded w-32"></div>
      </div>
    );
  }

  if (!savedAddress) {
    return (
      <div className="p-4 border border-dashed border-gray-300 rounded-md text-center">
        <p className="text-gray-600 text-sm mb-2">No address found</p>
        <Link href="/checkout/address">
          <Button size="sm" variant="flat" className="bg-gray-900 text-white text-xs">
            Add Address
          </Button>
        </Link>
      </div>
    );
  }

  const { customer, address } = savedAddress;

  return (
    <div className="border border-gray-300 rounded-md p-4 bg-white">
      <div className="flex items-start justify-between mb-3">
        <h3 className="font-medium text-gray-800 text-sm">Deliver to:</h3>
        <Link href="/checkout/address">
          <Button
            size="sm"
            variant="flat"
            className="border border-gray-300 bg-gray-50 text-gray-700 text-xs px-2 h-6"
          >
            CHANGE
          </Button>
        </Link>
      </div>

      <div className="space-y-1 text-sm text-gray-700 leading-relaxed">
        {customer?.fullName && (
          <p>
            <span className="font-semibold">Name:- </span>
            {customer.fullName}
          </p>
        )}

        {address?.address1 && (
          <p>
            <span className="font-semibold">Address As :- </span>
            {[
              address.address1,
              address.address2,
              address.city,
              address.state,
              address.zip,
            ]
              .filter(Boolean)
              .join(", ")}
          </p>
        )}

        {customer?.phone && (
          <p>
            <span className="font-semibold">Mobile: </span>
            {customer.phone}
          </p>
        )}
      </div>
    </div>
  );
}
