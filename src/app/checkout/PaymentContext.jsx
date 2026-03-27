"use client";
import { createContext, useContext } from "react";

// Create context for payment settings
const PaymentContext = createContext(null);

export const usePaymentSettings = () => useContext(PaymentContext);

export default PaymentContext;
