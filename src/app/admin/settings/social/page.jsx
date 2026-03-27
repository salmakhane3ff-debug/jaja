"use client";

import { useState, useEffect } from "react";
import { Input, Spinner } from "@heroui/react";
import { Globe, Facebook, Twitter, Instagram, Linkedin, Youtube, MessageCircle } from "lucide-react";
import CustomButton from "@/components/block/CustomButton";

export default function SocialMediaSettingsPage() {
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  const [settings, setSettings] = useState({
    facebookUrl: "",
    twitterUrl: "",
    instagramUrl: "",
    linkedinUrl: "",
    youtubeUrl: "",
    whatsappNumber: "",
  });

  const socialPlatforms = [
    {
      key: "facebookUrl",
      label: "Facebook Page URL",
      placeholder: "https://facebook.com/yourpage",
      icon: Facebook,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
      description: "Link to your Facebook business page"
    },
    {
      key: "twitterUrl", 
      label: "Twitter Profile URL",
      placeholder: "https://twitter.com/yourhandle",
      icon: Twitter,
      color: "text-sky-600",
      bgColor: "bg-sky-50",
      description: "Link to your Twitter profile"
    },
    {
      key: "instagramUrl",
      label: "Instagram Profile URL", 
      placeholder: "https://instagram.com/yourhandle",
      icon: Instagram,
      color: "text-pink-600",
      bgColor: "bg-pink-50",
      description: "Link to your Instagram profile"
    },
    {
      key: "linkedinUrl",
      label: "LinkedIn Company URL",
      placeholder: "https://linkedin.com/company/yourcompany", 
      icon: Linkedin,
      color: "text-blue-700",
      bgColor: "bg-blue-50",
      description: "Link to your LinkedIn company page"
    },
    {
      key: "youtubeUrl",
      label: "YouTube Channel URL",
      placeholder: "https://youtube.com/yourchannel",
      icon: Youtube,
      color: "text-red-600", 
      bgColor: "bg-red-50",
      description: "Link to your YouTube channel"
    },
    {
      key: "whatsappNumber",
      label: "WhatsApp Business Number",
      placeholder: "+1234567890",
      icon: MessageCircle,
      color: "text-green-600",
      bgColor: "bg-green-50", 
      description: "Include country code without + or spaces"
    }
  ];

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await fetch("/api/setting?type=store");
      const data = await res.json();
      if (data && Object.keys(data).length > 0) {
        setSettings({
          facebookUrl: data.facebookUrl || "",
          twitterUrl: data.twitterUrl || "",
          instagramUrl: data.instagramUrl || "",
          linkedinUrl: data.linkedinUrl || "",
          youtubeUrl: data.youtubeUrl || "",
          whatsappNumber: data.whatsappNumber || "",
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
      
      // Merge with new social media settings
      const updatedSettings = { ...existingData, ...settings };
      
      const res = await fetch("/api/setting?type=store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedSettings),
      });

      if (res.ok) {
        alert("Social media settings saved successfully!");
      } else {
        alert("Failed to save social media settings");
      }
    } catch (err) {
      console.error("Save error:", err);
      alert("Error saving social media settings");
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
          <div className="p-2 lg:p-3 bg-green-50 rounded-lg lg:rounded-xl">
            <Globe className="w-4 h-4 lg:w-6 lg:h-6 text-green-600" />
          </div>
          <div>
            <h1 className="text-xl lg:text-2xl font-bold text-gray-900">Social Media Settings</h1>
            <p className="text-gray-600 text-xs lg:text-sm mt-0.5 lg:mt-1">Configure your social media presence and contact channels</p>
          </div>
        </div>
        <CustomButton intent="primary" size="sm" onPress={handleSave} isLoading={loading} className="text-xs lg:text-sm">
          Save Changes
        </CustomButton>
      </div>

      {/* Settings Form */}
      <div className="bg-white rounded-xl lg:rounded-2xl p-4 lg:p-8 shadow-sm border border-gray-200 space-y-6 lg:space-y-8">
        <div className="space-y-4 lg:space-y-6">
          <div className="pb-3 lg:pb-4 border-b border-gray-200">
            <h3 className="text-base lg:text-lg font-semibold text-gray-900">Social Media Links</h3>
            <p className="text-xs lg:text-sm text-gray-500 mt-0.5 lg:mt-1">Connect your social media accounts to increase engagement</p>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:gap-6">
            {socialPlatforms.map((platform) => {
              const Icon = platform.icon;
              return (
                <div key={platform.key} className="group">
                  <div className="flex items-start gap-3 lg:gap-4 p-4 lg:p-6 border border-gray-200 rounded-lg lg:rounded-xl hover:border-gray-300 hover:shadow-sm transition-all duration-200">
                    <div className={`p-2 lg:p-3 ${platform.bgColor} rounded-lg flex-shrink-0`}>
                      <Icon className={`w-4 h-4 lg:w-5 lg:h-5 ${platform.color}`} />
                    </div>
                    <div className="flex-1">
                      <Input
                        label={platform.label}
                        labelPlacement="outside"
                        placeholder={platform.placeholder}
                        value={settings[platform.key]}
                        onChange={(e) => setSettings({ ...settings, [platform.key]: e.target.value })}
                        description={platform.description}
                        size="sm"
                        classNames={{
                          inputWrapper: "border-gray-300 hover:border-gray-400 focus-within:border-green-500",
                          label: "font-medium text-xs lg:text-sm",
                          description: "text-xs",
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Tips Section */}
        <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-lg lg:rounded-xl p-4 lg:p-6 border border-green-200">
          <h4 className="font-semibold text-green-900 mb-2 lg:mb-3 flex items-center gap-2 text-sm lg:text-base">
            <Globe className="w-4 h-4 lg:w-5 lg:h-5" />
            Social Media Tips
          </h4>
          <div className="space-y-1 lg:space-y-2 text-xs lg:text-sm text-green-800">
            <p>• Use complete URLs including https:// for external links</p>
            <p>• For WhatsApp, include country code without + symbol (e.g., 1234567890)</p>
            <p>• Social links will appear in your footer and contact sections</p>
            <p>• Leave fields empty if you don't use those platforms</p>
            <p>• Test your links after saving to ensure they work correctly</p>
          </div>
        </div>

        {/* Preview Section */}
        <div className="space-y-3 lg:space-y-4">
          <div className="pb-3 lg:pb-4 border-b border-gray-200">
            <h3 className="text-base lg:text-lg font-semibold text-gray-900">Active Social Links</h3>
            <p className="text-xs lg:text-sm text-gray-500 mt-0.5 lg:mt-1">Preview of your configured social media links</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 lg:gap-4">
            {socialPlatforms.map((platform) => {
              const Icon = platform.icon;
              const hasLink = settings[platform.key] && settings[platform.key].trim() !== "";
              
              return (
                <div
                  key={platform.key}
                  className={`p-3 lg:p-4 rounded-lg border-2 transition-all duration-200 ${
                    hasLink 
                      ? `${platform.bgColor} border-green-200 text-green-700` 
                      : 'bg-gray-50 border-gray-200 text-gray-400'
                  }`}
                >
                  <Icon className="w-5 h-5 lg:w-6 lg:h-6 mx-auto mb-1 lg:mb-2" />
                  <p className="text-xs text-center font-medium">
                    {platform.label.replace(' URL', '').replace(' Number', '')}
                  </p>
                  <p className="text-xs text-center mt-0.5 lg:mt-1">
                    {hasLink ? '✓ Active' : 'Not set'}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}