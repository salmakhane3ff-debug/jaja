"use client";

import { useState, useEffect } from "react";
import { Input, Textarea, Spinner, Button } from "@heroui/react";
import { Menu as MenuIcon, Plus, X, ExternalLink } from "lucide-react";
import CustomButton from "@/components/block/CustomButton";

export default function MenuSettingsPage() {
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  const [settings, setSettings] = useState({
    footerColumn1Title: "",
    footerColumn1Links: "",
  });

  const [parsedLinks, setParsedLinks] = useState([]);

  useEffect(() => {
    fetchSettings();
  }, []);

  useEffect(() => {
    // Parse links when settings change
    parseLinks(settings.footerColumn1Links);
  }, [settings.footerColumn1Links]);

  const fetchSettings = async () => {
    try {
      const res = await fetch("/api/setting?type=store");
      const data = await res.json();
      if (data && Object.keys(data).length > 0) {
        setSettings({
          footerColumn1Title: data.footerColumn1Title || "",
          footerColumn1Links: data.footerColumn1Links || "",
        });
      }
    } catch (err) {
      console.error("Failed to fetch settings:", err);
    } finally {
      setFetching(false);
    }
  };

  const parseLinks = (linksString) => {
    if (!linksString) {
      setParsedLinks([]);
      return;
    }
    
    const lines = linksString.split('\n').filter(line => line.trim());
    const links = lines.map((line, index) => {
      const parts = line.split('|');
      return {
        id: index,
        text: parts[0] || '',
        url: parts[1] || '',
        isValid: parts.length === 2 && parts[0].trim() && parts[1].trim()
      };
    });
    setParsedLinks(links);
  };

  const addNewLink = () => {
    const currentLinks = settings.footerColumn1Links;
    const newLinkLine = "New Link|/new-page";
    const updatedLinks = currentLinks ? `${currentLinks}\n${newLinkLine}` : newLinkLine;
    
    setSettings({
      ...settings,
      footerColumn1Links: updatedLinks
    });
  };

  const updateLink = (index, text, url) => {
    const lines = settings.footerColumn1Links.split('\n');
    lines[index] = `${text}|${url}`;
    setSettings({
      ...settings,
      footerColumn1Links: lines.join('\n')
    });
  };

  const removeLink = (index) => {
    const lines = settings.footerColumn1Links.split('\n').filter((_, i) => i !== index);
    setSettings({
      ...settings,
      footerColumn1Links: lines.join('\n')
    });
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      // Get existing settings first
      const getRes = await fetch("/api/setting?type=store");
      const existingData = await getRes.json();
      
      // Merge with new menu settings
      const updatedSettings = { ...existingData, ...settings };
      
      const res = await fetch("/api/setting?type=store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedSettings),
      });

      if (res.ok) {
        alert("Menu settings saved successfully!");
      } else {
        alert("Failed to save menu settings");
      }
    } catch (err) {
      console.error("Save error:", err);
      alert("Error saving menu settings");
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
          <div className="p-2 lg:p-3 bg-orange-50 rounded-lg lg:rounded-xl">
            <MenuIcon className="w-4 h-4 lg:w-6 lg:h-6 text-orange-600" />
          </div>
          <div>
            <h1 className="text-xl lg:text-2xl font-bold text-gray-900">Menu Settings</h1>
            <p className="text-gray-600 text-xs lg:text-sm mt-0.5 lg:mt-1">Configure your footer menu links and navigation</p>
          </div>
        </div>
        <CustomButton intent="primary" size="sm" onPress={handleSave} isLoading={loading} className="text-xs lg:text-sm">
          Save Changes
        </CustomButton>
      </div>

      {/* Settings Form */}
      <div className="bg-white rounded-xl lg:rounded-2xl p-4 lg:p-8 shadow-sm border border-gray-200 space-y-6 lg:space-y-8">
        {/* Menu Column Configuration */}
        <div className="space-y-4 lg:space-y-6">
          <div className="pb-3 lg:pb-4 border-b border-gray-200">
            <h3 className="text-base lg:text-lg font-semibold text-gray-900">Footer Menu Column</h3>
            <p className="text-xs lg:text-sm text-gray-500 mt-0.5 lg:mt-1">Configure the menu links displayed in your footer</p>
          </div>

          <Input
            label="Column Title"
            labelPlacement="outside"
            placeholder="Company"
            value={settings.footerColumn1Title}
            onChange={(e) => setSettings({ ...settings, footerColumn1Title: e.target.value })}
            description="The heading for your footer menu section"
            size="sm"
            classNames={{
              inputWrapper: "border-gray-300 hover:border-gray-400 focus-within:border-orange-500",
              label: "text-xs lg:text-sm font-medium",
              description: "text-xs",
            }}
          />

          {/* Link Builder */}
          <div className="space-y-3 lg:space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs lg:text-sm font-medium text-gray-700 block">Menu Links</label>
                <p className="text-xs text-gray-500 mt-0.5 lg:mt-1">Add links that will appear in your footer menu</p>
              </div>
              <Button
                size="sm"
                onPress={addNewLink}
                className="bg-orange-100 text-orange-700 hover:bg-orange-200 text-xs lg:text-sm"
                startContent={<Plus className="w-3 h-3 lg:w-4 lg:h-4" />}
              >
                Add Link
              </Button>
            </div>

            {/* Interactive Link Editor */}
            <div className="space-y-2 lg:space-y-3">
              {parsedLinks.map((link, index) => (
                <div
                  key={link.id}
                  className={`p-3 lg:p-4 border rounded-lg transition-all duration-200 ${
                    link.isValid ? 'border-gray-200 bg-gray-50' : 'border-red-200 bg-red-50'
                  }`}
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 lg:gap-4">
                    <Input
                      label="Link Text"
                      labelPlacement="outside"
                      size="sm"
                      placeholder="About Us"
                      value={link.text}
                      onChange={(e) => updateLink(index, e.target.value, link.url)}
                      classNames={{
                        inputWrapper: "border-gray-300 hover:border-gray-400 focus-within:border-orange-500",
                        label: "text-xs font-medium",
                      }}
                    />
                    <div className="flex gap-2">
                      <Input
                        label="URL"
                        labelPlacement="outside"
                        size="sm"
                        placeholder="/about"
                        value={link.url}
                        onChange={(e) => updateLink(index, link.text, e.target.value)}
                        classNames={{
                          inputWrapper: "border-gray-300 hover:border-gray-400 focus-within:border-orange-500",
                          label: "text-xs font-medium",
                        }}
                      />
                      <Button
                        isIconOnly
                        size="sm"
                        variant="flat"
                        onPress={() => removeLink(index)}
                        className="text-red-600 hover:bg-red-100 mt-4 lg:mt-5"
                      >
                        <X className="w-3 h-3 lg:w-4 lg:h-4" />
                      </Button>
                    </div>
                  </div>
                  {!link.isValid && (
                    <p className="text-xs text-red-600 mt-1 lg:mt-2">
                      Please provide both link text and URL
                    </p>
                  )}
                </div>
              ))}

              {parsedLinks.length === 0 && (
                <div className="text-center py-6 lg:py-8 text-gray-500">
                  <MenuIcon className="w-6 h-6 lg:w-8 lg:h-8 mx-auto mb-1 lg:mb-2 text-gray-400" />
                  <p className="text-xs lg:text-sm">No menu links added yet</p>
                  <p className="text-xs mt-0.5 lg:mt-1">Click "Add Link" to create your first menu item</p>
                </div>
              )}
            </div>
          </div>

          {/* Raw Text Editor (Advanced) */}
          <div className="bg-gray-50 rounded-lg p-3 lg:p-4">
            <Textarea
              label="Raw Link Data (Advanced)"
              labelPlacement="outside"
              placeholder="About Us|/about&#10;Contact|/contact&#10;Careers|/careers&#10;Blog|/blog"
              value={settings.footerColumn1Links}
              onChange={(e) => setSettings({ ...settings, footerColumn1Links: e.target.value })}
              description="Format: Link Text|URL (one per line). Use the editor above for easier management."
              rows={6}
              size="sm"
              classNames={{
                inputWrapper: "border-gray-300 hover:border-gray-400 focus-within:border-orange-500",
                label: "text-xs lg:text-sm font-medium",
                description: "text-xs",
              }}
            />
          </div>
        </div>

        {/* Preview Section */}
        <div className="space-y-3 lg:space-y-4">
          <div className="pb-3 lg:pb-4 border-b border-gray-200">
            <h3 className="text-base lg:text-lg font-semibold text-gray-900">Menu Preview</h3>
            <p className="text-xs lg:text-sm text-gray-500 mt-0.5 lg:mt-1">Preview of how your menu will appear in the footer</p>
          </div>

          <div className="bg-gray-900 text-white p-4 lg:p-6 rounded-lg">
            <div className="space-y-3 lg:space-y-4">
              {settings.footerColumn1Title && (
                <h4 className="font-semibold text-white text-sm lg:text-base">{settings.footerColumn1Title}</h4>
              )}
              <div className="space-y-1 lg:space-y-2">
                {parsedLinks.filter(link => link.isValid).map((link, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <ExternalLink className="w-2.5 h-2.5 lg:w-3 lg:h-3 text-gray-400" />
                    <span className="text-xs lg:text-sm text-gray-300 hover:text-white transition-colors cursor-pointer">
                      {link.text}
                    </span>
                  </div>
                ))}
                {parsedLinks.filter(link => link.isValid).length === 0 && (
                  <p className="text-xs lg:text-sm text-gray-500 italic">No valid links to display</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Format Help */}
        <div className="bg-gradient-to-r from-orange-50 to-yellow-50 rounded-lg lg:rounded-xl p-4 lg:p-6 border border-orange-200">
          <h4 className="font-semibold text-orange-900 mb-2 lg:mb-3 flex items-center gap-2 text-sm lg:text-base">
            <MenuIcon className="w-4 h-4 lg:w-5 lg:h-5" />
            Link Format Guide
          </h4>
          <div className="space-y-1 lg:space-y-2 text-xs lg:text-sm text-orange-800">
            <p>• <strong>Link Text:</strong> The visible text users will click (e.g., "About Us")</p>
            <p>• <strong>URL:</strong> The destination link (e.g., "/about" for internal pages or "https://example.com" for external)</p>
            <p>• <strong>Internal Links:</strong> Use relative paths like "/about", "/contact", "/products"</p>
            <p>• <strong>External Links:</strong> Include full URLs like "https://example.com"</p>
            <p>• <strong>Order:</strong> Links will appear in the same order as listed above</p>
          </div>
        </div>
      </div>
    </div>
  );
}