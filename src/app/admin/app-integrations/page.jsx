"use client";

import { useState, useEffect } from "react";
import { Badge, Spinner, Switch, Input, Textarea } from "@heroui/react";
import { CheckCircle, XCircle, Settings, Globe, Code, Trash2, Plus, BarChart3, Share2 } from "lucide-react";
import CustomButton from "@/components/block/CustomButton";

export default function AppIntegrationsPage() {
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  const [integrations, setIntegrations] = useState({
    googleAnalytics: { enabled: false, trackingIds: [] },
    metaPixel: { enabled: false, pixelIds: [] },
    googleTagManager: { enabled: false, containerIds: [] },
    googleAds: { enabled: false, conversionIds: [] },
    customCode: { enabled: false, scripts: [] },
  });

  const integrationConfig = {
    googleAnalytics: {
      name: "Google Analytics",
      description: "Track website traffic and user behavior",
      status: "active",
      icon: BarChart3,
      color: "blue",
    },
    metaPixel: {
      name: "Meta Pixel",
      description: "Facebook advertising and conversion tracking",
      status: "active",
      icon: Share2,
      color: "indigo",
    },
    googleTagManager: {
      name: "Google Tag Manager",
      description: "Manage all your website tags in one place",
      status: "active",
      icon: Code,
      color: "green",
    },
    googleAds: {
      name: "Google Ads",
      description: "Track conversions and optimize ad campaigns",
      status: "active",
      icon: BarChart3,
      color: "yellow",
    },
    customCode: {
      name: "Custom Code",
      description: "Add custom scripts and tracking codes",
      status: "active",
      icon: Code,
      color: "purple",
    },
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await fetch("/api/setting?type=integrations");
      const data = await res.json();
      if (data && Object.keys(data).length > 0) {
        // Ensure proper data structure with fallbacks
        setIntegrations({
          googleAnalytics: {
            enabled: data.googleAnalytics?.enabled || false,
            trackingIds: Array.isArray(data.googleAnalytics?.trackingIds) ? data.googleAnalytics.trackingIds : []
          },
          metaPixel: {
            enabled: data.metaPixel?.enabled || false,
            pixelIds: Array.isArray(data.metaPixel?.pixelIds) ? data.metaPixel.pixelIds : []
          },
          googleTagManager: {
            enabled: data.googleTagManager?.enabled || false,
            containerIds: Array.isArray(data.googleTagManager?.containerIds) ? data.googleTagManager.containerIds : []
          },
          googleAds: {
            enabled: data.googleAds?.enabled || false,
            conversionIds: Array.isArray(data.googleAds?.conversionIds) ? data.googleAds.conversionIds : []
          },
          customCode: {
            enabled: data.customCode?.enabled || false,
            scripts: Array.isArray(data.customCode?.scripts) ? data.customCode.scripts : []
          },
        });
      }
    } catch (err) {
      console.error("Failed to fetch integration settings:", err);
    } finally {
      setFetching(false);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/setting?type=integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(integrations),
      });
      if (res.ok) alert("Integration settings saved successfully!");
      else alert("Failed to save settings");
    } catch (err) {
      console.error(err);
      alert("Error saving settings");
    } finally {
      setLoading(false);
    }
  };

  const updateIntegration = (key, field, value) => {
    setIntegrations({
      ...integrations,
      [key]: { ...integrations[key], [field]: value },
    });
  };

  const addItem = (type, field) => {
    const current = integrations[type][field] || [];
    const newItem = field === "scripts" 
      ? { name: "", code: "" }
      : { id: "", name: "" };
    
    updateIntegration(type, field, [...current, newItem]);
  };

  const removeItem = (type, field, index) => {
    const current = integrations[type][field] || [];
    updateIntegration(type, field, current.filter((_, i) => i !== index));
  };

  const updateItem = (type, field, index, itemField, value) => {
    const current = [...(integrations[type][field] || [])];
    current[index][itemField] = value;
    updateIntegration(type, field, current);
  };

  if (fetching) {
    return (
      <div className="flex justify-center items-center h-[60vh]">
        <Spinner color="secondary" variant="gradient" size="lg" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6 md:space-y-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row items-center justify-between gap-4 lg:gap-6">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">App Integrations</h1>
          <p className="text-gray-600 mt-1 text-sm lg:text-base">Manage analytics, tracking pixels, and custom scripts for your store</p>
        </div>
        <CustomButton intent="primary" size="md" isLoading={loading} onPress={handleSave} className="px-4 lg:px-6">
          <Settings className="w-4 h-4 mr-2" /> Save Changes
        </CustomButton>
      </div>

      {/* Integration Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-6">
        {Object.entries(integrationConfig).map(([key, config]) => {
          const integration = integrations[key];
          const isActive = integration.enabled;
          const IconComponent = config.icon;

          return (
            <div key={key} className="bg-white rounded-lg p-4 lg:p-6 h-min">
              <div className="flex flex-col gap-4 lg:gap-6">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 bg-${config.color}-50 rounded-lg`}>
                      <IconComponent className={`w-4 h-4 lg:w-5 lg:h-5 text-${config.color}-600`} />
                    </div>
                  </div>
                  {config.status === "coming" && (
                    <span className="text-xs font-semibold bg-orange-100 text-orange-600 px-2 py-1 rounded-md">
                      Coming Soon
                    </span>
                  )}
                </div>

                <p className="text-xs lg:text-sm text-gray-600">{config.description}</p>

                <div className="flex items-center justify-between">
                  <Switch 
                    isSelected={isActive} 
                    isDisabled={config.status === "coming"} 
                    onValueChange={(v) => updateIntegration(key, "enabled", v)} 
                    color="success" 
                    size="md" 
                  />
                  <div className="flex items-center gap-2">
                    {isActive ? (
                      <CheckCircle className="w-3 h-3 lg:w-4 lg:h-4 text-green-500" />
                    ) : (
                      <XCircle className="w-3 h-3 lg:w-4 lg:h-4 text-gray-400" />
                    )}
                    <span className={`text-xs font-medium ${isActive ? "text-green-600" : "text-gray-500"}`}>
                      {isActive ? "Active" : "Inactive"}
                    </span>
                  </div>
                </div>

                {isActive && (
                  <div className="space-y-3 lg:space-y-4 mt-4">
                    {key === "googleAnalytics" && (
                      <IntegrationFields
                        type="googleAnalytics"
                        field="trackingIds"
                        items={integration.trackingIds || []}
                        addItem={addItem}
                        removeItem={removeItem}
                        updateItem={updateItem}
                        placeholder1="Account Name"
                        placeholder2="G-XXXXXXXXXX"
                        buttonText="Add GA4"
                      />
                    )}

                    {key === "metaPixel" && (
                      <IntegrationFields
                        type="metaPixel"
                        field="pixelIds"
                        items={integration.pixelIds || []}
                        addItem={addItem}
                        removeItem={removeItem}
                        updateItem={updateItem}
                        placeholder1="Ad Account Name"
                        placeholder2="Pixel ID (numbers only)"
                        buttonText="Add Pixel"
                      />
                    )}

                    {key === "googleTagManager" && (
                      <IntegrationFields
                        type="googleTagManager"
                        field="containerIds"
                        items={integration.containerIds || []}
                        addItem={addItem}
                        removeItem={removeItem}
                        updateItem={updateItem}
                        placeholder1="Container Name"
                        placeholder2="GTM-XXXXXXX"
                        buttonText="Add GTM"
                      />
                    )}

                    {key === "googleAds" && (
                      <IntegrationFields
                        type="googleAds"
                        field="conversionIds"
                        items={integration.conversionIds || []}
                        addItem={addItem}
                        removeItem={removeItem}
                        updateItem={updateItem}
                        placeholder1="Campaign Name"
                        placeholder2="AW-XXXXXXXXXX"
                        buttonText="Add Google Ads"
                      />
                    )}

                    {key === "customCode" && (
                      <CustomCodeFields
                        integration={integration}
                        addItem={addItem}
                        removeItem={removeItem}
                        updateItem={updateItem}
                      />
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Helper component for standard integration fields
function IntegrationFields({ type, field, items, addItem, removeItem, updateItem, placeholder1, placeholder2, buttonText }) {
  // Ensure items is always an array
  const safeItems = Array.isArray(items) ? items : [];
  
  return (
    <div className="space-y-2 lg:space-y-3">
      <div className="flex justify-between items-center">
        <span className="text-xs lg:text-sm font-medium text-gray-700">Configuration</span>
        <CustomButton
          intent="ghost"
          size="sm"
          onPress={() => addItem(type, field)}
          startContent={<Plus className="w-3 h-3 lg:w-4 lg:h-4" />}
        >
          {buttonText}
        </CustomButton>
      </div>
      
      {safeItems.length === 0 ? (
        <div className="text-center py-3 lg:py-4 text-gray-500 text-xs lg:text-sm">
          No items configured
        </div>
      ) : (
        <div className="space-y-2">
          {safeItems.map((item, index) => (
            <div key={index} className="flex gap-2 items-start">
              <div className="flex-1 space-y-2">
                <Input
                  labelPlacement="outside"
                  placeholder={placeholder1}
                  value={item.name || ""}
                  onChange={(e) => updateItem(type, field, index, "name", e.target.value)}
                  size="sm"
                />
                <Input
                  labelPlacement="outside"
                  placeholder={placeholder2}
                  value={item.id || ""}
                  onChange={(e) => updateItem(type, field, index, "id", e.target.value)}
                  size="sm"
                />
              </div>
              <button
                onClick={() => removeItem(type, field, index)}
                className="p-1.5 lg:p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors mt-1"
              >
                <Trash2 className="w-3 h-3 lg:w-4 lg:h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Helper component for custom code fields
function CustomCodeFields({ integration, addItem, removeItem, updateItem }) {
  // Ensure scripts is always an array
  const scripts = Array.isArray(integration?.scripts) ? integration.scripts : [];
  
  return (
    <div className="space-y-2 lg:space-y-3">
      <div className="flex justify-between items-center">
        <span className="text-xs lg:text-sm font-medium text-gray-700">Custom Scripts</span>
        <CustomButton
          intent="ghost"
          size="sm"
          onPress={() => addItem("customCode", "scripts")}
          startContent={<Plus className="w-3 h-3 lg:w-4 lg:h-4" />}
        >
          Add Script
        </CustomButton>
      </div>
      
      {scripts.length === 0 ? (
        <div className="text-center py-3 lg:py-4 text-gray-500 text-xs lg:text-sm">
          No custom scripts added
        </div>
      ) : (
        <div className="space-y-3">
          {scripts.map((script, index) => (
            <div key={index} className="border border-gray-200 rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <Input
                  labelPlacement="outside"
                  placeholder="Script Name/Description"
                  value={script.name || ""}
                  onChange={(e) => updateItem("customCode", "scripts", index, "name", e.target.value)}
                  size="sm"
                  className="flex-1"
                />
                <button
                  onClick={() => removeItem("customCode", "scripts", index)}
                  className="ml-3 p-1.5 lg:p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 className="w-3 h-3 lg:w-4 lg:h-4" />
                </button>
              </div>
              <Textarea
                labelPlacement="outside"
                placeholder="<script>&#10;  // Your custom code here&#10;</script>"
                value={script.code || ""}
                onChange={(e) => updateItem("customCode", "scripts", index, "code", e.target.value)}
                minRows={4}
                className="font-mono text-xs lg:text-sm"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
