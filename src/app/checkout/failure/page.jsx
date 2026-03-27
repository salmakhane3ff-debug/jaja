"use client";

import React from "react";
import { XCircle } from "lucide-react";

export default function CancelPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-white px-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 sm:p-12 max-w-md text-center space-y-6">
        <XCircle className="mx-auto h-16 w-16 text-red-500 animate-pulse" />
        <h1 className="text-2xl font-bold text-gray-800">Payment Cancelled</h1>
        <p className="text-gray-600">Your transaction was cancelled or failed. No payment has been made.</p>

        <button
          onClick={() => (window.location.href = "/")}
          className="w-full bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded-xl transition-all duration-200"
        >
          Back to Home
        </button>
      </div>
    </div>
  );
}
