"use client";

import { useEffect, useState } from "react";
import { Search, ChevronDown, ChevronUp } from "lucide-react";
import { Input } from "@heroui/react";

export default function FAQsPage() {
  const [faqs, setFaqs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [openIndex, setOpenIndex] = useState(null);

  useEffect(() => {
    async function fetchFAQs() {
      try {
        const res = await fetch("/api/data?collection=faqs", {
          cache: "force-cache",
          next: { revalidate: 300 }
        });
        const data = await res.json();
        if (res.ok) {
          const sorted = data.sort((a, b) => (a.order || 0) - (b.order || 0));
          setFaqs(sorted);
        }
      } catch (error) {
        console.error("Failed to fetch FAQs:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchFAQs();
  }, []);

  const filteredFAQs = faqs.filter((faq) =>
    faq.question?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    faq.answer?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleFAQ = (index) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-gray-200 border-t-gray-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 md:px-20">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Frequently Asked Questions
          </h1>
          <p className="text-gray-600">
            Find answers to common questions about our products and services
          </p>
        </div>

        {/* Search */}
        <div className="mb-8">
          <Input
            type="text"
            placeholder="Search FAQs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            startContent={<Search className="w-4 h-4 text-gray-400" />}
            classNames={{
              input: "text-sm",
              inputWrapper: "bg-white border border-gray-200 shadow-sm",
            }}
            size="lg"
          />
        </div>

        {/* FAQs List */}
        {filteredFAQs.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">No FAQs found matching your search.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredFAQs.map((faq, index) => (
              <div
                key={faq._id || index}
                className="bg-white rounded-lg shadow-sm overflow-hidden"
              >
                <button
                  onClick={() => toggleFAQ(index)}
                  className="w-full flex items-center justify-between p-6 text-left hover:bg-gray-50 transition-colors"
                >
                  <h3 className="text-sm md:text-base font-semibold text-gray-900 pr-4">
                    {faq.question}
                  </h3>
                  {openIndex === index ? (
                    <ChevronUp className="w-5 h-5 text-gray-500 flex-shrink-0" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-500 flex-shrink-0" />
                  )}
                </button>
                {openIndex === index && (
                  <div className="px-6 pb-6">
                    <p className="text-sm text-gray-600 leading-relaxed">
                      {faq.answer}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Contact Section */}
        <div className="mt-12 bg-gray-900 rounded-2xl p-8 text-center text-white">
          <h3 className="text-xl font-bold mb-2">Still have questions?</h3>
          <p className="text-gray-300 mb-6">
            Can't find the answer you're looking for? Please contact our support team.
          </p>
          <a
            href="/contact"
            className="inline-block px-6 py-3 bg-white text-gray-900 font-medium rounded-lg hover:bg-gray-100 transition-colors"
          >
            Contact Support
          </a>
        </div>
      </div>
    </div>
  );
}
