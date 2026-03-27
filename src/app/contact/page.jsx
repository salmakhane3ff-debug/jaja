"use client";

import { useState, useEffect } from "react";
import { Input, Textarea, Button } from "@heroui/react";
import { Send, Mail, Phone, MapPin } from "lucide-react";

export default function ContactPage() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    subject: "",
    message: "",
  });
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [storeSettings, setStoreSettings] = useState(null);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch("/api/setting?type=store", {
          cache: "force-cache",
          next: { revalidate: 300 }
        });
        const data = await res.json();
        if (data && Object.keys(data).length > 0) {
          setStoreSettings(data);
        }
      } catch (err) {
        console.error("Failed to load store settings:", err);
      }
    };

    fetchSettings();
  }, []);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.name || !formData.email || !formData.message) {
      setStatus("Please fill in all required fields");
      return;
    }

    setLoading(true);
    setStatus("");

    try {
      const res = await fetch("/api/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collection: "contact-submissions",
          ...formData,
          submittedAt: new Date().toISOString(),
          status: "unread",
        }),
      });

      if (res.ok) {
        setStatus("✓ Thank you! We'll get back to you soon.");
        setFormData({
          name: "",
          email: "",
          phone: "",
          subject: "",
          message: "",
        });
      } else {
        setStatus("✗ Failed to send. Please try again.");
      }
    } catch (error) {
      setStatus("✗ An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 md:px-20">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Get In Touch
          </h1>
          <p className="text-gray-600">
            Have a question? We'd love to hear from you. Send us a message and we'll respond as soon as possible.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {/* Contact Information Cards */}
          {(storeSettings?.footerEmail || storeSettings?.footerPhone || storeSettings?.footerAddress) && (
            <div className="lg:col-span-1 space-y-6">
              {storeSettings?.footerEmail && (
                <div className="bg-white rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                      <Mail className="w-6 h-6 text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 mb-1">Email</h3>
                      <a
                        href={`mailto:${storeSettings.footerEmail}`}
                        className="text-gray-600 hover:text-blue-600 transition-colors break-words"
                      >
                        {storeSettings.footerEmail}
                      </a>
                    </div>
                  </div>
                </div>
              )}

              {storeSettings?.footerPhone && (
                <div className="bg-white rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                      <Phone className="w-6 h-6 text-green-600" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 mb-1">Phone</h3>
                      <a
                        href={`tel:${storeSettings.footerPhone}`}
                        className="text-gray-600 hover:text-green-600 transition-colors"
                      >
                        {storeSettings.footerPhone}
                      </a>
                    </div>
                  </div>
                </div>
              )}

              {storeSettings?.footerAddress && (
                <div className="bg-white rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                      <MapPin className="w-6 h-6 text-purple-600" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 mb-1">Office</h3>
                      <p className="text-gray-600 leading-relaxed">
                        {storeSettings.footerAddress}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Contact Form */}
          <div className={`${(storeSettings?.footerEmail || storeSettings?.footerPhone || storeSettings?.footerAddress) ? 'lg:col-span-2' : 'lg:col-span-3 max-w-3xl mx-auto w-full'}`}>
            <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-8 shadow-sm">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <Input
                  label="Name *"
                  name="name"
                  placeholder="Your name"
                  value={formData.name}
                  onChange={handleChange}
                  labelPlacement="outside"
                  required
                />
                <Input
                  label="Email *"
                  name="email"
                  type="email"
                  placeholder="your@email.com"
                  value={formData.email}
                  onChange={handleChange}
                  labelPlacement="outside"
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <Input
                  label="Phone"
                  name="phone"
                  placeholder="+1 (555) 123-4567"
                  value={formData.phone}
                  onChange={handleChange}
                  labelPlacement="outside"
                />
                <Input
                  label="Subject"
                  name="subject"
                  placeholder="How can we help?"
                  value={formData.subject}
                  onChange={handleChange}
                  labelPlacement="outside"
                />
              </div>

              <div className="mb-6">
                <Textarea
                  label="Message *"
                  name="message"
                  placeholder="Tell us more about your inquiry..."
                  value={formData.message}
                  onChange={handleChange}
                  labelPlacement="outside"
                  minRows={6}
                  required
                />
              </div>

              <Button
                type="submit"
                size="lg"
                isLoading={loading}
                className="w-full bg-gray-900 text-white font-medium"
                startContent={!loading && <Send className="w-4 h-4" />}
              >
                {loading ? "Sending..." : "Send Message"}
              </Button>

              {status && (
                <p
                  className={`mt-4 text-sm text-center ${
                    status.includes("✓") ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {status}
                </p>
              )}
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
