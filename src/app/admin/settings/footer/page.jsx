"use client";

import { useState, useEffect } from "react";
import { Input, Textarea, Spinner } from "@heroui/react";
import { FileText, Mail, Phone, MapPin } from "lucide-react";
import CustomButton from "@/components/block/CustomButton";
import ImageSelector from "@/components/block/ImageSelector";

export default function FooterSettingsPage() {
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [footerLogoModalOpen, setFooterLogoModalOpen] = useState(false);

  const [settings, setSettings] = useState({
    footerTextLogo: "",
    copyrightText: "",
    footerEmail: "",
    footerPhone: "",
    footerAddress: "",
    footerLogo: "",
    footerAbout: "",
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
          footerTextLogo: data.footerTextLogo || "",
          copyrightText: data.copyrightText || "",
          footerEmail: data.footerEmail || "",
          footerPhone: data.footerPhone || "",
          footerAddress: data.footerAddress || "",
          footerLogo: data.footerLogo || "",
          footerAbout: data.footerAbout || "",
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
      // Get existing settings first
      const getRes = await fetch("/api/setting?type=store");
      const existingData = await getRes.json();
      
      // Merge with new footer settings
      const updatedSettings = { ...existingData, ...settings };
      
      const res = await fetch("/api/setting?type=store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedSettings),
      });

      if (res.ok) {
        alert("Footer settings saved successfully!");
      } else {
        alert("Failed to save footer settings");
      }
    } catch (err) {
      console.error("Save error:", err);
      alert("Error saving footer settings");
    } finally {
      setLoading(false);
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
          <div className="p-2 lg:p-3 bg-purple-50 rounded-lg lg:rounded-xl">
            <FileText className="w-4 h-4 lg:w-6 lg:h-6 text-purple-600" />
          </div>
          <div>
            <h1 className="text-xl lg:text-2xl font-bold text-gray-900">Footer Settings</h1>
            <p className="text-gray-600 text-xs lg:text-sm mt-0.5 lg:mt-1">Configure your store footer information and contact details</p>
          </div>
        </div>
        <CustomButton intent="primary" size="sm" onPress={handleSave} isLoading={loading} className="text-xs lg:text-sm">
          Save Changes
        </CustomButton>
      </div>

      {/* Settings Form */}
      <div className="bg-white rounded-xl lg:rounded-2xl p-4 lg:p-8 shadow-sm border border-gray-200 space-y-6 lg:space-y-8">
        {/* Footer Branding */}
        <div className="space-y-4 lg:space-y-6">
          <div className="pb-3 lg:pb-4 border-b border-gray-200">
            <h3 className="text-base lg:text-lg font-semibold text-gray-900">Footer Branding</h3>
            <p className="text-xs lg:text-sm text-gray-500 mt-0.5 lg:mt-1">Configure your footer logo and text</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
            <Input
              label="Footer Text Logo"
              labelPlacement="outside"
              placeholder="SHOP GOLD"
              value={settings.footerTextLogo}
              onChange={(e) => setSettings({ ...settings, footerTextLogo: e.target.value })}
              description="Text logo displayed in footer"
              size="sm"
              classNames={{
                inputWrapper: "border-gray-300 hover:border-gray-400 focus-within:border-purple-500",
                label: "text-xs lg:text-sm font-medium",
                description: "text-xs",
              }}
            />

            <div>
              <label className="text-xs lg:text-sm font-medium text-gray-700 mb-2 lg:mb-3 block">Footer Logo Image</label>
              <div
                onClick={() => setFooterLogoModalOpen(true)}
                className="flex justify-center items-center border-2 border-dashed border-gray-300 rounded-lg lg:rounded-xl cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition-all duration-200"
                style={{
                  height: settings.footerLogo ? "auto" : "100px",
                }}
              >
                {settings.footerLogo ? (
                  <div className="p-3 lg:p-4">
                    <img src={settings.footerLogo} alt="Footer Logo" className="max-h-16 lg:max-h-20 object-contain rounded-lg" />
                  </div>
                ) : (
                  <div className="text-center p-3 lg:p-4">
                    <FileText className="w-5 h-5 lg:w-6 lg:h-6 text-gray-400 mx-auto mb-1 lg:mb-2" />
                    <span className="text-gray-500 text-xs lg:text-sm font-medium">Click to select footer logo</span>
                    <p className="text-xs text-gray-400 mt-0.5 lg:mt-1">Optional footer logo</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* About & Copyright */}
        <div className="space-y-4 lg:space-y-6">
          <div className="pb-3 lg:pb-4 border-b border-gray-200">
            <h3 className="text-base lg:text-lg font-semibold text-gray-900">About & Copyright</h3>
            <p className="text-xs lg:text-sm text-gray-500 mt-0.5 lg:mt-1">Footer description and legal information</p>
          </div>

          <Textarea
            label="About Description"
            labelPlacement="outside"
            placeholder="Brief description about your store..."
            value={settings.footerAbout}
            onChange={(e) => setSettings({ ...settings, footerAbout: e.target.value })}
            description="Short description for footer about section"
            rows={3}
            size="sm"
            classNames={{
              inputWrapper: "border-gray-300 hover:border-gray-400 focus-within:border-purple-500",
              label: "text-xs lg:text-sm font-medium",
              description: "text-xs",
            }}
          />

          <Textarea
            label="Copyright Text"
            labelPlacement="outside"
            placeholder="© 2025 Shop Gold. All rights reserved."
            value={settings.copyrightText}
            onChange={(e) => setSettings({ ...settings, copyrightText: e.target.value })}
            description="Copyright notice displayed in footer"
            rows={2}
            size="sm"
            classNames={{
              inputWrapper: "border-gray-300 hover:border-gray-400 focus-within:border-purple-500",
              label: "text-xs lg:text-sm font-medium",
              description: "text-xs",
            }}
          />
        </div>

        {/* Contact Information */}
        <div className="space-y-4 lg:space-y-6">
          <div className="pb-3 lg:pb-4 border-b border-gray-200">
            <h3 className="text-base lg:text-lg font-semibold text-gray-900">Contact Information</h3>
            <p className="text-xs lg:text-sm text-gray-500 mt-0.5 lg:mt-1">How customers can reach you</p>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:gap-6">
            <Input
              label="Email Address"
              labelPlacement="outside"
              type="email"
              placeholder="contact@shopgold.com"
              value={settings.footerEmail}
              onChange={(e) => setSettings({ ...settings, footerEmail: e.target.value })}
              startContent={<Mail className="w-3 h-3 lg:w-4 lg:h-4 text-gray-500" />}
              description="Primary contact email address"
              size="sm"
              classNames={{
                inputWrapper: "border-gray-300 hover:border-gray-400 focus-within:border-purple-500",
                label: "text-xs lg:text-sm font-medium",
                description: "text-xs",
              }}
            />

            <Input
              label="Phone Number"
              labelPlacement="outside"
              type="tel"
              placeholder="+1 (555) 123-4567"
              value={settings.footerPhone}
              onChange={(e) => setSettings({ ...settings, footerPhone: e.target.value })}
              startContent={<Phone className="w-3 h-3 lg:w-4 lg:h-4 text-gray-500" />}
              description="Customer service phone number"
              size="sm"
              classNames={{
                inputWrapper: "border-gray-300 hover:border-gray-400 focus-within:border-purple-500",
                label: "text-xs lg:text-sm font-medium",
                description: "text-xs",
              }}
            />

            <Textarea
              label="Business Address"
              labelPlacement="outside"
              placeholder="123 Main Street, City, State, Country"
              value={settings.footerAddress}
              onChange={(e) => setSettings({ ...settings, footerAddress: e.target.value })}
              startContent={<MapPin className="w-3 h-3 lg:w-4 lg:h-4 text-gray-500" />}
              description="Your business or store address"
              rows={3}
              size="sm"
              classNames={{
                inputWrapper: "border-gray-300 hover:border-gray-400 focus-within:border-purple-500",
                label: "text-xs lg:text-sm font-medium",
                description: "text-xs",
              }}
            />
          </div>
        </div>
      </div>

      {/* Image Selector */}
      <ImageSelector 
        isOpen={footerLogoModalOpen} 
        onClose={() => setFooterLogoModalOpen(false)} 
        onSelectImages={(url) => setSettings({ ...settings, footerLogo: url })} 
        selectType="single" 
      />
    </div>
  );
}