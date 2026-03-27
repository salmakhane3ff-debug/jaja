"use client";

import { useState, useEffect } from "react";
import { Input, Textarea, Select, SelectItem, Spinner } from "@heroui/react";
import { Store, DollarSign } from "lucide-react";
import CustomButton from "@/components/block/CustomButton";
import ImageSelector from "@/components/block/ImageSelector";

export default function StoreSettingsPage() {
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [logoModalOpen, setLogoModalOpen] = useState(false);
  const [faviconModalOpen, setFaviconModalOpen] = useState(false);

  const currencies = [
    { label: "US Dollar ($)", value: "USD", symbol: "$" },
    { label: "Indian Rupee (₹)", value: "INR", symbol: "₹" },
  ];

  const [settings, setSettings] = useState({
    storeName: "",
    textLogo: "",
    websiteDescription: "",
    logoImage: "",
    faviconImage: "",
    storeCurrency: "USD",
    currencySymbol: "$",
    storeEmail: "",
    storeAddress: "",
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await fetch("/api/setting?type=store");
      const data = await res.json();
      if (data && Object.keys(data).length > 0) {
        setSettings({
          storeName: data.storeName || "",
          textLogo: data.textLogo || "",
          websiteDescription: data.websiteDescription || "",
          logoImage: data.logoImage || "",
          faviconImage: data.faviconImage || "",
          storeCurrency: data.storeCurrency || "USD",
          currencySymbol: data.currencySymbol || "$",
          storeEmail: data.storeEmail || "",
          storeAddress: data.storeAddress || "",
        });
      }
    } catch (err) {
      console.error("Failed to fetch settings:", err);
    } finally {
      setFetching(false);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/setting?type=store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      if (res.ok) {
        // Update cached currency data
        const currencyData = {
          currency: settings.storeCurrency,
          symbol: settings.currencySymbol,
          lastUpdated: new Date().toISOString()
        };
        localStorage.setItem("store_currency", JSON.stringify(currencyData));
        localStorage.setItem("store_settings", JSON.stringify(settings));
        
        // Update CSS variables
        document.documentElement.style.setProperty('--store-currency', settings.storeCurrency);
        document.documentElement.style.setProperty('--currency-symbol', settings.currencySymbol);
        
        // Dispatch event for other components
        window.dispatchEvent(new CustomEvent("currencyUpdated"));
        
        alert("Store settings saved successfully!");
      } else {
        alert("Failed to save store settings");
      }
    } catch (err) {
      console.error("Save error:", err);
      alert("Error saving store settings");
    } finally {
      setLoading(false);
    }
  };

  const handleCurrencyChange = (key) => {
    const selected = currencies.find((c) => c.value === key);
    if (selected) {
      setSettings({
        ...settings,
        storeCurrency: selected.value,
        currencySymbol: selected.symbol,
      });
    }
  };

  if (fetching) {
    return (
      <div className="flex justify-center items-center h-[calc(100vh-120px)] lg:h-[calc(100vh-200px)]">
        <Spinner color="secondary" variant="gradient" size="md" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 lg:gap-4 mb-6 lg:mb-8">
        <div className="flex items-center gap-2 lg:gap-3">
          <div className="p-2 lg:p-3 bg-blue-50 rounded-lg lg:rounded-xl">
            <Store className="w-4 h-4 lg:w-6 lg:h-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl lg:text-2xl font-bold text-gray-900">Store Settings</h1>
            <p className="text-gray-600 text-xs lg:text-sm mt-0.5 lg:mt-1">Configure your store information, branding, and currency</p>
          </div>
        </div>
        <CustomButton intent="primary" size="sm" onPress={handleSave} isLoading={loading} className="text-xs lg:text-sm">
          Save Changes
        </CustomButton>
      </div>

      {/* Settings Form */}
      <div className="bg-white rounded-xl lg:rounded-2xl p-4 lg:p-8 shadow-sm border border-gray-200 space-y-6 lg:space-y-10">{/* Basic Information */}
        <div className="space-y-4 lg:space-y-6">
          <div className="pb-3 lg:pb-4 border-b border-gray-200">
            <h3 className="text-base lg:text-lg font-semibold text-gray-900">Basic Information</h3>
            <p className="text-xs lg:text-sm text-gray-500 mt-0.5 lg:mt-1">Essential store details and identification</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6">
            <Input
              label="Store Name"
              labelPlacement="outside"
              placeholder="Shop Gold"
              value={settings.storeName}
              onChange={(e) => setSettings({ ...settings, storeName: e.target.value })}
              description="Your store's official name"
              size="sm"
              classNames={{
                inputWrapper: "border-gray-300 hover:border-gray-400 focus-within:border-blue-500",
                label: "text-xs lg:text-sm font-medium",
                description: "text-xs",
              }}
            />

            <Input
              label="Text Logo"
              labelPlacement="outside"
              placeholder="SHOP GOLD"
              value={settings.textLogo}
              onChange={(e) => setSettings({ ...settings, textLogo: e.target.value })}
              description="Text to display as logo if no image is set"
              size="sm"
              classNames={{
                inputWrapper: "border-gray-300 hover:border-gray-400 focus-within:border-blue-500",
                label: "text-xs lg:text-sm font-medium",
                description: "text-xs",
              }}
            />
          </div>

          <Textarea
            label="Website Description"
            labelPlacement="outside"
            placeholder="Your one-stop shop for premium products..."
            value={settings.websiteDescription}
            onChange={(e) => setSettings({ ...settings, websiteDescription: e.target.value })}
            description="SEO meta description for your site"
            rows={3}
            size="sm"
            classNames={{
              inputWrapper: "border-gray-300 hover:border-gray-400 focus-within:border-blue-500",
              label: "text-xs lg:text-sm font-medium",
              description: "text-xs",
            }}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6">
            <Input
              label="Store Email"
              labelPlacement="outside"
              placeholder="support@shopgold.com"
              value={settings.storeEmail}
              onChange={(e) => setSettings({ ...settings, storeEmail: e.target.value })}
              description="Customer support email address"
              size="sm"
              classNames={{
                inputWrapper: "border-gray-300 hover:border-gray-400 focus-within:border-blue-500",
                label: "text-xs lg:text-sm font-medium",
                description: "text-xs",
              }}
            />

            <Input
              label="Store Address"
              labelPlacement="outside"
              placeholder="123 Business Street, City, State 12345"
              value={settings.storeAddress}
              onChange={(e) => setSettings({ ...settings, storeAddress: e.target.value })}
              description="Registered business address"
              size="sm"
              classNames={{
                inputWrapper: "border-gray-300 hover:border-gray-400 focus-within:border-blue-500",
                label: "text-xs lg:text-sm font-medium",
                description: "text-xs",
              }}
            />
          </div>
        </div>

        {/* Visual Branding */}
        <div className="space-y-4 lg:space-y-6">
          <div className="pb-3 lg:pb-4 border-b border-gray-200">
            <h3 className="text-base lg:text-lg font-semibold text-gray-900">Visual Branding</h3>
            <p className="text-xs lg:text-sm text-gray-500 mt-0.5 lg:mt-1">Upload your store's visual identity</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
            {/* Logo */}
            <div>
              <label className="text-xs lg:text-sm font-medium text-gray-700 mb-2 lg:mb-3 block">Store Logo</label>
              <div
                onClick={() => setLogoModalOpen(true)}
                className="flex justify-center items-center border-2 border-dashed border-gray-300 rounded-lg lg:rounded-xl cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition-all duration-200"
                style={{
                  height: settings.logoImage ? "auto" : "120px",
                }}
              >
                {settings.logoImage ? (
                  <div className="relative p-3 lg:p-4 group">
                    <img src={settings.logoImage} alt="Logo" className="max-h-24 lg:max-h-32 object-contain rounded-lg" />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSettings({ ...settings, logoImage: "" });
                      }}
                      className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Remove logo"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ) : (
                  <div className="text-center p-4 lg:p-6">
                    <Store className="w-6 h-6 lg:w-8 lg:h-8 text-gray-400 mx-auto mb-1 lg:mb-2" />
                    <span className="text-gray-500 text-xs lg:text-sm font-medium">Click to select logo</span>
                    <p className="text-xs text-gray-400 mt-0.5 lg:mt-1">Recommended: 200x60px, PNG/SVG</p>
                  </div>
                )}
              </div>
            </div>

            {/* Favicon */}
            <div>
              <label className="text-xs lg:text-sm font-medium text-gray-700 mb-2 lg:mb-3 block">Favicon</label>
              <div
                onClick={() => setFaviconModalOpen(true)}
                className="flex justify-center items-center border-2 border-dashed border-gray-300 rounded-lg lg:rounded-xl cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition-all duration-200"
                style={{
                  height: settings.faviconImage ? "auto" : "120px",
                }}
              >
                {settings.faviconImage ? (
                  <div className="relative p-3 lg:p-4 group">
                    <img src={settings.faviconImage} alt="Favicon" className="h-16 w-16 lg:h-20 lg:w-20 object-contain rounded-lg mx-auto" />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSettings({ ...settings, faviconImage: "" });
                      }}
                      className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Remove favicon"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ) : (
                  <div className="text-center p-4 lg:p-6">
                    <div className="w-6 h-6 lg:w-8 lg:h-8 bg-gray-300 rounded mx-auto mb-1 lg:mb-2"></div>
                    <span className="text-gray-500 text-xs lg:text-sm font-medium">Click to select favicon</span>
                    <p className="text-xs text-gray-400 mt-0.5 lg:mt-1">Recommended: 32x32px, ICO/PNG</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Currency Settings */}
        <div className="space-y-4 lg:space-y-6">
          <div className="pb-3 lg:pb-4">
            <h3 className="text-base lg:text-lg font-semibold text-gray-900">Currency Configuration</h3>
            <p className="text-xs lg:text-sm text-gray-500 mt-0.5 lg:mt-1">Set your store's default currency</p>
          </div>

          <div className="max-w-md">
            <Select
              label="Store Currency"
              labelPlacement="outside"
              placeholder="Select currency"
              selectedKeys={[settings.storeCurrency]}
              onSelectionChange={(keys) => handleCurrencyChange(Array.from(keys)[0])}
              startContent={<DollarSign className="w-3 h-3 lg:w-4 lg:h-4 text-gray-500" />}
              size="sm"
              classNames={{
                trigger: "border-gray-300 hover:border-gray-400 focus-within:border-blue-500",
                label: "text-xs lg:text-sm font-medium",
              }}
            >
              {currencies.map((currency) => (
                <SelectItem key={currency.value} value={currency.value} className="text-sm">
                  {currency.label}
                </SelectItem>
              ))}
            </Select>
            <p className="text-xs text-gray-500 mt-1 lg:mt-2">
              Current symbol: <span className="font-medium">{settings.currencySymbol}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Image Selectors */}
      <ImageSelector 
        isOpen={logoModalOpen} 
        onClose={() => setLogoModalOpen(false)} 
        onSelectImages={(url) => setSettings({ ...settings, logoImage: url })} 
        selectType="single" 
      />
      <ImageSelector 
        isOpen={faviconModalOpen} 
        onClose={() => setFaviconModalOpen(false)} 
        onSelectImages={(url) => setSettings({ ...settings, faviconImage: url })} 
        selectType="single" 
      />
    </div>
  );
}