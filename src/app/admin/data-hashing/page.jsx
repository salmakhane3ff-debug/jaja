"use client";

import React, { useState } from "react";
import { Button } from "@heroui/react";
import { Hash, Copy, Download, Upload, AlertCircle, CheckCircle, Info } from "lucide-react";

export default function DataHashingPage() {
  const [inputData, setInputData] = useState("");
  const [hashedData, setHashedData] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState("");
  const [copySuccess, setCopySuccess] = useState(false);
  const [inputFormat, setInputFormat] = useState("json");

  // SHA256 hashing function
  const hashData = async (data) => {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  };

  // Process and hash the user data
  const processUserData = async () => {
    if (!inputData.trim()) {
      setError("Please enter user data to hash");
      return;
    }

    setIsProcessing(true);
    setError("");

    try {
      let userData;

      // Parse JSON data
      if (inputFormat === "json") {
        userData = JSON.parse(inputData);
      } else {
        // Handle CSV format
        const lines = inputData.trim().split("\n");
        const headers = lines[0].split(",").map((h) => h.trim());
        userData = lines.slice(1).map((line) => {
          const values = line.split(",").map((v) => v.trim());
          const obj = {};
          headers.forEach((header, index) => {
            obj[header] = values[index] || "";
          });
          return obj;
        });
      }

      // Ensure userData is an array
      if (!Array.isArray(userData)) {
        userData = [userData];
      }

      // Hash the customer data according to Google Ads requirements
      const hashedUsers = await Promise.all(
        userData.map(async (user) => {
          const hashedUser = { ...user };

          // Hash email if present
          if (user.email) {
            hashedUser.email = await hashData(user.email.toLowerCase().trim());
          }

          // Hash phone if present (remove all non-digits first)
          if (user.phone) {
            const cleanPhone = user.phone.replace(/\D/g, "");
            hashedUser.phone = await hashData(cleanPhone);
          }

          // Hash first name if present
          if (user.firstName || user.first_name) {
            const firstName = (user.firstName || user.first_name).toLowerCase().trim();
            hashedUser.firstName = await hashData(firstName);
            delete hashedUser.first_name; // Remove underscore version
          }

          // Hash last name if present
          if (user.lastName || user.last_name) {
            const lastName = (user.lastName || user.last_name).toLowerCase().trim();
            hashedUser.lastName = await hashData(lastName);
            delete hashedUser.last_name; // Remove underscore version
          }

          // Don't hash country and zip (as per Google Ads requirements)
          // Keep them as plain text

          return hashedUser;
        })
      );

      setHashedData(JSON.stringify(hashedUsers, null, 2));
    } catch (err) {
      setError(`Error processing data: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Copy hashed data to clipboard
  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(hashedData);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      setError("Failed to copy to clipboard");
    }
  };

  // Download hashed data as JSON file
  const downloadHashedData = () => {
    if (!hashedData) return;

    const blob = new Blob([hashedData], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hashed-customer-data-${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Load sample data
  const loadSampleData = () => {
    const sampleData = [
      {
        email: "customer1@example.com",
        phone: "+1234567890",
        firstName: "John",
        lastName: "Doe",
        country: "US",
        zip: "12345",
      },
      {
        email: "customer2@example.com",
        phone: "+0987654321",
        firstName: "Jane",
        lastName: "Smith",
        country: "US",
        zip: "67890",
      },
    ];
    setInputData(JSON.stringify(sampleData, null, 2));
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <Hash className="w-8 h-8 text-blue-600" />
          <h1 className="text-3xl font-bold text-gray-900">Data Hashing for Google Ads</h1>
        </div>
        <p className="text-gray-600 max-w-4xl">
          Convert customer data to SHA256 hashes for Google Ads Customer Match campaigns. This tool follows Google's requirements for data privacy and security.
        </p>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-600 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-2">Google Ads Customer Match Requirements:</p>
            <ul className="list-disc list-inside space-y-1 text-blue-700">
              <li>Email addresses, phone numbers, first names, and last names will be hashed using SHA256</li>
              <li>Country and zip codes remain unhashed (as required by Google)</li>
              <li>All data is processed locally in your browser for security</li>
              <li>Supports JSON and CSV formats</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Input Section */}
        <div className="space-y-6">
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Input Customer Data</h2>

            {/* Format Selection */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Data Format</label>
              <div className="flex gap-4">
                <label className="flex items-center">
                  <input type="radio" value="json" checked={inputFormat === "json"} onChange={(e) => setInputFormat(e.target.value)} className="mr-2" />
                  JSON
                </label>
                <label className="flex items-center">
                  <input type="radio" value="csv" checked={inputFormat === "csv"} onChange={(e) => setInputFormat(e.target.value)} className="mr-2" />
                  CSV
                </label>
              </div>
            </div>

            {/* Sample Data Button */}
            <div className="mb-4">
              <Button size="sm" variant="bordered" onPress={loadSampleData} className="mb-2">
                Load Sample Data
              </Button>
            </div>

            {/* Input Textarea */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Customer Data ({inputFormat.toUpperCase()})</label>
              <textarea
                value={inputData}
                onChange={(e) => setInputData(e.target.value)}
                placeholder={
                  inputFormat === "json"
                    ? 'Enter JSON data:\n[\n  {\n    "email": "customer@example.com",\n    "phone": "+1234567890",\n    "firstName": "John",\n    "lastName": "Doe",\n    "country": "US",\n    "zip": "12345"\n  }\n]'
                    : "Enter CSV data:\nemail,phone,firstName,lastName,country,zip\ncustomer@example.com,+1234567890,John,Doe,US,12345"
                }
                className="w-full h-64 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm resize-none"
              />
            </div>

            {/* Error Display */}
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center gap-2 text-red-800">
                  <AlertCircle className="w-4 h-4" />
                  <span className="text-sm">{error}</span>
                </div>
              </div>
            )}

            {/* Process Button */}
            <Button onPress={processUserData} isLoading={isProcessing} disabled={!inputData.trim()} className="w-full bg-blue-600 text-white hover:bg-blue-700">
              {isProcessing ? "Processing..." : "Hash Customer Data"}
            </Button>
          </div>
        </div>

        {/* Output Section */}
        <div className="space-y-6">
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Hashed Output</h2>

            {hashedData && (
              <>
                {/* Success Message */}
                <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center gap-2 text-green-800">
                    <CheckCircle className="w-4 h-4" />
                    <span className="text-sm">Data successfully hashed and ready for Google Ads Customer Match</span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 mb-4">
                  <Button size="sm" variant="bordered" onPress={copyToClipboard} className="flex items-center gap-2">
                    <Copy className="w-4 h-4" />
                    {copySuccess ? "Copied!" : "Copy"}
                  </Button>
                  <Button size="sm" variant="bordered" onPress={downloadHashedData} className="flex items-center gap-2">
                    <Download className="w-4 h-4" />
                    Download JSON
                  </Button>
                </div>
              </>
            )}

            {/* Output Textarea */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Hashed Customer Data (Ready for Google Ads)</label>
              <textarea
                value={hashedData}
                readOnly
                placeholder="Hashed data will appear here after processing..."
                className="w-full h-64 p-3 border border-gray-300 rounded-lg bg-gray-50 font-mono text-sm resize-none"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Usage Instructions */}
      <div className="mt-8 bg-gray-50 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">How to Use with Google Ads</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
          <div>
            <h4 className="font-medium text-gray-900 mb-2">1. Prepare Your Data</h4>
            <p className="text-gray-600">Enter customer data in JSON or CSV format with fields like email, phone, firstName, lastName, country, and zip.</p>
          </div>
          <div>
            <h4 className="font-medium text-gray-900 mb-2">2. Hash the Data</h4>
            <p className="text-gray-600">Click "Hash Customer Data" to convert sensitive information to SHA256 hashes while keeping country and zip codes unhashed.</p>
          </div>
          <div>
            <h4 className="font-medium text-gray-900 mb-2">3. Upload to Google Ads</h4>
            <p className="text-gray-600">Download the hashed JSON file and upload it to Google Ads Customer Match for targeted advertising campaigns.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
